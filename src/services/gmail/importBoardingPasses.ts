import { processPdfUri } from '../../parsers/pdfPipeline';
import { AuthUser } from '../../auth/types';
import { ParsedTicketDraft, Ticket } from '../../types/ticket';
import { isPastPass } from '../../utils/passTime';
import {
  downloadGmailPdf,
  listBoardingPdfCandidates,
} from './gmailApi';
import { passengerMatchesProfile } from './nameMatch';

export type GmailImportCandidate = {
  key: string;
  accountId: string;
  email: string;
  messageId: string;
  filename: string;
  subject?: string;
  draft: ParsedTicketDraft;
  matchedName: string;
  isPast: boolean;
};

export type GmailImportProgress = {
  phase: string;
  current: number;
  total: number;
};

function draftLooksLikeTicket(draft: ParsedTicketDraft): boolean {
  if (!draft.from || !draft.to) return false;
  if (draft.kind === 'flight' && !draft.flightNumber && !draft.pnr) return false;
  if (draft.kind === 'rail' && !draft.trainNumber && !draft.pnr) return false;
  return true;
}

function previewIsPast(draft: ParsedTicketDraft): boolean {
  const fake = {
    ...draft,
    id: 'preview',
    createdAt: new Date().toISOString(),
  } as Ticket;
  return isPastPass(fake);
}

function passengerNameOnDraft(draft: ParsedTicketDraft): string {
  const named = (draft.passengers || []).find(
    (p) => p.name && !/^traveller$/i.test(p.name)
  );
  return named?.name || '';
}

/**
 * Scan connected Gmail for PDF boarding passes matching the profile name.
 * Returns past + upcoming matches (caller can filter to past-only).
 */
export async function scanGmailForBoardingPasses(
  accountId: string,
  email: string,
  profile: AuthUser,
  onProgress?: (p: GmailImportProgress) => void
): Promise<GmailImportCandidate[]> {
  onProgress?.({ phase: 'Searching mail…', current: 0, total: 0 });
  const attachments = await listBoardingPdfCandidates(accountId);
  const out: GmailImportCandidate[] = [];
  const total = attachments.length;

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    onProgress?.({
      phase: `Reading ${att.filename}`,
      current: i + 1,
      total,
    });
    try {
      const uri = await downloadGmailPdf(
        accountId,
        att.messageId,
        att.attachmentId,
        att.filename
      );
      const draft = await processPdfUri(uri, att.filename);
      draft.source = 'email';
      if (!draftLooksLikeTicket(draft)) continue;

      const matchedName = passengerNameOnDraft(draft);
      if (!matchedName || !passengerMatchesProfile(matchedName, profile)) {
        continue;
      }

      out.push({
        key: `${accountId}:${att.messageId}:${att.attachmentId}`,
        accountId,
        email,
        messageId: att.messageId,
        filename: att.filename,
        subject: att.subject,
        draft,
        matchedName,
        isPast: previewIsPast(draft),
      });
    } catch {
      /* skip bad attachment */
    }
  }

  return out;
}
