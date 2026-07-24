import { ParsedTicketDraft, Ticket } from '../types/ticket';
import {
  formatJourneyDateLabel,
  istTodayIso,
  toJourneyDateIso,
} from '../services/railRadar';

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

function daysBetweenIso(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  return Math.round((tb - ta) / 86_400_000);
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
  if (ticket.kind === 'bus') return 10 * 60;
  if (ticket.kind === 'hotel') return 24 * 60; // default 1 night
  if (ticket.kind === 'metro') return 90; // typical metro trip + buffer
  // Long-distance trains + delay buffer when arrival clock is missing
  return 24 * 60;
}

/**
 * After scheduled arrival, keep the pass Ongoing this long so delayed
 * trains/buses/flights don't jump to Past while still en route.
 */
function postArrivalGraceMinutes(ticket: Ticket): number {
  if (ticket.kind === 'flight') return 4 * 60;
  if (ticket.kind === 'bus') return 8 * 60;
  if (ticket.kind === 'hotel') return 6 * 60; // late checkout buffer
  if (ticket.kind === 'metro') return 45;
  return 18 * 60; // rail — IRCTC delays often run many hours
}

function isCompletedStatus(status?: string): boolean {
  return /^(completed|travelled|traveled|flown|used|past)$/i.test(
    String(status || '').trim()
  );
}

function flightLooksLanded(ticket: Ticket): boolean {
  const s = String(ticket.flightStatus || '').toLowerCase();
  return /land|arriv|complet|flown|divert/.test(s);
}

/**
 * Boarding-pass barcodes often omit the year. If a flight date sits far in
 * the future, roll the year back to the most recent past (archive-friendly).
 */
export function coerceFlightArchiveDate<T extends Ticket | ParsedTicketDraft>(
  ticket: T
): T {
  if (ticket.kind !== 'flight') return ticket;
  const iso = toJourneyDateIso(ticket.departureDate);
  if (!iso) return ticket;
  const today = istTodayIso();
  const ahead = daysBetweenIso(today, iso);
  // Real upcoming boarding passes are usually within ~6 weeks
  if (ahead <= 45) return ticket;

  let y = Number(iso.slice(0, 4));
  const md = iso.slice(4); // -MM-DD
  let fixed = iso;
  while (y > 2015) {
    y -= 1;
    const candidate = `${y}${md}`;
    if (daysBetweenIso(today, candidate) <= 0) {
      fixed = candidate;
      break;
    }
    fixed = candidate;
  }

  if (fixed === iso) return ticket;
  const label = formatJourneyDateLabel(fixed) || fixed;
  const arrIso = toJourneyDateIso(ticket.arrivalDate);
  let nextArrival = ticket.arrivalDate;
  if (arrIso) {
    const delta = daysBetweenIso(iso, arrIso);
    const fixedArr = addDaysIso(fixed, Math.max(0, delta));
    nextArrival = formatJourneyDateLabel(fixedArr) || fixedArr;
  }

  return {
    ...ticket,
    departureDate: label,
    arrivalDate: nextArrival,
  };
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
  if (!y || !m || !d) {
    return stampAddMinutes(depStamp, estimateJourneyMinutes(ticket));
  }
  return packStamp(y, m, d, arrMins);
}

export function ticketTravelDateIso(ticket: Ticket): string | undefined {
  return toJourneyDateIso(ticket.departureDate);
}

/**
 * Phase from travel clocks only (ignores journeyCompleted / bookingStatus).
 * Used to undo false auto-complete when a delayed train is still running.
 */
