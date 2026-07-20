import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import {
  resetGoogleSignInConfig,
  webClientId,
} from '../../auth/googleSignIn';
import { proxyFetch, getApiProxyUrl } from '../apiProxy';
import {
  GmailAccount,
  getGmailTokens,
  saveGmailTokens,
  upsertGmailAccount,
} from '../../storage/gmailAccounts';

export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly';

function configureForGmail() {
  resetGoogleSignInConfig();
  GoogleSignin.configure({
    webClientId: webClientId(),
    offlineAccess: true,
    forceCodeForRefreshToken: true,
    scopes: [GMAIL_READONLY_SCOPE],
  });
}

function restoreAuthConfig() {
  resetGoogleSignInConfig();
}

function hasGmailScope(scopes: string[] | undefined | null): boolean {
  return (scopes || []).some(
    (s) =>
      s === GMAIL_READONLY_SCOPE ||
      s === 'https://mail.google.com/' ||
      /gmail/i.test(s)
  );
}

/**
 * Android often ignores configure().scopes for extra APIs — force Gmail via addScopes.
 */
async function ensureGmailReadonlyGranted(): Promise<string[]> {
  const current = GoogleSignin.getCurrentUser();
  if (hasGmailScope(current?.scopes)) {
    return current!.scopes;
  }

  const added = await GoogleSignin.addScopes({
    scopes: [GMAIL_READONLY_SCOPE],
  });
  if (added && isSuccessResponse(added) && hasGmailScope(added.data.scopes)) {
    return added.data.scopes;
  }

  const after = GoogleSignin.getCurrentUser();
  if (hasGmailScope(after?.scopes)) {
    return after!.scopes;
  }

  throw new Error(
    'Gmail read permission was not granted.\n\n' +
      '1) When Google asks, allow “View your email messages and settings”.\n' +
      '2) Cloud Console: enable Gmail API + add gmail.readonly on the consent screen.\n' +
      '3) Add your Gmail as a Test user (Testing mode).'
  );
}

/**
 * Connect another Gmail mailbox (can be different from Travel ID login).
 * Requests gmail.readonly; stores tokens for sync.
 */
export async function connectGmailAccount(): Promise<GmailAccount> {
  configureForGmail();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }

    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new Error('Gmail connect was cancelled.');
    }

    const gUser = response.data.user;
    if (!gUser?.id || !gUser.email) {
      throw new Error('Google did not return a Gmail profile.');
    }

    await ensureGmailReadonlyGranted();

    // Fresh token after scope grant
    try {
      const old = await GoogleSignin.getTokens();
      if (old.accessToken) {
        await GoogleSignin.clearCachedAccessToken(old.accessToken);
      }
    } catch {
      /* ignore */
    }
    const tokens = await GoogleSignin.getTokens();
    const serverAuthCode =
      GoogleSignin.getCurrentUser()?.serverAuthCode ||
      response.data.serverAuthCode;

    let refreshToken: string | null = null;
    if (serverAuthCode && getApiProxyUrl()) {
      try {
        refreshToken = await exchangeServerAuthCode(serverAuthCode);
      } catch {
        // Optional — access token still works until expiry
      }
    }

    const account: GmailAccount = {
      id: `gmail_${gUser.id}`,
      email: gUser.email,
      googleUserId: gUser.id,
      connectedAt: new Date().toISOString(),
    };

    await upsertGmailAccount(account, {
      accessToken: tokens.accessToken,
      refreshToken,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });

    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }

    return account;
  } finally {
    restoreAuthConfig();
  }
}

async function exchangeServerAuthCode(code: string): Promise<string | null> {
  const res = await proxyFetch('/google/oauth/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { refresh_token?: string };
  return json.refresh_token || null;
}

/** Valid access token for Gmail API calls (refresh via proxy when possible). */
export async function getValidGmailAccessToken(
  accountId: string
): Promise<string> {
  const tokens = await getGmailTokens(accountId);
  if (!tokens?.accessToken) {
    throw new Error('Gmail account is not connected. Connect it again.');
  }

  if (tokens.expiresAt && tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  if (tokens.refreshToken && getApiProxyUrl()) {
    try {
      const res = await proxyFetch('/google/oauth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          access_token?: string;
          expires_in?: number;
        };
        if (json.access_token) {
          await saveGmailTokens(accountId, {
            accessToken: json.access_token,
            refreshToken: tokens.refreshToken,
            expiresAt: Date.now() + (json.expires_in || 3000) * 1000,
          });
          return json.access_token;
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Re-auth interactively for this mailbox
  configureForGmail();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      throw new Error('Sign in again to refresh Gmail access.');
    }
    await ensureGmailReadonlyGranted();
    const fresh = await GoogleSignin.getTokens();
    await saveGmailTokens(accountId, {
      accessToken: fresh.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });
    try {
      await GoogleSignin.signOut();
    } catch {
      /* ignore */
    }
    return fresh.accessToken;
  } finally {
    restoreAuthConfig();
  }
}
