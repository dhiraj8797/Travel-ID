/**
 * Split airline designator + flight number for Cirium / boarding passes.
 * Accepts: "6E234", "6E-234", "6E 234", "AI101", "UK 955"
 */
export function parseFlightIdentity(raw?: string): {
  airlineCode?: string;
  flightNumber?: string;
  /** Compact form e.g. 6E234 */
  display?: string;
} {
  if (!raw?.trim()) return {};
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');

  // Already "6E234" or "6E-234" / "6E 234"
  const m = cleaned.match(/^([A-Z0-9]{2})\s*-?\s*(\d{1,4}[A-Z]?)$/);
  if (m) {
    const airlineCode = m[1];
    const num = m[2].replace(/^0+/, '') || m[2];
    return {
      airlineCode,
      flightNumber: `${airlineCode}${num}`,
      display: `${airlineCode}${num}`,
    };
  }

  // Bare number — caller must supply airline separately
  if (/^\d{1,4}[A-Z]?$/.test(cleaned)) {
    return { flightNumber: cleaned };
  }

  return { flightNumber: cleaned.replace(/\s+/g, '') };
}

/** Cirium wants carrier + numeric flight separately. */
export function ciriumFlightParts(
  airlineCode?: string,
  flightNumber?: string
): { carrier: string; flight: string } | null {
  const parsed = parseFlightIdentity(
    flightNumber?.startsWith(airlineCode || '')
      ? flightNumber
      : airlineCode && flightNumber
        ? `${airlineCode}${flightNumber}`
        : flightNumber
  );
  const carrier = (airlineCode || parsed.airlineCode || '').toUpperCase();
  if (!carrier || !parsed.flightNumber) return null;
  const digits = parsed.flightNumber.replace(/^[A-Z0-9]{2}/, '').replace(/\D/g, '');
  if (!digits) return null;
  return { carrier, flight: digits };
}

const AIRLINE_NAMES: Record<string, string> = {
  '6E': 'IndiGo',
  AI: 'Air India',
  UK: 'Vistara',
  SG: 'SpiceJet',
  QP: 'Akasa Air',
  IX: 'Air India Express',
  I5: 'AirAsia India',
  '9I': 'Alliance Air',
};

export function airlineNameFromCode(code?: string): string | undefined {
  if (!code) return undefined;
  return AIRLINE_NAMES[code.toUpperCase()];
}
