import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type GmailAccount = {
  id: string;
  email: string;
  /** Google user id for this mailbox */
  googleUserId: string;
  connectedAt: string;
  lastSyncAt?: string | null;
};

type GmailTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
};

const ACCOUNTS_KEY = 'travelid.gmail.accounts.v1';
const tokensKey = (accountId: string) => `travelid.gmail.tokens.${accountId}`;

export async function listGmailAccounts(): Promise<GmailAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GmailAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAccounts(accounts: GmailAccount[]) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function upsertGmailAccount(
  account: GmailAccount,
  tokens: GmailTokens
): Promise<GmailAccount[]> {
  const list = await listGmailAccounts();
  const next = [
    account,
    ...list.filter(
      (a) =>
        a.id !== account.id &&
        a.email.toLowerCase() !== account.email.toLowerCase()
    ),
  ];
  await saveAccounts(next);
  await SecureStore.setItemAsync(tokensKey(account.id), JSON.stringify(tokens));
  return next;
}

export async function removeGmailAccount(accountId: string): Promise<GmailAccount[]> {
  const list = (await listGmailAccounts()).filter((a) => a.id !== accountId);
  await saveAccounts(list);
  try {
    await SecureStore.deleteItemAsync(tokensKey(accountId));
  } catch {
    /* ignore */
  }
  return list;
}

export async function getGmailTokens(
  accountId: string
): Promise<GmailTokens | null> {
  try {
    const raw = await SecureStore.getItemAsync(tokensKey(accountId));
    if (!raw) return null;
    return JSON.parse(raw) as GmailTokens;
  } catch {
    return null;
  }
}

export async function saveGmailTokens(
  accountId: string,
  tokens: GmailTokens
): Promise<void> {
  await SecureStore.setItemAsync(tokensKey(accountId), JSON.stringify(tokens));
}

export async function markGmailSynced(accountId: string): Promise<void> {
  const list = await listGmailAccounts();
  const next = list.map((a) =>
    a.id === accountId ? { ...a, lastSyncAt: new Date().toISOString() } : a
  );
  await saveAccounts(next);
}
