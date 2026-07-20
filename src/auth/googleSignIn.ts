import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';
import { GOOGLE_WEB_CLIENT_ID } from './config';
import { AuthSession, AuthUser, normalizeAuthUser } from './types';

/** Debug keystore SHA-1 used by current release APKs (signingConfigs.debug). */
export const ANDROID_DEBUG_SHA1 =
  '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

let configured = false;

export function webClientId(): string {
  const extra = Constants.expoConfig?.extra as
    | { googleWebClientId?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    extra?.googleWebClientId ||
    GOOGLE_WEB_CLIENT_ID
  ).trim();
}

/** Reset so next call can reconfigure (e.g. after Gmail connect). */
export function resetGoogleSignInConfig() {
  configured = false;
}

function ensureConfigured() {
  if (configured) return;
  const id = webClientId();
  if (!id) {
    throw new Error('Google Web Client ID is not configured.');
  }
  GoogleSignin.configure({
    webClientId: id,
    offlineAccess: false,
    forceCodeForRefreshToken: false,
  });
  configured = true;
}

function mapGoogleError(e: unknown): Error {
  if (isErrorWithCode(e)) {
    if (e.code === statusCodes.SIGN_IN_CANCELLED) {
      return new Error('Sign-in cancelled');
    }
    if (e.code === statusCodes.IN_PROGRESS) {
      return new Error('Google sign-in already in progress.');
    }
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return new Error('Google Play Services is unavailable on this device.');
    }
    if (
      e.code === '10' ||
      e.code === 10 ||
      String(e.code).includes('DEVELOPER_ERROR') ||
      /developer_error|code:\s*10\b/i.test(String(e.message || ''))
    ) {
      return new Error(
        `Google Sign-In developer error (SHA-1 mismatch).\n\n` +
          `In Firebase → Android app (com.travelid.app) add fingerprint:\n\n` +
          `${ANDROID_DEBUG_SHA1}`
      );
    }
  }

  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e && 'message' in e
        ? String((e as { message?: string }).message)
        : '';

  return new Error(
    msg ||
      'Google sign-in failed. Check Firebase SHA-1 for com.travelid.app.'
  );
}

/**
 * Native Google account picker → local Travel ID session (no Pictogram).
 */
export async function signInWithGoogleAccount(): Promise<AuthSession> {
  ensureConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch {
    throw new Error(
      'Google Play Services is required for Google sign-in on this device.'
    );
  }

  try {
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new Error('Google sign-in was cancelled.');
    }

    const idToken = response.data.idToken;
    const gUser = response.data.user;
    if (!idToken) {
      throw new Error(
        `Google did not return an ID token.\n\nAdd this SHA-1 in Firebase:\n${ANDROID_DEBUG_SHA1}`
      );
    }
    if (!gUser?.id) {
      throw new Error('Google did not return a user profile.');
    }

    return {
      token: idToken,
      tokenType: 'google',
      loggedInAt: new Date().toISOString(),
      user: normalizeAuthUser({
        id: gUser.id,
        email: gUser.email,
        name: gUser.name,
        fullName: gUser.name,
        photo: gUser.photo,
        picture: gUser.photo,
        profilePic: gUser.photo,
      }),
    };
  } catch (e: unknown) {
    if (e instanceof Error && /cancelled|SHA-1|ID token/i.test(e.message)) {
      throw e;
    }
    throw mapGoogleError(e);
  }
}

/** Refresh Google photo/name; preserve Travel ID + profile details. */
export async function refreshGoogleProfile(
  existing?: Partial<AuthUser> | null
): Promise<AuthSession | null> {
  ensureConfigured();
  try {
    const response = await GoogleSignin.signInSilently();
    if (!isSuccessResponse(response)) return null;
    const idToken = response.data.idToken;
    const gUser = response.data.user;
    if (!idToken || !gUser?.id) return null;
    return {
      token: idToken,
      tokenType: 'google',
      loggedInAt: new Date().toISOString(),
      user: normalizeAuthUser({
        id: gUser.id,
        email: gUser.email || existing?.email,
        name: gUser.name || existing?.name,
        fullName:
          existing?.fullName ||
          [existing?.firstName, existing?.lastName].filter(Boolean).join(' ') ||
          gUser.name,
        firstName: existing?.firstName,
        lastName: existing?.lastName,
        dateOfBirth: existing?.dateOfBirth,
        travelId: existing?.travelId,
        travelIdCreatedAt: existing?.travelIdCreatedAt,
        photo: gUser.photo || existing?.photo,
        picture: gUser.photo || existing?.picture,
        profilePic: gUser.photo || existing?.profilePic,
      }),
    };
  } catch {
    return null;
  }
}
