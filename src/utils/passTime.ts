import { Ticket } from '../types/ticket';
import { istTodayIso, toJourneyDateIso } from '../services/railRadar';

export type PassPhase = 'upcoming' | 'ongoing' | 'past';

/**
 * Pack calendar day + minutes-of-day into one ordered number.
 * dayKey = YYYYMMDD, then * 1440 + minutes so time never collides with the day.
 */
function packStamp(y: number, m: number, d: number, minutes: number): number {
  const dayKey = y * 10_000 + m * 100 + d;
  return dayKey * 1_440 + Math.max(0, Math.min(1_439, minutes));
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function stampAddMinutes(stamp: number, mins: number): number {
  const dayKey = Math.floor(stamp / 1_440);
  const tod = stamp % 1_440;
  const y = Math.floor(dayKey / 10_000);
  const mo = Math.floor((dayKey % 10_000) / 100);
  const da = dayKey % 100;
  const start = Date.UTC(y, mo - 1, da, 0, 0, 0);
  const next = new Date(start + (tod + mins) * 60_000);
  return packStamp(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    next.getUTCHours() * 60 + next.getUTCMinutes()
  );
}

/** Current IST wall-clock as a comparable stamp. */
export function istNowStamp(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const n = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return packStamp(n('year'), n('month'), n('day'), n('hour') * 60 + n('minute'));
}

function parseClockMinutes(time?: string): number | null {
  const raw = (time || '').trim();
  if (!raw || raw === '--' || raw === '—' || raw === '--:--' || raw === 'TBD') {
    return null;
  }

  const h12 = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)\b/i);
  if (h12) {
    let h = Number(h12[1]) % 12;
    if (h12[3].toLowerCase() === 'pm') h += 12;
    return h * 60 + Number(h12[2]);
  }

  const h24 = raw.match(/^(\d{1,2}):(\d{2})\b/);
  if (h24) {
    return Number(h24[1]) * 60 + Number(h24[2]);
  }

  return null;
}

function parseDepartureTimeMinutes(time?: string): number {
  return parseClockMinutes(time) ?? 0;
}

/** Rough journey length when arrival time is missing. */
function estimateJourneyMinutes(ticket: Ticket): number {
  const tt = (ticket.travelTime || '').trim();
  if (tt) {
    const h = tt.match(/(\d+)\s*h/i);
    const m = tt.match(/(\d+)\s*m/i);
    const hours = h ? Number(h[1]) : 0;
    const mins = m ? Number(m[1]) : 0;
    if (hours || mins) return Math.max(60, hours * 60 + mins);
    const colon = tt.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  }
  if (ticket.kind === 'flight') return 3 * 60;
  if (ticket.kind === 'bus') return 8 * 60;
  return 12 * 60; // rail default
}

/**
 * Travel departure stamp from ticket travel date + time (IST).
 */
export function ticketTravelStamp(ticket: Ticket): number | null {
  const iso = toJourneyDateIso(ticket.departureDate);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return packStamp(y, m, d, parseDepartureTimeMinutes(ticket.departureTime));
}

/**
 * Arrival stamp — uses arrivalDate/time, or overnight on departure day,
 * or estimated duration after departure when arrival is missing.
 */
export function ticketArrivalStamp(ticket: Ticket): number | null {
  const depIso = toJourneyDateIso(ticket.departureDate);
  if (!depIso) return null;
  const depMins = parseClockMinutes(ticket.departureTime);
  const arrMins = parseClockMinutes(ticket.arrivalTime);
  const depStamp = ticketTravelStamp(ticket);
  if (depStamp == null) return null;

  if (arrMins == null) {
    return stampAddMinutes(depStamp, estimateJourneyMinutes(ticket));
  }

  let arrIso = toJourneyDateIso(ticket.arrivalDate) || depIso;

  // Same calendar day but arrival clock ≤ departure → overnight (+1 day)
  if (
    arrIso === depIso &&
    depMins != null &&
    arrMins <= depMins
  ) {
    arrIso = addDaysIso(depIso, 1);
  }

  const [y, m, d] = arrIso.split('-').map(Number);
  if (!y || !m || !d) return stampAddMinutes(depStamp, estimateJourneyMinutes(ticket));
  return packStamp(y, m, d, arrMins);
}

export function ticketTravelDateIso(ticket: Ticket): string | undefined {
  return toJourneyDateIso(ticket.departureDate);
}

/** upcoming → before dep · ongoing → dep…arr · past → after arr */
export function getPassPhase(ticket: Ticket): PassPhase {
  const now = istNowStamp();
  const dep = ticketTravelStamp(ticket);
  if (dep == null) return 'upcoming';

  if (now < dep) return 'upcoming';

  const arr = ticketArrivalStamp(ticket);
  if (arr == null) {
    // Shouldn't happen — arrival stamp always estimates — but be safe
    return now < stampAddMinutes(dep, estimateJourneyMinutes(ticket))
      ? 'ongoing'
      : 'past';
  }

  if (now < arr) return 'ongoing';
  return 'past';
}

/** Upcoming = not departed yet (IST). */
export function isUpcomingPass(ticket: Ticket): boolean {
  return getPassPhase(ticket) === 'upcoming';
}

/** Ongoing = departed but not yet arrived (IST). */
export function isOngoingPass(ticket: Ticket): boolean {
  return getPassPhase(ticket) === 'ongoing';
}

/** Past = arrival time completed (IST). */
export function isPastPass(ticket: Ticket): boolean {
  return getPassPhase(ticket) === 'past';
}

export function compareByTravelDate(
  a: Ticket,
  b: Ticket,
  ascending: boolean
): number {
  const as = ticketTravelStamp(a) ?? (ascending ? Number.MAX_SAFE_INTEGER : -1);
  const bs = ticketTravelStamp(b) ?? (ascending ? Number.MAX_SAFE_INTEGER : -1);
  return ascending ? as - bs : bs - as;
}

export { istTodayIso };
