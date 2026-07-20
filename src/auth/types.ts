export type AuthUser = {
  id: string;
  /** Permanent Travel ID (raw, no hyphens), e.g. DHIR1999KU25 */
  travelId?: string | null;
  travelIdCreatedAt?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** ISO YYYY-MM-DD */
  dateOfBirth?: string | null;
  username?: string | null;
  fullName?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  phone?: string | null;
  profilePic?: string | null;
  photo?: string | null;
  picture?: string | null;
};

export type AuthSession = {
  /** Google ID token (or opaque local token). */
  token: string;
  tokenType: 'google';
  user: AuthUser;
  loggedInAt: string;
};

export function normalizeAuthUser(
  raw: Record<string, unknown> | null | undefined
): AuthUser {
  if (!raw) {
    return { id: '' };
  }
  const id = String(raw._id || raw.id || raw.sub || '');
  const email = (raw.email as string | null | undefined) || null;
  const firstName = (raw.firstName as string) || null;
  const lastName = (raw.lastName as string) || null;
  const fullName =
    (raw.fullName as string) ||
    (raw.name as string) ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    (raw.username as string) ||
    null;

  return {
    id,
    travelId: (raw.travelId as string) || null,
    travelIdCreatedAt: (raw.travelIdCreatedAt as string) || null,
    firstName,
    lastName,
    dateOfBirth: (raw.dateOfBirth as string) || null,
    username: (raw.username as string) || (raw.preferred_username as string) || null,
    fullName,
    name: (raw.name as string) || fullName,
    email,
    mobile:
      (raw.mobile as string) ||
      (raw.phone_number as string) ||
      (raw.phone as string) ||
      null,
    phone: (raw.phone as string) || (raw.mobile as string) || null,
    profilePic:
      (raw.profilePic as string) ||
      (raw.photo as string) ||
      (raw.picture as string) ||
      (raw.profileImage as string) ||
      null,
    photo: (raw.photo as string) || (raw.profilePic as string) || (raw.picture as string) || null,
    picture: (raw.picture as string) || (raw.profilePic as string) || null,
  };
}

export function displayName(user: AuthUser | null | undefined): string {
  if (!user) return 'Traveller';
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return (
    fromParts ||
    user.fullName ||
    user.name ||
    user.username ||
    user.email ||
    'Traveller'
  );
}
