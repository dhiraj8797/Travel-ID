import { ParsedTicketDraft } from '../../types/ticket';
import { matchField, extractDate, extractTime } from '../helpers';
import {
  airlineNameFromCode,
  parseFlightIdentity,
} from '../../utils/flightIdentity';
import { isBcbpPayload, parseBcbp } from '../bcbp';
import { TicketParser, findPnr, findPassengerName, findTimes } from './types';

function extractFlightRaw(text: string): string | undefined {
  return (
    matchField(text, [
      /Flight\s*(?:No|Number|#)?\s*[:#]?\s*([A-Z0-9]{2}\s*-?\s*\d{1,4}[A-Z]?)/i,
      /\b([A-Z0-9]{2}\s*-?\s*\d{2,4}[A-Z]?)\b(?=.*(?:flight|gate|boarding|airport))/i,
      /\b((?:6E|AI|UK|SG|QP|IX|I5|9I)\s*-?\s*\d{1,4})\b/i,
    ]) || undefined
  );
}

function extractIataPair(text: string): { from?: string; to?: string } {
  const m = text.match(/\b([A-Z]{3})\s*[→\->/]\s*([A-Z]{3})\b/);
  if (m) return { from: m[1], to: m[2] };
  return {};
}

/** Normalize "3:00 PM" / "15:00 Hrs" → "15:00" */
function to24h(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim().replace(/\./g, ':').replace(/\s+/g, ' ');
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2];
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return undefined;
  return `${hm[1].padStart(2, '0')}:${hm[2]}`;
}

/**
 * Prefer labeled times so Boarding 14:20 is not mistaken for Departure 15:00.
 */
function extractFlightSchedule(text: string): {
  boarding?: string;
  departure?: string;
  arrival?: string;
} {
  const boarding = to24h(
    matchField(text, [
      /Boarding\s*(?:Time|Starts?|Gate)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /Report(?:ing)?\s*(?:Time)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /Be\s+at\s+(?:gate|airport).*?((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM))?)/i,
    ])
  );

  const departure = to24h(
    matchField(text, [
      /Dep(?:arture)?\s*(?:Time)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /STD\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /Scheduled\s*Dep(?:arture)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /Flight\s*Time\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
    ])
  );

  const arrival = to24h(
    matchField(text, [
      /Arr(?:ival)?\s*(?:Time)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /STA\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
      /Scheduled\s*Arr(?:ival)?\s*[:#]?\s*((?:[01]?\d|2[0-3])[:.][0-5]\d(?:\s*(?:AM|PM|Hrs|hrs))?)/i,
    ])
  );

  // Fallback: unlabeled clocks — if first is ≤90 min before second, treat as boarding + departure.
  if (!departure || !boarding) {
    const clocks = findTimes(text)
      .map((t) => to24h(t))
      .filter((t): t is string => Boolean(t));
    const unique = [...new Set(clocks)];
    if (!departure && unique.length >= 1) {
      if (!boarding && unique.length >= 2) {
        const [a, b] = unique;
        const toMin = (x: string) => {
          const [h, m] = x.split(':').map(Number);
          return h * 60 + m;
        };
        const gap = toMin(b) - toMin(a);
        if (gap > 0 && gap <= 90) {
          return {
            boarding: boarding || a,
            departure: b,
            arrival: arrival || unique[2],
          };
        }
      }
      return {
        boarding,
        departure: departure || unique[0],
        arrival: arrival || unique[1],
      };
    }
  }

  return { boarding, departure, arrival };
}

