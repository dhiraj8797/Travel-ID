import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { proxyFetch } from './apiProxy';

export type OcrEngine = 'unlimited-ocr' | 'ml-kit' | 'none';

export type OcrResult = {
  text: string;
  engine: OcrEngine;
};

const OCR_TIMEOUT_MS = 90_000;
const MAX_IMAGE_BYTES = 4_500_000;

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

async function readImageBase64(uri: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || (info.size != null && info.size > MAX_IMAGE_BYTES)) {
      // Still try; FileSystem may compress on read
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64 || base64.length < 32) return null;
    if (base64.length > MAX_IMAGE_BYTES * 1.4) return null;
    return { base64, mime: mimeFromUri(uri) };
  } catch {
    return null;
  }
}

/**
 * Baidu Unlimited-OCR via Travel ID proxy (`POST /ocr`).
 * Requires UNLIMITED_OCR_URL on the proxy (SGLang / vLLM OpenAI-compatible).
 * https://github.com/baidu/Unlimited-OCR
 */
export async function ocrWithUnlimitedOcr(
  imageUris: string[],
  opts?: { prompt?: string }
): Promise<OcrResult | null> {
  const images: { base64: string; mimeType: string }[] = [];
  for (const uri of imageUris.slice(0, 4)) {
    const packed = await readImageBase64(uri);
    if (packed) images.push({ base64: packed.base64, mimeType: packed.mime });
  }
  if (!images.length) return null;

  try {
    const res = await proxyFetch(
      '/ocr',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          prompt:
            opts?.prompt ||
            'document parsing. Extract all booking text: hotel name, address, phone, email, guest names, booking id, check-in, check-out, room type, meal plan, amenities.',
        }),
      },
      { timeoutMs: OCR_TIMEOUT_MS }
    );

    if (res.status === 503 || res.status === 501) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as {
      text?: string;
      success?: boolean;
      engine?: string;
    };
    const text = String(json.text || '').trim();
    if (!text || text.length < 8) return null;
    return { text, engine: 'unlimited-ocr' };
  } catch {
    return null;
  }
}

/** On-device ML Kit (always available in release APKs). */
export async function ocrWithMlKit(imageUri: string): Promise<OcrResult | null> {
  if (Platform.OS === 'web') return null;
  try {
    const TextRecognition = (await import('@react-native-ml-kit/text-recognition'))
      .default;
    const { TextRecognitionScript } = await import(
      '@react-native-ml-kit/text-recognition'
    );
    const result = await TextRecognition.recognize(
      imageUri,
      TextRecognitionScript.LATIN
    );
    const text = (result.text || '').trim();
    if (!text) return null;
    return { text, engine: 'ml-kit' };
  } catch {
    return null;
  }
}

/**
 * Prefer Baidu Unlimited-OCR (cloud GPU) when the proxy has it configured;
 * otherwise fall back to on-device ML Kit.
 */
export async function recognizeTicketText(
  imageUris: string[],
  opts?: { prompt?: string }
): Promise<OcrResult> {
  const remote = await ocrWithUnlimitedOcr(imageUris, opts);
  if (remote?.text) return remote;

  for (const uri of imageUris) {
    const local = await ocrWithMlKit(uri);
    if (local?.text) return local;
  }

  return { text: '', engine: 'none' };
}
