import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  refreshGoogleProfile,
  signInWithGoogleAccount,
} from './googleSignIn';
import { loadSession, saveSession } from './sessionStorage';
import { isCreatedTravelId, normalizeTravelId } from './travelId';
import { claimUniqueTravelId } from './travelIdRegistry';
import { AuthSession, AuthUser, displayName } from './types';

type ProfileDetailsInput = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  displayName: string;
  /** Permanent Travel ID once created (raw). */
  travelId: string | null;
  hasTravelId: boolean;
  loginWithGoogle: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Save name/DOB (does not change an existing Travel ID). */
  saveProfileDetails: (input: ProfileDetailsInput) => Promise<void>;
  /** Create Travel ID once from name + DOB. */
  createTravelId: (input: ProfileDetailsInput) => Promise<string>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (!stored) {
        setLoading(false);
        return;
      }
      setSession(stored);
      try {
        const refreshed = await refreshGoogleProfile(stored.user);
        if (refreshed) {
          setSession(refreshed);
          await saveSession(refreshed);
        }
      } catch {
        // Keep cached profile if offline / silent sign-in unavailable
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const commit = useCallback(async (next: AuthSession | null) => {
    setSession(next);
    await saveSession(next);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const next = await signInWithGoogleAccount();
    // Keep details if same Google user re-signs in after partial session
    if (
      session?.user?.id === next.user.id &&
      (session.user.travelId || session.user.firstName)
    ) {
      await commit({
        ...next,
        user: {
          ...next.user,
          firstName: session.user.firstName ?? next.user.firstName,
          lastName: session.user.lastName ?? next.user.lastName,
          dateOfBirth: session.user.dateOfBirth ?? next.user.dateOfBirth,
          travelId: session.user.travelId ?? next.user.travelId,
          travelIdCreatedAt:
            session.user.travelIdCreatedAt ?? next.user.travelIdCreatedAt,
          fullName:
            [session.user.firstName, session.user.lastName]
              .filter(Boolean)
              .join(' ') || next.user.fullName,
        },
      });
      return;
    }
    await commit(next);
  }, [commit, session]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const refreshed = await refreshGoogleProfile(session.user);
    if (refreshed) {
      await commit(refreshed);
      return;
    }
    throw new Error('Could not refresh Google profile. Sign in again.');
  }, [session, commit]);

  const saveProfileDetails = useCallback(
    async (input: ProfileDetailsInput) => {
      if (!session?.user?.id) {
        throw new Error('Sign in first.');
      }
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      const dateOfBirth = input.dateOfBirth.trim();
      if (!firstName || !lastName || !dateOfBirth) {
        throw new Error('First name, last name, and date of birth are required.');
      }
      const fullName = `${firstName} ${lastName}`.trim();
      await commit({
        ...session,
        user: {
          ...session.user,
          firstName,
          lastName,
          dateOfBirth,
          fullName,
          name: fullName,
          // Existing Travel ID is permanent — never rewrite here
        },
      });
    },
    [session, commit]
  );

  const createTravelId = useCallback(
    async (input: ProfileDetailsInput) => {
      if (!session?.user?.id) {
        throw new Error('Sign in first.');
      }
      if (isCreatedTravelId(session.user.travelId)) {
        return normalizeTravelId(session.user.travelId!);
      }
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      const dateOfBirth = input.dateOfBirth.trim();
      const travelId = await claimUniqueTravelId(session.user.id, {
        firstName,
        lastName,
        dateOfBirth,
      });
      const fullName = `${firstName} ${lastName}`.trim();
      await commit({
        ...session,
        user: {
          ...session.user,
          firstName,
          lastName,
          dateOfBirth,
          fullName,
          name: fullName,
          travelId,
          travelIdCreatedAt: new Date().toISOString(),
        },
      });
      return travelId;
    },
    [session, commit]
  );

  const logout = useCallback(async () => {
    try {
      const { GoogleSignin } = await import(
        '@react-native-google-signin/google-signin'
      );
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }
    await commit(null);
  }, [commit]);

  const travelId = isCreatedTravelId(session?.user?.travelId)
    ? normalizeTravelId(session!.user.travelId!)
    : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      displayName: displayName(session?.user),
      travelId,
      hasTravelId: Boolean(travelId),
      loginWithGoogle,
      refreshProfile,
      saveProfileDetails,
      createTravelId,
      logout,
    }),
    [
      session,
      loading,
      travelId,
      loginWithGoogle,
      refreshProfile,
      saveProfileDetails,
      createTravelId,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
