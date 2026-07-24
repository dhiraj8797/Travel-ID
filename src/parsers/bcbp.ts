import { ParsedTicketDraft } from '../types/ticket';
import { airlineNameFromCode } from '../utils/flightIdentity';
import { formatJourneyDateLabel } from '../services/railRadar';
import { createBoardingCode } from '../utils/boardingCode';
import { airportMeta } from '../utils/airports';

/**
 * IATA Bar Coded Boarding Pass (BCBP) — mandatory unique fields (format M).
 * Used by IndiGo and most airlines on PDF417 / Aztec / QR.
 */

type BcbpFields = {
  passengerName: string;
  pnr: string;
  fromCode: string;
  toCode: string;
  airlineCode: string;
  flightDigits: string;
  julian: number;
  cabin?: string;
  seat?: string;
  sequence?: string;
  segment: string;
};

/** Clean scanner noise (nulls, weird spaces) before parsing. */
export function normalizeBcbpInput(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[^\x20-\x7E>]/g, '')
    .replace(/\r|\n/g, '')
    .trim();
}

/** Pull the BCBP segment even if the scanner added noise around it. */
export function extractBcbpSegment(raw: string): string | null {
  const cleaned = normalizeBcbpInput(raw);
  if (!cleaned) return null;

  if (/^M[1-4]/i.test(cleaned) && cleaned.length >= 35) {
    return cleaned.toUpperCase();
  }

  const idx = cleaned.search(/M[1-4]/i);
  if (idx >= 0) {
    const seg = cleaned.slice(idx).toUpperCase();
    // Cut optional security/junk after first conditional marker if huge
    const cut = seg.indexOf('>');
    const core = cut > 50 ? seg.slice(0, cut + 20) : seg;
    if (core.length >= 35) return core;
  }

  return null;
}

export function isBcbpPayload(raw: string): boolean {
  return extractBcbpSegment(raw) != null;
}

/** Heuristic: looks like boarding-pass structure even if slightly short. */
export function looksLikeBoardingPassBarcode(raw: string): boolean {
  const v = normalizeBcbpInput(raw).toUpperCase();
  if (extractBcbpSegment(raw)) return true;
  if (
    /[A-Z]{2,}\/[A-Z]/.test(v) &&
    /[A-Z]{3}\s*[A-Z]{3}/.test(v) &&
    /\b(?:6E|AI|UK|SG|QP|IX|I5|9I|[A-Z]{2})\s*\d{2,4}\b/.test(v)
  ) {
    return true;
  }
  return false;
}

/**
 * BCBP stores day-of-year only (no year).
 * Resolve year for a travel wallet that holds both upcoming trips and archives:
 * - Prefer a date within the next ~6 weeks (imminent travel)
 * - Otherwise prefer the most recent past occurrence (old boarding passes)
 * - Fall back to nearest future within a year
 */
function julianToIso(julian: number, ref = new Date()): string | undefined {
  if (!Number.isFinite(julian) || julian < 1 || julian > 366) return undefined;

  const refY = ref.getUTCFullYear();
  const todayUtc = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());

  const candidates: { iso: string; deltaDays: number }[] = [];
  for (let y = refY - 5; y <= refY + 1; y++) {
    // UTC Jan 1 + (julian-1) days — Julian day 1 = Jan 1
    const t = Date.UTC(y, 0, 1) + (julian - 1) * 86_400_000;
    const d = new Date(t);
    // Guard invalid leap-day (e.g. julian 366 in non-leap year rolls over)
    if (y % 4 !== 0 && julian === 366) continue;
    const iso = d.toISOString().slice(0, 10);
    const dayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    candidates.push({
      iso,
      deltaDays: (dayUtc - todayUtc) / 86_400_000,
    });
  }
  if (!candidates.length) return undefined;

  // Imminent / current trip: yesterday … +45 days
  const soon = candidates
    .filter((c) => c.deltaDays >= -1 && c.deltaDays <= 45)
    .sort((a, b) => a.deltaDays - b.deltaDays);
  if (soon.length) return soon[0].iso;

  // Archived boarding pass: most recent date already flown
  const past = candidates
    .filter((c) => c.deltaDays < -1)
    .sort((a, b) => b.deltaDays - a.deltaDays);
  if (past.length) return past[0].iso;

  // Far-future booking: nearest upcoming within a year
  const future = candidates
    .filter((c) => c.deltaDays > 45)
    .sort((a, b) => a.deltaDays - b.deltaDays);
  return future[0]?.iso;
}

