import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { areAlarmNotificationsEnabled } from './appPrefs';

const ALARM_KEY = 'travelid.arrivalAlarms.v1';
const CHANNEL_ID = 'arrival-alerts';

/** Avoid calling at import time if notifications native isn't ready yet. */
let handlerReady = false;
function ensureNotificationHandler() {
  if (handlerReady) return;
  handlerReady = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

type AlarmRecord = {
  ticketId: string;
  notificationId?: string;
  firedAt?: string;
  etaIso?: string;
  /** User stopped this firing — do not auto-restart until re-armed. */
  silenced?: boolean;
};

let soundingTicketId: string | null = null;
let vibrateTimer: ReturnType<typeof setInterval> | null = null;

async function loadAlarms(): Promise<Record<string, AlarmRecord>> {
  try {
    const raw = await AsyncStorage.getItem(ALARM_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AlarmRecord>) : {};
  } catch {
    return {};
  }
}

async function saveAlarms(map: Record<string, AlarmRecord>) {
  await AsyncStorage.setItem(ALARM_KEY, JSON.stringify(map));
}

export async function ensureAlarmPermissions(): Promise<boolean> {
  ensureNotificationHandler();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Station arrival alerts',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'arrival_alarm',
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      // User can stop from the app; don't force ongoing forever
      enableVibrate: true,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return Boolean(asked.granted);
}

export async function isArrivalAlarmArmed(ticketId: string): Promise<boolean> {
  const map = await loadAlarms();
  return Boolean(map[ticketId]);
}

async function cancelNotification(id?: string) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
}

/**
 * Arm a 20-minute-before arrival alert for the destination station.
 * Re-schedules when ETA changes on live refresh.
 */
export async function armArrivalAlarm(
  input: {
    ticketId: string;
    trainNumber?: string;
    pnr?: string;
    stationName: string;
    stationCode?: string;
    eta: Date;
    minutesBefore?: number;
  },
  opts?: { fromUser?: boolean; allowFireNow?: boolean }
): Promise<{ ok: boolean; reason?: string }> {
  ensureNotificationHandler();

  if (!(await areAlarmNotificationsEnabled())) {
    await stopArrivalAlarmSound();
    return { ok: false, reason: 'disabled' };
  }

  const minutesBefore = input.minutesBefore ?? 20;
  const triggerAt = new Date(input.eta.getTime() - minutesBefore * 60_000);
  const map = await loadAlarms();
  const existing = map[input.ticketId];
  const fromUser = Boolean(opts?.fromUser);
  const allowFireNow = opts?.allowFireNow !== false;

  // User re-arming clears a previous silence
  const silenced = fromUser ? false : Boolean(existing?.silenced);

  if (existing?.firedAt && existing.etaIso === input.eta.toISOString() && !fromUser) {
    return { ok: true, reason: 'already-fired' };
  }

  if (silenced && !fromUser) {
    map[input.ticketId] = {
      ...existing!,
      ticketId: input.ticketId,
      etaIso: input.eta.toISOString(),
      silenced: true,
    };
    await saveAlarms(map);
    return { ok: true, reason: 'silenced' };
  }

  const allowed = await ensureAlarmPermissions();
  if (!allowed) {
    map[input.ticketId] = {
      ticketId: input.ticketId,
      etaIso: input.eta.toISOString(),
      silenced: false,
    };
    await saveAlarms(map);
    return { ok: true, reason: 'local-only' };
  }

  await cancelNotification(existing?.notificationId);

  const now = Date.now();
  if (triggerAt.getTime() <= now) {
    if (silenced) {
      map[input.ticketId] = {
        ticketId: input.ticketId,
        etaIso: input.eta.toISOString(),
        firedAt: existing?.firedAt || new Date().toISOString(),
        silenced: true,
      };
      await saveAlarms(map);
      return { ok: true, reason: 'silenced' };
    }

    if (!allowFireNow) {
      // Already inside the alert window — keep armed; tick plays foreground sound
      map[input.ticketId] = {
        ticketId: input.ticketId,
        etaIso: input.eta.toISOString(),
        firedAt: existing?.firedAt,
        silenced: false,
      };
      await saveAlarms(map);
      return { ok: true, reason: 'window-open' };
    }

    map[input.ticketId] = {
      ticketId: input.ticketId,
      etaIso: input.eta.toISOString(),
      firedAt: new Date().toISOString(),
      silenced: false,
    };
    await saveAlarms(map);
    await playArrivalAlarmSound(input.ticketId, { notify: true });
    return { ok: true, reason: 'fired-now' };
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Train arriving in 20 minutes',
      body: `${input.trainNumber || 'Your train'} · PNR ${input.pnr || '—'} → ${input.stationName}${
        input.stationCode ? ` (${input.stationCode})` : ''
      }. Get ready.`,
      sound: 'arrival_alarm.wav',
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerAt,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });

  map[input.ticketId] = {
    ticketId: input.ticketId,
    notificationId,
    etaIso: input.eta.toISOString(),
    silenced: false,
  };
  await saveAlarms(map);
  return { ok: true };
}

