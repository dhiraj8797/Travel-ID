import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

const MS_TO_KMH = 3.6;
const SMOOTH_SAMPLES = 5;
/** Ignore tiny GPS jitter when nearly stopped. */
const MIN_REPORT_KMH = 1.5;

export type GpsSpeedState = {
  /** Smoothed speed in km/h (0 when unavailable). */
  speedKmh: number;
  /** Raw last sample in km/h */
  rawSpeedKmh?: number;
  tracking: boolean;
  permission: 'undetermined' | 'granted' | 'denied';
  error?: string;
  accuracyM?: number;
};

/**
 * Live device speed from GPS (m/s → km/h).
 * Only meaningful when the phone is moving with the train.
 */
export function useGpsSpeed(enabled: boolean): GpsSpeedState & {
  requestPermission: () => Promise<boolean>;
} {
  const [speedKmh, setSpeedKmh] = useState(0);
  const [rawSpeedKmh, setRawSpeedKmh] = useState<number | undefined>();
  const [tracking, setTracking] = useState(false);
  const [permission, setPermission] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');
  const [error, setError] = useState<string | undefined>();
  const [accuracyM, setAccuracyM] = useState<number | undefined>();
  const samples = useRef<number[]>([]);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const requestPermission = useCallback(async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.granted) {
        setPermission('granted');
        return true;
      }
      const asked = await Location.requestForegroundPermissionsAsync();
      const ok = asked.granted;
      setPermission(ok ? 'granted' : 'denied');
      if (!ok) {
        setError('Location permission is required for GPS speed.');
      }
      return ok;
    } catch (e) {
      setPermission('denied');
      setError(e instanceof Error ? e.message : 'Unable to request location');
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      subRef.current?.remove();
      subRef.current = null;
      samples.current = [];
      if (!cancelled) {
        setTracking(false);
        setSpeedKmh(0);
        setRawSpeedKmh(undefined);
      }
    };

    const start = async () => {
      if (!enabled) {
        stop();
        return;
      }

      setError(undefined);
      const ok = await requestPermission();
      if (cancelled || !ok) {
        stop();
        return;
      }

      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setError('Turn on location / GPS on this phone.');
        stop();
        return;
      }

      try {
        subRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 0,
            mayShowUserSettingsDialog: true,
          },
          (pos) => {
            if (cancelled) return;
            const rawMs = pos.coords.speed;
            // Android/iOS may report -1 or null when speed is unknown
            if (rawMs == null || rawMs < 0 || Number.isNaN(rawMs)) {
              return;
            }
            let kmh = rawMs * MS_TO_KMH;
            if (kmh < MIN_REPORT_KMH) kmh = 0;

            setRawSpeedKmh(kmh);
            if (typeof pos.coords.accuracy === 'number') {
              setAccuracyM(pos.coords.accuracy);
            }

            const buf = samples.current;
            buf.push(kmh);
            if (buf.length > SMOOTH_SAMPLES) buf.shift();
            const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
            setSpeedKmh(Math.round(avg));
            setTracking(true);
          }
        );
        if (!cancelled) setTracking(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'GPS tracking failed');
          stop();
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, requestPermission]);

  return {
    speedKmh,
    rawSpeedKmh,
    tracking,
    permission,
    error,
    accuracyM,
    requestPermission,
  };
}
