import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  buildMetroLiveGuide,
  findStationByName,
  formatTravelTime,
  MetroLiveGuide,
  MetroNetworkId,
  MetroRoutePlan,
  planMetroRoute,
} from '../metro';
import { Ticket } from '../types/ticket';
import { getPassPhase } from '../utils/passTime';

export type MetroJourneyState = {
  networkId: MetroNetworkId;
  route: MetroRoutePlan | null;
  guide: MetroLiveGuide | null;
  travelTimeLabel: string;
  tracking: boolean;
  permission: 'undetermined' | 'granted' | 'denied';
  error?: string;
  showLiveGuide: boolean;
  modeBadge: string;
  requestPermission: () => Promise<boolean>;
  confirmStation: (stationId: string) => void;
  clearConfirmation: () => void;
  startJourneyClock: () => void;
};

function resolveNetworkId(ticket: Ticket): MetroNetworkId {
  const raw = ticket.metroNetworkId?.trim();
  if (
    raw === 'blr' ||
    raw === 'del' ||
    raw === 'bom' ||
    raw === 'hyd' ||
    raw === 'maa' ||
    raw === 'ccu' ||
    raw === 'pnq' ||
    raw === 'amd' ||
    raw === 'cok' ||
    raw === 'lko' ||
    raw === 'jai' ||
    raw === 'nag'
  ) {
    return raw;
  }
  return 'blr';
}

function resolveStationIds(ticket: Ticket): {
  fromId?: string;
  toId?: string;
} {
  const networkId = resolveNetworkId(ticket);
  const fromId = ticket.metroFromStationId || ticket.fromCode || undefined;
  const toId = ticket.metroToStationId || ticket.toCode || undefined;
  if (fromId && toId) return { fromId, toId };
  return {
    fromId: fromId || findStationByName(networkId, ticket.from)?.id,
    toId: toId || findStationByName(networkId, ticket.to)?.id,
  };
}

/**
 * Offline / assisted metro guidance for TravelID Metro Live Pass.
 * Never claims estimated progress as verified live train data.
 */
export function useMetroJourney(ticket: Ticket): MetroJourneyState {
  const networkId = resolveNetworkId(ticket);
  const { fromId, toId } = useMemo(() => resolveStationIds(ticket), [ticket]);

  const route = useMemo(() => {
    if (!fromId || !toId) return null;
    return planMetroRoute(fromId, toId, networkId);
  }, [fromId, toId, networkId]);

  const phase = getPassPhase(ticket);
  const showLiveGuide =
    !ticket.journeyCompleted &&
    (phase === 'upcoming' || phase === 'ongoing' || !ticket.departureDate);

  const [permission, setPermission] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [confirmedStationId, setConfirmedStationId] = useState<string | null>(
    null
  );
  const [journeyStartedAt, setJourneyStartedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const requestPermission = async () => {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) {
      setPermission('granted');
      return true;
    }
    const asked = await Location.requestForegroundPermissionsAsync();
    const ok = asked.granted;
    setPermission(ok ? 'granted' : 'denied');
    if (!ok) setError('Location permission helps near outdoor / elevated stations.');
    return ok;
  };

  const confirmStation = useCallback((stationId: string) => {
    setConfirmedStationId(stationId);
    setJourneyStartedAt((t) => t || Date.now());
  }, []);

  const clearConfirmation = useCallback(() => {
    setConfirmedStationId(null);
  }, []);

  const startJourneyClock = useCallback(() => {
    setJourneyStartedAt((t) => t || Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(
        current.granted
          ? 'granted'
          : current.canAskAgain
            ? 'undetermined'
            : 'denied'
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh elapsed-time estimates every 30s
  useEffect(() => {
    if (!showLiveGuide || !route) return;
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, [showLiveGuide, route]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!showLiveGuide || !route) {
        subRef.current?.remove();
        subRef.current = null;
        setTracking(false);
        return;
      }
      if (permission !== 'granted') {
        setTracking(false);
        return;
      }

      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setError('Turn on location for outdoor station detection.');
        setTracking(false);
        return;
      }

      setError(undefined);
      setTracking(true);
      try {
        subRef.current?.remove();
        subRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 25,
            timeInterval: 4000,
          },
          (loc) => {
            if (cancelled) return;
            setCoords({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
            setGpsAccuracyM(
              loc.coords.accuracy != null ? loc.coords.accuracy : null
            );
            setJourneyStartedAt((t) => t || Date.now());
          }
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'GPS tracking failed');
          setTracking(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [showLiveGuide, route, permission]);

  const guide = useMemo(() => {
    if (!route) return null;
    return buildMetroLiveGuide(route, coords, networkId, {
      confirmedStationId,
      gpsAccuracyM,
      journeyStartedAt,
    });
  }, [
    route,
    coords,
    networkId,
    confirmedStationId,
    gpsAccuracyM,
    journeyStartedAt,
  ]);

  const travelTimeLabel = route
    ? formatTravelTime(route.estimatedMinutes)
    : ticket.travelTime || '—';

  const modeBadge =
    guide?.trackingMode === 'accurate'
      ? 'LIVE'
      : guide?.trackingMode === 'assisted'
        ? 'ASSISTED'
        : 'OFFLINE';

  return {
    networkId,
    route,
    guide,
    travelTimeLabel,
    tracking,
    permission,
    error,
    showLiveGuide,
    modeBadge,
    requestPermission,
    confirmStation,
    clearConfirmation,
    startJourneyClock,
  };
}
