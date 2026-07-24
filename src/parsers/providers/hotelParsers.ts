import { BusAmenity, ParsedTicketDraft } from '../../types/ticket';
import {
  NOT_AVAILABLE,
  looksLikeHotel,
} from '../hotelDetect';
import {
  TicketParser,
  findPassengerName,
  findPnr,
  findTimes,
} from './types';

function clean(value?: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v || /^[\-–—]+$/.test(v)) return undefined;
  if (/^(n\/?a|null|none|not\s*available|tbd|tba)$/i.test(v)) return undefined;
  return v;
}

/** First matching capture group across synonym label patterns. */
function fieldByLabels(
  text: string,
  labels: string[],
  valuePattern = '([^\\n]{2,120})'
): string | undefined {
  for (const label of labels) {
    const re = new RegExp(
      `(?:${label})\\s*[:\\-]?\\s*${valuePattern}`,
      'i'
    );
    const m = text.match(re);
    const v = clean(m?.[1]);
    if (v && !/^(check|guest|booking|confirmation|address|date|time|room)$/i.test(v)) {
      return v.replace(/\s*(?:Phone|Email|Contact|Tel|Mobile|Check).*$/i, '').trim();
    }
  }
  return undefined;
}

function findHotelName(text: string): string | undefined {
  const labeled = fieldByLabels(text, [
    'Hotel(?:\\s*Name)?',
    'Property(?:\\s*Name)?',
    'Stay\\s*at',
    'Accommodation',
    'Resort(?:\\s*Name)?',
  ]);
  if (labeled) {
    const name = labeled.split(/[,|]/)[0]?.trim();
    if (name && name.length >= 3 && !/check|guest|booking|confirmation/i.test(name)) {
      return name;
    }
  }
  const titled = text.match(
    /\b((?:The\s+)?[A-Z][A-Za-z0-9 .,'&-]{2,50}\s+(?:Hotel|Resort|Inn|Suites|Palace|Lodge|Homestay))\b/
  );
  return clean(titled?.[1]);
}

function findCity(text: string): string | undefined {
  return (
    fieldByLabels(text, ['City', 'Location', 'Destination', 'Place'], '([A-Za-z][A-Za-z .\'-]{2,40})') ||
    clean(
      text.match(
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*(?:Andhra|Karnataka|Tamil|Maharashtra|Delhi|Kerala|Goa|Telangana|Rajasthan|Gujarat|West\s*Bengal|India)/i
      )?.[1]
    )
  );
}

function findAddress(text: string): string | undefined {
  return (
    fieldByLabels(text, [
      '(?:Hotel\\s*)?Address',
      'Property\\s*address',
      'Location\\s*address',
      'Hotel\\s*location',
    ]) ||
    clean(
      text.match(
        /\b(\d{1,4}[^\n,]{5,80},\s*[A-Za-z][A-Za-z .'-]{2,40},\s*[A-Za-z][A-Za-z ]{2,30}\s*\d{6})\b/
      )?.[1]
    )
  );
}

function findPhone(text: string): string | undefined {
  const labeled = fieldByLabels(
    text,
    [
      'Phone',
      'Tel',
      'Mobile',
      'Contact(?:\\s*no\\.?)?',
      'Helpline',
      'Hotel\\s*contact',
    ],
    '(\\+?\\d[\\d\\s\\-()]{8,18})'
  );
  if (labeled && labeled.replace(/\D/g, '').length >= 10) return labeled;
  const m =
    text.match(/(\+91[\s\-]?\d{2,5}[\s\-]?\d{5,10})/) ||
    text.match(/(\+?\d{2,4}[\s\-]?\d{3,5}[\s\-]?\d{3,5}[\s\-]?\d{0,5})/);
  const phone = clean(m?.[1]);
  if (phone && phone.replace(/\D/g, '').length >= 10) return phone;
  return undefined;
}

function findEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function findBookingId(text: string): string | undefined {
  const labeled = fieldByLabels(
    text,
    [
      'Booking\\s*(?:ID|No\\.?|Number|Ref(?:erence)?)',
      'Confirmation\\s*(?:No\\.?|Number|ID|Code)',
      'Reservation\\s*(?:No\\.?|ID|Number|Ref(?:erence)?)',
      'Voucher\\s*(?:No\\.?|ID|Number)',
      'CONF',
      'Itinerary\\s*(?:No\\.?|ID|Number)',
    ],
    '([A-Z0-9-]{5,24})'
  );
  if (labeled && !/check|guest|room/i.test(labeled)) return labeled;
  return findPnr(text);
}

function findGuestName(text: string): string | undefined {
  const labeled = fieldByLabels(
    text,
    [
      'Guest\\s*Name',
      'Primary\\s*Guest',
      'Lead\\s*Guest',
      'Booked\\s*by',
      'Traveller\\s*Name',
      'Customer\\s*Name',
      'Passenger\\s*Name',
    ],
    "((?:Mr\\.|Mrs\\.|Ms\\.)?\\s*[A-Za-z][A-Za-z .']{2,40})"
  );
  if (labeled && !/guest|name|adult|child/i.test(labeled)) return labeled;
  const fallback = findPassengerName(text);
  if (fallback && !/guest|name|adult/i.test(fallback)) return fallback;
  return undefined;
}

function findRoomType(text: string): string | undefined {
  return fieldByLabels(text, [
    'Room\\s*(?:Type|Category|Name)',
    'Accommodation',
    'Occupancy\\s*type',
    'Room\\s*category',
  ], '([A-Za-z0-9][A-Za-z0-9 /+()-]{2,45})');
}

function findRoomNumber(text: string): string | undefined {
  const m = text.match(/Room\s*(?:No\.?|Number|#)\s*[:\-]?\s*([A-Z0-9-]{1,8})/i);
  if (!m?.[1]) return undefined;
  if (/assign|tba|tbd|check|type|after/i.test(m[1])) return undefined;
  // Don't treat "Room Type" leftovers as a number
  if (/deluxe|suite|standard|twin|double|single/i.test(m[1])) return undefined;
  return m[1];
}

function findMealPlan(text: string): string | undefined {
  return text.match(
    /\b(EP|CP|MAP|AP|AI|Breakfast\s*included|Room\s*only|Half\s*board|Full\s*board)\b/i
  )?.[1];
}

function findStarRating(text: string): string | undefined {
  const m =
    text.match(/(\d)\s*[\*★]\s*(?:star|Stars)?/i) || text.match(/(\d)\s*star/i);
  if (m?.[1]) {
    const n = Math.min(5, Math.max(1, Number(m[1])));
    return `${'★'.repeat(n)}`;
  }
  if (/★★★★★|5\s*star/i.test(text)) return '★★★★★';
  if (/★★★★|4\s*star/i.test(text)) return '★★★★';
  return undefined;
}

function findGuestCount(text: string): number | undefined {
  const m =
    text.match(/(?:No\.?\s*of\s*)?Guests?\s*[:\-]?\s*(\d+)/i) ||
    text.match(/(\d+)\s*Adults?(?:\s*(?:&|and|,)\s*(\d+)\s*Child(?:ren)?)?/i) ||
    text.match(/Occupancy\s*[:\-]?\s*(\d+)/i);
  if (m?.[1]) {
    const adults = Number(m[1]);
    const children = m[2] ? Number(m[2]) : 0;
    return Math.max(1, adults + (Number.isFinite(children) ? children : 0));
  }
  return undefined;
}

function findGuestDetails(text: string): string | undefined {
  const m = text.match(
    /(\d+\s*Adults?(?:\s*(?:&|and|,)\s*\d+\s*Child(?:ren)?)?)/i
  );
  return clean(m?.[1]);
}

function findStatus(text: string): string | undefined {
  if (/cancel+ed|cancellation/i.test(text)) return 'Cancelled';
  if (/check\s*ed[\s\-]?in/i.test(text)) return 'Checked in';
  if (/completed|checked[\s\-]?out|travelled/i.test(text)) return 'Completed';
  if (/pending|awaiting/i.test(text)) return 'Pending';
  if (/confirm(?:ed|ation)?/i.test(text)) return 'Confirmed';
  return undefined;
}

function findDates(text: string): string[] {
  return Array.from(
    text.matchAll(
      /\b(\d{1,2}[\s\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/,]*\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi
    )
  ).map((m) => m[1]);
}

function findCheckLabeled(
  text: string,
  which: 'in' | 'out'
): { date?: string; time?: string } {
  const synonyms =
    which === 'in'
      ? [
          'Check[\\s\\-]?in',
          'Arrival(?:\\s*date)?',
          'Stay\\s*from',
          'Check\\s*in\\s*date',
        ]
      : [
          'Check[\\s\\-]?out',
          'Departure(?:\\s*date)?',
          'Stay\\s*to',
          'Stay\\s*until',
          'Check\\s*out\\s*date',
        ];

  let date: string | undefined;
  let time: string | undefined;

  for (const label of synonyms) {
    const dateLine = text.match(
      new RegExp(`${label}\\s*(?:date)?\\s*[:\\-]?\\s*([^\\n]{4,50})`, 'i')
    );
    const chunk = dateLine?.[1] || '';
    if (!date) {
      date = chunk.match(
        /\b(\d{1,2}[\s\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/,]*\d{2,4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i
      )?.[1];
    }
    if (!time) {
      time = chunk.match(
        /\b((?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM|am|pm))?|\d{1,2}\s?(?:AM|PM|am|pm))\b/
      )?.[1];
    }
  }
  return { date: clean(date), time: clean(time) };
}

const AMENITY_RULES: { name: string; re: RegExp }[] = [
  { name: 'Free Wi-Fi', re: /wi[\-\s]?fi|wireless|internet/i },
  { name: 'Breakfast Included', re: /breakfast|cp\b|map\b|\bai\b|meal\s*plan/i },
  { name: '24x7 Front Desk', re: /24\s*[x×]?\s*7|front\s*desk|reception/i },
  { name: 'Secure Stay', re: /secure|cctv|safe|security/i },
  { name: 'Airport Transfer', re: /airport\s*transfer|pickup|pick[\-\s]?up/i },
  { name: 'Parking', re: /parking|valet/i },
  { name: 'Swimming Pool', re: /pool|swimming/i },
  { name: 'Gym / Fitness', re: /gym|fitness|workout/i },
  { name: 'AC Room', re: /\bac\b|air[\-\s]?condition/i },
  { name: 'Room Service', re: /room\s*service/i },
  { name: 'Power Backup', re: /power\s*backup|generator/i },
  { name: 'Laundry', re: /laundry/i },
];

/** Only amenities explicitly mentioned — never invent defaults. */
function detectAmenities(text: string): BusAmenity[] {
  const out: BusAmenity[] = [];
  for (const rule of AMENITY_RULES) {
    if (rule.re.test(text)) out.push({ name: rule.name, available: true });
  }
  return out;
}

function detectPlatform(text: string): string | undefined {
  if (/makemytrip|\bmmt\b/i.test(text)) return 'MakeMyTrip';
  if (/booking\.com/i.test(text)) return 'Booking.com';
  if (/goibibo/i.test(text)) return 'Goibibo';
  if (/agoda/i.test(text)) return 'Agoda';
  if (/oyo/i.test(text)) return 'OYO';
  if (/treebo/i.test(text)) return 'Treebo';
  if (/fabhotel/i.test(text)) return 'FabHotels';
  if (/cleartrip/i.test(text)) return 'Cleartrip';
  if (/yatra/i.test(text)) return 'Yatra';
  if (/expedia/i.test(text)) return 'Expedia';
  return undefined;
}

function collectGuests(
  text: string,
  fallbackName: string | undefined,
  countHint?: number
): ParsedTicketDraft['passengers'] {
  const names = Array.from(
    text.matchAll(
      /(?:Guest|Passenger|Pax|Primary\s*Guest|Lead\s*Guest)\s*(?:\d+)?\s*[:\-]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z][A-Za-z .']{2,40})/gi
    )
  )
    .map((m) => m[1].trim())
    .filter((n) => !/name|adult|child|guest/i.test(n));

  const unique = [...new Set(names)];
  if (fallbackName && !unique.includes(fallbackName)) {
    unique.unshift(fallbackName);
  }

  // Do not invent "Guest 2" placeholders — only real names from the document
  const list = unique.slice(0, Math.max(countHint || unique.length, unique.length));
  if (!list.length) return [];
  return list.map((name) => ({ name, status: 'Confirmed' }));
}

function parseLooseDate(value?: string): Date | null {
  if (!value || value === NOT_AVAILABLE) return null;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = value.match(
    /(\d{1,2})[\s\-\/]([A-Za-z]{3,9}|\d{1,2})[\s\-\/,]*(\d{2,4})/
  );
  if (!m) return null;
  const day = Number(m[1]);
  let month: number;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (/[A-Za-z]/.test(m[2])) {
    month = months[m[2].slice(0, 3).toLowerCase()];
  } else {
    month = Number(m[2]) - 1;
  }
  if (!Number.isFinite(day) || month == null || month < 0 || month > 11) return null;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseHotelBooking(text: string): ParsedTicketDraft {
  const hotelName = findHotelName(text);
  const city = findCity(text);
  const address = findAddress(text);
  const phone = findPhone(text);
  const email = findEmail(text);
  const times = findTimes(text);
  const dates = findDates(text);
  const checkIn = findCheckLabeled(text, 'in');
  const checkOut = findCheckLabeled(text, 'out');
  const guest = findGuestName(text);
  const guestCount = findGuestCount(text);
  const guestDetails = findGuestDetails(text);
  const conf = findBookingId(text);
  const roomType = findRoomType(text);
  const roomNumber = findRoomNumber(text);
  const mealPlan = findMealPlan(text);
  const starRating = findStarRating(text);
  const amenities = detectAmenities(text);
  const bookingStatus = findStatus(text);
  const bookingPlatform = detectPlatform(text);

  const checkInDate = checkIn.date || dates[0];
  const checkOutDate = checkOut.date || dates[1];
  const checkInTime = checkIn.time || times[0];
  const checkOutTime = checkOut.time || times[1];

  const passengers = collectGuests(text, guest, guestCount);

  const inDate = parseLooseDate(checkInDate);
  const outDate = parseLooseDate(checkOutDate);
  const datesValid = !inDate || !outDate || outDate.getTime() >= inDate.getTime();

  const hasCore =
    Boolean(hotelName) &&
    Boolean(guest || passengers[0]?.name) &&
    Boolean(conf) &&
    Boolean(checkInDate);

  return {
    kind: 'hotel',
    source: 'pdf',
    title: hotelName || 'Hotel Pass',
    operator: hotelName || NOT_AVAILABLE,
    hotelName: hotelName || undefined,
    hotelAddress: address,
    hotelEmail: email,
    hotelTagline: 'YOUR STAY, OUR PRIVILEGE.',
    from: city || NOT_AVAILABLE,
    to: hotelName || NOT_AVAILABLE,
    departureDate: checkInDate || NOT_AVAILABLE,
    departureTime: checkInTime || NOT_AVAILABLE,
    arrivalDate: checkOutDate || NOT_AVAILABLE,
    arrivalTime: checkOutTime || NOT_AVAILABLE,
    roomType: roomType || undefined,
    roomNumber: roomNumber || undefined, // never invent — assign at check-in
    mealPlan,
    starRating,
    classType: roomType || undefined,
    pnr: conf,
    bookingId: conf,
    bookingStatus: bookingStatus || undefined,
    bookingPlatform,
    operatorContact: phone,
    supportNumber: phone,
    amenities,
    boardingInstructions:
      'Show this QR at the hotel front desk. Present a valid ID proof at check-in.',
    passengers,
    confidence: hasCore && datesValid ? 0.85 : hasCore ? 0.7 : 0.45,
    needsManualCompletion:
      !hotelName ||
      !conf ||
      !checkInDate ||
      !checkOutDate ||
      !datesValid ||
      passengers.length === 0 ||
      !guest,
    extractionNote: guestDetails
      ? `Guests: ${guestDetails}`
      : guestCount
        ? `Guests: ${guestCount}`
        : undefined,
  };
}

export { looksLikeHotel };

export const hotelParser: TicketParser = {
  name: 'HotelBookingParser',
  canParse(text) {
    return looksLikeHotel(text);
  },
  parse(text) {
    return parseHotelBooking(text);
  },
};
