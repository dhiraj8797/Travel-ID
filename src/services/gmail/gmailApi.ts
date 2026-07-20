import * as FileSystem from 'expo-file-system/legacy';
import { getValidGmailAccessToken } from './gmailAuth';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type GmailPdfAttachment = {
  messageId: string;
  attachmentId: string;
  filename: string;
  subject?: string;
  internalDate?: string;
};

const BOARDING_QUERY =
  [
    'has:attachment',
    'filename:pdf',
    '(',
    'subject:(boarding OR eticket OR e-ticket OR "boarding pass" OR PNR OR ticket OR itinerary)',
    'OR',
    'from:(irctc OR indigo OR goair OR spicejet OR airindia OR akasa OR makemytrip OR goibibo OR redBus OR confirmtkt OR rail OR flight OR airline OR traveller)',
    ')',
    'newer_than:3y',
  ].join(' ');

async function gmailFetch(
  accessToken: string,
  path: string
): Promise<Response> {
  return fetch(`${GMAIL_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
}

export async function listBoardingPdfCandidates(
  accountId: string,
  maxResults = 40
): Promise<GmailPdfAttachment[]> {
  const accessToken = await getValidGmailAccessToken(accountId);
  const q = encodeURIComponent(BOARDING_QUERY);
  const listRes = await gmailFetch(
    accessToken,
    `/messages?q=${q}&maxResults=${maxResults}`
  );
  if (!listRes.ok) {
    const err = await listRes.text();
    throw new Error(
      listRes.status === 403
        ? 'Gmail access denied.\n\nDisconnect this Gmail, then Connect again and allow mail read.\nAlso enable Gmail API in Google Cloud and add gmail.readonly on the OAuth consent screen.'
        : `Gmail search failed (${listRes.status}): ${err.slice(0, 160)}`
    );
  }

  const listJson = (await listRes.json()) as {
    messages?: Array<{ id: string }>;
  };
  const messages = listJson.messages || [];
  const out: GmailPdfAttachment[] = [];

  for (const msg of messages) {
    try {
      const detailRes = await gmailFetch(
        accessToken,
        `/messages/${msg.id}?format=full`
      );
      if (!detailRes.ok) continue;
      const detail = (await detailRes.json()) as {
        id: string;
        internalDate?: string;
        payload?: any;
        snippet?: string;
      };
      const subject = headerValue(detail.payload?.headers, 'Subject');
      const pdfs = findPdfParts(detail.payload);
      for (const pdf of pdfs) {
        out.push({
          messageId: detail.id,
          attachmentId: pdf.attachmentId,
          filename: pdf.filename,
          subject,
          internalDate: detail.internalDate,
        });
      }
    } catch {
      /* skip message */
    }
  }

  return out;
}

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string
): string | undefined {
  const hit = (headers || []).find(
    (h) => String(h.name || '').toLowerCase() === name.toLowerCase()
  );
  return hit?.value;
}

function findPdfParts(
  payload: any
): Array<{ attachmentId: string; filename: string }> {
  const found: Array<{ attachmentId: string; filename: string }> = [];

  const walk = (part: any) => {
    if (!part) return;
    const filename = String(part.filename || '');
    const mime = String(part.mimeType || '').toLowerCase();
    const attId = part.body?.attachmentId as string | undefined;
    if (
      attId &&
      (filename.toLowerCase().endsWith('.pdf') || mime === 'application/pdf')
    ) {
      found.push({
        attachmentId: attId,
        filename: filename || `ticket_${attId.slice(0, 8)}.pdf`,
      });
    }
    for (const child of part.parts || []) walk(child);
  };

  walk(payload);
  return found;
}

/** Download PDF attachment to a local file URI. */
export async function downloadGmailPdf(
  accountId: string,
  messageId: string,
  attachmentId: string,
  filename: string
): Promise<string> {
  const accessToken = await getValidGmailAccessToken(accountId);
  const res = await gmailFetch(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  if (!res.ok) {
    throw new Error(`Could not download attachment (${res.status}).`);
  }
  const json = (await res.json()) as { data?: string };
  if (!json.data) throw new Error('Empty Gmail attachment.');

  // Gmail uses URL-safe base64
  const base64 = json.data.replace(/-/g, '+').replace(/_/g, '/');
  const dir = `${FileSystem.cacheDirectory}gmail-import/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
    () => undefined
  );
  const safe = filename.replace(/[^\w.\-]+/g, '_');
  const dest = `${dir}${Date.now()}_${safe.endsWith('.pdf') ? safe : `${safe}.pdf`}`;
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return dest;
}
