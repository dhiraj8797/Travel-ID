import { extractPassengersFromText } from '../parsers/ticketText';
import { ParsedTicketDraft, Passenger } from '../types/ticket';

const CONFIRM_TKT = 'https://cttrainsapi.confirmtkt.com/api/v2/ctpro/mweb';

export type PnrLookupResult = {
  pnr: string;
  trainNumber: string;
  trainName?: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  boardingCode?: string;
  boardingName?: string;
  classType?: string;
  quota?: string;
  departureDate: string;
  arrivalDate?: string;
  departureTime?: string;
  arrivalTime?: string;
  bookingDate?: string;
  platform?: string;
  duration?: string;
  fare?: string;
  chartPrepared?: boolean;
  passengers: Passenger[];
  raw?: Record<string, unknown>;
};

function normalizePnr(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new Error('Enter a valid 10-digit IRCTC PNR');
  }
  return digits;
}

/** Find a 10-digit IRCTC PNR in messy OCR / PDF text. */
export function extractRailPnr(text: string): string | undefined {
  if (!text) return undefined;
  const labeled = text.match(
    /P\s*N\s*R\s*(?:No|Number|#)?\s*[:.\-]?\s*(\d{10})/i
  );
  if (labeled?.[1]) return labeled[1];

  const all = [...text.matchAll(/\b(\d{10})\b/g)].map((m) => m[1]);
  return all.find((p) => !/^(\d)\1{9}$/.test(p)) || all[0];
}

function berthFromCode(code?: string | null): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    LB: 'LOWER',
    MB: 'MIDDLE',
    UB: 'UPPER',
    SL: 'SIDE LOWER',
    SU: 'SIDE UPPER',
    WS: 'WINDOW SIDE',
  };
  return map[code.toUpperCase()] || code.toUpperCase();
}

function formatDoj(ddmmyyyy?: string): string {
  if (!ddmmyyyy) return '';
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return ddmmyyyy;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const mon = months[Number(m[2]) - 1] || m[2];
  return `${Number(m[1])} ${mon}, ${m[3]}`;
}

function durationLabel(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d+):(\d+)$/);
  if (!m) return raw;
  return `${Number(m[1])}h ${Number(m[2])}m`;
}

function isPlaceholderName(name?: string): boolean {
  if (!name?.trim()) return true;
  const n = name.trim().toLowerCase();
  return (
    n === 'traveller' ||
    n === 'traveler' ||
    n === 'passenger' ||
    /^passenger\s*\d+$/i.test(n)
  );
}

function pickPassengerName(ps: Record<string, unknown>, index: number): string {
  const keys = [
    'passengerName',
    'PassengerName',
    'passenger_name',
    'paxName',
    'PaxName',
    'name',
    'Name',
    'passenger',
    'Passenger',
    'pax',
  ];
  for (const key of keys) {
    const v = ps[key];
    if (typeof v === 'string' && v.trim() && !isPlaceholderName(v)) {
      return v.trim();
    }
  }
  // Nested objects sometimes hold the name
  for (const nestKey of ['passengerDetails', 'details', 'info']) {
    const nest = ps[nestKey];
    if (nest && typeof nest === 'object') {
      const nested = pickPassengerName(nest as Record<string, unknown>, index);
      if (!isPlaceholderName(nested)) return nested;
    }
  }
  return `Passenger ${Number(ps.number || index + 1)}`;
}

/** Prefer real names from local OCR/PDF over ConfirmTkt placeholders. */
export function mergePassengerLists(
  apiPassengers: Passenger[],
  localPassengers: Passenger[] = [],
  rawText?: string
): Passenger[] {
  const fromText = rawText
    ? extractPassengersFromText(rawText).filter((p) => !isPlaceholderName(p.name))
    : [];
  const nameSources = [localPassengers, fromText];
  const count = Math.max(
    apiPassengers.length,
    localPassengers.length,
    fromText.length,
    1
  );

  const merged: Passenger[] = [];
  for (let i = 0; i < count; i++) {
    const api = apiPassengers[i];
    const local = localPassengers[i];
    const text = fromText[i];
    let name =
      (api && !isPlaceholderName(api.name) ? api.name : undefined) ||
      (local && !isPlaceholderName(local.name) ? local.name : undefined) ||
      (text && !isPlaceholderName(text.name) ? text.name : undefined);

    if (!name) {
      for (const src of nameSources) {
        const hit = src.find((p) => !isPlaceholderName(p.name));
        if (hit && !merged.some((m) => m.name === hit.name)) {
          name = hit.name;
          break;
        }
      }
    }

    merged.push({
      name: name || api?.name || local?.name || `Passenger ${i + 1}`,
      age: api?.age || local?.age || text?.age,
      gender: api?.gender || local?.gender || text?.gender,
      coach: api?.coach || local?.coach || text?.coach,
      seat: api?.seat || local?.seat || text?.seat,
      berth: api?.berth || local?.berth || text?.berth,
      status: api?.status || local?.status || text?.status,
      currentStatus:
        api?.currentStatus || local?.currentStatus || text?.currentStatus,
    });
  }
  return merged;
}

