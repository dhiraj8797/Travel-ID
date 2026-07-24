# Travel ID API proxy

Secrets live in `server/.env` (gitignored). The mobile app only knows the
public proxy URL — never the RailRadar / Cirium / Aviationstack keys.

## Always-on (Railway)

Production URL (baked into the APK):

`https://travelid-api-proxy-production.up.railway.app`

Redeploy from this folder (after `railway login`):

```bash
cd server
railway up -y -d
```

### Cirium Sky (preferred for live flights)

In `server/.env` (or Railway variables):

```bash
CIRIUM_IDENTIFIER=paste_your_identifier
CIRIUM_SECRET=paste_your_static_authorization_token
CIRIUM_BASE_URL=https://api.sky.cirium.com
```

| Cirium dashboard | `.env` key |
| --- | --- |
| Identifier | `CIRIUM_IDENTIFIER` (optional for Sky) |
| Secret / static Authorization token | `CIRIUM_SECRET` |
| Base URL | `CIRIUM_BASE_URL` |

For legacy FlightStats Flex, set `CIRIUM_BASE_URL=https://api.flightstats.com` and use appId/appKey-style secrets.

Railway:

```bash
railway variable set -s travelid-api-proxy \
  CIRIUM_IDENTIFIER=... \
  CIRIUM_SECRET=... \
  CIRIUM_BASE_URL=https://api.sky.cirium.com
```

Proxy endpoint used by the app:

`GET /cirium/flight-status?carrier=6E&flight=214&year=2026&month=07&day=24`

### Multi-key failover (up to 6)

Set keys on Railway (or in `.env`):

```bash
railway variable set -s travelid-api-proxy \
  RAILRADAR_API_KEY=rg_... \
  RAILRADAR_API_KEY_2=rg_... \
  RAILRADAR_API_KEY_3=rg_... \
  RAILRADAR_API_KEY_4=rg_... \
  RAILRADAR_API_KEY_5=rg_... \
  RAILRADAR_API_KEY_6=rg_...
```

When key #N hits rate limit / quota / 401, the proxy cools it down and
**loops to the next key** automatically. After a success it sticks on that key
until it also limits.

Optional Aviationstack fallback: `AVIATIONSTACK_API_KEY` … `_6`.

## Gemini hotel extraction (PDF → JSON → UI)

Gemini does **not** render the boarding pass graphic. It only returns
structured JSON; the React Native `HotelBoardingPass` binds those fields
and draws the QR locally.

```
Upload PDF → Gemini multimodal + responseSchema → JSON → Review → Hotel Pass UI
```

### Keep the API key secure

| Where | Variable | Committed? |
|-------|----------|------------|
| `server/.env` | `GEMINI_API_KEY` | **No** (gitignored) |
| Railway | `GEMINI_API_KEY` | **No** (dashboard secrets) |
| Root `.env` | `EXPO_PUBLIC_GEMINI_API_KEY` | **No** (gitignored; build-time only) |

Never put the real key in source files, chat logs you publish, or `*.example` files.

`POST /hotel-booking/extract` body:

```json
{ "pdfBase64": "<base64>", "mimeType": "application/pdf", "fileName": "booking.pdf" }
```

or text-only fallback `{ "text": "..." }`.

Set on Railway:

```bash
railway variable set -s travelid-api-proxy \
  GEMINI_API_KEY=your_key \
  GEMINI_MODEL=gemini-flash-latest
```

Then:

```bash
cd server
railway up -y -d
```

```bash
cd server && npm start
```

## Baidu Unlimited-OCR (optional, better PDF/photo parsing)

Unlimited-OCR is a **GPU vision model** (~3B, needs NVIDIA GPU). It cannot run
inside the phone APK. The app prefers it when your proxy has it configured, and
falls back to on-device ML Kit otherwise.

1. Run Unlimited-OCR (SGLang example from upstream):

```bash
# See https://github.com/baidu/Unlimited-OCR
python -m sglang.launch_server \
  --model baidu/Unlimited-OCR \
  --served-model-name Unlimited-OCR \
  --host 0.0.0.0 --port 10000
```

Or Docker: `docker pull vllm/vllm-openai:unlimited-ocr`

2. Point the Travel ID proxy at it:

```bash
UNLIMITED_OCR_URL=http://127.0.0.1:10000
# UNLIMITED_OCR_MODEL=Unlimited-OCR
```

3. App upload flow: photo/PDF → `POST /ocr` on the proxy → Unlimited-OCR →
   hotel/train/bus/flight parsers. If OCR server is down, ML Kit is used.
