/**
 * Travel ID API proxy — keeps RailRadar + Aviationstack keys off the device.
 *
 * Endpoints:
 *   GET  /health
 *   GET  /rail/*     → https://api.railradar.in/v1/*  (Bearer key + failover)
 *   GET  /flights    → Aviationstack (legacy fallback)
 *   GET  /cirium/flight-status → Cirium FlightStats Flex (preferred)
 *   POST /ocr        → Baidu Unlimited-OCR (optional GPU server)
 *   POST /hotel-booking/extract → Gemini structured hotel JSON
 *   GET  /maps/geocode          → Google Geocoding (address → lat/lng)
 *   GET  /maps/reverse-geocode  → Google Geocoding (lat/lng → label)
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
const CIRIUM_IDENTIFIER = (
  process.env.CIRIUM_IDENTIFIER ||
  process.env.CIRIUM_APP_ID ||
  process.env.FLIGHTSTATS_APP_ID ||
  ''
).trim();
/** Cirium Sky static token (= secret). Also accepts legacy FlightStats appKey. */
const CIRIUM_SECRET = (
  process.env.CIRIUM_SECRET ||
  process.env.CIRIUM_APP_KEY ||
  process.env.FLIGHTSTATS_APP_KEY ||
  ''
).trim();
const CIRIUM_BASE_URL = (
  process.env.CIRIUM_BASE_URL ||
  process.env.FLIGHTSTATS_BASE_URL ||
  'https://api.sky.cirium.com'
)
  .trim()
  .replace(/\/+$/, '');
const APP_TOKEN = (process.env.APP_PROXY_TOKEN || '').trim();
const GOOGLE_MAPS_API_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
const TRAVEL_ID_DB = join(__dirname, 'data', 'travel-ids.json');

function isCiriumSkyHost(base) {
  return /sky\.cirium\.com/i.test(base) || /api\.cirium\.com/i.test(base);
}

/** Up to 6 RailRadar keys — rotate when one hits rate/quota limit. */
function loadRailKeys() {
  const fromList = String(process.env.RAILRADAR_API_KEYS || '')
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const numbered = [];
  for (let i = 1; i <= 6; i++) {
    const k = (
      process.env[`RAILRADAR_API_KEY_${i}`] ||
      (i === 1 ? process.env.RAILRADAR_API_KEY : '') ||
      (i === 2 ? process.env.RAILRADAR_API_KEY_BACKUP : '') ||
      ''
    ).trim();
    if (k) numbered.push(k);
  }

  const seen = new Set();
  const keys = [];
  for (const k of [...numbered, ...fromList]) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
    if (keys.length >= 6) break;
  }
  return keys;
}

/** Up to 6 Aviationstack keys — same rotate-on-limit loop. */
function loadFlightKeys() {
  const fromList = String(process.env.AVIATIONSTACK_API_KEYS || '')
    .split(/[,;\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  const numbered = [];
  for (let i = 1; i <= 6; i++) {
    const k = (
      process.env[`AVIATIONSTACK_API_KEY_${i}`] ||
      (i === 1 ? process.env.AVIATIONSTACK_API_KEY : '') ||
      ''
    ).trim();
    if (k) numbered.push(k);
  }

  const seen = new Set();
  const keys = [];
  for (const k of [...numbered, ...fromList]) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
    if (keys.length >= 6) break;
  }
  return keys;
}

const railKeys = loadRailKeys();
const flightKeys = loadFlightKeys();

let activeRailKey = 0;
let activeFlightKey = 0;
/** Per-key cooldown timestamps (ms). */
const railCooldownUntil = railKeys.map(() => 0);
const flightCooldownUntil = flightKeys.map(() => 0);

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
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/** Simple per-IP sliding window (in-memory; fine for a single Railway replica). */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(process.env.PROXY_RATE_LIMIT_PER_MIN || 90);
const rateBuckets = new Map();

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return xf || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (now - v.start >= RATE_WINDOW_MS) rateBuckets.delete(k);
    }
  }
  return bucket.count <= RATE_MAX;
}

