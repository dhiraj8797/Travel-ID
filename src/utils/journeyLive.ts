import { Ticket } from '../types/ticket';
import { formatJourneyDateLabel, toJourneyDateIso } from '../services/railRadar';
import { isPastPass } from './passTime';

/** UI / polling phase for train live tracking. */
export type LiveJourneyPhase =
  | 'too-early' // >2h before boarding departure
  | 'soon' // within 2h before departure, train not running yet
  | 'live' // journey active — show live location/delay/ETA
  | 'completed'; // destination reached / train completed

const LIVE_LEAD_MS = 2 * 60 * 60 * 1000; // trains: 2 hours before departure
/** Bus live journey unlocks this long before scheduled departure. */
export const BUS_LIVE_LEAD_MS = 30 * 60 * 1000;
/** Keep live tracking after scheduled arrival — trains are often delayed for hours. */
const COMPLETED_GRACE_MS = 18 * 60 * 60 * 1000;

function parseTimeMinutes(time?: string): number | null {
  const raw = (time || '').trim();
  if (!raw || raw === '--' || raw === '—' || raw === 'TBD' || raw === '--:--') {
    return null;
  }
  const h12 = raw.match(/^(\d{1,2}):(\d{2})\s*([ap]m)\b/i);
  if (h12) {
    let h = Number(h12[1]) % 12;
    if (h12[3].toLowerCase() === 'pm') h += 12;
    return h * 60 + Number(h12[2]);
  }
  const h24 = raw.match(/^(\d{1,2}):(\d{2})\b/);
  if (h24) return Number(h24[1]) * 60 + Number(h24[2]);
  return null;
}

/** Build a Date in Asia/Kolkata wall time for a ticket date + HH:mm. */
export function ticketDateTime(
  date?: string,
  time?: string,
  fallbackMinutes = 0
): Date | null {
  const iso = toJourneyDateIso(date);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const mins = parseTimeMinutes(time);
  const total = mins == null ? fallbackMinutes : mins;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  // Interpret as IST by using en-CA parts → equivalent UTC offset via formatter trick:
  // Construct as if local, then adjust using IST offset from Intl.
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  // IST is UTC+5:30 → store Instant that matches that wall clock in Kolkata
  return new Date(asUtc - (5 * 60 + 30) * 60_000);
}

function parseTravelDurationMs(travelTime?: string): number {
  if (!travelTime) return 8 * 60 * 60 * 1000; // default 8h if unknown
  const t = travelTime.toLowerCase();
  const hm = t.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
  if (hm) {
    return (Number(hm[1]) * 60 + Number(hm[2] || 0)) * 60_000;
  }
  const onlyM = t.match(/(\d+)\s*m/);
  if (onlyM) return Number(onlyM[1]) * 60_000;
  return 8 * 60 * 60 * 1000;
}

export type JourneyWindow = {
  departureAt: Date | null;
  arrivalAt: Date | null;
  departureLabel: string;
};

export function resolveJourneyWindow(input: {
  departureDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  travelTime?: string;
}): JourneyWindow {
  const departureAt = ticketDateTime(
    input.departureDate,
    input.departureTime,
    0
  );
  let arrivalAt = ticketDateTime(
    input.arrivalDate || input.departureDate,
    input.arrivalTime,
    0
  );
  if (departureAt && (!arrivalAt || arrivalAt.getTime() <= departureAt.getTime())) {
    arrivalAt = new Date(
      departureAt.getTime() + parseTravelDurationMs(input.travelTime)
    );
  }
  const timeLabel =
    (input.departureTime &&
      input.departureTime !== '--:--' &&
      input.departureTime) ||
    '—';
  const dateLabel =
    formatJourneyDateLabel(input.departureDate) ||
    input.departureDate ||
    'your travel date';
  return {
    departureAt,
    arrivalAt,
    departureLabel: `Journey starts ${dateLabel} at ${timeLabel}`,
  };
}

