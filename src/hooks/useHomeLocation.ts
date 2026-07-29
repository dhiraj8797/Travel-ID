import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { locateMetroCity } from '../metro';
import { reverseGeocodePlace } from '../services/mapsGeocode';

const STORAGE_KEY = 'travelid.home.location.v2';

type StoredLocation = {
  label: string;
  lat: number;
  lng: number;
  area?: string | null;
  city?: string | null;
  updatedAt: string;
};

export type HomeLocationState = {
  loading: boolean;
  label: string | null;
  area: string | null;
  city: string | null;
  coords: { lat: number; lng: number } | null;
  error: string | null;
  /** True once GPS (or cache) has produced a place label */
  hasLocation: boolean;
  addOrRefresh: () => Promise<void>;
  clear: () => Promise<void>;
};

async function labelFromCoords(
  lat: number,
  lng: number
): Promise<Omit<StoredLocation, 'updatedAt'>> {
  const metro = locateMetroCity(lat, lng);
  if (metro) {
    return {
      label: metro.city,
      lat,
      lng,
      area: metro.city,
      city: metro.city,
    };
  }

  const place = await reverseGeocodePlace(lat, lng);
  if (place?.label) {
    return {
      label: place.label,
      lat,
      lng,
      area: place.area,
      city: place.city,
    };
  }

  return {
    label: `${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
    lat,
    lng,
    area: null,
    city: null,
  };
}

/**
 * Current device location → area name for home + weather.
 * Auto-fetches on mount; user can refresh or clear.
 */
export function useHomeLocation(): HomeLocationState {
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const didAuto = useRef(false);

  const apply = useCallback((stored: StoredLocation) => {
    setLabel(stored.label);
    setArea(stored.area || null);
    setCity(stored.city || null);
    setCoords({ lat: stored.lat, lng: stored.lng });
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
      const stored: StoredLocation = {
        ...next,
        updatedAt: new Date().toISOString(),
      };
      if (!mounted.current) return;
      apply(stored);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Could not get location');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted.current) {
          const parsed = JSON.parse(raw) as StoredLocation;
          if (
            parsed?.label &&
            typeof parsed.lat === 'number' &&
            typeof parsed.lng === 'number'
          ) {
            apply(parsed);
          }
        }
      } catch {
        /* ignore corrupt cache */
      }
      if (!didAuto.current && mounted.current) {
        didAuto.current = true;
        await addOrRefresh();
      } else if (mounted.current) {
        setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [addOrRefresh, apply]);

  const clear = useCallback(async () => {
    setLabel(null);
    setArea(null);
    setCity(null);
    setCoords(null);
    setError(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return {
    loading,
    label,
    area,
    city,
    coords,
    error,
    hasLocation: Boolean(label),
    addOrRefresh,
    clear,
  };
}
