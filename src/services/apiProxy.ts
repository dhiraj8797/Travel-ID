import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { builtinProxyToken, builtinProxyUrl } from './proxySecrets';

type Extra = {
  apiProxyUrl?: string;
  apiProxyToken?: string;
};

const OVERRIDE_KEY = 'travelid.apiProxyUrl';
/**
 * Built-in cloud proxy (keys stay on the server).
 */
const BUILTIN_PROXY_URL = builtinProxyUrl();
/** Dev-only LAN / USB fallbacks — not shown in Settings. */
const LAN_PROXY_URLS = __DEV__
  ? ['http://10.221.85.168:8787', 'http://10.124.37.154:8787']
  : [];
/** USB debug — `adb reverse tcp:8787 tcp:8787` (short timeout). */
const ADB_REVERSE_URL = __DEV__ ? 'http://127.0.0.1:8787' : '';

const PER_CANDIDATE_MS = 12_000;
/** After all candidates fail, pause retries to avoid alert spam. */
const NETWORK_DOWN_COOLDOWN_MS = 45_000;

let overrideUrl: string | null | undefined;
let stickyProxy: string | null = null;
let networkDownUntil = 0;

function extra(): Extra {
  return (Constants.expoConfig?.extra as Extra | undefined) || {};
}

function normalize(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function isPrivateLanHttp(url: string): boolean {
  return /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
}

/** Hosts that are known dead — never use again. */
function isDeadKnownHost(url: string): boolean {
  return (
    /10\.221\.85\.158/.test(url) ||
    /10\.221\.85\.189/.test(url) ||
    /192\.168\.0\.109/.test(url) ||
    /patrick-birmingham-eds-programming\.trycloudflare\.com/.test(url) ||
    /pen-logs-functionality-excellent\.trycloudflare\.com/.test(url) ||
    /essential-enjoy-upgrading-weekly\.trycloudflare\.com/.test(url)
  );
}

/** Load a saved proxy URL override (call once at app start). */
export async function loadApiProxyOverride(): Promise<void> {
  if (!__DEV__) {
    // Release builds always use the baked-in production proxy.
    overrideUrl = null;
    try {
      await AsyncStorage.removeItem(OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    const raw = await AsyncStorage.getItem(OVERRIDE_KEY);
    if (raw && raw.trim()) {
      const next = normalize(raw);
      if (isDeadKnownHost(next)) {
        await AsyncStorage.removeItem(OVERRIDE_KEY);
        overrideUrl = null;
      } else {
        overrideUrl = next;
      }
    } else {
      overrideUrl = null;
    }
  } catch {
    overrideUrl = null;
  }
}

export async function setApiProxyUrlOverride(url: string): Promise<void> {
  if (!__DEV__) {
    throw new Error('Proxy override is only available in development builds');
  }
  const next = normalize(url);
  overrideUrl = next || null;
  stickyProxy = null;
  networkDownUntil = 0;
  if (next) await AsyncStorage.setItem(OVERRIDE_KEY, next);
  else await AsyncStorage.removeItem(OVERRIDE_KEY);
}

export async function clearApiProxyUrlOverride(): Promise<void> {
  overrideUrl = null;
  stickyProxy = null;
  networkDownUntil = 0;
  await AsyncStorage.removeItem(OVERRIDE_KEY);
}

/**
 * Public base URL of the Travel ID API proxy (no trailing slash).
 */
export function getApiProxyUrl(): string {
  if (overrideUrl) return overrideUrl;
  const fromEnv = (process.env.EXPO_PUBLIC_API_PROXY_URL || '').trim();
  const fromExtra = (extra().apiProxyUrl || '').trim();
  return normalize(fromEnv || fromExtra || BUILTIN_PROXY_URL);
}

export function getApiProxyUrlDefault(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_PROXY_URL || '').trim();
  const fromExtra = (extra().apiProxyUrl || '').trim();
  return normalize(fromEnv || fromExtra || BUILTIN_PROXY_URL);
}

/**
 * Ordered proxy bases: override → HTTPS tunnel → LAN → USB reverse.
 */
export function getApiProxyCandidates(): string[] {
  const primary = getApiProxyUrl();
  const baked = getApiProxyUrlDefault();
  const list = [
    primary,
    baked,
    BUILTIN_PROXY_URL,
    ...LAN_PROXY_URLS,
    ADB_REVERSE_URL,
  ].filter(Boolean);

  return [
    ...new Set(
      list
        .map(normalize)
        .filter((u) => u && !isDeadKnownHost(u))
    ),
  ];
}

export function isApiProxyConfigured(): boolean {
  return Boolean(getApiProxyUrl());
}

export function getApiProxyToken(): string | undefined {
  const fromEnv = (process.env.EXPO_PUBLIC_API_PROXY_TOKEN || '').trim();
  const fromExtra = (extra().apiProxyToken || '').trim();
  const t = fromEnv || fromExtra || builtinProxyToken();
  return t || undefined;
}

export function proxyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getApiProxyToken();
  if (token) headers['X-Travel-Id-Token'] = token;
  return headers;
}

export function formatProxyNetworkError(err: unknown, proxyUrl: string): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  if (
    lower.includes('noroute') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('network request failed') ||
    lower.includes('failed to connect') ||
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return (
      `Cannot reach live data. Check your internet connection and try again.`
    );
  }
  return msg || 'Network error talking to the API proxy';
}