export const indigoParser: TicketParser = {
  name: 'FlightBoardingPassParser',
  canParse(text) {
    const t = text.toLowerCase();
    return (
      isBcbpPayload(text) ||
      t.includes('indigo') ||
      t.includes('air india') ||
      t.includes('vistara') ||
      t.includes('spicejet') ||
      t.includes('akasa') ||
      t.includes('boarding pass') ||
      t.includes('flight no') ||
      t.includes('flight number') ||
      (/airport/.test(t) && (/gate/.test(t) || /terminal/.test(t)))
    );
  },
  parse(text): ParsedTicketDraft {
    const fromBcbp = parseBcbp(text);
    if (fromBcbp) return fromBcbp;

    const schedule = extractFlightSchedule(text);
    const pnr = findPnr(text);
    const name = findPassengerName(text) || 'Traveller';
    const iata = extractIataPair(text);
    const flightRaw = extractFlightRaw(text);
    const identity = parseFlightIdentity(flightRaw);
    const airlineCode =
      identity.airlineCode ||
      matchField(text, [
        /Airline\s*(?:code)?\s*[:#]?\s*([A-Z0-9]{2})\b/i,
        /Carrier\s*[:#]?\s*([A-Z0-9]{2})\b/i,
      ]) ||
      undefined;
    const flightNumber =
      identity.display ||
      (airlineCode && identity.flightNumber
        ? `${airlineCode}${identity.flightNumber.replace(/^[A-Z0-9]{2}/, '')}`
        : identity.flightNumber);

    const fromCode =
      iata.from ||
      matchField(text, [
        /From\s*[:#]?\s*([A-Z]{3})\b/,
        /Origin\s*[:#]?\s*([A-Z]{3})\b/,
        /Departure\s*Airport\s*[:#]?\s*([A-Z]{3})\b/i,
      ]);
    const toCode =
      iata.to ||
      matchField(text, [
        /To\s*[:#]?\s*([A-Z]{3})\b/,
        /Destination\s*[:#]?\s*([A-Z]{3})\b/,
        /Arrival\s*Airport\s*[:#]?\s*([A-Z]{3})\b/i,
      ]);

    const from =
      matchField(text, [
        /From\s*[:#]?\s*([A-Za-z .()-]{2,40})/i,
        /Origin\s*[:#]?\s*([A-Za-z .()-]{2,40})/i,
      ]) ||
      fromCode ||
      'Origin';
    const to =
      matchField(text, [
        /To\s*[:#]?\s*([A-Za-z .()-]{2,40})/i,
        /Destination\s*[:#]?\s*([A-Za-z .()-]{2,40})/i,
      ]) ||
      toCode ||
      'Destination';

    const terminal = matchField(text, [
      /(?:Dep(?:arture)?\s*)?Terminal\s*[:#]?\s*([A-Z0-9]+)/i,
    ]);
    const gate = matchField(text, [/Gate\s*[:#]?\s*([A-Z0-9]+)/i]);
    const operator =
      airlineNameFromCode(airlineCode) ||
      matchField(text, [
        /(IndiGo|Air India Express|Air India|Vistara|SpiceJet|Akasa(?:\s*Air)?)/i,
      ]) ||
      'Airline';

    const departureTime =
      schedule.departure || to24h(extractTime(text)) || '--:--';
    const arrivalTime = schedule.arrival;
    const reportingTime = schedule.boarding;

    const hasCore = Boolean(flightNumber && extractDate(text));

    return {
      kind: 'flight',
      source: 'pdf',
      title: flightNumber || 'Flight Pass',
      operator,
      airlineCode,
      flightNumber,
      pnr,
      bookingId: pnr,
      from,
      fromCode: fromCode || undefined,
      to,
      toCode: toCode || undefined,
      boardingPoint: terminal || undefined,
      terminal: terminal || undefined,
      droppingPoint: undefined,
      departureDate: extractDate(text) || 'TBD',
      departureTime,
      reportingTime,
      arrivalTime,
      gate: gate || undefined,
      classType: matchField(text, [
        /(?:Cabin|Class)\s*[:#]?\s*([A-Za-z ]{3,20})/i,
      ]),
      passengers: [
        {
          name,
          seat: matchField(text, [/Seat\s*[:#]?\s*([A-Z0-9]+)/i]),
        },
      ],
      rawText: text.slice(0, 8000),
      confidence: hasCore ? 0.88 : pnr ? 0.7 : 0.5,
      needsManualCompletion: !hasCore,
    };
  },
};
