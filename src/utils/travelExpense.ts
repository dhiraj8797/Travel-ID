import { Ticket, TicketKind } from '../types/ticket';
import { toJourneyDateIso } from '../services/railRadar';

export type YearExpense = {
  year: number;
  /** Sum of parsed final paid amounts (INR). */
  total: number;
  /** Passes counted into the total (have a parseable fare). */
  withFare: number;
  /** Passes in this year with missing/unparseable fare. */
  missingFare: number;
  byKind: Partial<Record<TicketKind, number>>;
};

/** Pull a numeric INR amount from ticket fare strings like "1,890", "₹12,800", "Rs. 825.50". */
export function parseFareAmount(raw?: string | null): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || /^(n\/?a|na|nil|—|-|tbd|pending)$/i.test(text)) return null;

  const matches = text.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi);
  if (!matches?.length) return null;

  const values: number[] = [];
  for (const m of matches) {
    const digits = m.replace(/[^\d.]/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) continue;
    // Ignore tiny noise (e.g. tax %) and absurd outliers
    if (n < 1 || n > 10_000_000) continue;
    values.push(n);
  }
  if (!values.length) return null;
  // When several amounts appear, the largest is usually the final / total paid.
  return Math.max(...values);
}

export function ticketExpenseYear(ticket: Ticket): number | null {
  const iso =
    toJourneyDateIso(ticket.departureDate) ||
    toJourneyDateIso(ticket.bookingDate) ||
    (ticket.createdAt ? ticket.createdAt.slice(0, 10) : undefined);
  if (!iso) return null;
  const year = Number(iso.slice(0, 4));
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

/** Aggregate wallet fares by calendar year of the trip (departure / check-in). */
export function aggregateExpensesByYear(tickets: Ticket[]): YearExpense[] {
  const map = new Map<number, YearExpense>();

  const ensure = (year: number): YearExpense => {
    let row = map.get(year);
    if (!row) {
      row = { year, total: 0, withFare: 0, missingFare: 0, byKind: {} };
      map.set(year, row);
    }
    return row;
  };

  for (const ticket of tickets) {
    const year = ticketExpenseYear(ticket);
    if (year == null) continue;
    const row = ensure(year);
    const amount = parseFareAmount(ticket.fare);
    if (amount == null) {
      row.missingFare += 1;
      continue;
    }
    row.total += amount;
    row.withFare += 1;
    row.byKind[ticket.kind] = (row.byKind[ticket.kind] || 0) + amount;
  }

  return [...map.values()].sort((a, b) => b.year - a.year);
}

export function formatInr(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}