function isNetworkFailure(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('noroute') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused') ||
    msg.includes('network request failed') ||
    msg.includes('failed to connect') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed') ||
    msg.includes('aborted')
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  ms: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET/POST against the Travel ID proxy with short per-host timeouts and failover.
 */
export async function proxyFetch(
  pathWithQuery: string,
  init?: RequestInit,
  options?: { timeoutMs?: number }
): Promise<Response> {
  const path = pathWithQuery.startsWith('/')
    ? pathWithQuery
    : `/${pathWithQuery}`;

  if (Date.now() < networkDownUntil) {
    throw new Error(
      formatProxyNetworkError(
        new Error('Proxy cooling down after network failure'),
        stickyProxy || getApiProxyUrl()
      )
    );
  }

  const candidates = stickyProxy
    ? [stickyProxy, ...getApiProxyCandidates().filter((u) => u !== stickyProxy)]
    : getApiProxyCandidates();

  if (!candidates.length) {
    throw new Error(
      'API proxy not configured. Set Settings → Live data proxy to your PC IP.'
    );
  }

  let lastErr: unknown;
  for (const base of candidates) {
    const defaultTimeout =
      base.includes('127.0.0.1') || base.includes('localhost')
        ? 2000
        : PER_CANDIDATE_MS;
    const timeout = options?.timeoutMs ?? defaultTimeout;
    try {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[proxy]', 'try', `${base}${path}`);
      }
      const res = await fetchWithTimeout(
        `${base}${path}`,
        {
          ...init,
          headers: { ...proxyHeaders(), ...(init?.headers || {}) },
        },
        timeout
      );
      // Don't stick to a dead tunnel that returned HTML/502
      if (res.status >= 502 && res.status <= 504) {
        lastErr = new Error(`Proxy upstream ${res.status}`);
        if (stickyProxy === base) stickyProxy = null;
        continue;
      }
      stickyProxy = base;
      networkDownUntil = 0;
      return res;
    } catch (e) {
      lastErr = e;
      if (stickyProxy === base) stickyProxy = null;
      if (!isNetworkFailure(e)) throw e;
    }
  }

  networkDownUntil = Date.now() + NETWORK_DOWN_COOLDOWN_MS;
  throw new Error(
    formatProxyNetworkError(lastErr, candidates[0] || getApiProxyUrl())
  );
}

/** Probe /health and remember the working base. */
export async function warmApiProxy(): Promise<string | null> {
  try {
    await proxyFetch('/health');
    return stickyProxy;
  } catch {
    return null;
  }
}
