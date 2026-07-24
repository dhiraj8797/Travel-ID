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
  /** How we found this row. */
  source?: 'cirium' | 'realtime' | 'dated';
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
  A: 'In air',
  L: 'Landed',
  C: 'Cancelled',
  D: 'Diverted',
  R: 'Redirected',
  U: 'Unknown',
  NO: 'Not operating',
};

const flightCache = new Map<string, { at: number; value: CiriumFlightStatus | null }>();
const FLIGHT_CACHE_TTL_MS = 90_000;

function labelFor(code?: string): string {
  if (!code) return 'Unknown';
  return STATUS_LABELS[code] || STATUS_LABELS[code.toLowerCase()] || code;
}

function pickDate(
  ...values: Array<{ dateLocal?: string; dateUtc?: string } | string | null | undefined>
): string | undefined {
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'object') {
      if (v.dateLocal) return v.dateLocal;
      if (v.dateUtc) return v.dateUtc;
    }
  }
  return undefined;
}

type CiriumFs = {
  flightId?: number | string;
  carrierFsCode?: string;
  flightNumber?: string;
  departureAirportFsCode?: string;
  arrivalAirportFsCode?: string;
  status?: string;
  delays?: {
    departureGateDelayMinutes?: number;
    arrivalGateDelayMinutes?: number;
  };
  airportResources?: {
    departureTerminal?: string;
    departureGate?: string;
    arrivalTerminal?: string;
    arrivalGate?: string;
  };
  operationalTimes?: Record<
    string,
    { dateLocal?: string; dateUtc?: string } | undefined
  >;
};

function mapCiriumFlight(
  f: CiriumFs,
  fallbackCarrier: string,
  fallbackNumber: string
): CiriumFlightStatus {
  const ot = f.operationalTimes || {};
  const res = f.airportResources || {};
  const delay =
    typeof f.delays?.departureGateDelayMinutes === 'number'
      ? f.delays.departureGateDelayMinutes
      : typeof f.delays?.arrivalGateDelayMinutes === 'number'
        ? f.delays.arrivalGateDelayMinutes
        : undefined;

  return {
    flightId: f.flightId != null ? String(f.flightId) : undefined,
    carrier: (f.carrierFsCode || fallbackCarrier || '').toUpperCase(),
    flightNumber: String(f.flightNumber || fallbackNumber),
    status: f.status || 'U',
    statusLabel: labelFor(f.status),
    departureAirport: f.departureAirportFsCode,
    arrivalAirport: f.arrivalAirportFsCode,
    departureTerminal: res.departureTerminal,
    arrivalTerminal: res.arrivalTerminal,
    departureGate: res.departureGate,
    arrivalGate: res.arrivalGate,
    scheduledDeparture: pickDate(
      ot.publishedDeparture,
      ot.scheduledGateDeparture,
      ot.flightPlanPlannedDeparture
    ),
    estimatedDeparture: pickDate(
      ot.estimatedGateDeparture,
      ot.estimatedRunwayDeparture
    ),
    actualDeparture: pickDate(ot.actualGateDeparture, ot.actualRunwayDeparture),
    scheduledArrival: pickDate(
      ot.publishedArrival,
      ot.scheduledGateArrival,
      ot.flightPlanPlannedArrival
    ),
    estimatedArrival: pickDate(ot.estimatedGateArrival, ot.estimatedRunwayArrival),
    actualArrival: pickDate(ot.actualGateArrival, ot.actualRunwayArrival),
    delayMinutes: delay,
    source: 'cirium',
    raw: f,
  };
}

function scoreCirium(
  f: CiriumFs,
  fromCode?: string,
  toCode?: string
): number {
  let score = 0;
  const st = String(f.status || '').toUpperCase();
  if (st === 'A') score += 50;
  else if (st === 'S') score += 35;
  else if (st === 'L') score += 10;
  else if (st === 'C') score -= 40;

  const dep = (f.departureAirportFsCode || '').toUpperCase();
  const arr = (f.arrivalAirportFsCode || '').toUpperCase();
  if (fromCode && dep === fromCode.toUpperCase()) score += 40;
  if (toCode && arr === toCode.toUpperCase()) score += 40;
  if (f.airportResources?.departureGate) score += 8;
  if (f.airportResources?.departureTerminal) score += 4;
  return score;
}

