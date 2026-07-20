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

function parseBusPassengerName(text: string): {
  name?: string;
  age?: string;
  gender?: string;
} {
  const m = text.match(
    /(?:Passenger|Pax|Name)\s*[:#]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z][A-Za-z .'-]{1,40}?)(?=\s*(?:Age|Gender|Sex|Seat|Status|Male|Female|\d{1,2}\b|$|\n))/i
  );
  const age = text.match(/Age\s*[:#]?\s*(\d{1,3})/i)?.[1];
  const gender = text.match(/(?:Sex|Gender)\s*[:#]?\s*([MFmf]|MALE|FEMALE)/i)?.[1];
  return { name: m?.[1]?.trim(), age, gender };
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

  const paxInfo = parseBusPassengerName(text);
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
    passengers: [
      {
        name: paxInfo.name || 'Traveller',
        age: paxInfo.age,
        gender: paxInfo.gender,
        seat,
        seatType,
        status: /confirm/i.test(text) ? 'Confirmed' : undefined,
      },
    ],
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
      bookingId && seat && boardingPoint !== from
        ? 0.93
        : bookingId
          ? 0.82
          : 0.55,
  };
}
