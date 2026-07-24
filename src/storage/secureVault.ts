import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { gcm } from '@noble/ciphers/aes.js';

const KEY_ID = 'travelid.wallet.aes256.v1';
const ENVELOPE_PREFIX = 'enc.v1.';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return globalThis.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function getOrCreateKey(): Promise<Uint8Array> {
  try {
    const existing = await SecureStore.getItemAsync(KEY_ID);
    if (existing) return base64ToBytes(existing);
  } catch {
    // recreate below
  }
  const key = await Crypto.getRandomBytesAsync(32);
  const encoded = bytesToBase64(key);
  await SecureStore.setItemAsync(KEY_ID, encoded, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

/** True when value is an encrypted vault envelope. */
export function isEncryptedEnvelope(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && raw.startsWith(ENVELOPE_PREFIX);
}

/** Encrypt UTF-8 plaintext → `enc.v1.` + base64(iv || ciphertext). */
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = await Crypto.getRandomBytesAsync(12);
  const aes = gcm(key, iv);
  const ciphertext = aes.encrypt(textEncoder.encode(plaintext));
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return ENVELOPE_PREFIX + bytesToBase64(packed);
}

/** Decrypt envelope, or return plaintext unchanged (legacy migration). */
export async function decryptString(raw: string): Promise<string> {
  if (!isEncryptedEnvelope(raw)) return raw;
  const packed = base64ToBytes(raw.slice(ENVELOPE_PREFIX.length));
  if (packed.length < 13) {
    throw new Error('Corrupt encrypted wallet payload');
  }
  const key = await getOrCreateKey();
  const iv = packed.subarray(0, 12);
  const ciphertext = packed.subarray(12);
  const aes = gcm(key, iv);
  return textDecoder.decode(aes.decrypt(ciphertext));
}
