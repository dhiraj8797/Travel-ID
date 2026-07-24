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
import {
  loadUserProfile,
  mergeStoredProfile,
  saveUserProfile,
} from './profileStore';
import { loadSession, saveSession } from './sessionStorage';
import { isCreatedTravelId, normalizeTravelId } from './travelId';
import { claimUniqueTravelId } from './travelIdRegistry';
import { AuthSession, displayName } from './types';

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
      // Restore durable profile if session was missing DOB / Travel ID
      const profile = await loadUserProfile(stored.user.id);
      const hydrated: AuthSession = {
        ...stored,
        user: mergeStoredProfile(stored.user, profile),
      };
      setSession(hydrated);
      try {
        const refreshed = await refreshGoogleProfile(hydrated.user);
        if (refreshed) {
          const merged = {
            ...refreshed,
            user: mergeStoredProfile(refreshed.user, {
              userId: hydrated.user.id,
              firstName: hydrated.user.firstName,
              lastName: hydrated.user.lastName,
              dateOfBirth: hydrated.user.dateOfBirth,
              fullName: hydrated.user.fullName || hydrated.user.name,
              travelId: hydrated.user.travelId,
              travelIdCreatedAt: hydrated.user.travelIdCreatedAt,
              updatedAt: new Date().toISOString(),
            }),
          };
          setSession(merged);
          await saveSession(merged);
          await saveUserProfile(merged.user);
        } else if (profile) {
          await saveSession(hydrated);
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
    if (next?.user?.id) {
      await saveUserProfile(next.user);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const next = await signInWithGoogleAccount();
    const stored = await loadUserProfile(next.user.id);
    // Prefer in-memory session for same user, then durable profile store
    let mergedUser = mergeStoredProfile(next.user, stored);
    if (session?.user?.id === next.user.id) {
      mergedUser = mergeStoredProfile(mergedUser, {
        userId: session.user.id,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        dateOfBirth: session.user.dateOfBirth,
        fullName: session.user.fullName || session.user.name,
        travelId: session.user.travelId,
        travelIdCreatedAt: session.user.travelIdCreatedAt,
        updatedAt: new Date().toISOString(),
      });
    }
    await commit({
      ...next,
      user: mergedUser,
    });
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