export function getLiveJourneyPhase(input: {
  departureDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  travelTime?: string;
  /** RailRadar run status when known */
  liveStatus?: string;
  /** Passenger destination stop status when known */
  destinationStopStatus?: string;
  now?: Date;
  /** Override default 2h lead (bus uses 30 min). */
  leadMs?: number;
}): LiveJourneyPhase {
  const now = input.now ?? new Date();
  const leadMs = input.leadMs ?? LIVE_LEAD_MS;
  const { departureAt, arrivalAt } = resolveJourneyWindow(input);
  const status = String(input.liveStatus || '').toLowerCase();
  const destSt = String(input.destinationStopStatus || '').toLowerCase();

  if (status === 'completed' || destSt === 'departed' || destSt === 'arrived') {
    return 'completed';
  }
  if (status === 'cancelled' && departureAt && now >= departureAt) {
    return 'completed';
  }

  if (status === 'running') return 'live';

  if (!departureAt) {
    // No time → only show on journey date (legacy fallback)
    return 'soon';
  }

  const liveFrom = departureAt.getTime() - leadMs;
  const liveUntil =
    (arrivalAt?.getTime() ?? departureAt.getTime() + 12 * 60 * 60 * 1000) +
    COMPLETED_GRACE_MS;
  const t = now.getTime();

  if (t > liveUntil) return 'completed';
  if (t < liveFrom) return 'too-early';

  // Within lead window or after departure, but API not running yet
  if (status === 'not-started' || t < departureAt.getTime()) return 'soon';

  return 'live';
}

/** Whether we should poll RailRadar live API. */
export function shouldFetchLiveStatus(
  phase: LiveJourneyPhase,
  force?: boolean
): boolean {
  if (force) return true;
  // Fetch on journey day window (soon/live). too-early still skips to save quota.
  return phase === 'soon' || phase === 'live';
}

export function livePhaseCopy(
  phase: LiveJourneyPhase,
  window: JourneyWindow
): { title: string; body: string } {
  switch (phase) {
    case 'too-early':
      return {
        title: window.departureLabel,
        body: 'Live tracking will be available approximately 2 hours before departure.',
      };
    case 'soon':
      return {
        title: 'Train status will be available soon',
        body:
          'Live location, delay and ETA unlock about 2 hours before departure, or once the train starts from its origin.',
      };
    case 'completed':
      return {
        title: 'Journey completed',
        body: 'Live tracking has ended for this trip.',
      };
    case 'live':
    default:
      return {
        title: 'Live tracking',
        body: 'Showing live location, delay and ETA.',
      };
  }
}

export function phaseFromTicket(
  ticket: Pick<
    Ticket,
    | 'departureDate'
    | 'departureTime'
    | 'arrivalDate'
    | 'arrivalTime'
    | 'travelTime'
  >,
  liveStatus?: string,
  destinationStopStatus?: string
): { phase: LiveJourneyPhase; window: JourneyWindow } {
  const window = resolveJourneyWindow(ticket);
  const phase = getLiveJourneyPhase({
    ...ticket,
    liveStatus,
    destinationStopStatus,
  });
  return { phase, window };
}

/** Bus journey phase — time unlock later; past trips stay completed. */
export function getBusJourneyPhase(
  ticket: Ticket,
  now?: Date
): { phase: LiveJourneyPhase; window: JourneyWindow } {
  const window = resolveJourneyWindow(ticket);
  void now;

  // Never show live GPS on finished trips
  if (isPastPass(ticket)) {
    return { phase: 'completed', window };
  }

  // TEMP: unlock tracking for upcoming + ongoing (30‑min gate later)
  // When ready: getLiveJourneyPhase({ ...ticket, now, leadMs: BUS_LIVE_LEAD_MS })
  return { phase: 'live', window };
}

export function busPhaseCopy(
  phase: LiveJourneyPhase,
  window: JourneyWindow,
  destinationName: string
): { title: string; body: string } {
  switch (phase) {
    case 'too-early':
      return {
        title: window.departureLabel,
        body: 'Live location & remaining km unlock 30 minutes before departure.',
      };
    case 'soon':
      return {
        title: 'Journey tracking ready',
        body: `GPS tracking is on toward ${destinationName}.`,
      };
    case 'completed':
      return {
        title: 'Journey completed',
        body: `You’ve reached ${destinationName}.`,
      };
    case 'live':
    default:
      return {
        title: 'Live bus journey',
        body: `Tracking remaining distance to ${destinationName}.`,
      };
  }
}
