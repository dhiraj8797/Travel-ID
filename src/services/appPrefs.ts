import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_KEY = 'wallet.ui.prefs';

export type AppPrefs = {
  /** Flight / trip change reminders */
  notifyTrips: boolean;
  biometricsHint: boolean;
  /** Train station arrival alarms (sound + notification) */
  alarmNotifications: boolean;
};

const DEFAULTS: AppPrefs = {
  notifyTrips: true,
  biometricsHint: true,
  alarmNotifications: true,
};

export async function loadAppPrefs(): Promise<AppPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return {
      notifyTrips:
        typeof parsed.notifyTrips === 'boolean'
          ? parsed.notifyTrips
          : DEFAULTS.notifyTrips,
      biometricsHint:
        typeof parsed.biometricsHint === 'boolean'
          ? parsed.biometricsHint
          : DEFAULTS.biometricsHint,
      alarmNotifications:
        typeof parsed.alarmNotifications === 'boolean'
          ? parsed.alarmNotifications
          : DEFAULTS.alarmNotifications,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveAppPrefs(
  patch: Partial<AppPrefs>
): Promise<AppPrefs> {
  const current = await loadAppPrefs();
  const next: AppPrefs = { ...current, ...patch };
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export async function areAlarmNotificationsEnabled(): Promise<boolean> {
  const prefs = await loadAppPrefs();
  return prefs.alarmNotifications !== false;
}
