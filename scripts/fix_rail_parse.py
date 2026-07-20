from pathlib import Path

p = Path("src/parsers/ticketText.ts")
text = p.read_text(encoding="utf-8")

# Remove old station helpers + parseRailTicket through end of that function
start = text.index("function stationWithCode")
end = text.index("export function parseTicketText")

new_parse = r'''
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

'''

# Also remove duplicate enrichTravelTime if it existed between stationWithCode and parseRail
text = text[:start] + new_parse + "\n" + text[end:]
p.write_text(text, encoding="utf-8")
print("updated parseRailTicket")
