import { matchField } from './helpers';

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function cleanStationName(name: string): string {
  let cleaned = titleCase(
    name
      .replace(/^\s*(TO|FROM|AND)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  // Common IRCTC / OCR spellings
  if (/krishnarajapur/i.test(cleaned)) cleaned = 'Krishnarajapuram';
  if (/shivamogga\s*town/i.test(cleaned) || /shimoga\s*town/i.test(cleaned)) {
    cleaned = 'Shivamogga Town';
  }
  if (/^shimoga$/i.test(cleaned) || /^shivamogga$/i.test(cleaned)) {
    cleaned = 'Shivamogga';
  }
  if (/bengaluru|bangalore/i.test(cleaned)) cleaned = cleaned.replace(/bangalore/i, 'Bengaluru');
  return cleaned;
}

export type StationPair = {
  from?: string;
  to?: string;
  fromName?: string;
  toName?: string;
};

/**
 * Resolve origin/destination for IRCTC / Scapia-style tickets.
 * Prefer labeled From/To / Departure/Arrival context — never trust raw document order alone.
 */
export function resolveRailStations(text: string): StationPair {
  const fromLabeled = matchLabeledStation(text, ['From', 'Boarding', 'Boarding at', 'Board']);
  const toLabeled = matchLabeledStation(text, [
    'To',
    'Destination',
    'Reservation Upto',
    'Reservn. Upto',
  ]);

  if (fromLabeled.code && toLabeled.code && fromLabeled.code !== toLabeled.code) {
    return {
      fromName: fromLabeled.name,
      from: fromLabeled.code,
      toName: toLabeled.name,
      to: toLabeled.code,
    };
  }

  // NAME (CODE) … Departure … NAME (CODE)
  const depFirst = text.match(
    /([A-Z][A-Z .']{2,40}?)\s*\(([A-Z]{2,5})\)[\s\S]{0,100}?\bDep(?:arture)?\b[\s\S]{0,220}?([A-Z][A-Z .']{2,40}?)\s*\(([A-Z]{2,5})\)/i
  );
  if (depFirst && depFirst[2].toUpperCase() !== depFirst[4].toUpperCase()) {
    return {
      fromName: cleanStationName(depFirst[1]),
      from: depFirst[2].toUpperCase(),
      toName: cleanStationName(depFirst[3]),
      to: depFirst[4].toUpperCase(),
    };
  }

  const pairs = [...text.matchAll(/([A-Z][A-Z .']{2,40}?)\s*\(([A-Z]{2,5})\)/g)].map((m) => ({
    name: cleanStationName(m[1]),
    code: m[2].toUpperCase(),
    index: m.index ?? 0,
  }));

  if (pairs.length >= 2) {
    const depPos = text.search(/\bDep(?:arture)?\b/i);
    const arrPos = text.search(/\bArr(?:ival)?\b/i);

    let fromPair = pairs[0];
    let toPair = pairs.find((p) => p.code !== fromPair.code) || pairs[1];

    if (depPos >= 0) {
      const beforeDep = pairs.filter((p) => p.index < depPos);
      if (beforeDep.length) fromPair = beforeDep[beforeDep.length - 1];
    }
    if (arrPos >= 0) {
      const nearArr = pairs.filter((p) => p.code !== fromPair.code);
      // Prefer station closest to Arrival label
      if (nearArr.length) {
        toPair = nearArr.reduce((best, p) =>
          Math.abs(p.index - arrPos) < Math.abs(best.index - arrPos) ? p : best
        );
      }
    }

    // Swap if from is closer to Arrival than Departure
    if (depPos >= 0 && arrPos >= 0) {
      const fromCloserToArr =
        Math.abs(fromPair.index - arrPos) < Math.abs(fromPair.index - depPos);
      const toCloserToDep =
        Math.abs(toPair.index - depPos) < Math.abs(toPair.index - arrPos);
      if (fromCloserToArr && toCloserToDep) {
        const tmp = fromPair;
        fromPair = toPair;
        toPair = tmp;
      }
    }

    return {
      fromName: fromPair.name,
      from: fromPair.code,
      toName: toPair.name,
      to: toPair.code,
    };
  }

  const codeArrow = text.match(/\b([A-Z]{2,5})\s*(?:→|->|–|—)\s*([A-Z]{2,5})\b/);
  if (codeArrow) {
    return { from: codeArrow[1].toUpperCase(), to: codeArrow[2].toUpperCase() };
  }

  return {
    fromName: fromLabeled.name,
    from: fromLabeled.code,
    toName: toLabeled.name,
    to: toLabeled.code,
  };
}

function matchLabeledStation(
  text: string,
  labels: string[]
): { name?: string; code?: string } {
  for (const label of labels) {
    const re = new RegExp(
      `\\b${label.replace(/\s+/g, '\\s+')}\\b[\\s\\S]{0,80}?([A-Z][A-Z .']{2,40}?)\\s*\\(([A-Z]{2,5})\\)`,
      'i'
    );
    const m = text.match(re);
    if (m) {
      return { name: cleanStationName(m[1]), code: m[2].toUpperCase() };
    }
  }

  for (const label of labels) {
    const re = new RegExp(
      `\\b${label.replace(/\s+/g, '\\s+')}\\b\\s*[:#]?\\s*([A-Za-z .'-]{3,45}?)(?:\\s*[\\[(]([A-Z]{2,5})[\\])])?`,
      'i'
    );
    const m = text.match(re);
    if (m?.[1] && m[1].trim().length >= 3) {
      return { name: cleanStationName(m[1]), code: m[2]?.toUpperCase() };
    }
  }

  return {};
}

/** Prefer journey departure time — never booking time (e.g. 7:35 PM). */
export function resolveRailTimes(text: string): {
  departureTime?: string;
  arrivalTime?: string;
  departureDate?: string;
  arrivalDate?: string;
} {
  const depExplicit = text.match(
    /Dep(?:arture)?\s*(?:Time)?\s*[:#|]?\s*((?:[01]?\d|2[0-3]):[0-5]\d)/i
  )?.[1];
  const arrExplicit = text.match(
    /Arr(?:ival)?\s*(?:Time)?\s*[:#|]?\s*((?:[01]?\d|2[0-3]):[0-5]\d)/i
  )?.[1];

  // Scapia style: 04:36 | 18 Jul, 2026 under Departure
  const depBlock = text.match(
    /Dep(?:arture)?[\s\S]{0,40}?\b((?:[01]?\d|2[0-3]):[0-5]\d)\b[\s|·]*([0-9A-Za-z,/\- ]{6,28})?/i
  );
  const arrBlock = text.match(
    /Arr(?:ival)?[\s\S]{0,40}?\b((?:[01]?\d|2[0-3]):[0-5]\d)\b[\s|·]*([0-9A-Za-z,/\- ]{6,28})?/i
  );

  const departureDate =
    matchField(text, [
      /(?:Date\s*of\s*Journey|Journey\s*Date)\s*[:#]?\s*([0-9A-Za-z/\- ,]{6,28})/i,
    ]) ||
    (depBlock?.[2] ? depBlock[2].trim() : undefined) ||
    matchField(text, [
      /Dep(?:arture)?[\s\S]{0,50}?(\d{1,2}\s*[A-Za-z]{3}[a-z]*\.?,?\s*\d{2,4})/i,
    ]);

  const arrivalDate =
    (arrBlock?.[2] ? arrBlock[2].trim() : undefined) ||
    matchField(text, [
      /Arr(?:ival)?[\s\S]{0,50}?(\d{1,2}\s*[A-Za-z]{3}[a-z]*\.?,?\s*\d{2,4})/i,
    ]) ||
    departureDate;

  return {
    departureTime: normalizeTime(depExplicit || depBlock?.[1]),
    arrivalTime: normalizeTime(arrExplicit || arrBlock?.[1]),
    departureDate,
    arrivalDate,
  };
}

function normalizeTime(value?: string): string | undefined {
  if (!value) return undefined;
  const m = value.match(/((?:[01]?\d|2[0-3]):[0-5]\d)/);
  if (!m) return value.trim();
  const [h, min] = m[1].split(':');
  return `${h.padStart(2, '0')}:${min}`;
}
