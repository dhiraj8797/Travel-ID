import { inflate } from 'pako';

/**
 * On-device PDF text extractor with selective FlateDecode + Tj/TJ parsing.
 */
function decodePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Only inflate FlateDecode content streams (skip image/binary streams). */
function inflateContentStreams(binary: string): string {
  const parts: string[] = [binary];
  const re = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = re.exec(binary)) !== null) {
    if (count >= 40) break;
    const dict = match[1];
    const raw = match[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '');

    const isFlate = /\/Filter\s*\/FlateDecode|\/Filter\s*\[\s*\/FlateDecode/.test(dict);
    const isImage = /\/Subtype\s*\/Image|\/Width\s+\d+|\/Height\s+\d+/.test(dict);
    if (!isFlate || isImage || raw.length > 2_000_000) continue;

    try {
      const inflated = inflate(latin1ToBytes(raw));
      if (inflated.length > 1_500_000) continue;
      const text = bytesToLatin1(inflated);
      // Keep streams that look like PDF content operators
      if (/Tj|TJ|BT|ET/.test(text) || /\([A-Za-z0-9]/.test(text)) {
        parts.push(text);
        count += 1;
      }
    } catch {
      // ignore non-flate payloads
    }
  }

  return parts.join('\n');
}

function extractFromContent(content: string): string[] {
  const chunks: string[] = [];

  const tjArrayRe = /\[([\s\S]*?)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = tjArrayRe.exec(content)) !== null) {
    const inner = m[1];
    const lit = /\((?:\\.|[^\\)])*\)/g;
    let lm: RegExpExecArray | null;
    let word = '';
    while ((lm = lit.exec(inner)) !== null) {
      word += decodePdfString(lm[0].slice(1, -1));
    }
    if (word.trim()) chunks.push(word.trim());
  }

  const tjRe = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  while ((m = tjRe.exec(content)) !== null) {
    const lit = m[0].match(/\((?:\\.|[^\\)])*\)/);
    if (!lit) continue;
    const decoded = decodePdfString(lit[0].slice(1, -1)).trim();
    if (decoded) chunks.push(decoded);
  }

  // Fallback literals only if little Tj/TJ text found
  if (chunks.join(' ').length < 60) {
    const anyLit = /\((?:\\.|[^\\)])*\)/g;
    while ((m = anyLit.exec(content)) !== null) {
      const decoded = decodePdfString(m[0].slice(1, -1)).trim();
      if (decoded.length >= 1 && decoded.length < 120) chunks.push(decoded);
    }
  }

  const hexRe = /<([0-9A-Fa-f]{4,})>/g;
  while ((m = hexRe.exec(content)) !== null) {
    const hex = m[1].replace(/\s+/g, '');
    if (hex.length % 2 !== 0 || hex.length > 200) continue;
    let out = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16);
      if (code >= 32 && code <= 126) out += String.fromCharCode(code);
    }
    if (out.trim().length >= 2) chunks.push(out.trim());
  }

  return chunks;
}

/** Only glue single-character PDF fragments — never merge words like "To"/"No". */
function stitchFragmented(chunks: string[]): string {
  const merged: string[] = [];
  let buf = '';
  for (const chunk of chunks) {
    if (chunk.length === 1 && /[A-Za-z0-9]/.test(chunk)) {
      buf += chunk;
      continue;
    }
    if (buf) {
      merged.push(buf);
      buf = '';
    }
    merged.push(chunk);
  }
  if (buf) merged.push(buf);
  return merged.join(' ');
}

function normalizeTicketText(text: string): string {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/P\s*N\s*R/gi, 'PNR')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim();
}

function scoreTicketText(text: string): number {
  const upper = text.toUpperCase();
  let score = 0;
  if (/\bPNR\b/.test(upper)) score += 3;
  if (/\bFROM\b/.test(upper)) score += 2;
  if (/\bTO\b/.test(upper)) score += 2;
  if (/\b(TRAIN|BUS|BOARDING|TRAVELS|IRCTC)\b/.test(upper)) score += 3;
  if (/\d{1,2}:\d{2}/.test(text)) score += 2;
  if (/\d{10}|\b[A-Z]{2,}\d{5,}/.test(text)) score += 2;
  score += Math.min(8, Math.floor(text.length / 200));
  return score;
}

export function extractTextFromPdfBase64(base64: string): string {
  const binary = globalThis.atob(base64);

  // Path A: inflate content streams + Tj/TJ
  const inflated = inflateContentStreams(binary);
  const richChunks = extractFromContent(inflated);
  const richText = normalizeTicketText(stitchFragmented(richChunks));

  // Path B: simple literals from raw PDF (previous reliable path)
  const simpleChunks = extractFromContent(binary);
  if (simpleChunks.join(' ').length < 40) {
    const ascii = binary.match(/[\x20-\x7E]{4,}/g) ?? [];
    simpleChunks.push(...ascii.filter((s) => !/^[%\/<>]/.test(s)));
  }
  const simpleText = normalizeTicketText(stitchFragmented(simpleChunks));

  const richScore = scoreTicketText(richText);
  const simpleScore = scoreTicketText(simpleText);

  if (richScore >= simpleScore && richText.length >= 12) return richText;
  if (simpleText.length >= 12) return simpleText;
  return richText || simpleText;
}
