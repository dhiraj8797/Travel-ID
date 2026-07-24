import Constants from 'expo-constants';

type Extra = {
  geminiApiKey?: string;
  geminiModel?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra as Extra | undefined) || {};
}

/**
 * Gemini credentials — NEVER hardcode keys in source.
 *
 * Loaded from gitignored `.env` / `server/.env` via app.config.js at build time,
 * or from Railway `GEMINI_API_KEY` on the proxy at runtime.
 */
export function builtinGeminiApiKey(): string {
  return (
    (process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim() ||
    (extra().geminiApiKey || '').trim()
  );
}

export function builtinGeminiModel(): string {
  return (
    (process.env.EXPO_PUBLIC_GEMINI_MODEL || '').trim() ||
    (extra().geminiModel || '').trim() ||
    'gemini-flash-latest'
  );
}

export function hasClientGeminiKey(): boolean {
  return builtinGeminiApiKey().length > 8;
}
