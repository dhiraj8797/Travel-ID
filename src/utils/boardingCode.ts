import { BoardingCode, BoardingCodeType, Ticket } from '../types/ticket';
import { isBcbpPayload } from '../parsers/bcbp';

/** Normalize expo-camera / ML Kit barcode type strings. */
export function normalizeBoardingCodeType(
  type?: string | null
): BoardingCodeType {
  const t = (type || '').toLowerCase().replace(/^org\.iso\./, '');
  if (t.includes('pdf417') || t === 'pdf_417') return 'PDF417';
  if (t.includes('aztec')) return 'AZTEC';
  if (t.includes('datamatrix') || t.includes('data_matrix')) return 'DATAMATRIX';
  if (t.includes('qr')) return 'QR';
  return 'UNKNOWN';
}

/**
 * Build a BoardingCode from a scan. Prefer the camera symbology; if the
 * payload is IATA BCBP and type is unknown, default to PDF417 (most common).
 */
export function createBoardingCode(
  rawValue: string,
  barcodeType?: string | null,
  imageUri?: string | null
): BoardingCode {
  let type = normalizeBoardingCodeType(barcodeType);
  const raw = rawValue.trim();
  if (type === 'UNKNOWN' && isBcbpPayload(raw)) {
    type = 'PDF417';
  }
  return {
    type,
    rawValue: raw || undefined,
    imageUri: imageUri || undefined,
    formatVersion: isBcbpPayload(raw) ? 'IATA-BCBP' : undefined,
  };
}

/** Value to show / re-encode for gate scan — never invent a new boarding payload. */
export function boardingCodeRaw(ticket: Ticket): string | undefined {
  const fromCode = ticket.boardingCode?.rawValue?.trim();
  if (fromCode) return fromCode;
  const original = ticket.originalQrValue?.trim();
  if (original && (isBcbpPayload(original) || ticket.kind === 'flight')) {
    return original;
  }
  return undefined;
}

export function boardingCodeType(ticket: Ticket): BoardingCodeType {
  if (ticket.boardingCode?.type) return ticket.boardingCode.type;
  const raw = boardingCodeRaw(ticket);
  if (raw && isBcbpPayload(raw)) return 'PDF417';
  return 'QR';
}

/** bwip-js bcid for a boarding symbology */
export function bwipBcidFor(type: BoardingCodeType): string {
  switch (type) {
    case 'PDF417':
      return 'pdf417';
    case 'AZTEC':
      return 'azteccode';
    case 'DATAMATRIX':
      return 'datamatrix';
    case 'QR':
    default:
      return 'qrcode';
  }
}