const MAX_BODY_BYTES = Number(process.env.PROXY_MAX_BODY_BYTES || 12 * 1024 * 1024);

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
  // Production must always require a token — keys must never be open.
  const requireToken =
    Boolean(APP_TOKEN) || process.env.NODE_ENV === 'production';
  if (!requireToken) return true;
  if (!APP_TOKEN) return false;
  const header = String(req.headers['x-travel-id-token'] || '').trim();
  return header.length > 0 && header === APP_TOKEN;
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
  // Round-robin loop starting at the last good key
  const order = [];
  for (let i = 0; i < railKeys.length; i++) {
    order.push((activeRailKey + i) % railKeys.length);
  }

  let last = null;
  let tried = 0;
  for (const idx of order) {
    if ((railCooldownUntil[idx] || 0) > now) continue;
    tried += 1;
    const { res, json, errMsg } = await railUpstream(
      pathWithQuery,
      railKeys[idx]
    );

    if (res.status === 429 || isQuotaMessage(errMsg)) {
      const retry = Number(res.headers.get('retry-after')) || 90;
      railCooldownUntil[idx] = Date.now() + Math.max(30, retry) * 1000;
      activeRailKey = (idx + 1) % railKeys.length;
      last = {
        status: 429,
        body: {
          success: false,
          error: { message: errMsg || 'RailRadar rate limit' },
        },
      };
      console.warn(
        `[rail] key#${idx + 1}/${railKeys.length} rate-limited — switching to key#${activeRailKey + 1}`
      );
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      railCooldownUntil[idx] = Date.now() + 60_000;
      activeRailKey = (idx + 1) % railKeys.length;
      last = {
        status: res.status,
        body: {
          success: false,
          error: { message: errMsg || 'RailRadar API key rejected' },
        },
      };
      console.warn(
        `[rail] key#${idx + 1}/${railKeys.length} rejected (${res.status}) — switching to key#${activeRailKey + 1}`
      );
      continue;
    }

    if (!res.ok && isQuotaMessage(errMsg)) {
      railCooldownUntil[idx] = Date.now() + 60_000;
      activeRailKey = (idx + 1) % railKeys.length;
      last = {
        status: res.status,
        body: {
          success: false,
          error: { message: errMsg || 'RailRadar quota' },
        },
      };
      console.warn(
        `[rail] key#${idx + 1}/${railKeys.length} quota — switching to key#${activeRailKey + 1}`
      );
      continue;
    }

    activeRailKey = idx;
    if (tried > 1 || idx !== 0) {
      console.log(`[rail] serving with key#${idx + 1}/${railKeys.length}`);
    }
    return { status: res.status, body: json };
  }

  return (
    last || {
      status: 429,
      body: {
        success: false,
        error: {
          message: `RailRadar rate limit — all ${railKeys.length} keys cooling down`,
        },
      },
    }
  );
}

async function flightUpstream(qs, key) {
  const params = new URLSearchParams(qs);
  params.set('access_key', key);
  const res = await fetch(`${FLIGHT_BASE}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
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
      : json.error?.message || json.error?.info) || json.message;
  return { res, json, errMsg };
}

async function proxyFlights(searchParams) {
  if (!flightKeys.length) {
    return {
      status: 503,
      body: {
        error: { message: 'Aviationstack key not configured on proxy' },
      },
    };
  }

  const now = Date.now();
  const order = [];
  for (let i = 0; i < flightKeys.length; i++) {
    order.push((activeFlightKey + i) % flightKeys.length);
  }

  let last = null;
  for (const idx of order) {
    if ((flightCooldownUntil[idx] || 0) > now) continue;
    const { res, json, errMsg } = await flightUpstream(
      searchParams,
      flightKeys[idx]
    );

    if (res.status === 429 || isQuotaMessage(errMsg)) {
      const retry = Number(res.headers.get('retry-after')) || 90;
      flightCooldownUntil[idx] = Date.now() + Math.max(30, retry) * 1000;
      activeFlightKey = (idx + 1) % flightKeys.length;
      last = {
        status: 429,
        body: {
          error: { message: errMsg || 'Flight API rate limit' },
        },
      };
      console.warn(
        `[flight] key#${idx + 1}/${flightKeys.length} rate-limited — switching to key#${activeFlightKey + 1}`
      );
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      flightCooldownUntil[idx] = Date.now() + 60_000;
      activeFlightKey = (idx + 1) % flightKeys.length;
      last = {
        status: res.status,
        body: {
          error: { message: errMsg || 'Flight API key rejected' },
        },
      };
      console.warn(
        `[flight] key#${idx + 1}/${flightKeys.length} rejected — switching`
      );
      continue;
    }

    activeFlightKey = idx;
    return { status: res.status, body: json };
  }

  return (
    last || {
      status: 429,
      body: {
        error: {
          message: `Flight API rate limit — all ${flightKeys.length} keys cooling down`,
        },
      },
    }
  );
}

