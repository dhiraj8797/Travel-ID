import { ParsedTicketDraft } from '../types/ticket';
import { parseWithProviders } from './providers';
import { findPnr } from './providers/types';
import { parseQrPayload } from './qr';
import {
  extractBcbpSegment,
  isBcbpPayload,
  looksLikeBoardingPassBarcode,
  parseBcbp,
} from './bcbp';
import { parseFlightIdentity } from '../utils/flightIdentity';
import { createBoardingCode } from '../utils/boardingCode';

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function tryParseJson(value: string): Record<string, string> | null {
  try {
    if (!value.trim().startsWith('{')) return null;
    const obj = JSON.parse(value) as Record<string, unknown>;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v != null) flat[k.toLowerCase()] = String(v);
    }
    return flat;
  } catch {
    return null;
  }
}

const FLIGHT_BARCODE_TYPES = new Set([
  'pdf417',
  'aztec',
  'datamatrix',
  'org.iso.pdf417',
  'org.iso.aztec',
  'org.iso.datamatrix',
]);

function isFlightBarcodeType(type?: string): boolean {
  if (!type) return false;
  return FLIGHT_BARCODE_TYPES.has(type.toLowerCase());
}

/**
 * Scan QR / barcode → boarding-pass BCBP / JSON / providers → draft.
 * Pass `barcodeType` from the camera (pdf417 / aztec) so IndiGo passes
 * are never misclassified as train tickets.
 */
function attachBoardingCode(
  draft: ParsedTicketDraft,
  raw: string,
  barcodeType?: string
): ParsedTicketDraft {
  const value = raw.trim();
  const code = createBoardingCode(value, barcodeType);
  const shouldAttach =
    draft.kind === 'flight' ||
    isBcbpPayload(value) ||
    isFlightBarcodeType(barcodeType) ||
    !!draft.boardingCode;

  if (!shouldAttach && !draft.boardingCode) return draft;

  const rawValue = draft.boardingCode?.rawValue || code.rawValue || value;
  return {
    ...draft,
    boardingCode: createBoardingCode(
      rawValue,
      barcodeType || draft.boardingCode?.type,
      draft.boardingCode?.imageUri
    ),
    originalQrValue: draft.originalQrValue || value,
    // Keep airline BCBP as the scannable payload — never invent a new code
    qrPayload: isBcbpPayload(value)
      ? value
      : draft.qrPayload || value,
  };
}

