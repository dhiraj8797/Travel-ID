import { Ticket } from '../types/ticket';

/**
 * Official metro gate QR helpers.
 * Travel ID must NEVER invent or alter an operator/AFC QR.
 */

export function hasOfficialMetroQr(
  ticket: Pick<Ticket, 'originalQrValue' | 'qrPayload' | 'boardingCode' | 'kind'>
): boolean {
  if (ticket.kind !== 'metro') return false;
  const raw =
    ticket.originalQrValue?.trim() ||
    ticket.boardingCode?.rawValue?.trim() ||
    ticket.qrPayload?.trim() ||
    '';
  if (!raw) return false;
  // Travel ID guidance deep-links are NOT gate-valid
  if (/^travelid:\/\//i.test(raw)) return false;
  return raw.length >= 8;
}

/** Payload to render for the gate — only the untouched official value. */
export function officialMetroQrPayload(
  ticket: Pick<Ticket, 'originalQrValue' | 'qrPayload' | 'boardingCode' | 'kind'>
): string | null {
  if (!hasOfficialMetroQr(ticket)) return null;
  return (
    ticket.originalQrValue?.trim() ||
    ticket.boardingCode?.rawValue?.trim() ||
    ticket.qrPayload?.trim() ||
    null
  );
}

/**
 * Heuristic: opaque / encrypted metro-style QR that isn't a known
 * rail/bus/flight payload — user must pick stations separately.
 */
export function looksLikeOpaqueMetroQr(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.length < 12) return false;
  if (/^travelid:\/\//i.test(v)) return false;
  if (/^M[1-9]/i.test(v)) return false; // BCBP
  if (/\bPNR\b/i.test(v) && /\d{10}/.test(v)) return false;
  if (/type=(rail|bus|flight|hotel)/i.test(v)) return false;
  // Binary-ish / base64 / signed tokens / long hex
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(v)) return true;
  if (/^https?:\/\/.*(metro|bmrcl|dmrc|namma)/i.test(v)) return true;
  if (/metro|bmrcl|dmrc|namma|quick.?qr|tqrc/i.test(v)) return true;
  // JSON metro ticket
  if (v.startsWith('{') && /metro|source|destination|operator/i.test(v)) {
    return true;
  }
  return false;
}
