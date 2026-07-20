import { istTodayIso, toJourneyDateIso } from './railRadar';
import { ciriumFlightParts } from '../utils/flightIdentity';
import {
  formatProxyNetworkError,
  getApiProxyUrl,
  isApiProxyConfigured,
  proxyFetch,
} from './apiProxy';

export type CiriumFlightStatus = {
  flightId?: string;
  carrier: string;
  flightNumber: string;
  status: string;
  statusLabel: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  departureGate?: string;
  arrivalGate?: string;
  scheduledDeparture?: string;
  estimatedDeparture?: string;
  actualDeparture?: string;
  scheduledArrival?: string;
  estimatedArrival?: string;
  actualArrival?: string;
  delayMinutes?: number;
  /** How we found this row (free tier = realtime). */
  source?: 'realtime' | 'dated';
  raw?: unknown;
};

/** True when the Travel ID API proxy is configured (keys live on the server). */
export function isCiriumConfigured(): boolean {
  return isApiProxyConfigured();
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  active: 'In air',
  landed: 'Landed',
  cancelled: 'Cancelled',
  incident: 'Incident',
  diverted: 'Diverted',
  S: 'Scheduled',
  A: 'Active',
  L: 'Landed',
  C: 'Cancelled',
  D: 'Diverted',
  U: 'Unknown',
};

const flightCache = new Map<string, { at: number; value: CiriumFlightStatus | null }>();
const FLIGHT_CACHE_TTL_MS = 90_000;

function labelFor(code?: string): string {
  if (!code) return 'Unknown';
  return STATUS_LABELS[code.toLowerCase()] || STATUS_LABELS[code] || code;
}

type AvLeg = {
  airport?: string;
  iata?: string;
  icao?: string;
  terminal?: string | null;
  gate?: string | null;
  delay?: number | null;
  scheduled?: string | null;
  estimated?: string | null;
  actual?: string | null;
  estimated_runway?: string | null;
  actual_runway?: string | null;
};

type AvFlight = {
  flight_date?: string;
  flight_status?: string;
  departure?: AvLeg;
  arrival?: AvLeg;
  airline?: { name?: string; iata?: string; icao?: string };
  flight?: {
    number?: string;
    iata?: string;
    icao?: string;
    codeshared?: unknown;
  };
};

function mapFlight(
  f: AvFlight,
  fallbackCarrier: string,
  fallbackNumber: string,
  source: 'realtime' | 'dated'
): CiriumFlightStatus {
  const dep = f.departure || {};
  const arr = f.arrival || {};
  const delay =
    typeof dep.delay === 'number'
      ? dep.delay
      : typeof arr.delay === 'number'
        ? arr.delay
        : undefined;
  const carrier = (f.airline?.iata || fallbackCarrier || '').toUpperCase();
  const num =
    f.flight?.number ||
    (f.flight?.iata || '').replace(/^[A-Z0-9]{2}/, '') ||
    fallbackNumber;

  return {
    flightId: f.flight?.iata || f.flight?.icao || undefined,
    carrier,
    flightNumber: String(num),
    status: f.flight_status || 'U',
    statusLabel: labelFor(f.flight_status),
    departureAirport: dep.iata || dep.icao,
    arrivalAirport: arr.iata || arr.icao,
    departureTerminal: dep.terminal || undefined,
    arrivalTerminal: arr.terminal || undefined,
    departureGate: dep.gate || undefined,
    arrivalGate: arr.gate || undefined,
    scheduledDeparture: dep.scheduled || undefined,
    estimatedDeparture: dep.estimated || dep.estimated_runway || undefined,
    actualDeparture: dep.actual || dep.actual_runway || undefined,
    scheduledArrival: arr.scheduled || undefined,
    estimatedArrival: arr.estimated || arr.estimated_runway || undefined,
    actualArrival: arr.actual || arr.actual_runway || undefined,
    delayMinutes: delay,
    source,
    raw: f,
  };
}

function scoreFlight(
  f: AvFlight,
  preferDate: string,
  fromCode?: string,
  toCode?: string
): number {
  let score = 0;
  const st = String(f.flight_status || '').toLowerCase();
  if (st === 'active') score += 50;
  else if (st === 'scheduled') score += 35;
  else if (st === 'landed') score += 10;
  else if (st === 'cancelled') score -= 40;

  const dep = (f.departure?.iata || '').toUpperCase();
  const arr = (f.arrival?.iata || '').toUpperCase();
  if (fromCode && dep === fromCode.toUpperCase()) score += 40;
  if (toCode && arr === toCode.toUpperCase()) score += 40;

  if (f.flight_date === preferDate) score += 30;
  else if (f.flight_date && f.flight_date !== preferDate) score -= 15;

  if (f.departure?.gate) score += 8;
  if (f.departure?.terminal) score += 4;
  if (f.departure?.estimated || f.departure?.actual) score += 6;

  return score;
}

function pickBest(
  list: AvFlight[],
  preferDate: string,
  fromCode?: string,
  toCode?: string
): AvFlight | null {
  if (!list.length) return null;
  let best: AvFlight | null = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = scoreFlight(f, preferDate, fromCode, toCode);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  // Reject weak mismatches (wrong route) when we have airport codes
  if (
    best &&
    fromCode &&
    toCode &&
    bestScore < 40 &&
    (best.departure?.iata || '').toUpperCase() !== fromCode.toUpperCase()
  ) {
    return null;
  }
  return best;
}

