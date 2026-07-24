import { ParsedTicketDraft } from '../../types/ticket';
import { parseBusTicket } from '../ticketText';
import { TicketParser, findPnr, findSeat, findPassengerName } from './types';

export const scapiaBusParser: TicketParser = {
  name: 'ScapiaBusParser',
  canParse(text) {
    return (
      (/scapia/i.test(text) && /bus|boarding\s*point|sleeper/i.test(text)) ||
      (/boarding\s*point/i.test(text) && /sns|holidays/i.test(text))
    );
  },
  parse(text) {
    const draft = parseBusTicket(text);
    const pnr = findPnr(text) || draft.pnr || draft.bookingId;
    const seat = findSeat(text);
    const name = findPassengerName(text);
    // Only patch single-passenger drafts; multi-pax comes from parseBusTicket
    if (draft.passengers.length <= 1) {
      if (seat && draft.passengers[0]) draft.passengers[0].seat = seat;
      if (name && draft.passengers[0]) draft.passengers[0].name = name;
    }
    return {
      ...draft,
      kind: 'bus',
      bookingPlatform: draft.bookingPlatform || 'Scapia',
      pnr,
      bookingId: pnr,
      confidence: Math.max(draft.confidence, 0.9),
    } satisfies ParsedTicketDraft;
  },
};

export const redBusParser: TicketParser = {
  name: 'RedBusParser',
  canParse(text) {
    return /redbus|red\s*bus/i.test(text);
  },
  parse(text) {
    const draft = parseBusTicket(text);
    const pnr = findPnr(text) || draft.bookingId;
    return {
      ...draft,
      kind: 'bus',
      bookingPlatform: 'RedBus',
      operator: draft.operator === 'Bus Operator' ? 'RedBus' : draft.operator,
      pnr,
      bookingId: pnr,
      confidence: Math.max(draft.confidence, 0.88),
    } satisfies ParsedTicketDraft;
  },
};
