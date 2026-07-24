import { useCallback, useEffect, useRef, useState } from 'react';
import { Ticket } from '../types/ticket';
import {
  CiriumFlightStatus,
  fetchCiriumFlightStatus,
  isCiriumConfigured,
} from '../services/cirium';
import { notifyFlightChanges } from '../services/flightAlerts';
import { isPastPass, isLiveWindowOver } from '../utils/passTime';

type Options = {
  ticket: Ticket;
  enabled?: boolean;
  /** Persist updates back to wallet */
  onUpdate?: (next: Ticket) => void | Promise<void>;
  pollMs?: number;
};

/** Aviationstack returns ISO timestamps — show as HH:mm IST on the pass. */
export function formatFlightClock(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const raw = value.trim();
  const hm = raw.match(/^(\d{1,2}):(\d{2})/);
  if (hm && !raw.includes('T')) {
    return `${hm[1].padStart(2, '0')}:${hm[2]}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Poll live flight status via the Travel ID API proxy.
 * Careful: do not write ticket → refresh → write ticket in a loop.
 */
export function useLiveFlightStatus({
  ticket,
  enabled = true,
  onUpdate,
  /** Free plan = 100 calls/mo — default poll is gentle. */
  pollMs = 300_000,
}: Options) {
  const [status, setStatus] = useState<CiriumFlightStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOkAt, setLastOkAt] = useState<string | undefined>(ticket.lastStatusAt);

  const ticketRef = useRef(ticket);
  const onUpdateRef = useRef(onUpdate);
  const prevRef = useRef<Ticket>(ticket);
  const inFlightRef = useRef(false);
  const configured = isCiriumConfigured();

  useEffect(() => {
    ticketRef.current = ticket;
  }, [ticket]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    prevRef.current = ticket;
  }, [ticket.id]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean; bypassCache?: boolean }) => {
      const t = ticketRef.current;
      if (!enabled || t.kind !== 'flight') return;
      if (isPastPass(t) || isLiveWindowOver(t) || t.journeyCompleted) {
        setStatus(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (!configured) {
        setError('Live updates need the API proxy running');
        return;
      }
      if (!t.flightNumber && !t.airlineCode) {
        setError('Add airline code and flight number to refresh status');
        return;
      }
      if (!t.departureDate) {
        setError('Add travel date to refresh flight status');
        return;
      }
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const silent = Boolean(opts?.silent);
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const live = await fetchCiriumFlightStatus({
          airlineCode: t.airlineCode,
          flightNumber: t.flightNumber,
          departureDate: t.departureDate,
          fromCode: t.fromCode,
          toCode: t.toCode,
          bypassCache: opts?.bypassCache,
        });
        setStatus(live);

        if (!live) {
          setError(
            'No real-time data yet — Free plan covers active/today flights; gate often appears closer to departure'
          );
          return;
        }

        const schedDep = formatFlightClock(live.scheduledDeparture);
        const schedArr = formatFlightClock(live.scheduledArrival);
        const estDep =
          formatFlightClock(live.estimatedDeparture) ||
          formatFlightClock(live.actualDeparture) ||
          schedDep;
        const estArr =
          formatFlightClock(live.estimatedArrival) ||
          formatFlightClock(live.actualArrival) ||
          schedArr;

        const nowIso = new Date().toISOString();
        setLastOkAt(nowIso);
        setError(null);

        const hasTicketDep = Boolean(t.departureTime && t.departureTime !== '--:--');
        const hasTicketArr = Boolean(t.arrivalTime && t.arrivalTime !== '--:--');

        const next: Ticket = {
          ...t,
          flightStatus: live.statusLabel || t.flightStatus,
          terminal: live.departureTerminal || t.terminal,
          arrivalTerminal: live.arrivalTerminal || t.arrivalTerminal,
          gate: live.departureGate || t.gate,
          delayMinutes:
            live.delayMinutes != null ? live.delayMinutes : t.delayMinutes,
          estimatedDeparture: estDep || t.estimatedDeparture,
          estimatedArrival: estArr || t.estimatedArrival,
          // BCBP barcodes have no clocks — fill from live schedule when missing
          departureTime: hasTicketDep
            ? t.departureTime
            : estDep || schedDep || t.departureTime,
          arrivalTime: hasTicketArr
            ? t.arrivalTime
            : estArr || schedArr || t.arrivalTime,
          reportingTime: t.reportingTime,
          ciriumFlightId: live.flightId || t.ciriumFlightId,
          lastStatusAt: nowIso,
          boardingPoint: live.departureTerminal || t.boardingPoint,
        };

        // Derive boarding if still empty and we now know departure
        if (!next.reportingTime && next.departureTime && next.departureTime !== '--:--') {
          const [hh, mm] = next.departureTime.split(':').map(Number);
          if (Number.isFinite(hh) && Number.isFinite(mm)) {
            let total = hh * 60 + mm - 40;
            if (total < 0) total += 24 * 60;
            next.reportingTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
          }
        }

        // Only persist when gate/status/times actually change — avoids refresh loops.
        const meaningfulChange =
          next.flightStatus !== t.flightStatus ||
          next.gate !== t.gate ||
          next.terminal !== t.terminal ||
          next.arrivalTerminal !== t.arrivalTerminal ||
          next.delayMinutes !== t.delayMinutes ||
          next.estimatedDeparture !== t.estimatedDeparture ||
          next.estimatedArrival !== t.estimatedArrival ||
          next.departureTime !== t.departureTime ||
          next.arrivalTime !== t.arrivalTime ||
          next.reportingTime !== t.reportingTime;

        if (meaningfulChange && onUpdateRef.current) {
          await notifyFlightChanges(prevRef.current, next);
          prevRef.current = next;
          ticketRef.current = next;
          await onUpdateRef.current(next);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not refresh flight status');
      } finally {
        inFlightRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [configured, enabled]
  );

  // One initial fetch + slow poll — do not depend on `refresh` identity churn.
  useEffect(() => {
    if (!enabled || ticket.kind !== 'flight' || !configured) return;
    if (isPastPass(ticket) || ticket.journeyCompleted || isLiveWindowOver(ticket)) {
      setStatus(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refresh({ silent: false });
    const id = setInterval(() => void refresh({ silent: true }), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rebind on ticket identity / poll
  }, [
    configured,
    enabled,
    pollMs,
    ticket.kind,
    ticket.id,
    ticket.journeyCompleted,
    ticket.departureDate,
  ]);

  return {
    configured,
    status,
    loading,
    error,
    lastOkAt,
    refresh: () => refresh({ silent: false, bypassCache: true }),
    waitingForKeys: !configured,
  };
}