const CONFIRM_TKT_BODY = JSON.stringify({
  proPlanName: 'CP7',
  emailId: '',
  tempToken: '',
});

/** Web client headers — needed for charted / completed (past) PNRs. */
const CT_WEB_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  ApiKey: 'ct-web!2$',
  'CT-Token': '',
  'CT-Userkey': '',
  'Cache-Control': 'no-cache',
  ClientId: 'ct-web',
  'Content-Type': 'application/json',
  DeviceId: 'd7369386-46dc-4e87-830c-f7653b2b8551',
  Origin: 'https://www.confirmtkt.com',
  Pragma: 'no-cache',
  Referer: 'https://www.confirmtkt.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

const CT_MWEB_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile Safari/537.36',
  Origin: 'https://www.confirmtkt.com',
  Referer: 'https://www.confirmtkt.com/',
};

type ConfirmTktMode = {
  querysource: 'ct-web' | 'ct-mweb';
  livePnr: boolean;
  headers: Record<string, string>;
};

/**
 * Past / chart-prepared PNRs often fail with livePnr=true + ct-mweb.
 * Prefer ct-web + livePnr=false first (same as ConfirmTkt website).
 */
const CONFIRM_TKT_MODES: ConfirmTktMode[] = [
  { querysource: 'ct-web', livePnr: false, headers: CT_WEB_HEADERS },
  { querysource: 'ct-web', livePnr: true, headers: CT_WEB_HEADERS },
  { querysource: 'ct-mweb', livePnr: false, headers: CT_MWEB_HEADERS },
  { querysource: 'ct-mweb', livePnr: true, headers: CT_MWEB_HEADERS },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasUsablePnrPayload(p: Record<string, unknown>): boolean {
  const trainNo = String(p.trainNo || p.TrainNo || '').trim();
  const pnrField = String(p.pnr || p.Pnr || '').trim();
  return Boolean(trainNo || (pnrField.length === 10));
}

function friendlyPnrError(raw: string): Error {
  const msg = String(raw || 'PNR lookup failed').trim();
  if (/invalid/i.test(msg)) {
    return new Error(
      'PNR not found. IRCTC removes completed journey PNRs after a few days — upload the ticket PDF or photo instead, or try again closer to travel.'
    );
  }
  if (/flush|expired|not available|journey.*(over|completed)|chart/i.test(msg)) {
    return new Error(
      'This PNR is no longer available from IRCTC (common after the journey). Upload your ticket PDF or photo instead.'
    );
  }
  return new Error(msg);
}

async function postConfirmTktOnce(
  pnr: string,
  mode: ConfirmTktMode
): Promise<Record<string, unknown>> {
  const url = `${CONFIRM_TKT}/${pnr}?querysource=${mode.querysource}&locale=en&getHighChanceText=true&livePnr=${mode.livePnr}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: mode.headers,
    body: CONFIRM_TKT_BODY,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = json?.data as Record<string, unknown> | undefined;
  const p = data?.pnrResponse as Record<string, unknown> | undefined;

  if (!res.ok || !p) {
    const nested = p?.error;
    const errObj = json?.error as { message?: string } | undefined;
    throw friendlyPnrError(
      String(
        nested ||
          errObj?.message ||
          json?.message ||
          `PNR lookup failed (${res.status})`
      )
    );
  }

  if (p.error && Number(p.errorCode || 0) !== 0) {
    throw friendlyPnrError(String(p.error));
  }

  if (!hasUsablePnrPayload(p)) {
    throw friendlyPnrError(
      String(p.error || 'Empty PNR response — try again or upload your ticket PDF')
    );
  }

  return p;
}

async function postConfirmTkt(pnr: string): Promise<Record<string, unknown>> {
  let lastError: Error | undefined;

  // ConfirmTkt often returns Invalid PNR on the first hit — retry, then try
  // alternate livePnr / client modes (past journeys need livePnr=false).
  for (let modeIdx = 0; modeIdx < CONFIRM_TKT_MODES.length; modeIdx++) {
    const mode = CONFIRM_TKT_MODES[modeIdx];
    const attempts = modeIdx === 0 ? 3 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        if (attempt > 0) await sleep(350 * attempt);
        return await postConfirmTktOnce(pnr, mode);
      } catch (e) {
        lastError =
          e instanceof Error ? e : new Error('Network error fetching PNR');
        const msg = lastError.message;
        const retryable =
          /invalid|empty|network|failed \(\d+\)|timed out|timeout|not found/i.test(
            msg
          );
        if (!retryable) throw lastError;
      }
    }
  }

  throw lastError || new Error('PNR lookup failed');
}

/**
 * Fetch full IRCTC ticket details from PNR via ConfirmTkt API.
 * Names are often omitted by the API — callers should merge with OCR/PDF text.
 */
export async function fetchPnrDetails(pnrInput: string): Promise<PnrLookupResult> {
  const pnr = normalizePnr(pnrInput);
  const p = await postConfirmTkt(pnr);

  const trainNumber = String(p.trainNo || p.TrainNo || '').trim();
  if (!trainNumber) {
    throw friendlyPnrError(
      String(p.error || 'Invalid PNR')
    );
  }

  const passengersRaw = Array.isArray(p.passengerStatus)
    ? (p.passengerStatus as Array<Record<string, unknown>>)
    : Array.isArray(p.PassengerStatus)
      ? (p.PassengerStatus as Array<Record<string, unknown>>)
      : [];

  const passengers: Passenger[] = passengersRaw.map((ps, i) => {
    const coach = String(
      ps.currentCoachId ||
        ps.CurrentCoachId ||
        ps.bookingCoachId ||
        ps.BookingCoachId ||
        ps.coach ||
        ps.Coach ||
        ''
    ).trim();
    const seat = String(
      ps.currentBerthNo ||
        ps.CurrentBerthNo ||
        ps.bookingBerthNo ||
        ps.BookingBerthNo ||
        ps.berth ||
        ps.Berth ||
        ''
    ).trim();
    const berthCode = String(
      ps.currentBerthCode ||
        ps.CurrentBerthCode ||
        ps.bookingBerthCode ||
        ps.BookingBerthCode ||
        ''
    ).trim();
    const currentStatus = String(
      ps.currentStatus ||
        ps.CurrentStatus ||
        ps.currentStatusNew ||
        ps.bookingStatus ||
        ps.BookingStatus ||
        'CNF'
    ).trim();
    const bookingStatus = String(
      ps.bookingStatus || ps.BookingStatus || currentStatus
    ).trim();
    return {
      name: pickPassengerName(ps, i),
      age:
        ps.age != null && String(ps.age)
          ? String(ps.age)
          : ps.Age != null
            ? String(ps.Age)
            : undefined,
      gender: ps.gender
        ? String(ps.gender)
        : ps.Gender
          ? String(ps.Gender)
          : undefined,
      coach: coach || undefined,
      seat: seat || undefined,
      berth: berthFromCode(berthCode),
      status: bookingStatus,
      currentStatus,
    };
  });

  const fromCode = String(p.boardingPoint || p.BoardingPoint || p.from || p.From || '');
  const toCode = String(
    p.reservationUpto || p.ReservationUpto || p.to || p.To || ''
  );

  return {
    pnr,
    trainNumber,
    trainName: p.trainName
      ? String(p.trainName)
      : p.TrainName
        ? String(p.TrainName)
        : undefined,
    fromCode,
    fromName: String(
      p.boardingStationName ||
        p.BoardingStationName ||
        p.sourceName ||
        p.SourceName ||
        fromCode
    ),
    toCode,
    toName: String(
      p.reservationUptoName ||
        p.ReservationUptoName ||
        p.destinationName ||
        p.DestinationName ||
        toCode
    ),
    boardingCode: fromCode,
    boardingName: p.boardingStationName
      ? String(p.boardingStationName)
      : p.BoardingStationName
        ? String(p.BoardingStationName)
        : undefined,
    classType: p.class ? String(p.class) : p.Class ? String(p.Class) : undefined,
    quota: p.quota ? String(p.quota) : p.Quota ? String(p.Quota) : undefined,
    departureDate: formatDoj(String(p.doj || p.Doj || p.sourceDoj || '')),
    arrivalDate: formatDoj(
      String(p.destinationDoj || p.DestinationDoj || p.doj || p.Doj || '')
    ),
    departureTime: p.departureTime
      ? String(p.departureTime)
      : p.DepartureTime
        ? String(p.DepartureTime)
        : undefined,
    arrivalTime: p.arrivalTime
      ? String(p.arrivalTime)
      : p.ArrivalTime
        ? String(p.ArrivalTime)
        : undefined,
    bookingDate: formatDoj(String(p.bookingDate || p.BookingDate || '')),
    platform: p.expectedPlatformNo
      ? String(p.expectedPlatformNo)
      : p.ExpectedPlatformNo
        ? String(p.ExpectedPlatformNo)
        : undefined,
    duration: durationLabel(
      p.duration ? String(p.duration) : p.Duration ? String(p.Duration) : undefined
    ),
    fare:
      p.ticketFare || p.bookingFare || p.TicketFare || p.BookingFare
        ? `₹${p.ticketFare || p.bookingFare || p.TicketFare || p.BookingFare}`
        : undefined,
    chartPrepared: Boolean(p.chartPrepared ?? p.ChartPrepared),
    passengers,
    raw: p,
  };
}

export function pnrResultToDraft(
  result: PnrLookupResult,
  local?: ParsedTicketDraft
): ParsedTicketDraft {
  const passengers = mergePassengerLists(
    result.passengers,
    local?.passengers || [],
    local?.rawText
  );
  const pax = passengers[0];
  const hasRealNames = passengers.some((p) => !isPlaceholderName(p.name));

  return {
    kind: 'rail',
    source: local?.source || 'manual',
    extractionMethod: local?.extractionMethod || 'manual',
    extractionNote: hasRealNames
      ? 'Filled from IRCTC PNR API'
      : 'Filled from IRCTC PNR API · enter passenger names below (PNR status never includes names)',
    title: result.trainName || `Train ${result.trainNumber}`,
    operator: 'Indian Railways',
    bookingPlatform: 'IRCTC',
    bookingStatus: pax?.currentStatus || pax?.status,
    pnr: result.pnr,
    bookingId: result.pnr,
    bookingDate: result.bookingDate,
    trainNumber: result.trainNumber,
    trainName: result.trainName,
    from: result.fromName,
    fromCode: result.fromCode,
    to: result.toName,
    toCode: result.toCode,
    boardingPoint: result.boardingName || result.fromName,
    departureDate: result.departureDate || '—',
    departureTime: result.departureTime || '--:--',
    arrivalDate: result.arrivalDate,
    arrivalTime: result.arrivalTime,
    platform: result.platform,
    classType: result.classType,
    quota: result.quota,
    travelTime: result.duration,
    fare: result.fare,
    passengers: passengers.length ? passengers : [{ name: 'Traveller' }],
    confidence: 0.96,
    needsManualCompletion: false,
    rawText: local?.rawText,
    originalPdfUri: local?.originalPdfUri,
    originalQrValue: local?.originalQrValue,
  };
}

export function passengersNeedNames(passengers: Passenger[]): boolean {
  return passengers.some((p) => isPlaceholderName(p.name));
}

/** Merge PNR API fields into an OCR/PDF draft (API fills gaps + keeps local names). */
export async function enrichDraftWithPnr(
  draft: ParsedTicketDraft,
  pnrOverride?: string
): Promise<ParsedTicketDraft> {
  const pnr =
    (pnrOverride || draft.pnr || draft.bookingId || '').replace(/\D/g, '') ||
    extractRailPnr(draft.rawText || '');

  if (!pnr || pnr.length !== 10) return draft;

  try {
    const result = await fetchPnrDetails(pnr);
    const fromApi = pnrResultToDraft(result, draft);
    return {
      ...draft,
      ...fromApi,
      originalPdfUri: draft.originalPdfUri || fromApi.originalPdfUri,
      originalQrValue: draft.originalQrValue,
      source: draft.source,
      extractionMethod:
        draft.extractionMethod === 'ocr' ? 'ocr' : draft.extractionMethod,
      extractionNote: draft.extractionNote
        ? `${draft.extractionNote} · enriched via PNR API`
        : fromApi.extractionNote,
      rawText: draft.rawText,
      passengers: mergePassengerLists(
        result.passengers,
        draft.passengers,
        draft.rawText
      ),
      confidence: Math.max(draft.confidence || 0, 0.96),
      needsManualCompletion: draft.needsManualCompletion && fromApi.needsManualCompletion,
    };
  } catch {
    return draft;
  }
}
