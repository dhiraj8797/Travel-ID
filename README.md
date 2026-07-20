# Wallet

Google Wallet–style app for **bus** and **rail** tickets.

## Features

- Upload a ticket **PDF** → on-device text extraction → wallet pass UI
- **Scan QR** → parse JSON / key-value / ticket text → wallet pass UI
- Paste ticket text or QR payload as a fallback
- India-first parsers (IRCTC-style rail, RedBus/IntrCity-style bus) with generic fallback
- Local storage on device (AsyncStorage)

## Run

```bash
npm install --legacy-peer-deps
npx expo start
```

Then open in Expo Go (Android/iOS) or press `w` for web.

## Try quickly

1. Open the app → **Load sample tickets**
2. Or **Add** → **Scan QR** → **Try sample**
3. Or paste a payload like:

```text
PNR:4521987630|TRAIN:12952|FROM:NDLS|TO:MMCT|DATE:22-Jul-2026|TIME:16:55|CLASS:3A|NAME:Aarav Sharma
```

## API proxy (secrets)

RailRadar and Aviationstack keys live in `server/.env` (gitignored) and are
never shipped in the APK. The app only calls `extra.apiProxyUrl`.

```bash
# terminal 1 — proxy
npm run proxy

# terminal 2 — app
npx expo start
```

For a physical phone on the same Wi‑Fi, set `extra.apiProxyUrl` in `app.json`
to `http://YOUR_PC_LAN_IP:8787`. For a shareable/production APK, deploy
`server/` to Render/Railway/Fly and point `apiProxyUrl` at that HTTPS URL.
