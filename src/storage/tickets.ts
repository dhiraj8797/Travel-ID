import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ticket } from '../types/ticket';

/** Legacy device-global key (pre account-scoped wallets). */
const LEGACY_KEY = 'wallet.tickets.v2';
const GUEST_KEY = 'wallet.tickets.v2.guest';

export function ticketsStorageKey(userId: string | null | undefined): string | null {
  const id = userId?.trim();
  if (!id) return null;
  return `wallet.tickets.v2.u:${id}`;
}

async function readList(key: string): Promise<Ticket[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Ticket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, tickets: Ticket[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(tickets));
}

/**
 * Load wallet for a Google account. On first claim (no account key yet),
 * migrates legacy/global and guest passes into this account.
 */
export async function loadTicketsForUser(
  userId: string | null | undefined
): Promise<Ticket[]> {
  const key = ticketsStorageKey(userId);
  if (!key) return [];

  const raw = await AsyncStorage.getItem(key);
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw) as Ticket[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const legacy = await readList(LEGACY_KEY);
  const guest = await readList(GUEST_KEY);
  const claimed = mergeTickets(legacy, guest);
  await writeList(key, claimed);
  if (legacy.length || guest.length) {
    try {
      await AsyncStorage.multiRemove([LEGACY_KEY, GUEST_KEY]);
    } catch {
      await AsyncStorage.removeItem(LEGACY_KEY);
      await AsyncStorage.removeItem(GUEST_KEY);
    }
  }
  return claimed;
}

export async function saveTicketsForUser(
  userId: string | null | undefined,
  tickets: Ticket[]
): Promise<void> {
  const key = ticketsStorageKey(userId);
  if (!key) {
    throw new Error('Sign in with Google to save passes.');
  }
  await writeList(key, tickets);
}

export async function upsertTicketForUser(
  userId: string | null | undefined,
  ticket: Ticket
): Promise<Ticket[]> {
  const tickets = await loadTicketsForUser(userId);
  const index = tickets.findIndex((t) => t.id === ticket.id);
  const next =
    index >= 0
      ? tickets.map((t, i) => (i === index ? ticket : t))
      : [ticket, ...tickets];
  await saveTicketsForUser(userId, next);
  return next;
}

export async function removeTicketForUser(
  userId: string | null | undefined,
  id: string
): Promise<Ticket[]> {
  const tickets = await loadTicketsForUser(userId);
  const next = tickets.filter((t) => t.id !== id);
  await saveTicketsForUser(userId, next);
  return next;
}

function mergeTickets(...lists: Ticket[][]): Ticket[] {
  const seen = new Set<string>();
  const out: Ticket[] = [];
  for (const list of lists) {
    for (const t of list) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** @deprecated Use loadTicketsForUser */
export async function loadTickets(): Promise<Ticket[]> {
  return readList(LEGACY_KEY);
}

/** @deprecated Use saveTicketsForUser */
export async function saveTickets(tickets: Ticket[]): Promise<void> {
  await writeList(LEGACY_KEY, tickets);
}

/** @deprecated Use upsertTicketForUser */
export async function upsertTicket(ticket: Ticket): Promise<Ticket[]> {
  const tickets = await loadTickets();
  const index = tickets.findIndex((t) => t.id === ticket.id);
  const next =
    index >= 0
      ? tickets.map((t, i) => (i === index ? ticket : t))
      : [ticket, ...tickets];
  await saveTickets(next);
  return next;
}

/** @deprecated Use removeTicketForUser */
export async function removeTicket(id: string): Promise<Ticket[]> {
  const tickets = await loadTickets();
  const next = tickets.filter((t) => t.id !== id);
  await saveTickets(next);
  return next;
}