export function processQrValue(
  raw: string,
  barcodeType?: string
): ParsedTicketDraft {
  const value = raw.trim();
  if (!value) {
    throw new Error('Empty QR code');
  }

  const flightBarcode = isFlightBarcodeType(barcodeType);
  const finish = (draft: ParsedTicketDraft) =>
    attachBoardingCode(draft, value, barcodeType);

  // Case 0: IATA boarding-pass barcode (IndiGo PDF417 / Aztec / QR BCBP)
  if (isBcbpPayload(value) || looksLikeBoardingPassBarcode(value)) {
    const bcbp = parseBcbp(value, barcodeType);
    if (bcbp) {
      return finish({
        ...bcbp,
        extractionNote: barcodeType
          ? `Parsed IATA boarding pass from ${barcodeType.toUpperCase()}`
          : bcbp.extractionNote,
      });
    }
  }

  // Segment retry (noise around M1 / uneven padding)
  const seg = extractBcbpSegment(value);
  if (seg) {
    const bcbp = parseBcbp(seg, barcodeType);
    if (bcbp) return finish(bcbp);
  }

  // Case 1: Full ticket JSON
  const json = tryParseJson(value);
  if (json) {
    const kind =
      /bus/i.test(json.type || json.kind || '')
        ? 'bus'
        : /flight|air/i.test(json.type || json.kind || '') ||
            json.flight ||
            json.flightnumber ||
            json.flightno
          ? 'flight'
          : /rail|train/i.test(json.type || json.kind || '') || json.pnr
            ? 'rail'
            : 'bus';

    const flightRaw =
      json.flight || json.flightnumber || json.flightno || json.flight_number;
    const flightId = parseFlightIdentity(flightRaw);
    const airlineCode =
      json.airlinecode ||
      json.airline_code ||
      json.carrier ||
      flightId.airlineCode;

    return finish({
      kind,
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote: 'Parsed structured JSON from QR',
      title:
        json.title ||
        json.operator ||
        (kind === 'flight'
          ? flightId.display || 'Flight Pass'
          : kind === 'bus'
            ? 'Bus Pass'
            : 'Train Pass'),
      operator:
        json.operator ||
        json.airline ||
        json.platform ||
        (kind === 'rail' ? 'IRCTC' : 'Operator'),
      airlineCode: kind === 'flight' ? airlineCode : undefined,
      flightNumber:
        kind === 'flight'
          ? flightId.display || flightRaw || undefined
          : undefined,
      bookingPlatform: json.platform || json.bookingplatform,
      bookingStatus:
        json.status ||
        json.bookingstatus ||
        (kind === 'bus' ? 'Confirmed' : undefined),
      pnr: json.pnr || json.booking || json.bookingid,
      bookingId: json.booking || json.bookingid || json.pnr,
      bookingDate: json.bookingdate || json.booking_date,
      trainNumber: json.train || json.trainno || json.trainnumber,
      trainName: json.trainname || json.train_name,
      busNumber: json.bus || json.busno || json.serviceno,
      serviceName: json.service || json.bustype,
      vehicleType: json.vehicletype || json.vehicle,
      classType: json.class || json.bustype || json.travelclass,
      from: json.from || json.origin || json.fromstation || 'Origin',
      fromCode: json.fromcode || json.from_code || json.origin,
      to: json.to || json.destination || json.tostation || 'Destination',
      toCode: json.tocode || json.to_code || json.destination,
      boardingPoint: json.boarding || json.boardingpoint || json.terminal,
      terminal: json.terminal || json.depterminal,
      gate: json.gate,
      droppingPoint: json.drop || json.dropping || json.droppoint,
      departureDate: json.date || json.depdate || json.journeydate || 'TBD',
      departureTime: json.departure || json.time || json.deptime || '--:--',
      reportingTime: json.report || json.reporting || json.reportingtime,
      arrivalDate: json.arrdate || json.arrivaldate,
      arrivalTime: json.arrival || json.arrtime,
      quota: json.quota,
      distance: json.distance,
      travelTime: json.duration || json.traveltime,
      supportNumber: json.support || json.helpline,
      boardingInstructions: json.instructions || json.boardinginstructions,
      passengers: [
        (() => {
          const status = json.status || json.currentstatus;
          const parts = status?.split('/') ?? [];
          return {
            name: json.name || json.passenger || 'Traveller',
            age: json.age,
            gender: json.gender || json.sex,
            seat: json.seat || parts[2],
            seatType: json.seattype,
            coach: json.coach || parts[1],
            berth: json.berth || json.berthtype || parts[3],
            status,
            currentStatus: status,
          };
        })(),
      ],
      qrPayload: value,
      originalQrValue: value,
      rawText: value,
      confidence: 0.95,
      needsManualCompletion: !(
        json.from &&
        json.to &&
        (json.pnr || json.booking || flightRaw)
      ),
    });
  }

  // Case 2: Booking URL
  if (isUrl(value)) {
    const pnrFromUrl = value.match(/([A-Z0-9-]{6,20})(?:\?|$)/i)?.[1];
    return finish({
      kind: flightBarcode ? 'flight' : 'bus',
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote:
        'Barcode/QR contains a URL — complete missing fields or upload PDF',
      title: flightBarcode ? 'Flight Pass' : 'Ticket from URL',
      operator: flightBarcode ? 'Airline' : 'Operator',
      pnr: pnrFromUrl,
      bookingId: pnrFromUrl,
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: value,
      originalQrValue: value,
      rawText: value,
      confidence: 0.35,
      needsManualCompletion: true,
    });
  }

  // Case 3: Only PNR / booking reference
  const onlyPnr = value.match(/^[A-Z0-9-]{6,15}$/i) || value.match(/^\d{10}$/);
  if (onlyPnr && value.length < 40) {
    const pnr = findPnr(value) || value;
    // 10-digit = rail; short alnum on a flight barcode = airline PNR
    const kind = /^\d{10}$/.test(pnr)
      ? 'rail'
      : flightBarcode
        ? 'flight'
        : 'bus';
    return finish({
      kind,
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote:
        'Scan only returned a booking ref — complete flight details or re-scan the full boarding barcode',
      title:
        kind === 'flight'
          ? 'Flight Pass'
          : kind === 'rail'
            ? 'Train Pass'
            : 'Bus Pass',
      operator:
        kind === 'flight' ? 'Airline' : kind === 'rail' ? 'IRCTC' : 'Operator',
      pnr,
      bookingId: pnr,
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: value,
      originalQrValue: value,
      rawText: value,
      confidence: 0.4,
      needsManualCompletion: true,
    });
  }

  // Encrypted-looking blobs on flight symbologies → still treat as flight pass shell
  const looksEncrypted =
    /^[A-Za-z0-9+/=]{40,}$/.test(value) && !/[ |]/.test(value);
  if (looksEncrypted) {
    return finish({
      kind: flightBarcode ? 'flight' : 'rail',
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote: flightBarcode
        ? 'Boarding barcode looked encoded — saved raw. Re-scan or upload IndiGo PDF.'
        : 'QR looks encrypted/signed — original code is saved. Upload PDF or enter details.',
      title: flightBarcode ? 'Flight Pass' : 'Pass (secure QR)',
      operator: flightBarcode ? 'Airline' : 'Issuer',
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: value,
      originalQrValue: value,
      rawText: value.slice(0, 500),
      confidence: 0.25,
      needsManualCompletion: true,
    });
  }

  // PDF417 / Aztec from camera but parse failed → never default to train
  if (flightBarcode) {
    const providers = parseWithProviders(value, 'qr');
    if (providers.kind === 'flight' && providers.confidence >= 0.55) {
      return finish({
        ...providers,
        source: 'qr',
        extractionMethod: 'qr',
        originalQrValue: value,
        qrPayload: value,
      });
    }
    return finish({
      kind: 'flight',
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote: `Scanned ${barcodeType?.toUpperCase() || 'boarding'} barcode — could not fully decode. Edit fields or upload PDF.`,
      title: 'Flight Pass',
      operator: 'Airline',
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: value,
      originalQrValue: value,
      rawText: value.slice(0, 800),
      confidence: 0.45,
      needsManualCompletion: true,
    });
  }

  try {
    const fromLegacy = parseQrPayload(value);
    if (
      fromLegacy.confidence >= 0.75 &&
      (fromLegacy.fromCode ||
        fromLegacy.trainNumber ||
        fromLegacy.flightNumber ||
        fromLegacy.passengers[0]?.coach)
    ) {
      return finish({
        ...fromLegacy,
        source: 'qr',
        extractionMethod: 'qr',
        originalQrValue: value,
        qrPayload: value,
        needsManualCompletion: fromLegacy.confidence < 0.65,
        extractionNote: 'Parsed structured ticket fields from QR',
      });
    }
    const fromProviders = parseWithProviders(value, 'qr');
    const draft =
      fromProviders.confidence > fromLegacy.confidence + 0.05
        ? fromProviders
        : fromLegacy;
    return finish({
      ...draft,
      source: 'qr',
      extractionMethod: 'qr',
      originalQrValue: value,
      qrPayload: value,
      needsManualCompletion: draft.confidence < 0.65,
      extractionNote:
        draft.extractionNote || 'Parsed ticket text from QR payload',
    });
  } catch {
    return finish({
      kind: 'bus',
      source: 'qr',
      extractionMethod: 'qr',
      extractionNote: 'Could not auto-parse QR — enter details manually',
      title: 'Scanned Pass',
      operator: 'Operator',
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: value,
      originalQrValue: value,
      rawText: value,
      confidence: 0.2,
      needsManualCompletion: true,
    });
  }
}
