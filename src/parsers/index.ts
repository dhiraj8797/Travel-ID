import { ParsedTicketDraft } from '../types/ticket';
import { pickAndProcessPdf } from './pdfPipeline';
import { processQrValue } from './qrPipeline';
import { parseWithProviders } from './providers';

/** @deprecated use pickAndProcessPdf — kept for older call sites */
export async function pickAndParsePdf(): Promise<ParsedTicketDraft> {
  const draft = await pickAndProcessPdf();
  if (!draft) throw new Error('PDF selection cancelled');
  return draft;
}

export function parseIncomingPayload(
  payload: string,
  barcodeType?: string
): ParsedTicketDraft {
  return processQrValue(payload, barcodeType);
}

export function parseTicketTextFallback(text: string): ParsedTicketDraft {
  return parseWithProviders(text, 'manual');
}

export { pickAndProcessPdf } from './pdfPipeline';
export { pickAndProcessTicketPhoto, processTicketPhotoUri } from './photoPipeline';
export { processQrValue } from './qrPipeline';
export { parseWithProviders } from './providers';
export {
  enrichDraftWithPnr,
  extractRailPnr,
  fetchPnrDetails,
  passengersNeedNames,
  pnrResultToDraft,
} from '../services/pnrLookup';
