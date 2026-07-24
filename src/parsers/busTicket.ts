import { ParsedTicketDraft } from '../types/ticket';
import {
  extractDate,
  extractTime,
  matchField,
  splitStations,
} from './helpers';

function cityOnly(value: string): string {
  return value.split(/[,(]/)[0]?.trim() || value;
}

function enrichTravelTime(dep?: string, arr?: string): string | undefined {
  if (!dep || !arr) return undefined;
  const parse = (t: string) => {
    const m = t.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = parse(dep);
  const b = parse(arr);
  if (a == null || b == null) return undefined;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function parseBusPassengers(
  text: string,
  fallbackSeat?: string,
  fallbackSeatType?: string
): Array<{
  name: string;
  age?: string;
  gender?: string;
  seat?: string;
  seatType?: string;
  status?: string;
}> {
  const confirmed = /confirm/i.test(text) ? 'Confirmed' : undefined;
  const found: Array<{
    name: string;
    age?: string;
    gender?: string;
    seat?: string;
    seatType?: string;
    status?: string;
  }> = [];

  // Block patterns: "Passenger 1: NAME ... Age: 28 ... Seat: 12"
  const blockRe =
    /(?:Passenger|Pax)\s*(?:No\.?|Number|#)?\s*\d*\s*[:.\-]?\s*((?:Mr\.|Mrs\.|Ms\.|M\/s\.?)?\s*[A-Za-z][A-Za-z .'-]{1,48})([\s\S]{0,160}?)(?=(?:Passenger|Pax)\s*(?:No\.?|Number|#)?\s*\d*\s*[:.\-]|Boarding\b|Drop(?:ping)?\b|Operator\b|Total\s*Fare\b|PNR\b|$)/gi;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[1].trim().replace(/\s+/g, ' ');
    const chunk = `${m[1]} ${m[2]}`;
    if (!name || /^traveller$/i.test(name)) continue;
    const age = chunk.match(/\bAge\s*[:#]?\s*(\d{1,3})\b/i)?.[1];
    const gender = chunk.match(
      /\b(?:Sex|Gender)\s*[:#]?\s*(Male|Female|M|F)\b/i
    )?.[1];
    const seat =
      chunk.match(/\bSeat(?:s)?\s*(?:No|Number)?\s*[:#]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i)?.[1] ||
      chunk.match(/\b([ULS]\d{1,2})\b/)?.[1];
    found.push({
      name,
      age,
      gender,
      seat,
      seatType: fallbackSeatType,
      status: confirmed,
    });
  }

  // Line patterns: "1. NAME 28 M Seat 12" / "NAME | 28 | M | 12"
  if (found.length < 2) {
    const lineRe =
      /(?:^|\n)\s*(?:\d{1,2}[.)]\s*)?((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Z][A-Za-z .'-]{2,40}?)\s*[|,/]?\s*(?:Age\s*[:#]?)?(\d{1,3})\s*(?:yrs?|years?)?\s*[|,/]?\s*(Male|Female|M|F)?\s*[|,/]?\s*(?:Seat\s*[:#]?)?([A-Z]?\d{1,3}[A-Z]?)?/gim;
    let lm: RegExpExecArray | null;
    const lineHits: typeof found = [];
    while ((lm = lineRe.exec(text)) !== null) {
      const name = lm[1].trim().replace(/\s+/g, ' ');
      if (
        !name ||
        /^(passenger|pax|name|from|to|seat|age|gender|operator|boarding|dropping)$/i.test(
          name
        )
      ) {
        continue;
      }
      lineHits.push({
        name,
        age: lm[2],
        gender: lm[3],
        seat: lm[4],
        seatType: fallbackSeatType,
        status: confirmed,
      });
    }
    if (lineHits.length > found.length) {
      found.length = 0;
      found.push(...lineHits);
    }
  }

  // "Name: X" repeated with nearby Age
  if (found.length === 0) {
    const nameAgeRe =
      /(?:Passenger|Pax|Name)\s*[:#]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z][A-Za-z .'-]{1,40}?)\s*(?:[\s\S]{0,80}?\bAge\s*[:#]?\s*(\d{1,3}))?/gi;
    let nm: RegExpExecArray | null;
    while ((nm = nameAgeRe.exec(text)) !== null) {
      const name = nm[1].trim().replace(/\s+/g, ' ');
      if (!name || /^traveller$/i.test(name)) continue;
      found.push({
        name,
        age: nm[2],
        seat: fallbackSeat,
        seatType: fallbackSeatType,
        status: confirmed,
      });
    }
  }

  // Deduplicate by name
  const uniq: typeof found = [];
  const seen = new Set<string>();
  for (const p of found) {
    const key = p.name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const seatCode = (p.seat || '').toUpperCase();
    const derivedType =
      seatCode.startsWith('U')
        ? 'Upper'
        : seatCode.startsWith('L')
          ? 'Lower'
          : seatCode.startsWith('S')
            ? 'Side'
            : undefined;
    uniq.push({
      ...p,
      seatType: derivedType || p.seatType || fallbackSeatType,
    });
  }

  if (uniq.length === 0) {
    return [
      {
        name: 'Traveller',
        seat: fallbackSeat,
        seatType: fallbackSeatType,
        status: confirmed,
      },
    ];
  }

  // If only first has seat from global fallback
  if (uniq.length === 1 && !uniq[0].seat && fallbackSeat) {
    uniq[0].seat = fallbackSeat;
  }

  return uniq;
}

export function parseBusTicket(text: string): ParsedTicketDraft {
  const stations = splitStations(text);
  const stop =
    '(?=\\s*(?:From\\b|To\\b|Destination\\b|Origin\\b|Boarding\\b|Drop(?:ping)?\\b|Dep(?:arture)?\\b|Arr(?:ival)?\\b|Operator\\b|Bus\\s*Type\\b|Vehicle\\b|PNR\\b|Booking\\b|Passenger\\b|Seat\\b|Status\\b|Duration\\b|Distance\\b|Report\\b|Journey\\b|Class\\b|Service\\b|\\n|$))';

  const from =
    matchField(text, [
      new RegExp(
        `(?:From|Source|Origin|Boarding\\s*City)\\s*[:#]?\\s*([A-Za-z][A-Za-z0-9 ./-]{1,40}?)${stop}`,
        'i'
      ),
    ]) ??
    stations.from ??
    'Origin';

  const to =
    matchField(text, [
      new RegExp(
        `(?:To|Destination|Drop(?:ping)?\\s*City)\\s*[:#]?\\s*([A-Za-z][A-Za-z0-9 ./-]{1,40}?)${stop}`,
        'i'
      ),
    ]) ??
    stations.to ??
    'Destination';

  const bookingId = matchField(text, [
    /(?:Booking|Ticket)\s*(?:ID|No|Number)\s*[:#]?\s*([A-Z0-9-]{5,30})/i,
    /PNR\s*[:#]?\s*([A-Z0-9-]{5,30})/i,
    /\b([A-Z]{2,5}\d{6,}[A-Z0-9]*)\b/,
  ]);

  const bookingPlatform = /scapia/i.test(text)
    ? 'Scapia'
    : /redbus|red\s*bus/i.test(text)
      ? 'RedBus'
      : /abhibus/i.test(text)
        ? 'AbhiBus'
        : /paytm/i.test(text)
          ? 'Paytm'
          : /makemytrip|mmt/i.test(text)
            ? 'MakeMyTrip'
            : /ixigo/i.test(text)
              ? 'ixigo'
              : undefined;

  const operator =
    matchField(text, [
      new RegExp(
        `(?:Bus\\s*)?Operator\\s*[:#]?\\s*([A-Za-z0-9 .&'-]{2,50}?)${stop}`,
        'i'
      ),
      /(SNS Holidays|SRS Travels|VRL Travels|Orange Tours|IntrCity|KSRTC|MSRTC|GSRTC|Rajesh Travels|Kallada)/i,
    ]) ?? (bookingPlatform === 'RedBus' ? 'RedBus' : 'Bus Operator');

  const boardingPoint =
    matchField(text, [
      new RegExp(
        `Boarding\\s*(?:Point|At|Location)\\s*[:#]?\\s*([A-Za-z0-9 ,./()&-]{3,80}?)${stop}`,
        'i'
      ),
    ]) ?? from;

  const droppingPoint =
    matchField(text, [
      new RegExp(
        `Drop(?:ping)?\\s*(?:Point|At|Location)\\s*[:#]?\\s*([A-Za-z0-9 ,./()&-]{3,80}?)${stop}`,
        'i'
      ),
    ]) ?? to;

  const seat = matchField(text, [
    /Seat(?:s)?\s*(?:No|Number)?\s*[:#]?\s*([ULS]?\d{1,3})\b/i,
    /\bSeat\b\s*([ULS]\d{1,2})\b/i,
  ]);

  const seatType =
    matchField(text, [
      /Seat\s*Type\s*[:#]?\s*([A-Za-z /-]{3,30})/i,
      /(Upper\s*Sleeper|Lower\s*Sleeper|Upper|Lower|Seater)/i,
    ]) ||
    (seat?.toUpperCase().startsWith('U')
      ? 'Upper'
      : seat?.toUpperCase().startsWith('L')
        ? 'Lower'
        : undefined);

  const passengers = parseBusPassengers(text, seat || undefined, seatType);

  const times = [...text.matchAll(/\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/g)].map((m) => m[1]);

  const departureTime =
    matchField(text, [
      /Dep(?:arture)?\s*(?:Time)?\s*[:#]?\s*([0-9:. ]{4,10}\s?(?:AM|PM)?)/i,
    ]) ??
    times[0] ??
    extractTime(text) ??
    '--:--';

  const arrivalTime =
    matchField(text, [
      /Arr(?:ival)?\s*(?:Time)?\s*[:#]?\s*([0-9:. ]{4,10}\s?(?:AM|PM)?)/i,
    ]) ??
    times.find((t) => t !== departureTime) ??
    times[1];

  const reportingTime = matchField(text, [
    /Report(?:ing)?\s*(?:Time|By)?\s*[:#]?\s*([0-9:. ]{4,10}\s?(?:AM|PM)?)/i,
  ]);

  const busType =
    matchField(text, [
      new RegExp(
        `(?:Bus\\s*)?Type\\s*[:#]?\\s*([A-Za-z0-9 /()+-]{3,40}?)${stop}`,
        'i'
      ),
      /(A\/C\s*Sleeper(?:\s*\([0-9+]+\))?|AC\s*Sleeper(?:\s*\([0-9+]+\))?|Non\s*A\/C\s*Sleeper|A\/C\s*Seater)/i,
    ]) ?? 'Bus';

  const seatingConfiguration = matchField(text, [/\((\d\+\d)\)/]);
  const vehicleType = matchField(text, [
    new RegExp(`Vehicle\\s*(?:Type)?\\s*[:#]?\\s*([A-Za-z0-9 /-]{3,40}?)${stop}`, 'i'),
    /(Volvo\s*Multi[\s-]?Axle|BharatBenz|Scania|Mercedes)/i,
  ]);

  const departureDate =
    extractDate(text) ??
    matchField(text, [
      /(?:Journey|Travel|Departure)\s*Date\s*[:#]?\s*([0-9A-Za-z,/\- ]{6,28})/i,
    ]) ??
    'TBD';

  const arrivalDate =
    matchField(text, [/Arrival\s*Date\s*[:#]?\s*([0-9A-Za-z,/\- ]{6,28})/i]) ||
    departureDate;

  const travelTime =
    matchField(text, [
      /(?:Travel\s*Time|Duration)\s*[:#]?\s*([0-9]+\s*h(?:rs?)?\s*[0-9]*\s*m(?:in)?)/i,
      /\b(\d{1,2}h\s*\d{1,2}m)\b/i,
    ]) || enrichTravelTime(departureTime, arrivalTime);

  const amenities = [];
  if (/a\/?c|air\s*condition/i.test(text))
    amenities.push({ name: 'Air conditioning', available: true });
  if (/sleeper/i.test(text)) amenities.push({ name: 'Sleeper', available: true });
  if (/charg|usb|power/i.test(text))
    amenities.push({ name: 'Charging point', available: true });
  if (/live\s*track/i.test(text))
    amenities.push({ name: 'Live tracking', available: true });

  return {
    kind: 'bus',
    source: 'pdf',
    title: `${operator.trim()} Bus`,
    operator: operator.trim(),
    bookingPlatform,
    bookingStatus: /confirm/i.test(text) ? 'Confirmed' : 'Booked',
    bookingId,
    pnr: bookingId,
    bookingDate: matchField(text, [
      /Booking\s*Date(?:\s*&\s*Time)?\s*[:#]?\s*([0-9A-Za-z,|:/ ·]{8,40})/i,
    ]),
    busNumber: matchField(text, [
      /(?:Bus|Service)\s*(?:No|Number)\s*[:#]?\s*([A-Z0-9-]{3,20})/i,
    ]),
    busRegistration: matchField(text, [
      /(?:Reg(?:istration)?)\s*(?:No|Number)\s*[:#]?\s*([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{3,4})/i,
    ]),
    serviceName: busType.trim(),
    vehicleType: vehicleType?.trim(),
    seatingConfiguration,
    classType: busType.trim(),
    from: cityOnly(from),
    to: cityOnly(to),
    boardingPoint: boardingPoint.trim(),
    droppingPoint: droppingPoint.trim(),
    departureDate,
    departureTime,
    reportingTime,
    arrivalDate,
    arrivalTime,
    platform: matchField(text, [/(?:Platform|Bay)\s*(?:No)?\s*[:#]?\s*([A-Z0-9 ]{1,12})/i]),
    distance: matchField(text, [
      /Distance\s*[:#]?\s*([0-9.]+\s*K?M)/i,
      /\b(\d{2,4}\s*KM)\b/i,
    ]),
    travelTime,
    passengers,
    fare: matchField(text, [
      /(?:Total\s*)?(?:Fare|Amount)\s*[:#]?\s*(?:INR|Rs\.?|₹)?\s*([0-9,.]+)/i,
    ]),
    amenities: amenities.length ? amenities : undefined,
    operatorContact: matchField(text, [
      /(?:Operator|Boarding)\s*(?:Contact|Phone|Helpline)\s*[:#]?\s*(\+?\d[\d\s-]{8,15})/i,
    ]),
    supportNumber: matchField(text, [
      /(?:Support|Helpline|Customer\s*Care)\s*[:#]?\s*(\+?\d[\d\s-]{8,15})/i,
    ]),
    trackingUrl: matchField(text, [/(https?:\/\/[^\s]+track[^\s]*)/i]),
    boardingInstructions: reportingTime
      ? `Arrive by ${reportingTime}. Show QR and photo ID.`
      : 'Show QR and photo ID at boarding.',
    rawText: text,
    confidence:
      bookingId && (seat || passengers.some((p) => p.seat)) && boardingPoint !== from
        ? 0.93
        : bookingId
          ? 0.82
          : 0.55,
  };
}
