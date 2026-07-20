import { ParsedTicketDraft } from '../types/ticket';

let pendingDraft: ParsedTicketDraft | null = null;

export function setPendingDraft(draft: ParsedTicketDraft | null) {
  pendingDraft = draft;
}

export function getPendingDraft(): ParsedTicketDraft | null {
  return pendingDraft;
}

export function consumePendingDraft(): ParsedTicketDraft | null {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}
