import {
  formatProxyNetworkError,
  getApiProxyUrl,
  proxyFetch,
} from './apiProxy';

/** Proxied RailRadar base — secrets stay on the server. */
function railApiBase(): string | null {
  const proxy = getApiProxyUrl();
  return proxy ? `${proxy}/rail` : null;
}

export type RailRadarStop = {
  sequence: number;
  stationCode: string;
  stationName: string;
  isHalt?: boolean;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
  delayArrival?: number | null;
  delayDeparture?: number | null;
  status?: string;
  platform?: string | null;
  distance?: number;
};

export type LiveTrainStatus = {
  trainNumber: string;
  trainName?: string;
  status: 'running' | 'not-started' | 'completed' | 'cancelled' | string;
  delayMinutes: number;
  isLive: boolean;
  lastUpdatedAt?: string;
  startDate?: string;
  currentStationCode?: string;
  currentStationName?: string;
  currentStopStatus?: string;
  segmentProgress?: number;
  /** Remaining km to nextHalt (from RailRadar segment). */
  kmToNext?: number;
  speedKmh?: number;
  nextHaltName?: string;
  nextHaltCode?: string;
  previousHaltName?: string;
  previousHaltCode?: string;
  /** Human-readable live location for the pass UI */
  locationLabel?: string;
  route: RailRadarStop[];
};

export type BoardingLiveTimes = {
  scheduledDeparture?: string;
  scheduledArrival?: string;
  expectedDeparture?: string;
  expectedArrival?: string;
  departureDelayMin?: number;
  arrivalDelayMin?: number;
  fromPlatform?: string;
  toPlatform?: string;
  fromStatus?: string;
  toStatus?: string;
};

export type TrainDetailHalt = {
  sequence: number;
  stationCode: string;
  stationName: string;
  lat?: number;
  lng?: number;
  isHalt: boolean;
  platform?: string;
  arrival?: string;
  departure?: string;
  arrivalDay?: number;
  departureDay?: number;
  distance?: number;
};

export type TrainDetails = {
  trainNumber: string;
  trainName?: string;
  type?: string;
  category?: string;
  sourceCode?: string;
  sourceName?: string;
  destinationCode?: string;
  destinationName?: string;
  runDays: string[];
  distanceKm?: number;
  durationMin?: number;
  avgSpeedKmh?: number;
  totalHalts?: number;
  returnTrain?: string;
  /** RailRadar rake order e.g. ENG-SLRD-GEN-S1-S2-PC-B1-A1-LPR */
  coachPosition?: string;
  halts: TrainDetailHalt[];
};

export type TrainRouteGeometry = {
  trainNumber: string;
  format: string;
  /** [lat, lng] pairs */
  coordinates: Array<[number, number]>;
};

function normalizeTrainNumber(trainNumber: string): string {
  const number = String(trainNumber).replace(/\D/g, '').slice(0, 5);
  if (number.length < 4) {
    throw new Error('Valid train number required');
  }
  return number;
}

/** Short-lived in-memory cache so polling doesn't burn the RailRadar quota. */
const liveCache = new Map<string, { at: number; value: LiveTrainStatus }>();
const LIVE_CACHE_TTL_MS = 45_000;

/** Drop cached live payloads (e.g. after pull-to-refresh). */
export function clearLiveTrainCache(trainNumber?: string) {
  if (!trainNumber) {
    liveCache.clear();
    return;
  }
  const n = String(trainNumber).replace(/\D/g, '').slice(0, 5);
  for (const key of [...liveCache.keys()]) {
    if (key.startsWith(`${n}|`)) liveCache.delete(key);
  }
}

/** Client-side cooldown after proxy reports rate limit (for stale-cache serving). */
let rateLimitedUntil = 0;

export class RailRadarError extends Error {
  status?: number;
  code?: 'rate_limit' | 'network' | 'auth' | 'api';

