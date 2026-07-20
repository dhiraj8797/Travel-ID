import { ParsedTicketDraft } from '../types/ticket';
import { parseTicketText } from './ticketText';
import { matchField } from './helpers';

function parseQueryString(payload: string): Record<string, string> {
  const data: Record<string, string> = {};
  const query = payload.includes('?') ? payload.split('?')[1] : payload;
  for (const part of query.split(/[&;|]/)) {
    if (!part.trim()) continue;
    // Prefer '=' so values like time=23:25 stay intact
    const eq = part.indexOf('=');
    const sep = eq >= 0 ? eq : part.indexOf(':');
    if (sep < 0) continue;
    const key = part.slice(0, sep).trim().toLowerCase();
    const value = part.slice(sep + 1).trim();
    if (key && value) data[key] = value;
  }
  return data;
}

function draftFromMap(
  map: Record<string, string>,
  source: ParsedTicketDraft['source'],
  raw: string
): ParsedTicketDraft | null {
  const kindRaw = (map.type || map.kind || map.mode || '').toLowerCase();
  const kind =
    kindRaw.includes('bus') || map.operator?.toLowerCase().includes('bus')
      ? 'bus'
      : kindRaw.includes('rail') || map.pnr || map.train
        ? 'rail'
        : map.bus || map.booking
          ? 'bus'
          : 'rail';

  const from = map.from || map.source || map.origin || map.boarding;
  const to = map.to || map.destination || map.drop || map.dropping;
  if (!from && !to && !map.pnr && !map.booking && !map.bookingid) return null;

  const passengerName = map.passenger || map.name || map.pax || 'Traveller';

  if (kind === 'bus') {
    return {
      kind: 'bus',
      source,
      title: map.service || map.title || `${map.operator || 'Bus'} Ticket`,
      operator: map.operator || map.travels || 'Bus Operator',
      bookingPlatform: map.platform || map.bookingplatform,
      bookingStatus: map.status || map.bookingstatus || 'Confirmed',
      bookingId: map.booking || map.bookingid || map.ticket || map.id || map.pnr,
      pnr: map.pnr || map.booking || map.bookingid,
      bookingDate: map.bookingdate,
      busNumber: map.bus || map.busno || map.vehicle || map.serviceno,
      busRegistration: map.reg || map.registration,
      serviceName: map.service || map.bustype,
      vehicleType: map.vehicletype || map.vehicle,
      seatingConfiguration: map.config || map.seating,
      classType: map.class || map.bustype || map.service,
      from: from || 'Origin',
      to: to || 'Destination',
      boardingPoint: map.boarding || map.boardingpoint || from,
      boardingLandmark: map.boardinglandmark || map.landmark,
      boardingAddress: map.boardingaddress,
      droppingPoint: map.dropping || map.droppingpoint || map.drop || to,
      droppingLandmark: map.droplandmark,
      droppingAddress: map.dropaddress,
      departureDate: map.date || map.depdate || 'TBD',
      departureTime: map.time || map.deptime || map.departure || '--:--',
      reportingTime: map.report || map.reporting || map.reportingtime,
      arrivalDate: map.arrdate,
      arrivalTime: map.arrtime || map.arrival,
      platform: map.platform || map.bay || map.gate,
      distance: map.distance,
      travelTime: map.duration || map.traveltime,
      passengers: [
        {
          name: passengerName,
          age: map.age,
          gender: map.gender || map.sex,
          seat: map.seat || map.seatno,
          seatType: map.seattype,
          deck: map.deck,
          status: map.status || 'Confirmed',
        },
      ],
      fare: map.fare || map.amount,
      operatorContact: map.contact || map.operatorcontact,
      supportNumber: map.support || map.helpline,
      trackingUrl: map.track || map.tracking,
      boardingInstructions: map.instructions || map.boardinginstructions,
      qrPayload: raw,
      originalQrValue: raw,
      rawText: raw,
      confidence: 0.92,
    };
  }

  return {
    kind: 'rail',
    source,
    title: map.trainname || map.title || 'Rail Ticket',
    operator: map.operator || map.platform || 'IRCTC',
    pnr: map.pnr,
    bookingDate: map.bookingdate || map.booking,
    trainNumber: map.train || map.trainno || map.trainnumber,
    trainName: map.trainname,
    from: from || 'Origin',
    fromCode: map.fromcode || map.fromstationcode,
    to: to || 'Destination',
    toCode: map.tocode || map.tostationcode,
    departureDate: map.date || map.depdate || map.journeydate || 'TBD',
    departureTime: map.time || map.deptime || map.departure || '--:--',
    arrivalDate: map.arrdate || map.arrivaldate,
    arrivalTime: map.arrtime || map.arrival,
    platform: map.platformno || map.platform,
    classType: map.class || map.travelclass,
    quota: map.quota || 'GN',
    distance: map.distance,
    travelTime: map.duration || map.traveltime,
    passengers: [
      (() => {
        const status = map.status || map.currentstatus;
        const parts = status?.split('/') ?? [];
        return {
          name: passengerName,
          age: map.age,
          gender: map.gender || map.sex,
          coach: map.coach || parts[1],
          seat: map.seat || map.seatno || parts[2],
          berth: map.berth || map.berthtype || parts[3],
          status,
          currentStatus: map.currentstatus || status,
        };
      })(),
    ],
    fare: map.fare || map.amount,
    qrPayload: raw,
    rawText: raw,
    confidence: 0.92,
  };
}

export function parseQrPayload(payload: string): ParsedTicketDraft {
  const trimmed = payload.trim();

  // JSON ticket payloads
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const flat: Record<string, string> = {};
      for (const [key, value] of Object.entries(json)) {
        if (value == null) continue;
        flat[key.toLowerCase()] = String(value);
      }
      const draft = draftFromMap(flat, 'qr', trimmed);
      if (draft) return draft;
    } catch {
      // fall through
    }
  }

  // URL or pipe/ampersand key-value payloads
  if (/[=:&|]/.test(trimmed)) {
    const map = parseQueryString(trimmed);
    const draft = draftFromMap(map, 'qr', trimmed);
    if (draft) return draft;
  }

  // IRCTC-ish PNR only QR
  const pnr = matchField(trimmed, [/\b(\d{10})\b/]);
  if (pnr && trimmed.length < 40) {
    return {
      kind: 'rail',
      source: 'qr',
      title: 'Rail Ticket',
      operator: 'IRCTC',
      pnr,
      from: 'Origin',
      to: 'Destination',
      departureDate: 'TBD',
      departureTime: '--:--',
      passengers: [{ name: 'Traveller' }],
      qrPayload: trimmed,
      rawText: trimmed,
      confidence: 0.45,
    };
  }

  // Free-form ticket text encoded in QR
  return { ...parseTicketText(trimmed, 'qr'), source: 'qr', qrPayload: trimmed };
}
