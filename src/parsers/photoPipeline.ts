import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  enrichDraftWithPnr,
  extractRailPnr,
  fetchPnrDetails,
  pnrResultToDraft,
} from '../services/pnrLookup';
import { recognizeTicketText } from '../services/ticketOcr';
import { ParsedTicketDraft } from '../types/ticket';
import { parseWithProviders } from './providers';

async function copyImageToAppStorage(uri: string, name?: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}tickets/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const ext = (name || uri).match(/\.(jpe?g|png|webp|heic)$/i)?.[0] || '.jpg';
  const dest = `${dir}${Date.now()}_photo${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function ocrImageUri(uri: string): Promise<{ text: string; engine: string }> {
  if (Platform.OS === 'web') {
    throw new Error('Photo OCR is only available on Android/iOS builds.');
  }
  const result = await recognizeTicketText([uri]);
  return { text: result.text, engine: result.engine };
}

export async function processTicketPhotoUri(
  uri: string,
  fileName?: string
): Promise<ParsedTicketDraft> {
  const storedUri = await copyImageToAppStorage(uri, fileName);
  let text = '';
  let engine = 'none';
  try {
    const ocr = await ocrImageUri(uri);
    text = ocr.text;
    engine = ocr.engine;
  } catch {
    text = '';
  }

  const pnr = extractRailPnr(text);

  // Prefer PNR API whenever we can see a 10-digit PNR (OCR is often messy)
  if (pnr) {
    try {
      const fromPnr = pnrResultToDraft(await fetchPnrDetails(pnr), {
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
        extractionMethod: 'ocr',
        extractionNote: text
          ? `Photo OCR (${engine}) found PNR · full details from PNR API`
          : 'Details from PNR API',
        originalPdfUri: storedUri,
        rawText: text,
        confidence: 0.96,
      };
    } catch {
      // fall through to OCR parse
    }
  }

  if (!text || text.length < 12) {
    throw new Error(
      'Could not read text or PNR from this photo. Use Fetch by PNR with your 10-digit PNR, or try a clearer photo.'
    );
  }

  const draft = parseWithProviders(text, 'pdf');
  const withMeta: ParsedTicketDraft = {
    ...draft,
    source: 'pdf',
    extractionMethod: 'ocr',
    extractionNote:
      engine === 'unlimited-ocr'
        ? 'Read with Baidu Unlimited-OCR (cloud)'
        : 'Read ticket text from photo (on-device OCR)',
    originalPdfUri: storedUri,
    ...(draft.kind === 'hotel' ? { hotelPhotoUri: storedUri } : {}),
    needsManualCompletion: draft.confidence < 0.65,
    rawText: text,
  };
  if (draft.kind === 'hotel') return withMeta;
  return enrichDraftWithPnr(withMeta);
}

type PhotoSource = 'library' | 'camera';

async function ensurePhotoPermission(source: PhotoSource): Promise<boolean> {
  if (source === 'camera') {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    const asked = await ImagePicker.requestCameraPermissionsAsync();
    return asked.granted;
  }
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted || current.accessPrivileges === 'limited') return true;
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return asked.granted || asked.accessPrivileges === 'limited';
}

/** Pick ticket photo from gallery or camera. Returns null if cancelled. */
export async function pickAndProcessTicketPhoto(
  source: PhotoSource
): Promise<ParsedTicketDraft | null> {
  const ok = await ensurePhotoPermission(source);
  if (!ok) {
    throw new Error(
      source === 'camera'
        ? 'Camera permission is required to photograph your ticket.'
        : 'Photo library permission is required to upload a ticket photo.'
    );
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: false,
          selectionLimit: 1,
        });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) {
    throw new Error('No photo was selected. Please try again.');
  }

  return processTicketPhotoUri(asset.uri, asset.fileName ?? undefined);
}
