import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCreatedTravelId, normalizeTravelId } from './travelId';
import { AuthUser } from './types';

const PROFILE_STORE_KEY = 'travelid.user.profiles.v1';

export type StoredUserProfile = {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  fullName?: string | null;
  travelId?: string | null;
  travelIdCreatedAt?: string | null;
  updatedAt: string;
};

type ProfileMap = Record<string, StoredUserProfile>;

async function loadMap(): Promise<ProfileMap> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProfileMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveMap(map: ProfileMap): Promise<void> {
  await AsyncStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(map));
}

/** Load durable profile for a Google user (survives logout). */
export async function loadUserProfile(
  userId: string | null | undefined
): Promise<StoredUserProfile | null> {
  const id = userId?.trim();
  if (!id) return null;
  const map = await loadMap();
  return map[id] || null;
}

/** Persist name / DOB / Travel ID so re-login does not ask again. */
export async function saveUserProfile(
  user: Pick<
    AuthUser,
    | 'id'
    | 'firstName'
    | 'lastName'
    | 'dateOfBirth'
    | 'fullName'
    | 'name'
    | 'travelId'
    | 'travelIdCreatedAt'
  >
): Promise<void> {
  const id = user.id?.trim();
  if (!id) return;

  const travelId = isCreatedTravelId(user.travelId)
    ? normalizeTravelId(user.travelId!)
    : null;

  const map = await loadMap();
  const prev = map[id];
  map[id] = {
    userId: id,
    firstName: user.firstName ?? prev?.firstName ?? null,
    lastName: user.lastName ?? prev?.lastName ?? null,
    dateOfBirth: user.dateOfBirth ?? prev?.dateOfBirth ?? null,
    fullName:
      user.fullName ||
      user.name ||
      prev?.fullName ||
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      null,
    travelId: travelId ?? prev?.travelId ?? null,
    travelIdCreatedAt: travelId
      ? user.travelIdCreatedAt ?? prev?.travelIdCreatedAt ?? null
      : prev?.travelIdCreatedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
  await saveMap(map);
}

/** Merge durable profile into a fresh Google session user. */
export function mergeStoredProfile(
  user: AuthUser,
  stored: StoredUserProfile | null | undefined
): AuthUser {
  if (!stored) return user;
  const travelId = isCreatedTravelId(stored.travelId)
    ? normalizeTravelId(stored.travelId!)
    : isCreatedTravelId(user.travelId)
      ? normalizeTravelId(user.travelId!)
      : null;
  const firstName = user.firstName || stored.firstName || null;
  const lastName = user.lastName || stored.lastName || null;
  const fullName =
    user.fullName ||
    stored.fullName ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    user.name ||
    null;
  return {
    ...user,
    firstName,
    lastName,
    dateOfBirth: user.dateOfBirth || stored.dateOfBirth || null,
    fullName,
    name: fullName || user.name,
    travelId,
    travelIdCreatedAt: travelId
      ? user.travelIdCreatedAt || stored.travelIdCreatedAt || null
      : null,
  };
}
