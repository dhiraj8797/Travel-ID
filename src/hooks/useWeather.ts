import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWeatherAt, WeatherSnapshot } from '../services/weather';

export type WeatherState = {
  weather: WeatherSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Weather for the given GPS point. Re-fetches when coords change.
 */
export function useWeather(
  coords: { lat: number; lng: number } | null
): WeatherState {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!coords) {
      setWeather(null);
      setError(null);
      lastKey.current = null;
      return;
    }
    const key = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchWeatherAt(coords.lat, coords.lng);
      if (!mounted.current) return;
      setWeather(next);
      lastKey.current = key;
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Weather unavailable');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [coords]);

  useEffect(() => {
    if (!coords) {
      setWeather(null);
      lastKey.current = null;
      return;
    }
    const key = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
    if (key === lastKey.current) return;
    void refresh();
  }, [coords, refresh]);

  return { weather, loading, error, refresh };
}
