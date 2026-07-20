/** Normalize for passenger vs profile matching. */
export function normalizePersonName(name: string): string {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(name: string): string[] {
  return normalizePersonName(name)
    .split(' ')
    .filter((t) => t.length >= 2);
}

/**
 * True if ticket passenger appears to be this profile user.
 * Handles "DHIRAJ KUMAR", "KUMAR/DHIRAJ", "KUMAR, DHIRAJ".
 */
export function passengerMatchesProfile(
  passengerName: string,
  profile: { firstName?: string | null; lastName?: string | null; fullName?: string | null; name?: string | null }
): boolean {
  const pax = normalizePersonName(
    passengerName.replace(/,/g, ' ').replace(/\//g, ' ')
  );
  if (!pax || pax === 'TRAVELLER' || pax === 'PASSENGER') return false;

  const first = normalizePersonName(profile.firstName || '');
  const last = normalizePersonName(profile.lastName || '');
  const full = normalizePersonName(
    profile.fullName ||
      profile.name ||
      [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  );

  if (first && last) {
    if (pax.includes(first) && pax.includes(last)) return true;
    // BCBP style already spaced
    const paxTokens = nameTokens(pax);
    if (paxTokens.includes(first) && paxTokens.includes(last)) return true;
  }

  if (full && full.length >= 5) {
    const fullTokens = nameTokens(full);
    const paxTokens = nameTokens(pax);
    if (fullTokens.length >= 2) {
      const hits = fullTokens.filter((t) => paxTokens.includes(t));
      if (hits.length >= 2) return true;
    }
    if (pax === full) return true;
  }

  return false;
}
