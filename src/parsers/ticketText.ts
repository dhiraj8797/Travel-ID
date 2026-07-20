import { ParsedTicketDraft, Passenger } from '../types/ticket';
import {
  detectKind,
  extractDate,
  matchField,
  splitStations,
} from './helpers';
import { applyStatusToPassenger, formatTravelClass, parseRailStatus } from './railStatus';
import { parseBusTicket } from './busTicket';
import { resolveRailStations, resolveRailTimes } from './railStations';

export { parseBusTicket };

/** Extract passenger names / seats from IRCTC-style ticket text (PDF/OCR). */
export function extractPassengersFromText(text: string): Passenger[] {
  return parsePassengers(text);
}

function parsePassengers(text: string): Passenger[] {
  const passengers: Passenger[] = [];

  // IRCTC / Scapia: NAME Age Sex Status  e.g. DHIRAJ KUMAR 27 M CNF/A2/13/LOWER
  const irctcLine =
    /([A-Z][A-Z .']{2,35})\s+(\d{1,2})\s+([MF])\s+((?:CNF|RAC|WL)\/[A-Z0-9]+\/[A-Z0-9]+(?:\/[A-Z ]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = irctcLine.exec(text)) !== null) {
    const status = match[4];
    const parsed = parseRailStatus(status);
    passengers.push({
      name: titleCase(match[1]),
      age: match[2],
      gender: match[3],
      status,
      currentStatus: status,
      coach: parsed.coach,
      seat: parsed.seat,
      berth: parsed.berth,
    });
  }
  if (passengers.length) return passengers;

  const statusAnywhere = text.match(
    /\b((?:CNF|RAC|WL)\/[A-Z0-9]+\/[A-Z0-9]+(?:\/[A-Z]+)?)\b/i
  )?.[1];

  const lineRe =
    /(?:Passenger|Pax|Name)\s*[:#]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z][A-Za-z .'-]{1,40}?)(?=\s*(?:Age|Gender|Sex|Male|Female|\d{1,2}\s*[MF]|CNF|RAC|WL|$|\n))/gi;

  while ((match = lineRe.exec(text)) !== null) {
    const chunk = text.slice(match.index, match.index + 120);
    passengers.push(
      applyStatusToPassenger(
        {
          name: titleCase(match[1].trim()),
          age: chunk.match(/Age\s*[:#]?\s*(\d{1,3})/i)?.[1],
          gender: normalizeGender(
            chunk.match(/(?:Sex|Gender)\s*[:#]?\s*([MFmf]|MALE|FEMALE)/i)?.[1]
          ),
        },
        statusAnywhere
      )
    );
  }

  if (passengers.length) return passengers;

  const nameOnly = matchField(text, [
    /Passenger\s*(?:Name)?\s*[:#]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z .'-]{2,40})/i,
    /\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){0,3})\s+\d{1,2}\s+[MF]\b/,
  ]);

  if (nameOnly || statusAnywhere) {
    const status =
      statusAnywhere ||
      matchField(text, [
        /((?:CNF|RAC|WL)\/[A-Z0-9]+\/[A-Z0-9]+(?:\/[A-Z]+)?)/i,
        /(?:Booking|Current)\s*Status\s*[:#]?\s*([A-Z0-9/ ]+)/i,
      ]);
    return [
      applyStatusToPassenger(
        {
          name: titleCase(nameOnly || 'Traveller'),
          age: matchField(text, [/Age\s*[:#]?\s*(\d{1,3})/i]),
          gender: normalizeGender(
            matchField(text, [/(?:Sex|Gender)\s*[:#]?\s*([MFmf]|MALE|FEMALE)/i])
          ),
          coach: matchField(text, [/Coach\s*(?:No|Number)?\s*[:#]?\s*([A-Z0-9]+)/i]),
          seat: matchField(text, [/Seat\s*(?:No|Number)?\s*[:#]?\s*([A-Z0-9]+)/i]),
          berth: matchField(text, [
            /Berth\s*(?:Type|No)?\s*[:#]?\s*(LOWER|UPPER|MIDDLE|SIDE\s*LOWER|SIDE\s*UPPER|LB|MB|UB|SL|SU)/i,
          ]),
        },
        status
      ),
    ];
  }

  return [{ name: 'Traveller' }];
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeGender(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v.startsWith('M')) return 'M';
  if (v.startsWith('F')) return 'F';
  return value;
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
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

export function parseRailTicket(text: string): ParsedTicketDraft {
  const stations = splitStations(text);
  const resolved = resolveRailStations(text);
  const times = resolveRailTimes(text);

  const from =
    resolved.fromName ||
    matchField(text, [
      /Boarding\s*(?:at|station|point)?\s*[:#]?\s*([A-Za-z .()-]{2,45})/i,
    ]) ||
    stations.from ||
    'Origin';

  const to =
    resolved.toName ||
    matchField(text, [
      /(?:Destination|Reservation\s*Upto)\s*[:#]?\s*([A-Za-z .()-]{2,45})/i,
    ]) ||
    stations.to ||
    'Destination';

  const fromCode = resolved.from;
  const toCode = resolved.to;

  const trainNumber = matchField(text, [
    /Train\s*(?:No|Number|#)?\s*[:#.]?\s*(\d{3,5})/i,
    /Train\s*No\.?\s*\/\s*Name\s*[:#]?\s*(\d{3,5})/i,
    /(\d{5})\s+[A-Z][A-Z0-9 /-]{2,40}/,
  ]);

  const trainName = matchField(text, [
    /Train\s*Name\s*[:#]?\s*([A-Za-z0-9 ./-]{3,50})/i,
    /Train\s*No\.?\s*\/\s*Name\s*[:#]?\s*\d{3,5}\s*[\/-]?\s*([A-Za-z0-9 ./-]{3,50})/i,
    /\d{5}\s+([A-Z][A-Z0-9 ./-]{2,40})/,
  ]);

  const pnr = matchField(text, [
    /PNR\s*(?:No|Number)?\s*[:#.]?\s*(\d{10})/i,
    /\b(\d{10})\b/,
  ]);

  const departureDate =
    times.departureDate ||
    extractDate(text) ||
    matchField(text, [
      /(?:Date\s*of\s*Journey|Journey\s*Date)\s*[:#]?\s*([0-9A-Za-z/\- ,]{6,28})/i,
    ]) ||
    'TBD';

  const departureTime = times.departureTime || '--:--';
  const arrivalTime = times.arrivalTime;
  const arrivalDate = times.arrivalDate || departureDate;

  const classRaw = matchField(text, [
    /\b(SECOND\s*AC\s*\(?\s*2A\s*\)?)/i,
    /\b(THIRD\s*AC\s*\(?\s*3A\s*\)?)/i,
    /\b(FIRST\s*AC\s*\(?\s*1A\s*\)?)/i,
    /(?:Travel\s*)?Class\s*[:#]?\s*((?:SECOND|THIRD|FIRST)\s*AC\s*\(?[0-9A-Z]+\)?|2A|3A|1A|SL|CC|EC)/i,
    /\b(SL|3A|2A|1A|CC|EC|EA|3E|2S|FC)\b/,
  ]);

  const passengers = parsePassengers(text);
  if (passengers[0]) {
    const status =
      passengers[0].status ||
      text.match(/\b((?:CNF|RAC|WL)\/[A-Z0-9]+\/[A-Z0-9]+(?:\/[A-Z]+)?)\b/i)?.[1];
    Object.assign(passengers[0], applyStatusToPassenger(passengers[0], status));
    passengers[0].coach =
      passengers[0].coach ||
      matchField(text, [/Coach\s*(?:No|Number)?\s*[:#]?\s*([A-Z]\d{1,2})/i]);
    passengers[0].seat =
      passengers[0].seat ||
      matchField(text, [/Seat\s*(?:No|Number)?\s*[:#]?\s*(\d{1,3})/i]);
    passengers[0].berth =
      passengers[0].berth ||
      matchField(text, [
        /Berth\s*(?:Type)?\s*[:#]?\s*(LOWER|UPPER|MIDDLE|SIDE\s*LOWER|SIDE\s*UPPER)/i,
      ]);
  }

  const travelTime =
    matchField(text, [
      /(?:Travel\s*Time|Duration)\s*[:#]?\s*([0-9]+\s*h(?:rs?)?\s*[0-9]*\s*m(?:in)?)/i,
      /\b(\d{1,2}h\s*\d{1,2}m)\b/i,
      /\b(\d{2}h\s*\d{2}m)\b/i,
    ]) || enrichTravelTime(departureTime, arrivalTime);

  const distance = matchField(text, [
    /Distance\s*[:#]?\s*([0-9.]+\s*K?M)/i,
    /\b(\d{2,4}\s*KM)\b/i,
  ]);

  const bookingPlatform = /scapia/i.test(text)
    ? 'Scapia'
    : /confirmtkt|confirm\s*tkt/i.test(text)
      ? 'ConfirmTkt'
      : /ixigo/i.test(text)
        ? 'ixigo'
        : /makemytrip|mmt/i.test(text)
          ? 'MakeMyTrip'
          : undefined;

  return {
    kind: 'rail',
    source: 'pdf',
    title: trainName || (trainNumber ? `Train ${trainNumber}` : 'Train Ticket'),
    operator:
      bookingPlatform ||
      (/IRCTC|Indian\s*Railways/i.test(text) ? 'IRCTC' : 'Indian Railways'),
    bookingPlatform,
    bookingStatus: /confirm/i.test(text) ? 'Confirmed' : undefined,
    pnr,
    bookingDate: matchField(text, [
      /Booking\s*Date(?:\s*&\s*Time)?\s*[:#]?\s*([0-9A-Za-z,|:/ ·]{8,40})/i,
      /Transaction\s*Date\s*[:#]?\s*([0-9A-Za-z,|:/ ·]{8,40})/i,
    ]),
    trainNumber,
    trainName: trainName?.replace(/^\d{5}\s+/, '').trim(),
    from: from.replace(/\s*\([A-Z]{2,5}\)\s*$/i, '').trim(),
    fromCode,
    to: to.replace(/\s*\([A-Z]{2,5}\)\s*$/i, '').trim(),
    toCode,
    departureDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    platform: matchField(text, [/Platform\s*(?:No)?\s*[:#]?\s*([A-Z0-9]+)/i]),
    classType: formatTravelClass(classRaw),
    quota: matchField(text, [/Quota\s*[:#]?\s*([A-Z]{2,8}|General|Tatkal)/i]) || 'GN',
    distance,
    travelTime,
    passengers,
    fare: matchField(text, [
      /(?:Total\s*)?(?:Fare|Amount|Ticket\s*Fare)\s*[:#]?\s*(?:INR|Rs\.?|₹)?\s*([0-9,.]+)/i,
    ]),
    rawText: text,
    confidence:
      pnr && trainNumber && fromCode && passengers[0]?.coach
        ? 0.95
        : pnr && trainNumber
          ? 0.88
          : pnr || trainNumber
            ? 0.72
            : 0.5,
  };
}


export function parseTicketText(
  text: string,
  source: ParsedTicketDraft['source'] = 'pdf'
): ParsedTicketDraft {
  const kind = detectKind(text);
  const draft = kind === 'bus' ? parseBusTicket(text) : parseRailTicket(text);
  return { ...draft, kind, source, rawText: text.slice(0, 8000) };
}
