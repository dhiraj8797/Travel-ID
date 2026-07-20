import { ParsedTicketDraft } from '../../types/ticket';
import { parseRailTicket } from '../ticketText';
import { applyStatusToPassenger } from '../railStatus';
import { TicketParser, findPnr } from './types';

export const irctcParser: TicketParser = {
  name: 'IrctcParser',
  canParse(text) {
    const t = text.toLowerCase();
    const isScapiaTrain =
      t.includes('scapia') &&
      (/\btrain\b/.test(t) || /\bcnf\//.test(t) || /\b(coach|berth|quota)\b/.test(t));
    return (
      t.includes('irctc') ||
      t.includes('indian railways') ||
      isScapiaTrain ||
      /train\s*(no|number|name)/i.test(text) ||
      /cnf\/[a-z0-9]+\//i.test(text) ||
      (/\b\d{10}\b/.test(text) && /\b(train|pnr|coach|berth)\b/i.test(text))
    );
  },
  parse(text) {
    const draft = parseRailTicket(text);
    const pnr = findPnr(text) || draft.pnr;
    const status = text.match(
      /\b((?:CNF|RAC|WL)\/[A-Z0-9]+\/[A-Z0-9]+(?:\/[A-Z]+)?)\b/i
    )?.[1];
    const passengers = draft.passengers.map((p) =>
      applyStatusToPassenger(p, status || p.status)
    );
    return {
      ...draft,
      kind: 'rail',
      pnr,
      passengers,
      operator: /scapia/i.test(text) ? 'Scapia' : draft.operator || 'IRCTC',
      confidence: Math.max(
        draft.confidence,
        pnr && passengers[0]?.coach ? 0.95 : 0.8
      ),
    } satisfies ParsedTicketDraft;
  },
};
