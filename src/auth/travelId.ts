/** Letters only, uppercased. */
function lettersOnly(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function padLetters(value: string, len: number): string {
  const s = lettersOnly(value).slice(0, len);
  return s.padEnd(len, 'X');
}

function padDay(day: number): string {
  return String(Math.max(1, Math.min(31, Math.floor(day)))).padStart(2, '0');
}

export type TravelIdParts = {
  firstName: string;
  lastName: string;
  /** ISO date YYYY-MM-DD */
  dateOfBirth: string;
};

/** Parse YYYY-MM-DD or DD/MM/YYYY → { year, day }. */
export function parseDob(dateOfBirth: string): { year: string; day: string } | null {
  const raw = String(dateOfBirth || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { year: iso[1], day: iso[3] };
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    return { year: dmy[3], day: padDay(Number(dmy[1])) };
  }
  return null;
}

/**
 * Base Travel ID (12 chars):
 * first 4 of first name + birth year + first 2 of last name + birth day
 * e.g. DHIR1999KU25
 */
export function buildBaseTravelId(parts: TravelIdParts): string {
  const dob = parseDob(parts.dateOfBirth);
  if (!dob) {
    throw new Error('Enter a valid date of birth.');
  }
  const first = padLetters(parts.firstName, 4);
  const last = padLetters(parts.lastName, 2);
  if (lettersOnly(parts.firstName).length < 1) {
    throw new Error('Enter your first name.');
  }
  if (lettersOnly(parts.lastName).length < 1) {
    throw new Error('Enter your last name.');
  }
  return `${first}${dob.year}${last}${dob.day}`;
}

const SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomUniquenessCode(): string {
  let out = '';
  for (let i = 0; i < 2; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

/** Strip hyphens / normalize for storage & uniqueness checks. */
export function normalizeTravelId(id: string): string {
  return String(id || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Display format:
 * DHIR1999KU25     → DHIR-1999-KU-25
 * DHIR1999KU25A7   → DHIR-1999-KU-25-A7
 */
export function formatTravelIdDisplay(id: string): string {
  const raw = normalizeTravelId(id);
  if (raw.length < 12) return raw;
  const base = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}-${raw.slice(10, 12)}`;
  if (raw.length === 12) return base;
  return `${base}-${raw.slice(12)}`;
}

/** True only for name/DOB Travel IDs (not legacy TID-… hashes). */
export function isCreatedTravelId(id?: string | null): boolean {
  const raw = normalizeTravelId(id || '');
  return raw.length === 12 || raw.length === 14;
}

export function canCreateTravelId(parts: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}): boolean {
  if (!lettersOnly(parts.firstName) || !lettersOnly(parts.lastName)) return false;
  const dob = parseDob(parts.dateOfBirth);
  if (!dob) return false;
  const iso = parts.dateOfBirth.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return false;
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  const year = Number(iso[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (year < 1900 || year > new Date().getFullYear()) return false;
  return true;
}
