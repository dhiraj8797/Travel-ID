# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Cursor Cloud specific instructions

This repo is an Expo SDK 57 React Native app ("Travel ID", a wallet for bus/rail/flight tickets) plus an optional pure-Node API proxy in `server/`. Dependencies are installed by the startup update script (`npm install --legacy-peer-deps`, which also runs `patch-package` via `postinstall`).

### Running services (headless VM)
- App (web): `npx expo start --web --port 8081` (Metro bundler). Run/scripts are in `package.json`. Standard commands (`start`, `web`, `proxy`) live there.
- API proxy: `npm run proxy` → listens on `http://0.0.0.0:8787`. It runs fine with no secrets (endpoints degrade gracefully / return 503). Live rail/flight/OCR/Gemini data needs keys in `server/.env` (see `server/.env.example`); those are never required just to boot.

### Non-obvious caveats
- Web needs `react-dom` + `react-native-web` (now in `package.json`). Without them `expo start --web` errors out asking you to install them.
- Google Sign-In cannot complete/persist on web: `expo-secure-store` is a no-op stub on web, so `saveSession` throws and any injected session is wiped by the legacy-migration path in `src/auth/sessionStorage.ts`. Therefore the authenticated wallet flows (Load sample tickets, Scan QR, saving passes) are only fully testable on a native Android/iOS build or device — not on web. The web build still boots and renders the home/settings UI.
- To exercise the core ticket-parsing pipeline headlessly, run `npx tsx scripts/smoke-rail.ts` (parses raw IRCTC text → structured pass fields). Note `scripts/smoke-bus.ts` transitively imports `react-native` (via `qrPipeline`) and will NOT run under `tsx`/esbuild.
- There is no ESLint config or `lint`/`test` script. Typecheck is `npx tsc --noEmit`, but it currently reports a few pre-existing errors (unrelated to environment setup).
