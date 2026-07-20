import { ParsedTicketDraft, TicketType } from '../../types/ticket';

export interface TicketParser {
  readonly name: string;
  canParse(text: string): boolean;
  parse(text: string): ParsedTicketDraft;
}

export function detectTicketType(text: string): TicketType {
  const value = text.toLowerCase();

  // IATA BCBP boarding barcodes (IndiGo etc.) — check before rail heuristics
  if (
    /^m[1-4]/i.test(text.trim()) ||
    /m[1-4][a-z]+\/[a-z]/i.test(text) ||
    /\b(?:6e|ai|uk|sg|qp)\s*\d{2,4}\b/i.test(text)
  ) {
    return 'FLIGHT';
  }

  if (
    /boarding\s*pass|flight\s*no|airline|airport|indigo|air\s*india|gate\s*[a-z0-9]/.test(
      value
    )
  ) {
    return 'FLIGHT';
  }

  if (
    /indian\s*railways|irctc|train\s*no|coach|berth|cnf\/|quota/.test(value)
  ) {
    return 'TRAIN';
  }

  if (
    /boarding\s*point|bus\s*operator|a\/c\s*sleeper|dropping\s*point|redbus|travels|scapia/.test(
      value
    )
  ) {
    return 'BUS';
  }

  return 'UNKNOWN';
}

export function findPnr(text: string): string | undefined {
  const patterns = [
    /(?:PNR|Booking\s*ID|Ticket\s*(?:No|ID))\s*[:\-]?\s*([A-Z0-9-]{6,20})/i,
    /\b([A-Z]{2,5}\d{6,}[A-Z0-9]*)\b/,
    /\b(\d{10})\b/,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

export function findTimes(text: string): string[] {
  return Array.from(
    text.matchAll(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM|am|pm))?\b/g)
  ).map((m) => m[0]);
}

export function findSeat(text: string): string | undefined {
  return text.match(
    /(?:seat|berth)\s*[:\-]?\s*([A-Z]?\d{1,3}(?:\/[A-Z]+)?)/i
  )?.[1];
}

export function findPassengerName(text: string): string | undefined {
  const m =
    text.match(
      /(?:Passenger|Pax|Name)\s*[:\-]?\s*((?:Mr\.|Mrs\.|Ms\.)?\s*[A-Za-z][A-Za-z .']{2,40})/i
    ) ||
    text.match(/\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){0,3})\s+\d{1,2}\s+[MF]\b/);
  return m?.[1]?.trim();
}