export async function disarmAllArrivalAlarms() {
  const map = await loadAlarms();
  for (const record of Object.values(map)) {
    await cancelNotification(record.notificationId);
  }
  await saveAlarms({});
  await stopArrivalAlarmSound();
}

export async function disarmArrivalAlarm(ticketId: string) {
  const map = await loadAlarms();
  const existing = map[ticketId];
  await cancelNotification(existing?.notificationId);
  delete map[ticketId];
  await saveAlarms(map);
  await stopArrivalAlarmSound();
}

/**
 * User stopped the ringing alarm — must not restart on the next live tick.
 */
export async function silenceArrivalAlarm(ticketId: string) {
  const map = await loadAlarms();
  const existing = map[ticketId];
  if (existing) {
    await cancelNotification(existing.notificationId);
    map[ticketId] = {
      ...existing,
      notificationId: undefined,
      silenced: true,
      firedAt: existing.firedAt || new Date().toISOString(),
    };
    await saveAlarms(map);
  }
  await stopArrivalAlarmSound();
}

/** Foreground alert: short vibrate cycles (stoppable). */
export async function playArrivalAlarmSound(
  ticketId: string,
  opts?: { notify?: boolean }
) {
  if (!(await areAlarmNotificationsEnabled())) {
    await stopArrivalAlarmSound();
    return;
  }

  const map = await loadAlarms();
  if (map[ticketId]?.silenced) {
    await stopArrivalAlarmSound();
    return;
  }

  soundingTicketId = ticketId;
  // Finite pattern — do NOT pass repeat=true (that was unstoppable on some OEMs)
  const pattern = [0, 600, 300, 600, 300, 900, 400, 600];
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  Vibration.cancel();
  Vibration.vibrate(pattern, false);

  vibrateTimer = setInterval(() => {
    if (soundingTicketId !== ticketId) {
      if (vibrateTimer) clearInterval(vibrateTimer);
      vibrateTimer = null;
      Vibration.cancel();
      return;
    }
    Vibration.vibrate(pattern, false);
  }, 4500);

  if (opts?.notify === false) return;

  try {
    ensureNotificationHandler();
    // One banner only — avoid stacking sound every tick
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Train arriving soon',
        body: 'Open Travel ID and tap Stop alarm',
        sound: 'arrival_alarm.wav',
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    // vibration still runs
  }
}

export async function stopArrivalAlarmSound() {
  if (vibrateTimer) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  soundingTicketId = null;
  Vibration.cancel();
  // Extra cancel on next frame for OEMs that ignore the first cancel
  setTimeout(() => Vibration.cancel(), 50);
  setTimeout(() => Vibration.cancel(), 200);
}

export function isAlarmSoundPlaying(ticketId?: string): boolean {
  if (!ticketId) return Boolean(soundingTicketId);
  return soundingTicketId === ticketId;
}

/**
 * Call on each live refresh while alarm is armed.
 * Alerts when within the 20-minute window (app foreground).
 */
export async function tickArrivalAlarm(input: {
  ticketId: string;
  minutesUntilArrival?: number;
  eta?: Date;
  trainNumber?: string;
  pnr?: string;
  stationName: string;
  stationCode?: string;
  minutesBefore?: number;
}): Promise<'idle' | 'armed' | 'sounding' | 'silenced' | 'disarmed'> {
  if (!(await areAlarmNotificationsEnabled())) {
    await stopArrivalAlarmSound();
    return 'disarmed';
  }

  const map = await loadAlarms();
  const record = map[input.ticketId];
  if (!record) return 'disarmed';

  if (record.silenced) {
    await stopArrivalAlarmSound();
    return 'silenced';
  }

  const minutesBefore = input.minutesBefore ?? 20;
  const mins = input.minutesUntilArrival;

  if (input.eta) {
    await armArrivalAlarm(
      {
        ticketId: input.ticketId,
        trainNumber: input.trainNumber,
        pnr: input.pnr,
        stationName: input.stationName,
        stationCode: input.stationCode,
        eta: input.eta,
        minutesBefore,
      },
      { fromUser: false, allowFireNow: false }
    );
  }

  // Re-read after schedule update
  const latest = (await loadAlarms())[input.ticketId];
  if (!latest) return 'disarmed';
  if (latest.silenced) {
    await stopArrivalAlarmSound();
    return 'silenced';
  }

  if (typeof mins === 'number' && mins <= minutesBefore && mins > -15) {
    if (!isAlarmSoundPlaying(input.ticketId)) {
      await playArrivalAlarmSound(input.ticketId, {
        // Notify once when first entering the window
        notify: !latest.firedAt,
      });
      const next = await loadAlarms();
      if (next[input.ticketId]) {
        next[input.ticketId] = {
          ...next[input.ticketId],
          firedAt: next[input.ticketId].firedAt || new Date().toISOString(),
        };
        await saveAlarms(next);
      }
    }
    return 'sounding';
  }

  if (typeof mins === 'number' && mins <= -15) {
    await stopArrivalAlarmSound();
    return 'armed';
  }

  return 'armed';
}
