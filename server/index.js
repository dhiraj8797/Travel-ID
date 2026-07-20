/**
 * Travel ID API proxy — keeps RailRadar + Aviationstack keys off the device.
 *
 * Endpoints:
 *   GET /health
 *   GET /rail/*     → https://api.railradar.in/v1/*  (Bearer key + failover)
 *   GET /flights    → https://api.aviationstack.com/v1/flights (access_key injected)
 *
 * Configure secrets in server/.env (never commit that file).
 */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 8787);
const RAIL_BASE = 'https://api.railradar.in/v1';
const FLIGHT_BASE = 'https://api.aviationstack.com/v1/flights';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const APP_TOKEN = (process.env.APP_PROXY_TOKEN || '').trim();
const TRAVEL_ID_DB = join(__dirname, 'data', 'travel-ids.json');
const GOOGLE_CLIENT_ID = (
  process.env.GOOGLE_CLIENT_ID ||
  process.env.GOOGLE_WEB_CLIENT_ID ||
  ''
).trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

const railKeys = [
  process.env.RAILRADAR_API_KEY,
  process.env.RAILRADAR_API_KEY_BACKUP,
]
  .map((k) => (k || '').trim())
  .filter(Boolean);

const flightKey = (process.env.AVIATIONSTACK_API_KEY || '').trim();

let activeRailKey = 0;
const railCooldownUntil = [0, 0];

function loadEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function isQuotaMessage(message) {
  if (!message) return false;
  const m = String(message).toLowerCase();
  return (
    m.includes('rate limit') ||
    m.includes('api limit') ||
    m.includes('limit reached') ||
    m.includes('quota') ||
    m.includes('too many') ||
    m.includes('exhausted') ||
    m.includes('429')
  );
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Accept, Content-Type, X-Travel-Id-Token'
  );
}

function sendJson(res, status, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res) {
  sendJson(res, 401, {
    success: false,
    error: { message: 'Unauthorized proxy request' },
  });
}

function checkAppToken(req) {
  if (!APP_TOKEN) return true;
  return req.headers['x-travel-id-token'] === APP_TOKEN;
}

