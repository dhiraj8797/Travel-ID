/**
 * Live proxy endpoint + app token.
 * RailRadar / Aviationstack keys live ONLY on the server — never in the APK.
 * Token is split to avoid a trivial plaintext string in Settings / app.json.
 * (Still extractable from a determined reverse engineer — rotate if leaked.)
 */

const URL_PARTS = [
  'https://travelid-api-proxy',
  '-production.up.railway.app',
];

const TOKEN_PARTS = ['4W2J0OQB', 'Gg0RyI32', '25GOrQgL', '65dkmxSX'];

export function builtinProxyUrl(): string {
  return URL_PARTS.join('');
}

export function builtinProxyToken(): string {
  return TOKEN_PARTS.join('');
}
