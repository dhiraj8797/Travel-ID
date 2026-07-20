import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Ticket } from '../types/ticket';

const CHANNEL = 'flight-alerts';

let handlerReady = false;

async function ensureReady() {
  if (!handlerReady) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerReady = true;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Flight alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
    });
  }
  const perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) {
    await Notifications.requestPermissionsAsync();
  }
}

type Change = { label: string; from?: string; to?: string };

function diffFlight(prev: Ticket, next: Ticket): Change[] {
  const changes: Change[] = [];
  const check = (label: string, a?: string | number | null, b?: string | number | null) => {
    const left = a == null || a === '' ? undefined : String(a);
    const right = b == null || b === '' ? undefined : String(b);
    if (right && left !== right) changes.push({ label, from: left, to: right });
  };
  check('Status', prev.flightStatus, next.flightStatus);
  check('Gate', prev.gate, next.gate);
  check('Terminal', prev.terminal || prev.boardingPoint, next.terminal || next.boardingPoint);
  check('Delay', prev.delayMinutes, next.delayMinutes);
  return changes;
}

/** Notify when Cirium reports important flight field changes. */
export async function notifyFlightChanges(prev: Ticket, next: Ticket): Promise<void> {
  if (prev.kind !== 'flight' || next.kind !== 'flight') return;
  const changes = diffFlight(prev, next);
  if (!changes.length) return;

  await ensureReady();
  const flight = next.flightNumber || 'Flight';
  const body = changes
    .map((c) =>
      c.from ? `${c.label}: ${c.from} → ${c.to}` : `${c.label}: ${c.to}`
    )
    .join(' · ');

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${flight} update`,
      body,
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
    },
    trigger: null,
  });
}