/** Try to find an explicit year in optional / free-text barcode data. */
function yearHintFromPayload(raw: string): number | undefined {
  const years = [
    ...normalizeBcbpInput(raw).matchAll(/\b(20[12]\d)\b/g),
  ].map((m) => Number(m[1]));
  const nowY = new Date().getFullYear();
  const plausible = years.filter((y) => y >= 2015 && y <= nowY + 1);
  if (!plausible.length) return undefined;
  // Prefer an explicit past year when archiving old passes
  const past = plausible.filter((y) => y < nowY).sort((a, b) => b - a);
  if (past.length) return past[0];
  return Math.min(...plausible);
}

function julianToIsoWithHint(
  julian: number,
  raw: string,
  ref = new Date()
): string | undefined {
  const hint = yearHintFromPayload(raw);
  if (hint != null) {
    const t = Date.UTC(hint, 0, 1) + (julian - 1) * 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  return julianToIso(julian, ref);
}

function cabinLabel(code?: string): string | undefined {
  if (!code) return undefined;
  const map: Record<string, string> = {
    F: 'First',
    C: 'Business',
    J: 'Business',
    W: 'Premium Economy',
    Y: 'Economy',
    M: 'Economy',
    B: 'Economy',
    H: 'Economy',
    K: 'Economy',
    Q: 'Economy',
    V: 'Economy',
    O: 'Economy',
    U: 'Economy',
  };
  return map[code] || code;
}

function formatPassengerName(nameRaw: string): string {
  const cleaned = nameRaw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const [last, first] = cleaned.split('/');
  return [first, last]
    .filter(Boolean)
    .map((p) => p.trim())
    .join(' ')
    .replace(/\s+/g, ' ');
}

/** Keep airline-style sequence (e.g. 0012). */
function normalizeSequence(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.padStart(Math.max(4, digits.length), '0');
}

function isValidIata(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

function isValidAirline(code: string): boolean {
  return /^[A-Z0-9]{2}$/.test(code);
}

/** Strict IATA fixed-width parse (correctly padded barcodes). */
function parseStrict(segment: string): BcbpFields | null {
  const s = segment.padEnd(60, ' ');
  const nameRaw = s.slice(2, 22);
  const pnr = s.slice(23, 30).trim();
  const fromCode = s.slice(30, 33).trim();
  const toCode = s.slice(33, 36).trim();
  const airlineCode = s.slice(36, 39).replace(/\s/g, '').slice(0, 2);
  const flightField = s.slice(39, 44).replace(/\s/g, '');
  const flightDigits = flightField.replace(/^0+/, '') || flightField;
  const julian = Number(s.slice(44, 47).trim());
  const cabin = s.slice(47, 48).trim() || undefined;
  const seatRaw = s.slice(48, 52).trim();
  const seat = seatRaw.replace(/^0+/, '') || undefined;
  const sequence = normalizeSequence(s.slice(52, 57).trim());

  if (!isValidIata(fromCode) || !isValidIata(toCode)) return null;
  if (!isValidAirline(airlineCode)) return null;
  if (!flightDigits || !/^\d{1,4}[A-Z]?$/.test(flightDigits)) return null;
  if (!Number.isFinite(julian) || julian < 1 || julian > 366) return null;

  return {
    passengerName: formatPassengerName(nameRaw),
    pnr,
    fromCode,
    toCode,
    airlineCode,
    flightDigits,
    julian,
    cabin,
    seat,
    sequence,
    segment,
  };
}

/**
 * Compact contiguous form: strip spaces after M1 name block heuristic,
 * then try fixed-width on rebuilt string.
 */
function parseCompacted(segment: string): BcbpFields | null {
  const s = segment.toUpperCase();
  // Keep name area spaces; compact from first airport-looking run
  const m = s.match(
    /^(M[1-4].{10,30}?)([A-Z]{3}\s*[A-Z]{3}\s*[A-Z0-9]{2}[\s0-9A-Z>]+)$/
  );
  if (!m) {
    // Fallback: remove all spaces and try strict on M1… without spaces (name breaks)
    const noSpace = s.replace(/\s+/g, '');
    if (noSpace.length >= 45) {
      // Re-insert name padding by finding LAST/FIRST then rebuilding is hard;
      // try route-only flexible on no-space string instead.
      return parseFlexible(noSpace);
    }
    return null;
  }
  const head = m[1];
  const tail = m[2].replace(/\s+/g, '');
  return parseFlexible(head.replace(/\s+$/, ' ') + tail) || parseFlexible(s);
}

/**
 * Flexible parse for uneven name padding / missing spaces (common on scans).
 * Locates route+flight first, then walks backward for name / PNR.
 */
function parseFlexible(segment: string): BcbpFields | null {
  const s = segment.toUpperCase().replace(/\r|\n/g, '');

  // Contiguous airports: BLRDEL6E0521201Y012A00012
  const routeRe =
    /([A-Z]{3})([A-Z]{3})([A-Z0-9]{2})\s*0*(\d{1,4}[A-Z]?)\s*(\d{3})([A-Z])\s*0*(\d{1,3}[A-Z])\s*0*(\d{1,5})/;
  let route = routeRe.exec(s);

  // Spaced airports: BLR DEL 6E 0521 201 Y 12A 0012
  if (!route) {
    const spaced =
      /([A-Z]{3})\s+([A-Z]{3})\s+([A-Z0-9]{2})\s+0*(\d{1,4}[A-Z]?)\s+(\d{3})\s*([A-Z])\s*0*(\d{1,3}[A-Z])\s*0*(\d{1,5})/;
    route = spaced.exec(s);
  }

  if (!route) return null;

  const fromCode = route[1];
  const toCode = route[2];
  const airlineCode = route[3];
  const flightDigits = route[4].replace(/^0+/, '') || route[4];
  const julian = Number(route[5]);
  const cabin = route[6];
  const seat = route[7].replace(/^0+/, '') || route[7];
  const sequence = normalizeSequence(route[8]);

  if (fromCode === toCode) return null;
  if (!isValidIata(fromCode) || !isValidIata(toCode)) return null;
  if (!isValidAirline(airlineCode)) return null;
  if (!Number.isFinite(julian) || julian < 1 || julian > 366) return null;

  const before = s.slice(0, route.index);
  const head = before.match(/^M[1-4](.+?)(?:\s*E\s*)?([A-Z0-9]{5,7})\s*$/);
  let passengerName = '';
  let pnr = '';
  if (head) {
    passengerName = formatPassengerName(head[1].replace(/\s*E\s*$/, ''));
    pnr = head[2].trim();
  } else {
    const nameMatch = before.match(/([A-Z][A-Z0-9 ]{1,18}\/[A-Z][A-Z0-9 ]{0,18})/);
    if (nameMatch) passengerName = formatPassengerName(nameMatch[1]);
    const pnrMatch = before.match(/(?:^|\s)E?\s*([A-Z0-9]{5,7})\s*$/);
    if (pnrMatch) pnr = pnrMatch[1];
  }

  return {
    passengerName,
    pnr,
    fromCode,
    toCode,
    airlineCode,
    flightDigits,
    julian,
    cabin,
    seat,
    sequence,
    segment: s,
  };
}

/**
 * Token walk — last resort when scanners insert spaces everywhere.
 * Expects roughly: M1 NAME/PART E PNR FROM TO CARRIER FLIGHT JULIAN CABIN SEAT SEQ
 */
function parseTokens(segment: string): BcbpFields | null {
  const s = segment.toUpperCase().replace(/\s+/g, ' ').trim();
  const nameMatch = s.match(/^M[1-4]\s*([A-Z][A-Z0-9 ]{1,22}\/[A-Z][A-Z0-9 ]{0,22})/);
  if (!nameMatch) return null;

  const afterName = s.slice(nameMatch[0].length).trim();
  const m = afterName.match(
    /^E?\s*([A-Z0-9]{5,7})\s+([A-Z]{3})\s+([A-Z]{3})\s+([A-Z0-9]{2})\s+(\d{1,4})\s+(\d{1,3})\s*([A-Z])\s*(\d{1,3}[A-Z])\s*(\d{1,5})/
  );
  if (!m) return null;

  const julian = Number(m[6]);
  if (!Number.isFinite(julian) || julian < 1 || julian > 366) return null;

  return {
    passengerName: formatPassengerName(nameMatch[1]),
    pnr: m[1],
    fromCode: m[2],
    toCode: m[3],
    airlineCode: m[4],
    flightDigits: m[5].replace(/^0+/, '') || m[5],
    julian,
    cabin: m[7],
    seat: m[8].replace(/^0+/, '') || m[8],
    sequence: normalizeSequence(m[9]),
    segment: s,
  };
}

function fieldsToDraft(
  fields: BcbpFields,
  raw: string,
  barcodeType?: string
): ParsedTicketDraft {
  const departureIso = julianToIsoWithHint(fields.julian, raw);
  const departureDate =
    formatJourneyDateLabel(departureIso) || departureIso || 'TBD';
  const flightNumber = `${fields.airlineCode}${fields.flightDigits}`;
  const operator =
    airlineNameFromCode(fields.airlineCode) || fields.airlineCode;
  const fromMeta = airportMeta(fields.fromCode, fields.fromCode);
  const toMeta = airportMeta(fields.toCode, fields.toCode);
  const payload = normalizeBcbpInput(raw) || raw.trim();
  const name = fields.passengerName || 'Traveller';
  const yearGuessed = !yearHintFromPayload(raw);

  return {
    kind: 'flight',
    source: 'qr',
    extractionMethod: 'qr',
    extractionNote: yearGuessed
      ? 'Boarding barcode has day-of-year only (no year). Year was estimated — edit the travel date on Review if it should be an older trip (e.g. 2023).'
      : 'Parsed IATA boarding-pass barcode (BCBP). Times are not in the barcode — add them or tap LIVE UPDATES / edit on Review.',
    title: flightNumber,
    operator,
    airlineCode: fields.airlineCode,
    flightNumber,
    pnr: fields.pnr || undefined,
    bookingId: fields.pnr || undefined,
    from: fromMeta.city || fields.fromCode,
    fromCode: fields.fromCode,
    to: toMeta.city || fields.toCode,
    toCode: fields.toCode,
    departureDate,
    departureTime: '--:--',
    classType: cabinLabel(fields.cabin),
    passengers: [
      {
        name,
        seat: fields.seat,
        status: fields.sequence ? `SEQ ${fields.sequence}` : undefined,
        currentStatus: fields.sequence,
      },
    ],
    boardingCode: createBoardingCode(payload, barcodeType || 'pdf417'),
    qrPayload: payload,
    originalQrValue: payload,
    rawText: fields.segment.slice(0, 500),
    confidence:
      departureIso && fields.pnr && name !== 'Traveller' ? 0.96 : 0.88,
    needsManualCompletion: true,
  };
}

export function parseBcbp(
  raw: string,
  barcodeType?: string
): ParsedTicketDraft | null {
  const v = extractBcbpSegment(raw);
  if (!v) return null;

  try {
    const fields =
      parseStrict(v) ||
      parseFlexible(v) ||
      parseCompacted(v) ||
      parseTokens(v);
    if (!fields) return null;
    return fieldsToDraft(fields, raw, barcodeType);
  } catch {
    return null;
  }
}

/**
 * Pick the best string from camera `data` / `raw` (Android often differs).
 * Prefer the candidate that successfully parses as BCBP.
 */
export function pickBestBarcodePayload(
  data?: string | null,
  raw?: string | null
): string {
  const candidates = [raw, data]
    .map((v) => (v == null ? '' : String(v)))
    .filter((v) => v.trim().length > 0);

  if (candidates.length === 0) return '';
  if (candidates.length === 1) return candidates[0];

  for (const c of candidates) {
    if (parseBcbp(c)) return c;
  }
  // Prefer longer / more BCBP-like
  const scored = [...candidates].sort((a, b) => {
    const score = (x: string) =>
      (isBcbpPayload(x) ? 1000 : 0) +
      (looksLikeBoardingPassBarcode(x) ? 500 : 0) +
      (/M[1-4]/i.test(x) ? 200 : 0) +
      x.length;
    return score(b) - score(a);
  });
  return scored[0];
}