async function fetchCiriumNative(input: {
  carrier: string;
  flight: string;
  iso: string;
  fromCode?: string;
  toCode?: string;
}): Promise<CiriumFlightStatus | null> {
  const [y, m, d] = input.iso.split('-');
  const qs = new URLSearchParams({
    carrier: input.carrier,
    flight: input.flight,
    year: y,
    month: m,
    day: d,
    utc: 'false',
  });
  if (input.fromCode) qs.set('airport', input.fromCode.toUpperCase());

  const res = await proxyFetch(`/cirium/flight-status?${qs}`).catch((e) => {
    throw new Error(
      e instanceof Error ? e.message : formatProxyNetworkError(e, getApiProxyUrl())
    );
  });

  const json = (await res.json()) as {
    error?: { message?: string };
    provider?: string;
    flightStatuses?: CiriumFs[];
  };

  if (res.status === 503) {
    // Cirium not configured on proxy — caller falls back to Aviationstack
    return null;
  }

  if (!res.ok || json.error) {
    throw new Error(
      json.error?.message || `Cirium lookup failed (${res.status})`
    );
  }

  const list = Array.isArray(json.flightStatuses) ? json.flightStatuses : [];
  if (!list.length) return null;

  let best: CiriumFs | null = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = scoreCirium(f, input.fromCode, input.toCode);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  if (!best) return null;

  // If route codes were given and nothing matched either airport, reject
  if (
    input.fromCode &&
    input.toCode &&
    bestScore < 40 &&
    (best.departureAirportFsCode || '').toUpperCase() !==
      input.fromCode.toUpperCase()
  ) {
    return null;
  }

  return mapCiriumFlight(best, input.carrier, input.flight);
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

function mapAvFlight(
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

function scoreAvFlight(
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

function pickBestAv(
  list: AvFlight[],
  preferDate: string,
  fromCode?: string,
  toCode?: string
): AvFlight | null {
  if (!list.length) return null;
  let best: AvFlight | null = null;
  let bestScore = -Infinity;
  for (const f of list) {
    const s = scoreAvFlight(f, preferDate, fromCode, toCode);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
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

async function fetchAviationstack(qs: URLSearchParams): Promise<AvFlight[]> {
  const proxy = getApiProxyUrl();
  if (!proxy) {
    throw new Error(
      'API proxy not configured. Set extra.apiProxyUrl (Travel ID proxy URL).'
    );
  }

  const res = await proxyFetch(`/flights?${qs}`).catch((e) => {
    throw new Error(
      e instanceof Error ? e.message : formatProxyNetworkError(e, proxy)
    );
  });
  const json = (await res.json()) as {
    error?: { code?: number | string; message?: string; info?: string };
    data?: AvFlight[];
  };

  if (json.error) {
    const info = `${json.error.info || ''} ${json.error.message || ''}`.toLowerCase();
    if (
      info.includes('historical') ||
      info.includes('flight_date') ||
      info.includes('upgrade') ||
      info.includes('your plan') ||
      info.includes('functionality') ||
      info.includes('not configured')
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
 * Live flight status:
 * 1) Cirium FlightStats (preferred when proxy has CIRIUM_APP_ID/KEY)
 * 2) Aviationstack fallback
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

  // Prefer Cirium
  try {
    const cirium = await fetchCiriumNative({
      carrier: parts.carrier,
      flight: parts.flight,
      iso,
      fromCode: input.fromCode,
      toCode: input.toCode,
    });
    if (cirium) {
      flightCache.set(cacheKey, { at: Date.now(), value: cirium });
      return cirium;
    }
  } catch (e) {
    // If Cirium is configured but failed, still try Aviationstack
    console.warn(
      '[flight]',
      e instanceof Error ? e.message : 'Cirium lookup failed — trying fallback'
    );
  }

  const delta = daysFromToday(iso);
  if (delta > 2) {
    flightCache.set(cacheKey, { at: Date.now(), value: null });
    throw new Error(
      'Live flight data usually appears within a few days of departure'
    );
  }

  // Aviationstack fallback
  const realtimeQs = new URLSearchParams({ flight_iata: flightIata });
  if (input.fromCode) realtimeQs.set('dep_iata', input.fromCode.toUpperCase());
  if (input.toCode) realtimeQs.set('arr_iata', input.toCode.toUpperCase());

  let list = await fetchAviationstack(realtimeQs);
  let source: 'realtime' | 'dated' = 'realtime';

  if (list.length) {
    const dated = list.filter((f) => !f.flight_date || f.flight_date === iso);
    if (dated.length) list = dated;
  }

  if (!list.length && delta >= -1 && delta <= 1) {
    const datedQs = new URLSearchParams({
      flight_iata: flightIata,
      flight_date: iso,
    });
    if (input.fromCode) datedQs.set('dep_iata', input.fromCode.toUpperCase());
    if (input.toCode) datedQs.set('arr_iata', input.toCode.toUpperCase());
    try {
      const datedList = await fetchAviationstack(datedQs);
      if (datedList.length) {
        list = datedList;
        source = 'dated';
      }
    } catch {
      /* ignore */
    }
  }

  if (!list.length && (input.fromCode || input.toCode)) {
    list = await fetchAviationstack(
      new URLSearchParams({ flight_iata: flightIata })
    );
    source = 'realtime';
    if (list.length) {
      const dated = list.filter((f) => !f.flight_date || f.flight_date === iso);
      if (dated.length) list = dated;
    }
  }

  const best = pickBestAv(list, iso, input.fromCode, input.toCode);
  const mapped = best
    ? mapAvFlight(best, parts.carrier, parts.flight, source)
    : null;
  flightCache.set(cacheKey, { at: Date.now(), value: mapped });
  return mapped;
}
