import { parseRailTicket } from '../src/parsers/ticketText';
import { resolveRailStations, resolveRailTimes } from '../src/parsers/railStations';
import { parseRailStatus } from '../src/parsers/railStatus';

const sample = `
scapia TRAVEL
TRAIN TICKET
BOOKING CONFIRMED
PNR 4761434418
BOOKING DATE & TIME 17 Jul, 2026 | 7:35 PM
KRISHNARAJAPURM (KJM)
Departure 04:36 | 18 Jul, 2026
SHIVAMOGGA TOWN (SMET)
Arrival 10:55 | 18 Jul, 2026
285 KM
Train No. / Name 12691 MAS SMET SF EXP
Class SECOND AC (2A)
Quota GN
PASSENGER DHIRAJ KUMAR Age: 27 | Gender: M
BOOKING STATUS CNF/A2/13/LOWER
CURRENT STATUS CNF/A2/13/LOWER
`;

console.log('stations', resolveRailStations(sample));
console.log('times', resolveRailTimes(sample));
console.log('status', parseRailStatus('CNF/A2/13/LOWER'));
const d = parseRailTicket(sample);
console.log(
  JSON.stringify(
    {
      from: d.from,
      fromCode: d.fromCode,
      to: d.to,
      toCode: d.toCode,
      dep: d.departureTime,
      date: d.departureDate,
      arr: d.arrivalTime,
      class: d.classType,
      pax: d.passengers[0],
    },
    null,
    2
  )
);

// Reversed document order should still resolve via Departure proximity
const reversed = `
SHIVAMOGGA TOWN (SMET) KRISHNARAJAPURM (KJM)
Departure 04:36 Arrival 10:55
PNR 4761434418 Train 12691 Class 2A CNF/A2/13/LOWER
`;
const r = parseRailTicket(reversed);
console.log('reversed from', r.from, r.fromCode, 'to', r.to, r.toCode, 'dep', r.departureTime);
