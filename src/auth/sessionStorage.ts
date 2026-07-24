import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { isCreatedTravelId, normalizeTravelId } from './travelId';
import { AuthSession } from './types';

const STORAGE_KEY = 'travelid.google.session.v1';
const TOKEN_KEY = 'travelid.google.token.v1';
const LEGACY_KEY = 'travelid.pictogram.session.v1';

const secureOpts = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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

/** Profile blob without the Google ID token (safe for size / legacy paths). */
function profileWithoutToken(session: AuthSession): Omit<AuthSession, 'token'> & {
  token: '';
} {
  const lean = leanSession(session);
  return { ...lean, token: '' };
}

function sanitizeLoaded(session: AuthSession): AuthSession {
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

async function clearLegacyKeys() {
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
}

export async function loadSession(): Promise<AuthSession | null> {
  try {
    const [secureBody, secureToken] = await Promise.all([
      SecureStore.getItemAsync(STORAGE_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
    ]);

    if (secureBody) {
      const parsed = JSON.parse(secureBody) as AuthSession;
      const token = secureToken || parsed.token;
      if (parsed?.tokenType === 'google' && parsed.user?.id && token) {
        // Migrate: scrub any token that was stored in the body.
        if (parsed.token && !secureToken) {
          try {
            await SecureStore.setItemAsync(TOKEN_KEY, token, secureOpts);
            await SecureStore.setItemAsync(
              STORAGE_KEY,
              JSON.stringify(profileWithoutToken({ ...parsed, token })),
              secureOpts
            );
          } catch {
            /* keep reading */
          }
        }
        return sanitizeLoaded({ ...parsed, token });
      }
    }
  } catch {
    // fall through
  }

  // Legacy plaintext AsyncStorage — migrate token out, never keep it there.
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed?.tokenType === 'google' && parsed.user?.id && parsed.token) {
        try {
          await saveSession(parsed);
        } catch {
          // If SecureStore is unavailable, drop the insecure session.
          await AsyncStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return sanitizeLoaded(parsed);
      }
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }

  await clearLegacyKeys();
  return null;
}

export async function saveSession(session: AuthSession | null) {
  if (!session) {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }

  const lean = leanSession(session);
  if (!lean.token) {
    throw new Error('Missing session token');
  }

  // Never persist the Google ID token in AsyncStorage.
  await AsyncStorage.removeItem(STORAGE_KEY);

  try {
    await SecureStore.setItemAsync(TOKEN_KEY, lean.token, secureOpts);
    await SecureStore.setItemAsync(
      STORAGE_KEY,
      JSON.stringify(profileWithoutToken(lean)),
      secureOpts
    );
  } catch (error) {
    // Do not fall back to plaintext storage for auth tokens.
    throw error instanceof Error
      ? error
      : new Error('Could not store session securely on this device');
  }
}
