import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { enrichDraftWithPnr, extractRailPnr, fetchPnrDetails, pnrResultToDraft } from '../services/pnrLookup';
import { ParsedTicketDraft } from '../types/ticket';
import { extractTextFromPdfBase64 } from './pdfExtract';
import { parseWithProviders } from './providers';

const MIN_TEXT_SCORE_CHARS = 80;

function textLooksUseful(text: string): boolean {
  if (!text || text.length < 24) return false;
  const upper = text.toUpperCase();
  const signals =
    Number(/\bPNR\b/.test(upper)) +
    Number(/\bFROM\b/.test(upper)) +
    Number(/\bTO\b/.test(upper)) +
    Number(/\b(TRAIN|BUS|FLIGHT|BOARDING|IRCTC|TRAVELS)\b/.test(upper)) +
    Number(/\d{1,2}:\d{2}/.test(text));
  return signals >= 2 || text.length >= MIN_TEXT_SCORE_CHARS;
}

async function copyPdfToAppStorage(uri: string, name?: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}tickets/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const safe = (name || `ticket_${Date.now()}`).replace(/[^\w.\-]+/g, '_');
  const dest = `${dir}${Date.now()}_${safe.endsWith('.pdf') ? safe : `${safe}.pdf`}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function ocrPdfPages(fileUri: string, maxPages = 3): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('OCR is only available on Android/iOS builds.');
  }

  const PdfThumbnail = (await import('react-native-pdf-thumbnail')).default;
  const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
  const { TextRecognitionScript } = await import('@react-native-ml-kit/text-recognition');

  const parts: string[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const thumb = await PdfThumbnail.generate(fileUri, page, 95);
      const result = await TextRecognition.recognize(
        thumb.uri,
        TextRecognitionScript.LATIN
      );
      if (result.text?.trim()) {
        parts.push(result.text.trim());
      }
    } catch {
      if (page === 0) throw new Error('Could not render PDF page for OCR.');
      break;
    }
  }

  return parts.join('\n\n');
}

/**
 * PDF selected → embedded text → if insufficient, render pages + ML Kit OCR → parse.
 */
export async function processPdfUri(
  uri: string,
  fileName?: string
): Promise<ParsedTicketDraft> {
  const storedUri = await copyPdfToAppStorage(uri, fileName);

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let text = '';
  let method: ParsedTicketDraft['extractionMethod'] = 'embedded-text';
  let note = 'Extracted selectable text from PDF';

  try {
    text = extractTextFromPdfBase64(base64);
  } catch {
    text = '';
  }

  if (!textLooksUseful(text)) {
    try {
      const ocrText = await ocrPdfPages(storedUri, 3);
      if (ocrText && ocrText.length > (text?.length || 0)) {
        text = ocrText;
        method = 'ocr';
        note = 'PDF looked scanned — used on-device OCR (ML Kit)';
      }
    } catch (error) {
      if (!textLooksUseful(text)) {
        const msg = error instanceof Error ? error.message : 'OCR failed';
        throw new Error(
          `${msg}. Try a text-based e-ticket PDF, or Scan QR / paste details.`
        );
      }
    }
  }

  const pnrOnly = extractRailPnr(text || '');

  if (!textLooksUseful(text)) {
    // Fallback: if we at least got a PNR, pull full ticket from API
    if (pnrOnly) {
      const fromPnr = pnrResultToDraft(await fetchPnrDetails(pnrOnly), {
        kind: 'rail',
        source: 'pdf',
        title: 'Train Pass',
        operator: 'Indian Railways',
        from: 'Origin',
        to: 'Destination',
        departureDate: '—',
        departureTime: '--:--',
        passengers: [],
        confidence: 0,
        rawText: text,
      });
      return {
        ...fromPnr,
        source: 'pdf',
        extractionMethod: method,
        extractionNote: `${note} · details from PNR API`,
        originalPdfUri: storedUri,
        rawText: text,
      };
    }
    throw new Error(
      'Could not read enough ticket text from this PDF. Try Fetch by PNR, Scan QR, or a clearer file.'
    );
  }

  const draft = parseWithProviders(text, 'pdf');
  const withMeta: ParsedTicketDraft = {
    ...draft,
    source: 'pdf',
    extractionMethod: method,
    extractionNote: note,
    originalPdfUri: storedUri,
    rawText: text,
    needsManualCompletion: draft.confidence < 0.65,
  };
  return enrichDraftWithPnr(withMeta, pnrOnly || draft.pnr);
}

/** Returns null when the user cancels the document picker. */
export async function pickAndProcessPdf(): Promise<ParsedTicketDraft | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) {
    throw new Error('No PDF file was selected. Please try again.');
  }

  return processPdfUri(asset.uri, asset.name);
}
