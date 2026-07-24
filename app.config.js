const fs = require('fs');
const path = require('path');

/** Load KEY=VALUE from a gitignored env file (no dotenv dependency). */
function loadEnvFile(filePath) {
  const out = {};
  try {
    const text = fs.readFileSync(filePath, 'utf8');
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
      out[key] = val;
    }
  } catch {
    // missing file is fine
  }
  return out;
}

const rootEnv = loadEnvFile(path.join(__dirname, '.env'));
const serverEnv = loadEnvFile(path.join(__dirname, 'server', '.env'));

const geminiApiKey =
  process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
  rootEnv.EXPO_PUBLIC_GEMINI_API_KEY ||
  serverEnv.GEMINI_API_KEY ||
  '';
const geminiModel =
  process.env.EXPO_PUBLIC_GEMINI_MODEL ||
  rootEnv.EXPO_PUBLIC_GEMINI_MODEL ||
  serverEnv.GEMINI_MODEL ||
  'gemini-flash-latest';

/** Expo merges this with app.json — do not re-parse app.json here. */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    // From gitignored .env at build time — not hardcoded in repo source
    geminiApiKey,
    geminiModel,
  },
});
