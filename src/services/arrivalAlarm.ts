import * as Notifications from 'expo-notifications';
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/**
 * Arm a 5-minute-before arrival alert for the destination station.
 * Re-schedules when ETA changes on live refresh.
 */
export async function armArrivalAlarm(input: {
  ticketId: string;
  trainNumber?: string;
  pnr?: string;
  stationName: string;
  stationCode?: string;
  eta: Date;
  minutesBefore?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  ensureNotificationHandler();
  const minutesBefore = input.minutesBefore ?? 5;
  const triggerAt = new Date(input.eta.getTime() - minutesBefore * 60_000);
  const map = await loadAlarms();
  const existing = map[input.ticketId];

  if (existing?.firedAt && existing.etaIso === input.eta.toISOString()) {
    return { ok: true, reason: 'already-fired' };
  }

  const allowed = await ensureAlarmPermissions();
  if (!allowed) {
    map[input.ticketId] = {
      ticketId: input.ticketId,
      etaIso: input.eta.toISOString(),
    };
    await saveAlarms(map);
    return { ok: true, reason: 'local-only' };
  }

  if (existing?.notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    } catch {
      // ignore
    }
  }

  const now = Date.now();
  if (triggerAt.getTime() <= now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Train arriving soon',
        body: `${input.trainNumber || 'Your train'} · PNR ${input.pnr || '—'} arrives ${input.stationName}${
          input.stationCode ? ` (${input.stationCode})` : ''
        } in about ${minutesBefore} min.`,
        sound: 'arrival_alarm.wav',
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    map[input.ticketId] = {
      ticketId: input.ticketId,
      etaIso: input.eta.toISOString(),
      firedAt: new Date().toISOString(),
    };
    await saveAlarms(map);
    await playArrivalAlarmSound(input.ticketId);
    return { ok: true, reason: 'fired-now' };
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Train arriving in 5 minutes',
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
  };
  await saveAlarms(map);
  return { ok: true };
}

export async function disarmArrivalAlarm(ticketId: string) {
  const map = await loadAlarms();
  const existing = map[ticketId];
  if (existing?.notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    } catch {
      // ignore
    }
  }
  delete map[ticketId];
  await saveAlarms(map);
  if (soundingTicketId === ticketId) {
    await stopArrivalAlarmSound();
  }
}

/** Foreground alert: vibrating pulse + notification sound (no expo-av). */
export async function playArrivalAlarmSound(ticketId: string) {
  soundingTicketId = ticketId;
  const pattern = [0, 600, 300, 600, 300, 900];
  Vibration.vibrate(pattern, true);
  if (vibrateTimer) clearInterval(vibrateTimer);
  // Keep pattern alive on some OEMs that stop after one cycle
  vibrateTimer = setInterval(() => {
    Vibration.vibrate(pattern, true);
  }, 4000);

  try {
    ensureNotificationHandler();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Train arriving soon',
        body: 'Tap Travel ID · get ready at your station',
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
  Vibration.cancel();
  soundingTicketId = null;
}

export function isAlarmSoundPlaying(ticketId?: string): boolean {
  if (!ticketId) return Boolean(soundingTicketId);
  return soundingTicketId === ticketId;
}

/**
 * Call on each live refresh while alarm is armed.
 * Alerts when within the 5-minute window (app foreground).
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
}): Promise<'idle' | 'armed' | 'sounding' | 'disarmed'> {
  const map = await loadAlarms();
  if (!map[input.ticketId]) return 'disarmed';

  const minutesBefore = input.minutesBefore ?? 5;
  const mins = input.minutesUntilArrival;

  if (input.eta) {
    await armArrivalAlarm({
      ticketId: input.ticketId,
      trainNumber: input.trainNumber,
      pnr: input.pnr,
      stationName: input.stationName,
      stationCode: input.stationCode,
      eta: input.eta,
      minutesBefore,
    });
  }

  if (typeof mins === 'number' && mins <= minutesBefore && mins > -15) {
    if (!isAlarmSoundPlaying(input.ticketId)) {
      await playArrivalAlarmSound(input.ticketId);
    }
    return 'sounding';
  }

  if (typeof mins === 'number' && mins <= -15) {
    await stopArrivalAlarmSound();
    return 'armed';
  }

  return 'armed';
}