async function railUpstream(pathWithQuery, key) {
  const res = await fetch(`${RAIL_BASE}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }
  const errMsg =
    (typeof json.error === 'string'
      ? json.error
      : json.error?.message) || json.message;
  return { res, json, errMsg };
}

async function proxyRail(pathWithQuery) {
  if (!railKeys.length) {
    return {
      status: 503,
      body: {
        success: false,
        error: { message: 'RailRadar keys not configured on proxy' },
      },
    };
  }

  const now = Date.now();
  const order = [];
  for (let i = 0; i < railKeys.length; i++) {
    order.push((activeRailKey + i) % railKeys.length);
  }

  let last = null;
  for (const idx of order) {
    if ((railCooldownUntil[idx] || 0) > now) continue;
    const { res, json, errMsg } = await railUpstream(pathWithQuery, railKeys[idx]);

    if (res.status === 429 || isQuotaMessage(errMsg)) {
      const retry = Number(res.headers.get('retry-after')) || 90;
      railCooldownUntil[idx] = Date.now() + Math.max(30, retry) * 1000;
      last = {
        status: 429,
        body: {
          success: false,
          error: { message: errMsg || 'RailRadar rate limit' },
        },
      };
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      railCooldownUntil[idx] = Date.now() + 300_000;
      last = {
        status: res.status,
        body: {
          success: false,
          error: { message: errMsg || 'RailRadar API key rejected' },
        },
      };
      continue;
    }

    activeRailKey = idx;
    return { status: res.status, body: json };
  }

  return (
    last || {
      status: 429,
      body: {
        success: false,
        error: { message: 'RailRadar rate limit — all keys cooling down' },
      },
    }
  );
}

async function proxyFlights(searchParams) {
  if (!flightKey) {
    return {
      status: 503,
      body: {
        error: { message: 'Aviationstack key not configured on proxy' },
      },
    };
  }

  const qs = new URLSearchParams(searchParams);
  qs.set('access_key', flightKey);
  // Strip any client-supplied key
  const res = await fetch(`${FLIGHT_BASE}?${qs}`);
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: { message: text.slice(0, 200) } };
  }
  return { status: res.status, body: json };
}

function readTravelIdDb() {
  try {
    if (!existsSync(TRAVEL_ID_DB)) return {};
    const parsed = JSON.parse(readFileSync(TRAVEL_ID_DB, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTravelIdDb(db) {
  const dir = dirname(TRAVEL_ID_DB);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TRAVEL_ID_DB, JSON.stringify(db, null, 2), 'utf8');
}

function normalizeTravelId(id) {
  return String(id || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Claim Travel ID: ok | owned (same user) | taken (409). */
function claimTravelId(travelId, userId) {
  const id = normalizeTravelId(travelId);
  const uid = String(userId || '').trim();
  if (!id || id.length < 12 || !uid) {
    return {
      status: 400,
      body: { ok: false, error: { message: 'travelId and userId required' } },
    };
  }
  const db = readTravelIdDb();
  const existing = db[id];
  if (existing && existing.userId === uid) {
    return { status: 200, body: { ok: true, status: 'owned', travelId: id } };
  }
  if (existing) {
    return {
      status: 409,
      body: { ok: false, status: 'taken', error: { message: 'Travel ID taken' } },
    };
  }
  db[id] = { userId: uid, createdAt: new Date().toISOString() };
  writeTravelIdDb(db);
  return { status: 200, body: { ok: true, status: 'ok', travelId: id } };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        railKeys: railKeys.length,
        flightKey: Boolean(flightKey),
      });
      return;
    }

    if (!checkAppToken(req)) {
      unauthorized(res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/travel-id/claim') {
      const body = await readJsonBody(req);
      const { status, body: out } = claimTravelId(body.travelId, body.userId);
      sendJson(res, status, out);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/google/oauth/exchange') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        sendJson(res, 503, {
          ok: false,
          error: {
            message:
              'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set on proxy (.env)',
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const code = String(body.code || '').trim();
      if (!code) {
        sendJson(res, 400, { ok: false, error: { message: 'code required' } });
        return;
      }
      const params = new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: '',
      });
      // Android serverAuthCode often uses empty redirect for installed apps
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tokenJson = await tokenRes.json();
      sendJson(res, tokenRes.status, tokenJson);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/google/oauth/refresh') {
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        sendJson(res, 503, {
          ok: false,
          error: {
            message:
              'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set on proxy (.env)',
          },
        });
        return;
      }
      const body = await readJsonBody(req);
      const refreshToken = String(body.refreshToken || '').trim();
      if (!refreshToken) {
        sendJson(res, 400, {
          ok: false,
          error: { message: 'refreshToken required' },
        });
        return;
      }
      const params = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      });
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const tokenJson = await tokenRes.json();
      sendJson(res, tokenRes.status, tokenJson);
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { success: false, error: { message: 'Method not allowed' } });
      return;
    }

    if (url.pathname === '/flights' || url.pathname === '/v1/flights') {
      const { status, body } = await proxyFlights(url.searchParams);
      sendJson(res, status, body);
      return;
    }

    if (url.pathname.startsWith('/rail/') || url.pathname.startsWith('/v1/')) {
      const pathWithQuery =
        (url.pathname.startsWith('/rail/')
          ? url.pathname.slice('/rail'.length)
          : url.pathname) + url.search;
      const { status, body } = await proxyRail(pathWithQuery);
      sendJson(res, status, body);
      return;
    }

    sendJson(res, 404, { success: false, error: { message: 'Not found' } });
  } catch (e) {
    sendJson(res, 500, {
      success: false,
      error: { message: e instanceof Error ? e.message : 'Proxy error' },
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Travel ID API proxy on http://0.0.0.0:${PORT}`);
  console.log(`  Rail keys: ${railKeys.length} · Flight key: ${flightKey ? 'yes' : 'no'}`);
});