  constructor(
    message: string,
    opts?: { status?: number; code?: RailRadarError['code'] }
  ) {
    super(message);
    this.name = 'RailRadarError';
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

function isQuotaMessage(message?: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('api limit') ||
    m.includes('limit reached') ||
    m.includes('quota') ||
    m.includes('too many') ||
    m.includes('exhausted') ||
    m.includes('429')
  );
}

/** True while proxy reported rate limit recently (used to serve stale cache). */
export function isRailRadarCoolingDown(): boolean {
  return rateLimitedUntil > Date.now();
}

async function railGet(path: string): Promise<unknown> {
  const base = railApiBase();
  if (!base) {
    throw new RailRadarError(
      'API proxy not configured. Set extra.apiProxyUrl (Travel ID proxy URL).',
      { code: 'api' }
    );
  }

  if (rateLimitedUntil > Date.now()) {
    const sec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    throw new RailRadarError(`RailRadar rate limit — retry in ${sec}s`, {
      status: 429,
      code: 'rate_limit',
    });
  }

  const railPath = path.startsWith('/rail/')
    ? path
    : `/rail${path.startsWith('/') ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await proxyFetch(railPath);
  } catch (e) {
    throw new RailRadarError(
      e instanceof Error
        ? e.message
        : formatProxyNetworkError(e, getApiProxyUrl()),
      { code: 'network' }
    );
  }

  let json: {
    success?: boolean;
    data?: unknown;
    error?: { message?: string; code?: string } | string;
    message?: string;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    json = {};
  }

  const errMsg =
    (typeof json.error === 'string'
      ? json.error
      : json.error?.message) ||
    json.message;

  if (res.status === 429 || isQuotaMessage(errMsg)) {
    const retryHdr = res.headers.get('retry-after');
    const retrySec = retryHdr ? Number(retryHdr) || 90 : 90;
    rateLimitedUntil = Date.now() + Math.max(30, retrySec) * 1000;
    throw new RailRadarError(
      errMsg || 'RailRadar rate limit — try again shortly',
      { status: 429, code: 'rate_limit' }
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new RailRadarError(
      errMsg || 'Live API unauthorized — check proxy token',
      { status: res.status, code: 'auth' }
    );
  }

  if (!res.ok || !json?.success) {
    throw new RailRadarError(
      errMsg || `Live train request failed (${res.status})`,
      { status: res.status, code: 'api' }
    );
  }

  return json.data;
}

/** Human-readable live-status error for boarding-pass UI. */
export function formatRailRadarError(error?: string | null): string {
  if (!error) return 'Fetching live location…';
  const e = error.toLowerCase();
  if (e.includes('rate limit') || e.includes('too many') || e.includes('429') || e.includes('api limit') || e.includes('limit reached') || e.includes('quota')) {
    return 'API limit hit — switching keys / retry shortly';
  }
  if (
    e.includes('network') ||
    e.includes('failed to fetch') ||
    e.includes('internet') ||
    e.includes('offline') ||
    e.includes('noroute') ||
    e.includes('cannot reach') ||
    e.includes('proxy')
  ) {
    return error.length > 90 ? `${error.slice(0, 87)}…` : error;
  }
  if (e.includes('api key') || e.includes('unauthorized') || e.includes('forbidden')) {
    return 'RailRadar API key issue';
  }
  return error.length > 80 ? `${error.slice(0, 77)}…` : error;
}

/** Convert ticket date strings like "18 Jul, 2026" / "18 Jul 2026" → YYYY-MM-DD */
export function toJourneyDateIso(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mon}-${day}`;
  }

  const m = trimmed.match(
    /(\d{1,2})\s+([A-Za-z]{3,})[.,]?\s+(\d{4})/
  );
  if (!m) return undefined;
  const months: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };
  const mon = months[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return undefined;
  const day = m[1].padStart(2, '0');
  return `${m[3]}-${mon}-${day}`;
}

/**
 * @deprecated Prefer getLiveJourneyPhase / shouldFetchLiveStatus from journeyLive.ts
 * Kept for older call sites — true from journey calendar day onward.
 */
export function isLiveStatusAvailable(journeyDate?: string): boolean {
  const iso = toJourneyDateIso(journeyDate);
  if (!iso) return true;
  return istTodayIso() >= iso;
}

