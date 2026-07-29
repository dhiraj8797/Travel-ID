import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { locateMetroCity } from '../metro';
import { reverseGeocodeLabel } from '../services/mapsGeocode';

const STORAGE_KEY = 'travelid.home.locationLabel.v1';

export type HomeLocationState = {
  loading: boolean;
  label: string | null;
  error: string | null;
  /** True once user has added / fetched a location at least once this session or from cache */
  hasLocation: boolean;
  addOrRefresh: () => Promise<void>;
  clear: () => Promise<void>;
};

async function labelFromCoords(lat: number, lng: number): Promise<string> {
  const metro = locateMetroCity(lat, lng);
  if (metro) return metro.city;

  const fromMaps = await reverseGeocodeLabel(lat, lng);
  if (fromMaps) return fromMaps;

  return `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
}

/**
 * Opt-in home location label (shown under the user name).
 */
export function useHomeLocation(): HomeLocationState {
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!mounted.current || !raw?.trim()) return;
      setLabel(raw.trim());
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const addOrRefresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        if (mounted.current) setError('Turn on location services');
        return;
      }
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        if (mounted.current) setError('Location permission needed');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = await labelFromCoords(
        pos.coords.latitude,
        pos.coords.longitude
      );
      if (!mounted.current) return;
      setLabel(next);
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not get location');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setLabel(null);
    setError(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    loading,
    label,
    error,
    hasLocation: Boolean(label),
    addOrRefresh,
    clear,
  };
}
