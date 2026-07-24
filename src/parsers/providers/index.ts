import { ParsedTicketDraft } from '../../types/ticket';
import { detectKind } from '../helpers';
import { parseBusTicket, parseRailTicket } from '../ticketText';
import { TicketParser, detectTicketType } from './types';
import { irctcParser } from './irctcParser';
import { redBusParser, scapiaBusParser } from './busParsers';
import { indigoParser } from './flightParsers';
import { hotelParser, parseHotelBooking } from './hotelParsers';

const genericParser: TicketParser = {
  name: 'GenericTicketParser',
  canParse() {
    return true;
  },
  parse(text) {
    const type = detectTicketType(text);
    if (type === 'HOTEL') return parseHotelBooking(text);
    if (type === 'FLIGHT') return indigoParser.parse(text);
    if (type === 'BUS') {
      const draft = parseBusTicket(text);
      return { ...draft, kind: 'bus' };
    }
    if (type === 'TRAIN') {
      const draft = parseRailTicket(text);
      return { ...draft, kind: 'rail' };
    }
    // fallback to existing heuristic
    const kind = detectKind(text);
    const draft = kind === 'bus' ? parseBusTicket(text) : parseRailTicket(text);
    return { ...draft, kind };
  },
};

export const ticketParsers: TicketParser[] = [
  hotelParser,
  scapiaBusParser,
  redBusParser,
  irctcParser,
  indigoParser,
  genericParser,
];

export function parseWithProviders(
  text: string,
  source: ParsedTicketDraft['source'] = 'pdf'
): ParsedTicketDraft {
  const parser = ticketParsers.find((p) => p.canParse(text)) ?? genericParser;
  const draft = parser.parse(text);
  return {
    ...draft,
    source,
    rawText: text.slice(0, 8000),
    extractionNote: `Parsed with ${parser.name}`,
  };
}
