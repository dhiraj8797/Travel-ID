import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

type Extra = {
  apiProxyUrl?: string;
  apiProxyToken?: string;
};

const OVERRIDE_KEY = 'travelid.apiProxyUrl';
/**
 * Built-in default proxy URL.
 * Prefer a public HTTPS tunnel (localtunnel / cloudflared) so the APK works
 * over mobile data — private LAN IPs are not routable from cellular.
 * Keep `npm run proxy` + the tunnel process running on the PC.
 */
const BUILTIN_PROXY_URL =
  'https://essential-enjoy-upgrading-weekly.trycloudflare.com';
/** USB/LAN fallback when phone shares the PC subnet (e.g. USB tethering). */
const LAN_PROXY_URL = 'http://10.221.85.43:8787';
/** USB debug only — often broken on modern Android; try last with short timeout. */
const ADB_REVERSE_URL = 'http://127.0.0.1:8787';

const PER_CANDIDATE_MS = 20_000;

let overrideUrl: string | null | undefined;

function extra(): Extra {
  return (Constants.expoConfig?.extra as Extra | undefined) || {};
}

function normalize(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function isPrivateLanHttp(url: string): boolean {
  return /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
}

function isDeadKnownHost(url: string): boolean {
  return (
    /10\.124\.37\.154/.test(url) ||
    /10\.221\.85\.189/.test(url) ||
    /127\.0\.0\.1:8787/.test(url) ||
    /localhost:8787/.test(url) ||
    // Saved LAN overrides fail on mobile data — clear them so HTTPS tunnel is used.
    isPrivateLanHttp(url)
  );
}

/** Load a saved LAN proxy URL override (call once at app start). */
export async function loadApiProxyOverride(): Promise<void> {
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
  const next = normalize(url);
  overrideUrl = next || null;
  if (next) await AsyncStorage.setItem(OVERRIDE_KEY, next);
  else await AsyncStorage.removeItem(OVERRIDE_KEY);
}

export async function clearApiProxyUrlOverride(): Promise<void> {
  overrideUrl = null;
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
 * Ordered proxy bases: saved override → app config / builtin LAN → USB reverse last.
 */
export function getApiProxyCandidates(): string[] {
  const primary = getApiProxyUrl();
  const baked = getApiProxyUrlDefault();
  const list = [primary, baked, BUILTIN_PROXY_URL].filter(Boolean);
  return [
    ...new Set(
      list
        .map(normalize)
        .filter(
          (u) =>
            u &&
            !/127\.0\.0\.1|localhost/.test(u) &&
            !isPrivateLanHttp(u)
        )
    ),
  ];
}

export function isApiProxyConfigured(): boolean {
  return Boolean(getApiProxyUrl());
}

export function getApiProxyToken(): string | undefined {
  const fromEnv = (process.env.EXPO_PUBLIC_API_PROXY_TOKEN || '').trim();
  const fromExtra = (extra().apiProxyToken || '').trim();
  const t = fromEnv || fromExtra;
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
      `Cannot reach live proxy (${proxyUrl || 'none'}). ` +
      `Phone + PC on same Wi‑Fi, run npm run proxy on PC, ` +
      `then set the PC IP in Settings → Live data proxy.`
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

let stickyProxy: string | null = null;

/**
 * GET against the Travel ID proxy with short per-host timeouts and failover.
 */
export async function proxyFetch(
  pathWithQuery: string,
  init?: RequestInit
): Promise<Response> {
  const path = pathWithQuery.startsWith('/')
    ? pathWithQuery
    : `/${pathWithQuery}`;
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
    const timeout =
      base.includes('127.0.0.1') || base.includes('localhost')
        ? 1500
        : PER_CANDIDATE_MS;
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
      stickyProxy = base;
      return res;
    } catch (e) {
      lastErr = e;
      if (stickyProxy === base) stickyProxy = null;
      if (!isNetworkFailure(e)) throw e;
    }
  }

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