export function formatJourneyDateLabel(journeyDate?: string): string | undefined {
  if (!journeyDate?.trim()) return undefined;
  const iso = toJourneyDateIso(journeyDate);
  if (!iso) return journeyDate.trim();
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${d} ${months[m - 1]}, ${y}`;
}

export function formatIsoTime(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function shiftIso(iso: string, minutes: number): Date {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

export function istTodayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function shiftDateIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function scoreLiveCandidate(
  live: LiveTrainStatus,
  fromCode?: string,
  toCode?: string,
  preferDate?: string
): number {
  let score = 0;
  if (live.isLive) score += 30;
  if (live.status === 'running') score += 50;
  else if (live.status === 'not-started') score += 45;
  else if (live.status === 'completed') score -= 80;
  else if (live.status === 'cancelled') score -= 100;

  const start = toJourneyDateIso(live.startDate) || String(live.startDate || '');
  const today = istTodayIso();
  const prefer = preferDate ? toJourneyDateIso(preferDate) || preferDate : undefined;

  // Strongly prefer the journey / today start date — avoids yesterday's mid-route run.
  if (prefer && start) {
    if (start === prefer) score += 100;
    else if (start === today) score += 50;
    else if (start < today) score -= 70;
  } else if (start === today) {
    score += 60;
  } else if (start && start < today) {
    score -= 50;
  }

  const from = findStop(live.route, fromCode);
  const to = findStop(live.route, toCode);
  const fromSt = String(from?.status || '').toLowerCase();
  const toSt = String(to?.status || '').toLowerCase();

  if (fromSt === 'departed') score += 20;
  if (fromSt === 'upcoming' && live.status === 'not-started') score += 25;
  if (toSt === 'upcoming' || toSt === 'arrived' || toSt === 'at-station') score += 25;
  if (toSt === 'departed') score -= 40; // already left your station — likely older run

  // Sanity: a "just started" train should not already be deep into the route.
  const departed = live.route.filter((h) =>
    ['departed', 'skipped'].includes(String(h.status || '').toLowerCase())
  ).length;
  if (live.status === 'not-started' && departed <= 1) score += 30;
  if (live.status === 'running' && departed >= Math.max(4, Math.floor(live.route.length * 0.4))) {
    // Mid/late route is fine if date matches; penalize if date is stale
    if (prefer && start && start !== prefer && start !== today) score -= 40;
  }

  return score;
}

async function fetchLiveTrainStatusForDate(
  number: string,
  date?: string
): Promise<LiveTrainStatus> {
  const params = new URLSearchParams({ haltsOnly: 'true' });
  if (date) params.set('date', date);

  const data = (await railGet(
    `/trains/${number}/live?${params}`
  )) as Record<string, any>;
  const route: RailRadarStop[] = normalizeLiveRoute(data.route);
  const currentCode =
    (data.currentLocation?.stationCode as string | undefined) ||
    (data.currentLocation?.station as { code?: string } | undefined)?.code;
  const currentFromRoute = currentCode
    ? route.find((s) => String(s.stationCode).toUpperCase() === currentCode.toUpperCase())
    : undefined;

  const previousHaltName =
    (data.previousHalt?.stationName as string | undefined) ||
    (data.previousHalt?.station as { name?: string } | undefined)?.name;
  const previousHaltCode =
    (data.previousHalt?.stationCode as string | undefined) ||
    (data.previousHalt?.station as { code?: string } | undefined)?.code;
  const nextHaltName =
    (data.nextHalt?.stationName as string | undefined) ||
    (data.nextHalt?.station as { name?: string } | undefined)?.name;
  const nextHaltCode =
    (data.nextHalt?.stationCode as string | undefined) ||
    (data.nextHalt?.station as { code?: string } | undefined)?.code;
  const currentStationName =
    currentFromRoute?.stationName ||
    (currentCode && previousHaltCode?.toUpperCase() === currentCode.toUpperCase()
      ? previousHaltName
      : undefined) ||
    currentCode;

  const stopStatus = String(data.currentLocation?.status || '').toLowerCase();
  const segmentProgress = normalizeSegmentProgress(
    data.currentLocation?.segmentProgress
  );
  const kmToNext = computeKmToNextHalt({
    route,
    previousHaltCode,
    nextHaltCode,
    previousDistance:
      typeof data.previousHalt?.distance === 'number'
        ? data.previousHalt.distance
        : undefined,
    nextDistance:
      typeof data.nextHalt?.distance === 'number'
        ? data.nextHalt.distance
        : undefined,
    segmentProgress,
    stopStatus,
  });
  const locationLabel = buildLocationLabel({
    runStatus: data.status,
    stopStatus,
    currentStationName,
    currentStationCode: currentCode,
    previousHaltName,
    previousHaltCode,
    nextHaltName,
    nextHaltCode,
    segmentProgress,
  });

  return {
    trainNumber: String(data.trainNumber || number),
    trainName: data.trainName || data.train?.name,
    status: data.status || 'unknown',
    delayMinutes: Number(data.delayMinutes ?? 0),
    isLive: Boolean(data.isLive),
    lastUpdatedAt: data.lastUpdatedAt,
    startDate: data.startDate,
    currentStationCode: currentCode,
    currentStationName,
    currentStopStatus: data.currentLocation?.status,
    segmentProgress,
    kmToNext,
    speedKmh: undefined,
    nextHaltName,
    nextHaltCode,
    previousHaltName,
    previousHaltCode,
    locationLabel,
    route,
  };
}

/**
 * Fetch live status for a train.
 * Prefer auto-detect date — ticket boarding date often differs from origin start date
 * (e.g. train left Chennai yesterday, passenger date is today).
 */
/** GET /v1/trains/{number} — schedule, type, run days, halt list */
export async function fetchTrainDetails(trainNumber: string): Promise<TrainDetails> {
  const number = normalizeTrainNumber(trainNumber);
  const data = (await railGet(`/trains/${number}`)) as {
    train?: Record<string, unknown>;
    route?: Array<Record<string, unknown>>;
  };
  const train = data.train || {};
  const source = (train.source || {}) as { code?: string; name?: string };
  const destination = (train.destination || {}) as { code?: string; name?: string };
  const route = Array.isArray(data.route) ? data.route : [];

  const halts: TrainDetailHalt[] = route
    .filter((s) => s.isHalt === true)
    .map((s) => {
      const station = (s.station || {}) as {
        code?: string;
        name?: string;
        lat?: number;
        lng?: number;
      };
      return {
        sequence: Number(s.sequence || 0),
        stationCode: String(station.code || ''),
        stationName: String(station.name || station.code || ''),
        lat: typeof station.lat === 'number' ? station.lat : undefined,
        lng: typeof station.lng === 'number' ? station.lng : undefined,
        isHalt: Boolean(s.isHalt ?? true),
        platform: s.platform ? String(s.platform) : undefined,
        arrival: s.arrival ? String(s.arrival) : undefined,
        departure: s.departure ? String(s.departure) : undefined,
        arrivalDay: typeof s.arrivalDay === 'number' ? s.arrivalDay : undefined,
        departureDay: typeof s.departureDay === 'number' ? s.departureDay : undefined,
        distance: typeof s.distance === 'number' ? s.distance : undefined,
      };
    })
    .filter((h) => h.stationCode);

  return {
    trainNumber: String(train.number || number),
    trainName: train.name ? String(train.name) : undefined,
    type: train.type ? String(train.type) : undefined,
    category: train.category ? String(train.category) : undefined,
    sourceCode: source.code,
    sourceName: source.name,
    destinationCode: destination.code,
    destinationName: destination.name,
    runDays: Array.isArray(train.runDays)
      ? train.runDays.map(String)
      : typeof train.runDays === 'string'
        ? train.runDays.split(/[\s,]+/).filter(Boolean)
        : [],
    distanceKm: typeof train.distance === 'number' ? train.distance : undefined,
    durationMin: typeof train.duration === 'number' ? train.duration : undefined,
    avgSpeedKmh: typeof train.avgSpeed === 'number' ? train.avgSpeed : undefined,
    totalHalts: typeof train.totalHalts === 'number' ? train.totalHalts : halts.length,
    returnTrain: train.returnTrain ? String(train.returnTrain) : undefined,
    coachPosition: train.coachPosition
      ? String(train.coachPosition)
      : undefined,
    halts,
  };
}

/** GET /v1/trains/{number}/route — lat/lng path for map sketch */
export async function fetchTrainRouteGeometry(
  trainNumber: string
): Promise<TrainRouteGeometry> {
  const number = normalizeTrainNumber(trainNumber);
  const data = (await railGet(`/trains/${number}/route?format=coordinates`)) as {
    trainNumber?: string;
    format?: string;
    coordinates?: Array<number[] | { lat?: number; lng?: number }>;
  };

  const coordinates: Array<[number, number]> = [];
  for (const point of data.coordinates || []) {
    if (Array.isArray(point) && point.length >= 2) {
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordinates.push([lat, lng]);
      }
      continue;
    }
    if (point && typeof point === 'object') {
      const lat = Number((point as { lat?: number }).lat);
      const lng = Number((point as { lng?: number }).lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordinates.push([lat, lng]);
      }
    }
  }

  if (!coordinates.length) {
    throw new Error('No route geometry for this train');
  }

  return {
    trainNumber: String(data.trainNumber || number),
    format: String(data.format || 'coordinates'),
    coordinates,
  };
}

export async function fetchLiveTrainStatus(
  trainNumber: string,
  journeyDate?: string,
  fromCode?: string,
  toCode?: string,
  opts?: { bypassCache?: boolean }
): Promise<LiveTrainStatus> {
  const number = normalizeTrainNumber(trainNumber);
  const cacheKey = `${number}|${toJourneyDateIso(journeyDate) || ''}|${(fromCode || '').toUpperCase()}|${(toCode || '').toUpperCase()}`;
  const cached = liveCache.get(cacheKey);
  if (
    !opts?.bypassCache &&
    cached &&
    Date.now() - cached.at < LIVE_CACHE_TTL_MS
  ) {
    return cached.value;
  }

  // Serve slightly stale cache while keys are cooling down instead of failing hard
  if (cached && isRailRadarCoolingDown()) {
    return cached.value;
  }

  const ticketDate = toJourneyDateIso(journeyDate);
  const today = istTodayIso();
  // Ticket / today first — auto-detect last so we don't latch onto an older run.
  const candidates: Array<string | undefined> = [
    ticketDate,
    ticketDate && ticketDate !== today ? today : undefined,
    undefined,
  ];
  const unique = [...new Set(candidates.filter((d, i, arr) => arr.indexOf(d) === i))];

  let best: LiveTrainStatus | undefined;
  let bestScore = -Infinity;
  let lastError: Error | undefined;

  for (const date of unique) {
    try {
      const live = await fetchLiveTrainStatusForDate(number, date);
      const score = scoreLiveCandidate(live, fromCode, toCode, ticketDate || today);
      if (score > bestScore) {
        best = live;
        bestScore = score;
      }
      // Strong match on preferred date — stop early to save quota
      const start = toJourneyDateIso(live.startDate) || live.startDate;
      if (
        (ticketDate && start === ticketDate && score >= 80) ||
        (live.status === 'running' && live.isLive && start === (ticketDate || today) && score >= 100) ||
        (live.status === 'not-started' && start === (ticketDate || today) && score >= 90)
      ) {
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Live status failed');
      if (e instanceof RailRadarError && e.code === 'rate_limit') break;
    }
  }

  if (!best) {
    if (cached) return cached.value;
    throw lastError || new RailRadarError('Unable to load live train status', { code: 'api' });
  }
  liveCache.set(cacheKey, { at: Date.now(), value: best });
  return best;
}

/** Expected arrival Date at passenger destination (or boarding) station. */
export function getExpectedArrivalDate(
  live: LiveTrainStatus,
  stationCode?: string
): Date | undefined {
  const stop = findStop(live.route, stationCode);
  if (!stop) return undefined;

  if (stop.actualArrival) {
    const d = new Date(stop.actualArrival);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (stop.scheduledArrival) {
    const mins = stop.delayArrival ?? live.delayMinutes ?? 0;
    return shiftIso(stop.scheduledArrival, mins);
  }
  return undefined;
}

export function minutesUntil(date?: Date): number | undefined {
  if (!date) return undefined;
  return Math.round((date.getTime() - Date.now()) / 60_000);
}

function buildLocationLabel(input: {
  runStatus?: string;
  stopStatus?: string;
  currentStationName?: string;
  currentStationCode?: string;
  previousHaltName?: string;
  previousHaltCode?: string;
  nextHaltName?: string;
  nextHaltCode?: string;
  segmentProgress?: number;
}): string {
  const {
    runStatus,
    stopStatus,
    currentStationName,
    currentStationCode,
    previousHaltName,
    previousHaltCode,
    nextHaltName,
    nextHaltCode,
    segmentProgress,
  } = input;

  if (runStatus === 'not-started') {
    return previousHaltName || currentStationName
      ? `At origin ${formatStation(previousHaltName || currentStationName, previousHaltCode || currentStationCode)}`
      : 'Not started';
  }
  if (runStatus === 'completed') return 'Journey completed';
  if (runStatus === 'cancelled') return 'Train cancelled';

  const here = formatStation(currentStationName, currentStationCode);
  const next = formatStation(nextHaltName, nextHaltCode);
  const prev = formatStation(previousHaltName, previousHaltCode);

  if (stopStatus === 'arrived' || stopStatus === 'at-station') {
    return here ? `At ${here}` : 'At station';
  }
  if (stopStatus === 'departed' || stopStatus === 'running') {
    if (prev && next) {
      const pct =
        typeof segmentProgress === 'number'
          ? ` · ${Math.round(segmentProgress * 100)}% to next`
          : '';
      return `Between ${prev} → ${next}${pct}`;
    }
    if (here && next) return `Left ${here} → ${next}`;
    if (next) return `Towards ${next}`;
  }
  if (here && next) return `${here} → ${next}`;
  return here || next || 'Live tracking';
}

function formatStation(name?: string, code?: string): string | undefined {
  if (!name && !code) return undefined;
  if (name && code) {
    const short = name.length > 22 ? `${name.slice(0, 20)}…` : name;
    return `${short} (${code})`;
  }
  return name || code;
}

function normalizeSegmentProgress(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  // Some feeds send 0–100 instead of 0–1
  const n = raw > 1 && raw <= 100 ? raw / 100 : raw;
  if (n < 0 || n > 1) return undefined;
  return n;
}

/**
 * Remaining km to next halt using previousHalt → nextHalt distances
 * and segmentProgress. Avoids treating "progress missing" as 0% (which
 * wrongly jumps the UI back to the full segment length).
 */
function computeKmToNextHalt(args: {
  route: RailRadarStop[];
  previousHaltCode?: string;
  nextHaltCode?: string;
  previousDistance?: number;
  nextDistance?: number;
  segmentProgress?: number;
  stopStatus?: string;
}): number | undefined {
  const {
    route,
    previousHaltCode,
    nextHaltCode,
    previousDistance,
    nextDistance,
    segmentProgress,
    stopStatus,
  } = args;

  if (['arrived', 'at-station'].includes(String(stopStatus || '').toLowerCase())) {
    return 0;
  }

  const prevFromRoute = previousHaltCode
    ? route.find(
        (s) =>
          String(s.stationCode).toUpperCase() === previousHaltCode.toUpperCase()
      )
    : undefined;
  const nextFromRoute = nextHaltCode
    ? route.find(
        (s) => String(s.stationCode).toUpperCase() === nextHaltCode.toUpperCase()
      )
    : undefined;

  const prevDist =
    typeof previousDistance === 'number'
      ? previousDistance
      : prevFromRoute?.distance;
  const nextDist =
    typeof nextDistance === 'number' ? nextDistance : nextFromRoute?.distance;

  if (typeof prevDist !== 'number' || typeof nextDist !== 'number') {
    return undefined;
  }

  const segLen = nextDist - prevDist;
  if (segLen <= 0) return 0;

  if (typeof segmentProgress === 'number') {
    return Math.max(0, Math.round(segLen * (1 - segmentProgress)));
  }

  // No progress yet — unknown remaining; caller should keep last stable value
  return undefined;
}

function findStop(route: RailRadarStop[], code?: string): RailRadarStop | undefined {
  if (!code) return undefined;
  const want = code.toUpperCase();
  return route.find((s) => String(s.stationCode || '').toUpperCase() === want);
}

/**
 * RailRadar live `route[]` may be flat or nest station as `{ station: { code, name } }`.
 * Always return flat stops with readable stationName.
 */
function normalizeLiveRoute(raw: unknown): RailRadarStop[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const s = (item || {}) as Record<string, unknown>;
      const nested = (s.station || {}) as { code?: string; name?: string };
      const stationCode = String(
        s.stationCode || s.code || nested.code || ''
      ).trim();
      const stationName = String(
        s.stationName || s.name || nested.name || stationCode || ''
      ).trim();
      if (!stationCode && !stationName) return null;
      return {
        sequence: Number(s.sequence ?? index + 1),
        stationCode: stationCode || stationName,
        stationName: stationName || stationCode,
        isHalt: s.isHalt !== false,
        scheduledArrival: (s.scheduledArrival as string | null | undefined) ?? null,
        scheduledDeparture:
          (s.scheduledDeparture as string | null | undefined) ?? null,
        actualArrival: (s.actualArrival as string | null | undefined) ?? null,
        actualDeparture: (s.actualDeparture as string | null | undefined) ?? null,
        delayArrival:
          typeof s.delayArrival === 'number' ? s.delayArrival : null,
        delayDeparture:
          typeof s.delayDeparture === 'number' ? s.delayDeparture : null,
        status: s.status ? String(s.status) : undefined,
        platform: s.platform != null ? String(s.platform) : null,
        distance: typeof s.distance === 'number' ? s.distance : undefined,
      } satisfies RailRadarStop;
    })
    .filter((s): s is RailRadarStop => Boolean(s));
}

/** Map live route stops to boarding-pass from/to expected times. */
export function resolveBoardingLiveTimes(
  live: LiveTrainStatus,
  fromCode?: string,
  toCode?: string
): BoardingLiveTimes {
  const from = findStop(live.route, fromCode);
  const to = findStop(live.route, toCode);
  const overallDelay = live.delayMinutes || 0;

  const fromDepIso = from?.actualDeparture || from?.scheduledDeparture || null;
  const toArrIso = to?.actualArrival || to?.scheduledArrival || null;

  const fromDelay =
    from?.delayDeparture ??
    (from?.scheduledDeparture && !from.actualDeparture ? overallDelay : undefined);
  const toDelay =
    to?.delayArrival ??
    (to?.scheduledArrival && !to.actualArrival ? overallDelay : undefined);

  let expectedDeparture = formatIsoTime(from?.actualDeparture);
  if (!expectedDeparture && from?.scheduledDeparture) {
    const mins = fromDelay ?? overallDelay;
    expectedDeparture = mins
      ? formatIsoTime(shiftIso(from.scheduledDeparture, mins).toISOString())
      : formatIsoTime(from.scheduledDeparture);
    // Prefer formatting the shifted Date directly to keep IST display stable
    if (mins) {
      expectedDeparture = shiftIso(from.scheduledDeparture, mins).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }

  let expectedArrival = formatIsoTime(to?.actualArrival);
  if (!expectedArrival && to?.scheduledArrival) {
    const mins = toDelay ?? overallDelay;
    expectedArrival = mins
      ? shiftIso(to.scheduledArrival, mins).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : formatIsoTime(to.scheduledArrival);
  }

  const cleanPf = (value?: string | null) => {
    if (value == null) return undefined;
    const s = String(value).trim();
    if (!s || s === '-' || s.toLowerCase() === 'null') return undefined;
    return s;
  };

  return {
    scheduledDeparture: formatIsoTime(from?.scheduledDeparture),
    scheduledArrival: formatIsoTime(to?.scheduledArrival),
    expectedDeparture,
    expectedArrival,
    departureDelayMin: fromDelay ?? (from ? overallDelay : undefined),
    arrivalDelayMin: toDelay ?? (to ? overallDelay : undefined),
    fromPlatform: cleanPf(from?.platform),
    toPlatform: cleanPf(to?.platform),
    fromStatus: from?.status,
    toStatus: to?.status,
  };
}
