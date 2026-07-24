import * as FileSystem from 'expo-file-system/legacy';

const LOG_TAG = 'TravelID/PDF';
const LOG_FILE = () => `${FileSystem.documentDirectory}last-pdf-upload.log`;

/** Dev-only diagnostics — never write booking text / PNR to disk in release. */
export function pdfLog(step: string, detail?: unknown) {
  if (!__DEV__) return;
  const msg =
    detail === undefined
      ? `[${LOG_TAG}] ${step}`
      : `[${LOG_TAG}] ${step}: ${
          typeof detail === 'string' ? detail : safeJson(detail)
        }`;
  console.warn(msg);
  void appendLogFile(msg);
}

export function pdfLogError(step: string, error: unknown) {
  if (!__DEV__) return;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  pdfLog(`ERROR @ ${step}`, message);
  if (stack) pdfLog('stack', stack.slice(0, 1200));
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 800);
  } catch {
    return String(value);
  }
}

async function appendLogFile(line: string) {
  if (!__DEV__) return;
  try {
    const path = LOG_FILE();
    const stamp = new Date().toISOString();
    const prev = (await FileSystem.getInfoAsync(path)).exists
      ? await FileSystem.readAsStringAsync(path)
      : '';
    const next = `${prev}${stamp} ${line}\n`.slice(-12000);
    await FileSystem.writeAsStringAsync(path, next);
  } catch {
    // ignore disk errors
  }
}

export async function readLastPdfLog(): Promise<string> {
  if (!__DEV__) return '';
  try {
    const path = LOG_FILE();
    if (!(await FileSystem.getInfoAsync(path)).exists) return '';
    return FileSystem.readAsStringAsync(path);
  } catch {
    return '';
  }
}
