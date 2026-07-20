import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { isCreatedTravelId, normalizeTravelId } from './travelId';
import { AuthSession } from './types';

const STORAGE_KEY = 'travelid.google.session.v1';
const LEGACY_KEY = 'travelid.pictogram.session.v1';

/** Keep only fields Travel ID needs — full profiles can exceed SecureStore limits. */
export function leanSession(session: AuthSession): AuthSession {
  const u = session.user || { id: '' };
  const travelId = isCreatedTravelId(u.travelId)
    ? normalizeTravelId(u.travelId!)
    : null;
  return {
    token: session.token,
    tokenType: 'google',
    loggedInAt: session.loggedInAt,
    user: {
      id: u.id,
      travelId,
      travelIdCreatedAt: travelId ? u.travelIdCreatedAt ?? null : null,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      dateOfBirth: u.dateOfBirth ?? null,
      username: u.username ?? null,
      fullName: u.fullName ?? null,
      name: u.name ?? null,
      email: u.email ?? null,
      mobile: u.mobile ?? null,
      phone: u.phone ?? null,
      profilePic: u.profilePic ?? null,
      photo: u.photo ?? null,
      picture: u.picture ?? null,
    },
  };
}

function sanitizeLoaded(session: AuthSession): AuthSession {
  // Drop auto-generated legacy TID-… hashes so user can create a real Travel ID
  if (session.user?.travelId && !isCreatedTravelId(session.user.travelId)) {
    return {
      ...session,
      user: {
        ...session.user,
        travelId: null,
        travelIdCreatedAt: null,
      },
    };
  }
  if (session.user?.travelId) {
    return {
      ...session,
      user: {
        ...session.user,
        travelId: normalizeTravelId(session.user.travelId),
      },
    };
  }
  return session;
}

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const secure = await SecureStore.getItemAsync(STORAGE_KEY);
    if (secure) {
      const parsed = JSON.parse(secure) as AuthSession;
      if (parsed?.tokenType === 'google' && parsed.user?.id) {
        return sanitizeLoaded(parsed);
      }
    }
  } catch {
    // fall through
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed?.tokenType === 'google' && parsed.user?.id) {
        return sanitizeLoaded(parsed);
      }
    }
  } catch {
    // ignore
  }

  try {
    await SecureStore.deleteItemAsync(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  try {
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveSession(session: AuthSession | null) {
  if (!session) {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  const payload = JSON.stringify(leanSession(session));

  try {
    await SecureStore.setItemAsync(STORAGE_KEY, payload);
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  } catch {
    // Android SecureStore has a ~2KB limit; fall back to AsyncStorage.
  }

  await AsyncStorage.setItem(STORAGE_KEY, payload);
}