/**
 * Cirium flight status by carrier + flight + departure date.
 * Supports Cirium Sky (`api.sky.cirium.com`) and legacy FlightStats Flex.
 * Query: carrier, flight, year, month, day [, airport=dep IATA]
 */
async function proxyCiriumFlightStatus(searchParams) {
  if (!CIRIUM_SECRET) {
    return {
      status: 503,
      body: {
        error: {
          message:
            'Cirium not configured — set CIRIUM_SECRET (and CIRIUM_BASE_URL) on the proxy',
        },
      },
    };
  }

  const carrier = String(searchParams.get('carrier') || '')
    .trim()
    .toUpperCase();
  const flight = String(searchParams.get('flight') || '')
    .trim()
    .replace(/\D/g, '');
  const year = String(searchParams.get('year') || '').trim();
  const month = String(searchParams.get('month') || '').padStart(2, '0');
  const day = String(searchParams.get('day') || '').padStart(2, '0');

  if (!carrier || !flight || !year || !month || !day) {
    return {
      status: 400,
      body: {
        error: {
          message:
            'Need carrier, flight, year, month, day (departure date) for Cirium lookup',
        },
      },
    };
  }

  const depDate = `${year}-${month}-${day}`;
  const airport = String(searchParams.get('airport') || '').trim().toUpperCase();
  const sky = isCiriumSkyHost(CIRIUM_BASE_URL);

  let url;
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json' };

  if (sky) {
    // Cirium Sky: Authorization = static API secret/token
    // GET /v1/flights/status/airline/{airline}/flight-number/{n}/departure-date/{YYYY-MM-DD}
    const qs = new URLSearchParams();
    if (airport) qs.set('airport', airport);
    const q = qs.toString();
    url = `${CIRIUM_BASE_URL}/v1/flights/status/airline/${encodeURIComponent(
      carrier
    )}/flight-number/${encodeURIComponent(flight)}/departure-date/${encodeURIComponent(
      depDate
    )}${q ? `?${q}` : ''}`;
    headers.Authorization = CIRIUM_SECRET;
  } else {
    // Legacy FlightStats Flex (appId + appKey)
    const qs = new URLSearchParams({
      appId: CIRIUM_IDENTIFIER || 'unused',
      appKey: CIRIUM_SECRET,
      utc: searchParams.get('utc') || 'false',
      extendedOptions: 'includeNewFields',
    });
    if (airport) qs.set('airport', airport);
    url = `${CIRIUM_BASE_URL}/flex/flightstatus/rest/v2/json/flight/status/${encodeURIComponent(
      carrier
    )}/${encodeURIComponent(flight)}/dep/${encodeURIComponent(year)}/${encodeURIComponent(
      month
    )}/${encodeURIComponent(day)}?${qs.toString()}`;
    if (CIRIUM_IDENTIFIER) headers.appId = CIRIUM_IDENTIFIER;
    headers.appKey = CIRIUM_SECRET;
  }

  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: { message: text.slice(0, 200) || 'Invalid Cirium response' } };
    }

    if (!res.ok) {
      const errMsg =
        json?.error?.errorMessage ||
        json?.error?.message ||
        json?.message ||
        `Cirium error (${res.status})`;
      return {
        status: res.status,
        body: {
          error: { message: errMsg },
          provider: sky ? 'cirium-sky' : 'flightstats',
        },
      };
    }

    return {
      status: 200,
      body: { ...json, provider: sky ? 'cirium-sky' : 'flightstats' },
    };
  } catch (e) {
    return {
      status: 502,
      body: {
        error: {
          message: e instanceof Error ? e.message : 'Cirium upstream failed',
        },
        provider: sky ? 'cirium-sky' : 'flightstats',
      },
    };
  }
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
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
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

/**
 * Baidu Unlimited-OCR via OpenAI-compatible chat completions.
 * Set UNLIMITED_OCR_URL=http://host:10000 (SGLang / vLLM).
 * @see https://github.com/baidu/Unlimited-OCR
 */
const UNLIMITED_OCR_URL = (process.env.UNLIMITED_OCR_URL || '').trim().replace(/\/$/, '');
const UNLIMITED_OCR_MODEL =
  (process.env.UNLIMITED_OCR_MODEL || 'Unlimited-OCR').trim();
const UNLIMITED_OCR_API_KEY = (process.env.UNLIMITED_OCR_API_KEY || '').trim();

