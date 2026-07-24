import { Ticket } from '../types/ticket';

/**
 * Hotel QR: opaque pass id only — no guest name, phone, email, or payment data.
 * Desk apps can look up the pass by id after access checks.
 */
export function buildHotelPassQr(
  ticket: Pick<Ticket, 'id' | 'bookingId' | 'pnr'>
): string {
  const passId = ticket.id || 'unknown';
  const bookingRef = (ticket.bookingId || ticket.pnr || '').trim();
  // Compact deep-link style payload (safe for offline wallets without a server)
  return bookingRef
    ? `travelid://hotel-pass/${passId}?bookingId=${encodeURIComponent(bookingRef)}`
    : `travelid://hotel-pass/${passId}`;
}

/** Builds a scannable QR payload with all boarding-critical fields. */
export function buildQrPayload(ticket: Pick<
  Ticket,
  | 'id'
  | 'kind'
  | 'pnr'
  | 'bookingId'
  | 'operator'
  | 'trainNumber'
  | 'trainName'
  | 'busNumber'
  | 'flightNumber'
  | 'airlineCode'
  | 'gate'
  | 'terminal'
  | 'from'
  | 'fromCode'
  | 'to'
  | 'toCode'
  | 'departureDate'
  | 'departureTime'
  | 'arrivalDate'
  | 'arrivalTime'
  | 'classType'
  | 'boardingPoint'
  | 'droppingPoint'
  | 'passengers'
  | 'qrPayload'
  | 'reportingTime'
  | 'bookingPlatform'
  | 'originalQrValue'
  | 'metroNetworkId'
  | 'metroFromStationId'
  | 'metroToStationId'
>): string {
  if (ticket.kind === 'hotel') {
    return buildHotelPassQr(ticket);
  }

  if (ticket.kind === 'metro') {
    // Never invent a gate-valid QR. Guidance uses Travel ID deep-links only
    // for wallet cards when no official QR exists — gate viewer refuses those.
    if (ticket.originalQrValue?.trim()) return ticket.originalQrValue.trim();
    if (
      ticket.qrPayload?.trim() &&
      !/^travelid:\/\//i.test(ticket.qrPayload.trim())
    ) {
      return ticket.qrPayload.trim();
    }
    // Placeholder for home-card thumbnail only (not shown at gate)
    return `travelid://metro-pass/${ticket.id || 'unknown'}?guidance=1`;
  }

  if (ticket.qrPayload && ticket.qrPayload.trim().length > 8) {
    return ticket.qrPayload.trim();
  }

  const pax = ticket.passengers[0];
  const data: Record<string, string> = {
    type: ticket.kind,
    operator: ticket.operator,
    from: ticket.from,
    to: ticket.to,
    date: ticket.departureDate,
    time: ticket.departureTime,
  };

  if (ticket.pnr) data.pnr = ticket.pnr;
  if (ticket.bookingId) data.booking = ticket.bookingId;
  if (ticket.bookingPlatform) data.platform = ticket.bookingPlatform;
  if (ticket.fromCode) data.fromcode = ticket.fromCode;
  if (ticket.toCode) data.tocode = ticket.toCode;
  if (ticket.arrivalDate) data.arrdate = ticket.arrivalDate;
  if (ticket.arrivalTime) data.arrtime = ticket.arrivalTime;
  if (ticket.reportingTime) data.report = ticket.reportingTime;
  if (ticket.classType) data.class = ticket.classType;
  if (ticket.trainNumber) data.train = ticket.trainNumber;
  if (ticket.trainName) data.trainname = ticket.trainName;
  if (ticket.busNumber) data.bus = ticket.busNumber;
  if (ticket.flightNumber) data.flight = ticket.flightNumber;
  if (ticket.airlineCode) data.airlinecode = ticket.airlineCode;
  if (ticket.gate) data.gate = ticket.gate;
  if (ticket.terminal) data.terminal = ticket.terminal;
  if (ticket.boardingPoint) data.boarding = ticket.boardingPoint;
  if (ticket.droppingPoint) data.dropping = ticket.droppingPoint;
  if (pax?.name) data.name = pax.name;
  if (pax?.seat) data.seat = pax.seat;
  if (pax?.seatType) data.seattype = pax.seatType;
  if (pax?.coach) data.coach = pax.coach;
  if (pax?.berth) data.berth = pax.berth;
  if (pax?.status) data.status = pax.status;

  return Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

export function railSeatStatus(ticket: Ticket): string {
  const p = ticket.passengers[0];
  if (!p) return 'CNF';
  if (p.status && /\/.+\/.+/.test(p.status)) return p.status;
  if (p.coach && p.seat) {
    return ['CNF', p.coach, p.seat, p.berth].filter(Boolean).join('/');
  }
  return p.status || 'CNF';
}

export function formatPassengerLine(ticket: Ticket): string {
  const p = ticket.passengers[0];
  if (!p) return 'Traveller';
  const bits = [
    p.gender ? (p.gender.toUpperCase().startsWith('M') ? 'MALE' : p.gender.toUpperCase().startsWith('F') ? 'FEMALE' : p.gender) : null,
    p.age,
  ].filter(Boolean);
  return bits.length ? `${p.name} (${bits.join(', ')})` : p.name;
}

export function cityName(value: string): string {
  return value.split(/[,(]/)[0]?.trim() || value;
}
