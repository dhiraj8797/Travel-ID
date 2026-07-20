function clean(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length ? trimmed : undefined;
}

export function matchField(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return undefined;
}

export function matchAll(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = clean(match[1] ?? match[0]);
    if (value) values.push(value);
  }
  return values;
}

export function detectKind(text: string): 'rail' | 'bus' {
  const upper = text.toUpperCase();

  // Hard bus overrides — common e-ticket phrases
  const strongBus =
    /\bBUS\s*TICKET\b/.test(upper) ||
    /\bBOARDING\s*POINT\b/.test(upper) ||
    /\bDROP(?:PING)?\s*POINT\b/.test(upper) ||
    /\b(REDBUS|INTRCITY|ABHIBUS|PAYTM\s*BUS)\b/.test(upper) ||
    /\b(KSRTC|MSRTC|GSRTC|RSRTC|UPSRTC|APSRTC|TSRTC)\b/.test(upper) ||
    /\b(VOLVO|A\/C\s*SLEEPER|AC\s*SLEEPER|SEATER)\b/.test(upper) ||
    /\b(TRAVELS|OPERATOR)\b/.test(upper) && /\b(SEAT|BUS)\b/.test(upper) ||
    /\bBUS\s*(?:NO|NUMBER|TYPE|NAME)\b/.test(upper);

  // Hard rail overrides
  const strongRail =
    /\bIRCTC\b/.test(upper) ||
    /\bINDIAN\s*RAILWAYS?\b/.test(upper) ||
    /\bTRAIN\s*TICKET\b/.test(upper) ||
    /\bTRAIN\s*(?:NO|NUMBER|NAME)\b/.test(upper) ||
    /\b(COACH|BERTH|QUOTA)\b/.test(upper) ||
    /\b(CNF|RAC|WL)\/[A-Z0-9]+\//.test(upper) ||
    /\bE[\s-]?TICKET\b/.test(upper) && /\bPNR\b/.test(upper) && /\bTRAIN\b/.test(upper);

  if (strongBus && !strongRail) return 'bus';
  if (strongRail && !strongBus) return 'rail';

  let busScore = 0;
  let railScore = 0;

  if (/\bBUS\b/.test(upper)) busScore += 5;
  if (/\bBOARDING\b/.test(upper)) busScore += 3;
  if (/\bDROP/.test(upper)) busScore += 3;
  if (/\bTRAVELS\b/.test(upper)) busScore += 4;
  if (/\bOPERATOR\b/.test(upper)) busScore += 2;
  if (/\bSEAT\b/.test(upper)) busScore += 2;
  if (/\b(L|U|S)\d{1,2}\b/.test(upper)) busScore += 2; // sleeper seats L4, U1
  if (/PNR\s*[:#]?\s*[A-Z]{2,}/i.test(text)) busScore += 4; // alphanumeric PNR = usually bus
  if (/\b[A-Z]{2,5}\d{5,}[A-Z0-9]*\b/.test(upper)) busScore += 2; // booking ids

  if (/\bTRAIN\b/.test(upper)) railScore += 5;
  if (/\bIRCTC\b/.test(upper)) railScore += 6;
  if (/\b(COACH|BERTH)\b/.test(upper)) railScore += 4;
  if (/\bQUOTA\b/.test(upper)) railScore += 3;
  if (/\b(CNF|RAC|WL)\//.test(upper)) railScore += 5;
  if (/\b(SL|3A|2A|1A|3E|CC|EC)\b/.test(upper)) railScore += 2;
  // Pure numeric 10-digit PNR is strongly IRCTC — but only if not clearly a bus ticket
  if (/\bPNR\s*[:#]?\s*\d{10}\b/i.test(text) || (/\b\d{10}\b/.test(text) && /\bTRAIN\b/.test(upper))) {
    railScore += 4;
  }
  if (/\b\d{5}\b/.test(text) && /\bTRAIN\b/.test(upper)) railScore += 3;

  if (busScore === railScore) {
    // Tie-break: prefer bus if "bus" appears at all, else rail
    return /\bBUS\b/.test(upper) ? 'bus' : 'rail';
  }
  return busScore > railScore ? 'bus' : 'rail';
}


export function splitStations(text: string): { from?: string; to?: string } {
  // Word-boundary on "to" so "TOWN" is never split as To + WN
  const arrow = text.match(
    /([A-Za-z][A-Za-z .'-]{1,40})\s*(?:→|->|–|—|\bto\b)\s*([A-Za-z][A-Za-z .'-]{1,40})/i
  );
  if (arrow) {
    return { from: clean(arrow[1]), to: clean(arrow[2]) };
  }
  return {};
}

export function extractDate(text: string): string | undefined {
  return matchField(text, [
    /(\d{1,2}[-\/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\/\s]\d{2,4})/i,
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ]);
}

export function extractTime(text: string): string | undefined {
  return matchField(text, [
    /\b((?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s?(?:AM|PM|am|pm)?)\b/,
    /\b((?:[01]?\d|2[0-3])[:.][0-5]\d\s?(?:Hrs|hrs|HRS)?)\b/,
  ]);
}
