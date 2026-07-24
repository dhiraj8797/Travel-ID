import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { enrichDraftWithPnr, extractRailPnr, fetchPnrDetails, pnrResultToDraft } from '../services/pnrLookup';
import { recognizeTicketText } from '../services/ticketOcr';
import { ParsedTicketDraft } from '../types/ticket';
import { looksLikeHotel } from './hotelDetect';
import { pdfLog, pdfLogError } from './pdfDiagnostics';
import { extractTextFromPdfBase64 } from './pdfExtract';
import { parseWithProviders } from './providers';
import { parseHotelBooking } from './providers/hotelParsers';
import {
  extractHotelBookingWithAi,
  extractHotelFromPdfBase64,
  hotelJsonToDraft,
  isHotelGeminiHit,
  mergeHotelDraft,
} from '../services/hotelGemini';

const MIN_TEXT_SCORE_CHARS = 80;

function textLooksUseful(text: string): boolean {
  if (!text || text.length < 24) return false;
  const upper = text.toUpperCase();
  const signals =
    Number(/\bPNR\b/.test(upper)) +
    Number(/\bFROM\b/.test(upper)) +
    Number(/\bTO\b/.test(upper)) +
    Number(
      /\b(TRAIN|BUS|FLIGHT|BOARDING|IRCTC|TRAVELS|HOTEL|CHECK|GUEST|ROOM|RESERVATION|VOUCHER|AGODA|BOOKING)\b/.test(
        upper
      )
    ) +
    Number(/\d{1,2}:\d{2}/.test(text));
  return signals >= 2 || text.length >= MIN_TEXT_SCORE_CHARS;
}

function filenameLooksHotel(name?: string): boolean {
  if (!name) return false;
  return /hotel|booking|agoda|makemytrip|\bmmt\b|goibibo|oyo|reservation|voucher|stay|airbnb|expedia/i.test(
    name
  );
}

