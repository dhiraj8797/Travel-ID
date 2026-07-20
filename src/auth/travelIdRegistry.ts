import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiProxyUrl, proxyFetch } from '../services/apiProxy';
import {
  buildBaseTravelId,
  normalizeTravelId,
  randomUniquenessCode,
  TravelIdParts,
} from './travelId';

const LOCAL_REGISTRY_KEY = 'travelid.travelId.registry.v1';

type Registry = Record<string, { userId: string; createdAt: string }>;

async function loadLocalRegistry(): Promise<Registry> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_REGISTRY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Registry;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveLocalRegistry(reg: Registry): Promise<void> {
  await AsyncStorage.setItem(LOCAL_REGISTRY_KEY, JSON.stringify(reg));
}

/**
 * Claim a Travel ID for this Google user.
 * Tries proxy registry when online; always updates local registry.
 * If base ID is taken by another user, appends a 2-char uniqueness code.
 */
export async function claimUniqueTravelId(
  userId: string,
  parts: TravelIdParts
): Promise<string> {
  const base = normalizeTravelId(buildBaseTravelId(parts));
  let candidate = base;

  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await tryClaim(userId, candidate);
    if (result === 'ok') return candidate;
    if (result === 'owned') return candidate;
    // collision — add / rotate uniqueness suffix
    candidate = `${base}${randomUniquenessCode()}`;
  }

  throw new Error('Could not allocate a unique Travel ID. Try again.');
}

async function tryClaim(
  userId: string,
  travelId: string
): Promise<'ok' | 'owned' | 'taken'> {
  const id = normalizeTravelId(travelId);

  // Prefer server registry when proxy is reachable
  const remote = await claimOnProxy(userId, id);
  if (remote === 'ok' || remote === 'owned' || remote === 'taken') {
    if (remote === 'ok' || remote === 'owned') {
      await markLocal(userId, id);
    }
    return remote;
  }

  // Offline / no proxy — local device registry
  const reg = await loadLocalRegistry();
  const existing = reg[id];
  if (!existing) {
    await markLocal(userId, id);
    return 'ok';
  }
  if (existing.userId === userId) return 'owned';
  return 'taken';
}

async function markLocal(userId: string, travelId: string): Promise<void> {
  const reg = await loadLocalRegistry();
  reg[travelId] = { userId, createdAt: new Date().toISOString() };
  await saveLocalRegistry(reg);
}

async function claimOnProxy(
  userId: string,
  travelId: string
): Promise<'ok' | 'owned' | 'taken' | 'unavailable'> {
  if (!getApiProxyUrl()) return 'unavailable';
  try {
    const res = await proxyFetch('/travel-id/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelId, userId }),
    });
    if (res.status === 404 || res.status === 405) return 'unavailable';
    const json = (await res.json()) as {
      ok?: boolean;
      status?: string;
      error?: { message?: string };
    };
    if (res.status === 409 || json.status === 'taken') return 'taken';
    if (json.status === 'owned' || (res.ok && json.status === 'owned')) {
      return 'owned';
    }
    if (res.ok && (json.ok || json.status === 'ok')) return 'ok';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}