async function fetchFlights(qs: URLSearchParams): Promise<AvFlight[]> {
  const proxy = getApiProxyUrl();
  if (!proxy) {
    throw new Error(
      'API proxy not configured. Set extra.apiProxyUrl (Travel ID proxy URL).'
    );
  }

  const res = await proxyFetch(`/flights?${qs}`).catch((e) => {
    throw new Error(
      e instanceof Error
        ? e.message
        : formatProxyNetworkError(e, proxy)
    );
  });
  const json = (await res.json()) as {
    error?: { code?: number | string; message?: string; info?: string };
    data?: AvFlight[];
  };

  // Free plan often rejects historical / flight_date — treat as empty, not fatal
  if (json.error) {
    const info = `${json.error.info || ''} ${json.error.message || ''}`.toLowerCase();
    if (
      info.includes('historical') ||
      info.includes('flight_date') ||
      info.includes('upgrade') ||
      info.includes('your plan') ||
      info.includes('functionality')
    ) {
      return [];
    }
    throw new Error(
      json.error.info ||
        json.error.message ||
        `Flight API error (${res.status})`
    );
  }

  if (!res.ok) {
    throw new Error(`Flight API error (${res.status})`);
  }

  return Array.isArray(json.data) ? json.data : [];
}

function daysFromToday(iso: string): number {
  const today = istTodayIso();
  const t0 = Date.parse(`${today}T00:00:00+05:30`);
  const t1 = Date.parse(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(t0) || Number.isNaN(t1)) return 0;
  return Math.round((t1 - t0) / 86_400_000);
}

/**
 * Live flight status tuned for Aviationstack Free:
 * - Prefer real-time (no flight_date) — Free has no Historical Flights
 * - Cache to protect the 100 calls/month quota
 * - Soft-fail dated lookups instead of hard errors
 */
export async function fetchCiriumFlightStatus(input: {
  airlineCode?: string;
  flightNumber?: string;
  departureDate: string;
  fromCode?: string;
  toCode?: string;
  bypassCache?: boolean;
}): Promise<CiriumFlightStatus | null> {
  if (!isApiProxyConfigured()) {
    throw new Error(
      'API proxy not configured. Set extra.apiProxyUrl (Travel ID proxy URL).'
    );
  }

  const parts = ciriumFlightParts(input.airlineCode, input.flightNumber);
  if (!parts) {
    throw new Error('Need airline code and flight number for flight lookup');
  }

  const iso = toJourneyDateIso(input.departureDate);
  if (!iso) {
    throw new Error('Need a valid travel date for flight lookup');
  }

  const flightIata = `${parts.carrier}${parts.flight}`;
  const cacheKey = `${flightIata}|${iso}|${(input.fromCode || '').toUpperCase()}|${(input.toCode || '').toUpperCase()}`;
  const cached = flightCache.get(cacheKey);
  if (
    !input.bypassCache &&
    cached &&
    Date.now() - cached.at < FLIGHT_CACHE_TTL_MS
  ) {
    return cached.value;
  }

  const delta = daysFromToday(iso);
  // Free realtime feed won't have far-future schedules
  if (delta > 2) {
    const none = null;
    flightCache.set(cacheKey, { at: Date.now(), value: none });
    throw new Error(
      'Live flight data usually appears within ~48 hours of departure (Free plan)'
    );
  }

  // 1) Real-time first (Free plan strength)
  const realtimeQs = new URLSearchParams({ flight_iata: flightIata });
  if (input.fromCode) realtimeQs.set('dep_iata', input.fromCode.toUpperCase());
  if (input.toCode) realtimeQs.set('arr_iata', input.toCode.toUpperCase());

  let list = await fetchFlights(realtimeQs);
  let source: 'realtime' | 'dated' = 'realtime';

  // Soft client filter by date when the API includes flight_date
  if (list.length) {
    const dated = list.filter((f) => !f.flight_date || f.flight_date === iso);
    if (dated.length) list = dated;
  }

  // 2) Only for today / nearby: optional dated query (may be blocked on Free)
  if (!list.length && delta >= -1 && delta <= 1) {
    const datedQs = new URLSearchParams({
      flight_iata: flightIata,
      flight_date: iso,
    });
    if (input.fromCode) datedQs.set('dep_iata', input.fromCode.toUpperCase());
    if (input.toCode) datedQs.set('arr_iata', input.toCode.toUpperCase());
    try {
      const datedList = await fetchFlights(datedQs);
      if (datedList.length) {
        list = datedList;
        source = 'dated';
      }
    } catch {
      /* Free plan — ignore */
    }
  }

  // 3) Broader realtime without airport filters
  if (!list.length && (input.fromCode || input.toCode)) {
    list = await fetchFlights(new URLSearchParams({ flight_iata: flightIata }));
    source = 'realtime';
    if (list.length) {
      const dated = list.filter((f) => !f.flight_date || f.flight_date === iso);
      if (dated.length) list = dated;
    }
  }

  const best = pickBest(list, iso, input.fromCode, input.toCode);
  const mapped = best ? mapFlight(best, parts.carrier, parts.flight, source) : null;
  flightCache.set(cacheKey, { at: Date.now(), value: mapped });
  return mapped;
}
