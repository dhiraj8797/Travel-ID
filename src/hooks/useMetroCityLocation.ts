import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  isMetroNetworkId,
  locateMetroCity,
  MetroNetworkId,
} from '../metro';

export type MetroCityLocationState = {
  loading: boolean;
  permission: 'undetermined' | 'granted' | 'denied';
  coords: { lat: number; lng: number } | null;
  networkId: MetroNetworkId | null;
  cityLabel: string | null;
  distanceKm: number | null;
  error: string | null;
  /** Short label for top-right chip */
  chipLabel: string;
  refresh: () => Promise<void>;
  requestPermissionAndFetch: () => Promise<void>;
};

/**
 * Auto-detect Indian metro city from device GPS.
 * Station pickers should stay locked until networkId is set.
 */
export function useMetroCityLocation(
  autoFetch = true
): MetroCityLocationState {
  const [loading, setLoading] = useState(autoFetch);
  const [permission, setPermission] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [networkId, setNetworkId] = useState<MetroNetworkId | null>(null);
  const [cityLabel, setCityLabel] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyCoords = useCallback((lat: number, lng: number) => {
    setCoords({ lat, lng });
    const hit = locateMetroCity(lat, lng);
    if (hit && isMetroNetworkId(hit.networkId)) {
      setNetworkId(hit.networkId);
      setCityLabel(hit.city);
      setDistanceKm(hit.distanceKm);
      setError(null);
    } else {
      setNetworkId(null);
      setCityLabel(null);
      setDistanceKm(null);
      setError('No metro network near your location');
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        if (mounted.current) {
          setError('Turn on location services');
          setLoading(false);
        }
        return;
      }
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (mounted.current) {
          setPermission(status === 'denied' ? 'denied' : 'undetermined');
          setError('Location permission needed');
          setLoading(false);
        }
        return;
      }
      if (mounted.current) setPermission('granted');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mounted.current) return;
      applyCoords(pos.coords.latitude, pos.coords.longitude);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not get location');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [applyCoords]);

  const requestPermissionAndFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current) return;
      if (status !== 'granted') {
        setPermission('denied');
        setError('Location permission denied');
        setLoading(false);
        return;
      }
      setPermission('granted');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (!mounted.current) return;
      applyCoords(pos.coords.latitude, pos.coords.longitude);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Location failed');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [applyCoords]);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled || !mounted.current) return;
      if (status === 'granted') {
        setPermission('granted');
        await refresh();
      } else {
        setPermission(status === 'denied' ? 'denied' : 'undetermined');
        await requestPermissionAndFetch();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentional one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch]);

  const chipLabel = loading
    ? 'Locating…'
    : cityLabel
      ? cityLabel
      : error
        ? 'No metro'
        : 'Location';

  return {
    loading,
    permission,
    coords,
    networkId,
    cityLabel,
    distanceKm,
    error,
    chipLabel,
    refresh,
    requestPermissionAndFetch,
  };
}
