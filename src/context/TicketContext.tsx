import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { DEMO_TICKETS } from '../data/demoTickets';
import {
  loadTicketsForUser,
  removeTicketForUser,
  saveTicketsForUser,
  upsertTicketForUser,
} from '../storage/tickets';
import {
  deleteTicketLocalFiles,
  deleteTicketsLocalFiles,
} from '../storage/ticketFiles';
import { ParsedTicketDraft, Ticket } from '../types/ticket';
import { buildQrPayload } from '../utils/ticketFormat';
import {
  airlineNameFromCode,
  parseFlightIdentity,
} from '../utils/flightIdentity';
import { isBcbpPayload } from '../parsers/bcbp';
import { boardingCodeRaw, createBoardingCode } from '../utils/boardingCode';
import {
  applyCompletedIfPast,
  coerceFlightArchiveDate,
  repairFalseCompletedFlags,
} from '../utils/passTime';

/** Prefer airline boarding payload; never overwrite BCBP with a Travel ID QR. */
function resolveQrPayload(ticket: Ticket): string {
  // Hotel: always opaque pass-id QR (never embed guest / contact PII)
  if (ticket.kind === 'hotel') {
    return buildQrPayload(ticket);
  }
  // Metro: prefer scanned Namma Metro / gate QR when present
  if (ticket.kind === 'metro') {
    const original = ticket.originalQrValue?.trim();
    if (original) return original;
    return buildQrPayload(ticket);
  }
  const boarding = boardingCodeRaw(ticket);
  if (boarding) return boarding;
  const original = ticket.originalQrValue?.trim();
  if (original) return original;
  const existing = ticket.qrPayload?.trim();
  if (existing && (isBcbpPayload(existing) || ticket.kind === 'flight')) {
    return existing;
  }
  return existing || buildQrPayload(ticket);
}

function createId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

type TicketContextValue = {
  tickets: Ticket[];
  loading: boolean;
  /** False when signed out — wallet is account-only. */
  canEditWallet: boolean;
  addFromDraft: (draft: ParsedTicketDraft) => Promise<Ticket>;
  updateTicket: (ticket: Ticket) => Promise<void>;
  deleteTicket: (id: string) => Promise<void>;
  clearAllTickets: () => Promise<void>;
  seedDemoTickets: () => Promise<void>;
  getTicket: (id: string) => Ticket | undefined;
};

const TicketContext = createContext<TicketContextValue | null>(null);

export function TicketProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id?.trim() || null;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (authLoading) return;
      setLoading(true);
      try {
        const stored = await loadTicketsForUser(userId);
        if (!mounted) return;
        const migrated = stored.map((t) =>
          applyCompletedIfPast(
            repairFalseCompletedFlags(coerceFlightArchiveDate(t))
          )
        );
        const changed = migrated.some(
          (t, i) =>
            t.journeyCompleted !== stored[i].journeyCompleted ||
            t.bookingStatus !== stored[i].bookingStatus ||
            t.departureDate !== stored[i].departureDate ||
            t.flightStatus !== stored[i].flightStatus
        );
        if (changed && userId) {
          await saveTicketsForUser(userId, migrated);
        }
        if (!mounted) return;
        setTickets(migrated);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId, authLoading]);

  const requireUser = useCallback(() => {
    const id = userIdRef.current;
    if (!id) {
      throw new Error('Sign in with Google to save passes to your account.');
    }
    return id;
  }, []);

  const addFromDraft = useCallback(
    async (draft: ParsedTicketDraft) => {
      const uid = requireUser();
      const {
        confidence: _confidence,
        needsManualCompletion: _needs,
        extractionNote: _note,
        ...rest
      } = draft;
      let normalized = { ...rest };
      if (normalized.kind === 'flight') {
        const id = parseFlightIdentity(
          normalized.flightNumber ||
            (normalized.airlineCode
              ? `${normalized.airlineCode}${normalized.flightNumber || ''}`
              : undefined)
        );
        const airlineCode = normalized.airlineCode || id.airlineCode;
        const flightNumber = id.display || normalized.flightNumber;
        normalized = {
          ...normalized,
          airlineCode,
          flightNumber,
          operator:
            normalized.operator && normalized.operator !== 'Airline'
              ? normalized.operator
              : airlineNameFromCode(airlineCode) ||
                normalized.operator ||
                'Airline',
          title: flightNumber || normalized.title || 'Flight Pass',
          terminal: normalized.terminal || normalized.boardingPoint,
        };
      }

      let ticket: Ticket = applyCompletedIfPast({
        ...normalized,
        id: createId(),
        createdAt: new Date().toISOString(),
        bookingDate:
          normalized.bookingDate ||
          new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }),
      });
      if (
        ticket.kind === 'flight' &&
        !ticket.boardingCode?.rawValue &&
        (ticket.originalQrValue || ticket.qrPayload)
      ) {
        ticket.boardingCode = createBoardingCode(
          ticket.originalQrValue || ticket.qrPayload || '',
          ticket.boardingCode?.type
        );
      }
      ticket.qrPayload = resolveQrPayload(ticket);
      ticket = applyCompletedIfPast(ticket);
      const next = await upsertTicketForUser(uid, ticket);
      if (userIdRef.current === uid) setTickets(next);
      return ticket;
    },
    [requireUser]
  );

  const updateTicket = useCallback(
    async (ticket: Ticket) => {
      const uid = requireUser();
      const nextTicket = {
        ...ticket,
        boardingCode: ticket.boardingCode,
        originalQrValue: ticket.originalQrValue,
        qrPayload: resolveQrPayload(ticket),
      };
      const next = await upsertTicketForUser(uid, nextTicket);
      if (userIdRef.current === uid) setTickets(next);
    },
    [requireUser]
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      const uid = requireUser();
      const doomed = tickets.find((t) => t.id === id);
      const next = await removeTicketForUser(uid, id);
      if (userIdRef.current === uid) setTickets(next);
      void deleteTicketLocalFiles(doomed);
    },
    [requireUser, tickets]
  );

  const clearAllTickets = useCallback(async () => {
    const uid = requireUser();
    const snapshot = tickets;
    await saveTicketsForUser(uid, []);
    if (userIdRef.current === uid) setTickets([]);
    void deleteTicketsLocalFiles(snapshot);
  }, [requireUser, tickets]);

  const seedDemoTickets = useCallback(async () => {
    const uid = requireUser();
    const existing = await loadTicketsForUser(uid);
    const demoIds = new Set(DEMO_TICKETS.map((t) => t.id));
    const kept = existing.filter((t) => !demoIds.has(t.id));
    const next = [...DEMO_TICKETS, ...kept];
    await saveTicketsForUser(uid, next);
    if (userIdRef.current === uid) setTickets(next);
  }, [requireUser]);

  const getTicket = useCallback(
    (id: string) => tickets.find((t) => t.id === id),
    [tickets]
  );

  const value = useMemo(
    () => ({
      tickets,
      loading: loading || authLoading,
      canEditWallet: !!userId,
      addFromDraft,
      updateTicket,
      deleteTicket,
      clearAllTickets,
      seedDemoTickets,
      getTicket,
    }),
    [
      tickets,
      loading,
      authLoading,
      userId,
      addFromDraft,
      updateTicket,
      deleteTicket,
      clearAllTickets,
      seedDemoTickets,
      getTicket,
    ]
  );

  return (
    <TicketContext.Provider value={value}>{children}</TicketContext.Provider>
  );
}

export function useTickets() {
  const ctx = useContext(TicketContext);
  if (!ctx) throw new Error('useTickets must be used within TicketProvider');
  return ctx;
}