export function getSchedulePassPhase(ticket: Ticket): PassPhase {
  const now = istNowStamp();
  const today = istTodayIso();
  const depIso = toJourneyDateIso(ticket.departureDate);
  const endIso =
    toJourneyDateIso(ticket.arrivalDate) || depIso;

  // Travel calendar date(s) finished → always past (live → Completed)
  if (endIso && endIso < today) return 'past';
  if (depIso && depIso < today && ticket.kind === 'flight') return 'past';

  if (ticket.kind === 'flight' && flightLooksLanded(ticket)) return 'past';

  const yearHint = String(ticket.departureDate || '').match(/\b(20\d{2})\b/);
  if (yearHint) {
    const y = Number(yearHint[1]);
    const nowY = Number(today.slice(0, 4));
    if (Number.isFinite(y) && y < nowY) return 'past';
  }

  const dep = ticketTravelStamp(ticket);
  if (dep == null) {
    // No parseable date — if year is old, past; else don't force completed
    if (yearHint) {
      const y = Number(yearHint[1]);
      const nowY = Math.floor(now / 1_440 / 10_000);
      if (Number.isFinite(y) && y < nowY) return 'past';
    }
    return 'upcoming';
  }

  if (now < dep) return 'upcoming';

  // Flights with no real departure clock (BCBP often has --:--) stay ongoing
  // for the whole travel day; Completed kicks in when the date rolls over.
  if (
    ticket.kind === 'flight' &&
    depIso === today &&
    parseClockMinutes(ticket.departureTime) == null
  ) {
    return 'ongoing';
  }

  const arr =
    ticketArrivalStamp(ticket) ??
    stampAddMinutes(dep, estimateJourneyMinutes(ticket));
  const ongoingUntil = stampAddMinutes(arr, postArrivalGraceMinutes(ticket));

  if (now < ongoingUntil) return 'ongoing';
  return 'past';
}

/**
 * True once the wallet should stop live updates:
 * travel/arrival calendar day is over, or schedule phase is past.
 */
export function isLiveWindowOver(ticket: Ticket): boolean {
  return getPassPhase(ticket) === 'past';
}

/** upcoming → before dep · ongoing → dep…arr(+grace) · past → after grace */
export function getPassPhase(ticket: Ticket): PassPhase {
  if (ticket.journeyCompleted) return 'past';
  if (isCompletedStatus(ticket.bookingStatus)) return 'past';
  return getSchedulePassPhase(ticket);
}

/**
 * Undo auto-complete when schedule still says the trip is active
 * (delayed train still en route after scheduled arrival).
 * Flights are never un-completed — old boarding passes stay archived.
 */
export function repairFalseCompletedFlags<T extends Ticket | ParsedTicketDraft>(
  ticket: T
): T {
  if (ticket.kind === 'flight') return ticket;

  const markedDone =
    Boolean(ticket.journeyCompleted) || isCompletedStatus(ticket.bookingStatus);
  if (!markedDone) return ticket;
  if (getSchedulePassPhase(ticket as Ticket) === 'past') return ticket;

  return {
    ...ticket,
    journeyCompleted: false,
    bookingStatus: isCompletedStatus(ticket.bookingStatus)
      ? 'Confirmed'
      : ticket.bookingStatus,
  };
}

/**
 * Mark archived / finished trips so UI + live tracking treat them as past.
 * Only when schedule phase is past (includes delay grace) — never while Ongoing.
 */
export function applyCompletedIfPast<T extends Ticket | ParsedTicketDraft>(
  ticket: T
): T {
  const dated =
    ticket.kind === 'flight' ? coerceFlightArchiveDate(ticket) : ticket;
  const repaired = repairFalseCompletedFlags(dated);
  if (repaired.journeyCompleted) return repaired;
  if (getSchedulePassPhase(repaired as Ticket) !== 'past') return repaired;
  return {
    ...repaired,
    journeyCompleted: true,
    bookingStatus:
      repaired.bookingStatus &&
      !/confirm|booked|pending/i.test(repaired.bookingStatus)
        ? repaired.bookingStatus
        : 'Completed',
    flightStatus:
      repaired.kind === 'flight'
        ? repaired.flightStatus &&
          !/schedul|on time|on-time/i.test(String(repaired.flightStatus))
          ? repaired.flightStatus
          : 'Completed'
        : repaired.flightStatus,
  };
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