async function copyPdfToAppStorage(uri: string, name?: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}tickets/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const safe = (name || `ticket_${Date.now()}`).replace(/[^\w.\-]+/g, '_');
  const dest = `${dir}${Date.now()}_${safe.endsWith('.pdf') ? safe : `${safe}.pdf`}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function ocrPdfPages(
  fileUri: string,
  maxPages = 3
): Promise<{ text: string; engine: string }> {
  if (Platform.OS === 'web') {
    throw new Error('OCR is only available on Android/iOS builds.');
  }

  const PdfThumbnail = (await import('react-native-pdf-thumbnail')).default;
  const pageUris: string[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    try {
      const thumb = await PdfThumbnail.generate(fileUri, page, 95);
      if (thumb?.uri) pageUris.push(thumb.uri);
    } catch (err) {
      pdfLogError(`ocrPdfPages page ${page}`, err);
      if (page === 0) throw new Error('Could not render PDF page for OCR.');
      break;
    }
  }

  if (!pageUris.length) return { text: '', engine: 'none' };

  pdfLog('ocr pages', { count: pageUris.length });
  const result = await recognizeTicketText(pageUris, {
    prompt:
      'Extract all hotel booking / travel ticket text from these document pages. Include hotel name, guest, booking ID, check-in, check-out, room type, address, and status when present.',
  });
  return { text: result.text, engine: result.engine };
}

/**
 * PDF → Gemini multimodal structured JSON (hotel) → review UI.
 * Non-hotel PDFs fall through to text/OCR + transport parsers.
 * Gemini never renders the pass graphic — only JSON for the frontend.
 */
export async function processPdfUri(
  uri: string,
  fileName?: string
): Promise<ParsedTicketDraft> {
  pdfLog('start', { fileName, uriScheme: uri.split(':')[0] });

  let storedUri: string;
  try {
    storedUri = await copyPdfToAppStorage(uri, fileName);
    pdfLog('copied', storedUri);
  } catch (err) {
    pdfLogError('copyPdfToAppStorage', err);
    throw new Error(
      'Could not open this PDF. Try saving it to Downloads and upload again.'
    );
  }

  let base64 = '';
  try {
    base64 = await FileSystem.readAsStringAsync(storedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    pdfLog('base64 length', base64.length);
  } catch (err) {
    pdfLogError('readAsStringAsync', err);
    throw new Error('Could not read the PDF file from storage.');
  }

  // ── 1) Hotel path: send PDF to Gemini with JSON schema ──────────────
  pdfLog('gemini multimodal PDF extract');
  const geminiBooking = await extractHotelFromPdfBase64(base64, fileName);
  if (isHotelGeminiHit(geminiBooking)) {
    const draft = hotelJsonToDraft(geminiBooking!, {
      source: 'pdf',
      originalPdfUri: storedUri,
      extractionMethod: 'ocr',
      rawText: JSON.stringify(geminiBooking),
    });
    // Always hotel kind — never let train parsers claim this draft later
    pdfLog('hotel via gemini PDF', {
      hotelName: draft.hotelName,
      bookingId: draft.bookingId,
      amenities: draft.amenities?.length,
      incomplete: draft.needsManualCompletion,
    });
    return {
      ...draft,
      kind: 'hotel',
      source: 'pdf',
      originalPdfUri: storedUri,
      needsManualCompletion: true, // always review after AI extract
    };
  }

  if (geminiBooking?.is_hotel_booking === false) {
    pdfLog('gemini says not a hotel booking — transport pipeline');
  } else if (filenameLooksHotel(fileName)) {
    pdfLog('filename looks hotel but gemini miss — will force hotel if OCR agrees');
  }

  // ── 2) Transport / fallback: embedded text → OCR → providers ────────
  let text = '';
  let method: ParsedTicketDraft['extractionMethod'] = 'embedded-text';
  let note = 'Extracted selectable text from PDF';

  try {
    text = extractTextFromPdfBase64(base64);
    pdfLog('embedded text', {
      chars: text.length,
      useful: textLooksUseful(text),
      preview: text.slice(0, 160).replace(/\s+/g, ' '),
    });
  } catch (err) {
    pdfLogError('extractTextFromPdfBase64', err);
    text = '';
  }

  if (!textLooksUseful(text)) {
    pdfLog('ocr fallback starting');
    try {
      const ocr = await ocrPdfPages(storedUri, 3);
      pdfLog('ocr result', {
        engine: ocr.engine,
        chars: ocr.text?.length || 0,
        preview: (ocr.text || '').slice(0, 160).replace(/\s+/g, ' '),
      });
      if (ocr.text && ocr.text.length > (text?.length || 0)) {
        text = ocr.text;
        method = 'ocr';
        note =
          ocr.engine === 'unlimited-ocr'
            ? 'PDF scanned — read with Baidu Unlimited-OCR'
            : 'PDF looked scanned — used on-device OCR (ML Kit)';
      }
    } catch (error) {
      pdfLogError('ocrPdfPages', error);
      if (!textLooksUseful(text)) {
        const msg = error instanceof Error ? error.message : 'OCR failed';
        throw new Error(
          `${msg}. Try a text-based booking PDF, or Scan QR / paste details.`
        );
      }
    }
  }

  const hotelDoc =
    looksLikeHotel(text || '') || filenameLooksHotel(fileName);
  pdfLog('detect', {
    hotelDoc,
    useful: textLooksUseful(text),
    chars: (text || '').length,
  });
  const pnrOnly = hotelDoc ? undefined : extractRailPnr(text || '');

  if (!textLooksUseful(text)) {
    if (pnrOnly && !hotelDoc) {
      pdfLog('pnr-only fallback', pnrOnly);
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
    pdfLog('abort: not enough text');
    throw new Error(
      'Could not read enough booking text from this PDF. Try a clearer hotel confirmation or ticket file.'
    );
  }

  // Hotel-first: never run rail/bus parsers when hotel signals present
  let resolved: ParsedTicketDraft;
  if (hotelDoc) {
    let hotelDraft = parseHotelBooking(text);
    const ai = await extractHotelBookingWithAi(text);
    if (ai && (isHotelGeminiHit(ai) || ai.hotelName || ai.checkInDate)) {
      hotelDraft = mergeHotelDraft(hotelDraft, ai);
    }
    resolved = { ...hotelDraft, kind: 'hotel' };
    pdfLog('forced hotel path', {
      hotelName: resolved.hotelName,
      bookingId: resolved.bookingId,
      confidence: resolved.confidence,
    });
  } else {
    resolved = parseWithProviders(text, 'pdf');
    // Safety: if providers returned rail but text is hotel-like, override
    if (resolved.kind !== 'hotel' && looksLikeHotel(text)) {
      resolved = { ...parseHotelBooking(text), kind: 'hotel' };
    }
  }

  pdfLog('parsed', {
    kind: resolved.kind,
    confidence: resolved.confidence,
    hotelName: resolved.hotelName,
    bookingId: resolved.bookingId || resolved.pnr,
    parserNote: resolved.extractionNote,
  });

  const withMeta: ParsedTicketDraft = {
    ...resolved,
    source: 'pdf',
    extractionMethod: method,
    extractionNote: resolved.extractionNote || note,
    originalPdfUri: storedUri,
    rawText: text,
    needsManualCompletion:
      resolved.kind === 'hotel'
        ? true
        : resolved.needsManualCompletion || resolved.confidence < 0.65,
  };

  if (withMeta.kind === 'hotel') {
    return { ...withMeta, kind: 'hotel' };
  }

  return enrichDraftWithPnr(withMeta, pnrOnly || withMeta.pnr);
}

/** Returns null when the user cancels the document picker. */
export async function pickAndProcessPdf(): Promise<ParsedTicketDraft | null> {
  pdfLog('picker open');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) {
    pdfLog('picker canceled');
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) {
    pdfLog('picker no uri');
    throw new Error('No PDF file was selected. Please try again.');
  }

  pdfLog('picker asset', {
    name: asset.name,
    size: asset.size,
    mimeType: asset.mimeType,
  });

  try {
    return await processPdfUri(asset.uri, asset.name);
  } catch (err) {
    pdfLogError('processPdfUri', err);
    throw err;
  }
}
