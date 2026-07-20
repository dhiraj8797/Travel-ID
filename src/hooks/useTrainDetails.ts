import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { fetchTrainDetails, TrainDetails } from '../services/railRadar';

const cacheKey = (n: string) => `train_details_v2_${n}`;

export function useTrainDetails(trainNumber?: string) {
  const [details, setDetails] = useState<TrainDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    const number = String(trainNumber || '').replace(/\D/g, '');
    if (!number) {
      setDetails(null);
      return;
    }

    // Show cached schedule immediately so station names never disappear
    try {
      const cached = await AsyncStorage.getItem(cacheKey(number));
      if (cached) {
        const parsed = JSON.parse(cached) as TrainDetails;
        if (parsed?.halts?.length) setDetails(parsed);
      }
    } catch {
      /* ignore cache read */
    }

    setLoading(true);
    setError(undefined);
    try {
      const next = await fetchTrainDetails(number);
      setDetails(next);
      if (next.halts?.length) {
        await AsyncStorage.setItem(cacheKey(number), JSON.stringify(next));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load train details');
      // Keep whatever we already have (cache / previous)
    } finally {
      setLoading(false);
    }
  }, [trainNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { details, loading, error, refresh };
}
