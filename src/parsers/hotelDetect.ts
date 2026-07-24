/**
 * Shared hotel-vs-transport detection.
 * Score-based so OTA PDFs (MMT / Booking.com / Agoda / Goibibo) win over
 * weak rail heuristics (10-digit IDs that look like PNRs).
 */

export const NOT_AVAILABLE = 'Not available in booking document';
export const ROOM_PENDING = 'To be assigned at check-in';

const HOTEL_PLATFORM =
  /booking\.com|makemytrip|\bmmt\b|goibibo|agoda|oyo\s*rooms?|treebo|fabhotel|cleartrip|yatra|expedia|hotels\.com|trivago|airbnb|hotel\s*booking|hotel\s*voucher|hotel\s*confirmation|property\s*confirmation/i;

const HOTEL_FIELDS =
  /check[\s\-]?in|check[\s\-]?out|room\s*type|meal\s*plan|guest\s*name|primary\s*guest|lead\s*guest|no\.?\s*of\s*guests|occupancy|reservation\s*(?:no|id|number|ref)|confirmation\s*(?:no|id|number|code)|voucher\s*(?:no|id|number)|hotel\s*address|property\s*name|stay\s*(?:from|to|dates)|nights?\s*(?:of\s*)?stay/i;

const HOTEL_PROPERTY =
  /\b(?:hotel|resort|inn|suites|homestay|guest\s*house|boutique\s*hotel|palace\s*hotel)\b/i;

const STRONG_RAIL =
  /indian\s*railways|\birctc\b|train\s*(?:no|number|name)|cnf\/[a-z0-9]+\/|berth|coach\s*(?:no|number)|boarding\s*station|chart\s*prepared|\bquota\b/i;

const STRONG_FLIGHT =
  /boarding\s*pass|flight\s*(?:no|number)|airline|airport|gate\s*[a-z0-9]|\bindigo\b|air\s*india/i;

const STRONG_BUS =
  /boarding\s*point|dropping\s*point|bus\s*operator|redbus|a\/c\s*sleeper/i;

export function hotelSignalScore(text: string): number {
  if (!text) return 0;
  let score = 0;
  if (HOTEL_PLATFORM.test(text)) score += 4;
  if (HOTEL_FIELDS.test(text)) score += 3;
  if (HOTEL_PROPERTY.test(text)) score += 2;
  if (/check[\s\-]?in/i.test(text) && /check[\s\-]?out/i.test(text)) score += 3;
  if (/room\s*type|deluxe|suite|standard\s*room/i.test(text)) score += 1;
  if (/adults?|guests?/i.test(text) && /night/i.test(text)) score += 1;
  return score;
}

export function looksLikeHotel(text: string): boolean {
  const score = hotelSignalScore(text);
  if (score < 3) return false;
  // Only veto hotel when transport evidence is strong AND hotel score is weak
  if (STRONG_RAIL.test(text) && score < 6) return false;
  if (STRONG_FLIGHT.test(text) && score < 5) return false;
  if (STRONG_BUS.test(text) && score < 5) return false;
  return true;
}

export function isPlaceholderHotelValue(value?: string | null): boolean {
  if (!value) return true;
  const v = value.trim();
  if (!v) return true;
  return (
    v === NOT_AVAILABLE ||
    v === '—' ||
    v === '-' ||
    /^(hotel|city|guest|traveller|origin|destination)$/i.test(v)
  );
}