function normalizeOcrImages(body) {
  const list = [];
  if (Array.isArray(body?.images)) {
    for (const img of body.images) {
      if (!img) continue;
      if (typeof img === 'string') {
        list.push({ base64: img, mimeType: 'image/jpeg' });
      } else if (img.base64) {
        list.push({
          base64: String(img.base64).replace(/^data:[^;]+;base64,/, ''),
          mimeType: img.mimeType || 'image/jpeg',
        });
      }
    }
  }
  if (body?.imageBase64) {
    list.push({
      base64: String(body.imageBase64).replace(/^data:[^;]+;base64,/, ''),
      mimeType: body.mimeType || 'image/jpeg',
    });
  }
  return list.slice(0, 4);
}

async function proxyUnlimitedOcr(body) {
  if (!UNLIMITED_OCR_URL) {
    return {
      status: 503,
      body: {
        success: false,
        error: {
          message:
            'Unlimited-OCR not configured. Set UNLIMITED_OCR_URL on the proxy (see server/README.md).',
        },
      },
    };
  }

  const images = normalizeOcrImages(body);
  if (!images.length) {
    return {
      status: 400,
      body: { success: false, error: { message: 'imageBase64 / images required' } },
    };
  }

  const prompt =
    String(body.prompt || '').trim() ||
    (images.length > 1
      ? 'Multi page parsing.'
      : 'document parsing.');

  const content = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    })),
  ];

  const payload = {
    model: UNLIMITED_OCR_MODEL,
    messages: [{ role: 'user', content }],
    temperature: 0,
    stream: false,
    // Hint for Unlimited-OCR SGLang / vLLM recipes
    images_config: {
      image_mode: images.length > 1 ? 'base' : 'gundam',
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (UNLIMITED_OCR_API_KEY) {
    headers.Authorization = `Bearer ${UNLIMITED_OCR_API_KEY}`;
  }

  try {
    const upstream = await fetch(`${UNLIMITED_OCR_URL}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    const textBody = await upstream.text();
    let json = {};
    try {
      json = JSON.parse(textBody);
    } catch {
      json = {};
    }

    if (!upstream.ok) {
      return {
        status: upstream.status >= 400 ? upstream.status : 502,
        body: {
          success: false,
          error: {
            message:
              json.error?.message ||
              json.message ||
              `Unlimited-OCR upstream ${upstream.status}`,
          },
        },
      };
    }

    const text =
      json.choices?.[0]?.message?.content ||
      json.choices?.[0]?.text ||
      json.text ||
      '';
    const cleaned = String(text).trim();
    if (!cleaned) {
      return {
        status: 502,
        body: {
          success: false,
          error: { message: 'Unlimited-OCR returned empty text' },
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        engine: 'unlimited-ocr',
        text: cleaned,
      },
    };
  } catch (e) {
    return {
      status: 502,
      body: {
        success: false,
        error: {
          message:
            e instanceof Error
              ? e.message
              : 'Failed to reach Unlimited-OCR server',
        },
      },
    };
  }
}

const HOTEL_PASS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_hotel_booking: {
      type: 'BOOLEAN',
      description:
        'True only if this document is a hotel booking / stay voucher',
    },
    hotel_name: { type: 'STRING', nullable: true },
    booking_status: { type: 'STRING', nullable: true },
    booking_id: { type: 'STRING', nullable: true },
    guest_name: { type: 'STRING', nullable: true },
    number_of_guests: { type: 'STRING', nullable: true },
    check_in_date: { type: 'STRING', nullable: true },
    check_in_time: { type: 'STRING', nullable: true },
    check_out_date: { type: 'STRING', nullable: true },
    check_out_time: { type: 'STRING', nullable: true },
    room_type: { type: 'STRING', nullable: true },
    room_number: {
      type: 'STRING',
      nullable: true,
      description:
        'Actual room number if assigned; otherwise null (do not invent)',
    },
    hotel_address: { type: 'STRING', nullable: true },
    contact_phone: { type: 'STRING', nullable: true },
    contact_email: { type: 'STRING', nullable: true },
    booking_platform: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    amenities: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'Included amenities / perks from the PDF (e.g. Free Wi-Fi, Breakfast Included)',
    },
  },
  required: ['is_hotel_booking'],
};

const PDF_EXTRACT_PROMPT = `Extract hotel boarding-pass fields from this PDF.

Return JSON matching the schema.
- Set is_hotel_booking=false if this is a train/bus/flight ticket or unrelated document.
- Do not invent missing values — use null.
- room_number must be null unless an assigned room number appears in the document.
- Prefer dates like "21 May 2026" and times like "02:00 PM".
- amenities: only inclusions explicitly mentioned (Wi-Fi, breakfast, transfer, etc.).`;

function extractJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        /* fall through */
      }
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function extractHotelBookingWithGemini(body) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const model = (process.env.GEMINI_MODEL || 'gemini-flash-latest').trim();
  const text = String(body?.text || '').trim();
  const pdfBase64 = String(body?.pdfBase64 || body?.pdf_base64 || '').trim();
  const mimeType = String(body?.mimeType || 'application/pdf').trim();
  const fileName = String(body?.fileName || '').trim();

  if (!apiKey) {
    return {
      status: 503,
      body: {
        success: false,
        error: { message: 'GEMINI_API_KEY not configured on proxy' },
      },
    };
  }

  const parts = [];
  if (pdfBase64) {
    if (pdfBase64.length > 20_000_000) {
      return {
        status: 413,
        body: {
          success: false,
          error: { message: 'PDF too large for Gemini extract (max ~15MB)' },
        },
      };
    }
    parts.push({
      inlineData: {
        mimeType: mimeType || 'application/pdf',
        data: pdfBase64,
      },
    });
    parts.push({
      text: `${PDF_EXTRACT_PROMPT}${fileName ? `\nFile name: ${fileName}` : ''}`,
    });
  } else if (text.length >= 20) {
    parts.push({
      text: `${PDF_EXTRACT_PROMPT}\n\nDocument text:\n${text.slice(0, 12000)}`,
    });
  } else {
    return {
      status: 400,
      body: {
        success: false,
        error: { message: 'Provide pdfBase64 or booking text' },
      },
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: HOTEL_PASS_RESPONSE_SCHEMA,
        },
      }),
    });

    const json = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return {
        status: upstream.status >= 400 ? upstream.status : 502,
        body: {
          success: false,
          error: {
            message:
              json?.error?.message ||
              `Gemini upstream ${upstream.status}`,
          },
        },
      };
    }

    const rawText =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      '';
    const booking = extractJsonObject(rawText);
    if (!booking || typeof booking !== 'object') {
      return {
        status: 502,
        body: {
          success: false,
          error: { message: 'Gemini returned non-JSON hotel fields' },
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        engine: 'gemini-pdf',
        model,
        booking,
        requiresReview: true,
      },
    };
  } catch (e) {
    return {
      status: 502,
      body: {
        success: false,
        error: {
          message:
            e instanceof Error ? e.message : 'Failed to reach Gemini',
        },
      },
    };
  }
}

/** Google Geocoding API — key stays on proxy only. */
async function proxyGoogleGeocode(address) {
  if (!GOOGLE_MAPS_API_KEY) {
    return {
      status: 503,
      body: {
        success: false,
        error: { message: 'GOOGLE_MAPS_API_KEY not configured on proxy' },
      },
    };
  }
  const q = String(address || '').trim();
  if (!q || q.length > 500) {
    return {
      status: 400,
      body: { success: false, error: { message: 'address required (max 500 chars)' } },
    };
  }
  try {
    const params = new URLSearchParams({ address: q, key: GOOGLE_MAPS_API_KEY });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
      return {
        status: res.status >= 400 ? res.status : 502,
        body: {
          success: false,
          error: {
            message: json.error_message || json.status || 'Geocoding failed',
          },
        },
      };
    }
    const first = json.results?.[0];
    const loc = first?.geometry?.location;
    if (!first || typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
      return {
        status: 404,
        body: { success: false, error: { message: 'No results for address' } },
      };
    }
    return {
      status: 200,
      body: {
        success: true,
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: first.formatted_address || null,
      },
    };
  } catch (e) {
    return {
      status: 502,
      body: {
        success: false,
        error: {
          message: e instanceof Error ? e.message : 'Geocoding upstream failed',
        },
      },
    };
  }
}

async function proxyGoogleReverseGeocode(lat, lng) {
  if (!GOOGLE_MAPS_API_KEY) {
    return {
      status: 503,
      body: {
        success: false,
        error: { message: 'GOOGLE_MAPS_API_KEY not configured on proxy' },
      },
    };
  }
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    return {
      status: 400,
      body: { success: false, error: { message: 'lat and lng required' } },
    };
  }
  try {
    const params = new URLSearchParams({
      latlng: `${latN},${lngN}`,
      key: GOOGLE_MAPS_API_KEY,
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === 'REQUEST_DENIED' || json.status === 'INVALID_REQUEST') {
      return {
        status: res.status >= 400 ? res.status : 502,
        body: {
          success: false,
          error: {
            message: json.error_message || json.status || 'Reverse geocoding failed',
          },
        },
      };
    }
    const first = json.results?.[0];
    if (!first) {
      return {
        status: 404,
        body: { success: false, error: { message: 'No results for coordinates' } },
      };
    }
    const comps = first.address_components || [];
    const pick = (type) =>
      comps.find((c) => c.types?.includes(type))?.long_name || null;
    const neighborhood =
      pick('neighborhood') ||
      pick('sublocality_level_1') ||
      pick('sublocality') ||
      pick('premise');
    const city =
      pick('locality') ||
      pick('administrative_area_level_2') ||
      pick('administrative_area_level_1');
    const label =
      neighborhood && city && neighborhood !== city
        ? `${neighborhood}, ${city}`
        : neighborhood || city || first.formatted_address || null;
    return {
      status: 200,
      body: {
        success: true,
        label,
        area: neighborhood,
        city,
        formattedAddress: first.formatted_address || null,
      },
    };
  } catch (e) {
    return {
      status: 502,
      body: {
        success: false,
        error: {
          message:
            e instanceof Error ? e.message : 'Reverse geocoding upstream failed',
        },
      },
    };
  }
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
      // Public liveness only — never expose key counts without token.
      if (!checkAppToken(req)) {
        sendJson(res, 200, { ok: true });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        railKeys: railKeys.length,
        flightKeys: flightKeys.length,
        cirium: Boolean(CIRIUM_SECRET),
        ciriumHost: CIRIUM_BASE_URL || null,
        activeRailKey: railKeys.length ? activeRailKey + 1 : 0,
        activeFlightKey: flightKeys.length ? activeFlightKey + 1 : 0,
        unlimitedOcr: Boolean(UNLIMITED_OCR_URL),
        gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
        googleMaps: Boolean(GOOGLE_MAPS_API_KEY),
      });
      return;
    }

    if (!checkRateLimit(req)) {
      sendJson(res, 429, {
        success: false,
        error: { message: 'Too many requests — try again in a minute' },
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

    if (req.method === 'POST' && url.pathname === '/ocr') {
      const body = await readJsonBody(req);
      const { status, body: out } = await proxyUnlimitedOcr(body);
      sendJson(res, status, out);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/hotel-booking/extract') {
      const body = await readJsonBody(req);
      const { status, body: out } = await extractHotelBookingWithGemini(body);
      sendJson(res, status, out);
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

    if (url.pathname === '/maps/geocode' || url.pathname === '/v1/maps/geocode') {
      const address = url.searchParams.get('address') || '';
      const { status, body } = await proxyGoogleGeocode(address);
      sendJson(res, status, body);
      return;
    }

    if (
      url.pathname === '/maps/reverse-geocode' ||
      url.pathname === '/v1/maps/reverse-geocode'
    ) {
      const { status, body } = await proxyGoogleReverseGeocode(
        url.searchParams.get('lat'),
        url.searchParams.get('lng')
      );
      sendJson(res, status, body);
      return;
    }

    if (
      url.pathname === '/cirium/flight-status' ||
      url.pathname === '/v1/cirium/flight-status'
    ) {
      const { status, body } = await proxyCiriumFlightStatus(url.searchParams);
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
    const status = e && typeof e === 'object' && e.statusCode === 413 ? 413 : 500;
    sendJson(res, status, {
      success: false,
      error: {
        message:
          e instanceof Error
            ? e.message
            : status === 413
              ? 'Request body too large'
              : 'Proxy error',
      },
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Travel ID API proxy on http://0.0.0.0:${PORT}`);
  console.log(
    `  Rail keys: ${railKeys.length}/6 · Flight keys: ${flightKeys.length}/6 · Cirium: ${
      CIRIUM_SECRET ? `yes (${CIRIUM_BASE_URL})` : 'no'
    } · Google Maps: ${GOOGLE_MAPS_API_KEY ? 'yes' : 'no'}`
  );
  if (process.env.NODE_ENV === 'production' && !APP_TOKEN) {
    console.warn('  WARNING: APP_PROXY_TOKEN missing — proxy will reject requests');
  }
});
