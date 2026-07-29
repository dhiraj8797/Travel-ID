import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import {
  geocodeAddress,
  googleMapsDirectionsUrl,
  type LatLng,
} from '../services/mapsGeocode';
import { Ticket } from '../types/ticket';
import {
  busPhaseCopy,
  getBusJourneyPhase,
  LiveJourneyPhase,
} from '../utils/journeyLive';
import {
  formatKmLeft,
  haversineKm,
  parseTicketDistanceKm,
} from '../utils/geo';

export type { LatLng };

export type BusJourneyState = {
  phase: LiveJourneyPhase;
  destinationName: string;
  /** Remaining straight-line km to destination (GPS). */
  kmLeft: number | null;
  /** Trip total km (ticket distance, or first GPS→dest reading). */
  totalKm: number | null;
  kmLeftLabel: string;
  statusTitle: string;
  statusBody: string;
  tracking: boolean;
  permission: 'undetermined' | 'granted' | 'denied';
  error?: string;
  /** Show live remaining-km strip */
  showLiveTrack: boolean;
  openGoogleMapsJourney: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
};

function destinationLabel(ticket: Ticket): string {
  return (
    ticket.droppingPoint ||
    ticket.to ||
    ticket.droppingAddress ||
    'destination'
  );
}

function destinationQuery(ticket: Ticket): string {
  const parts = [
    ticket.droppingPoint,
    ticket.droppingLandmark,
    ticket.droppingAddress,
    ticket.to,
  ].filter(Boolean);
  return parts.join(', ') || ticket.to || 'India';
}

function boardingQuery(ticket: Ticket): string {
  const parts = [
    ticket.boardingPoint,
    ticket.boardingLandmark,
    ticket.boardingAddress,
    ticket.from,
  ].filter(Boolean);
  return parts.join(', ') || ticket.from || '';
}

const geocodeCache = new Map<string, LatLng>();

async function geocodePlace(query: string): Promise<LatLng | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const hit = geocodeCache.get(key);
  if (hit) return hit;
  const point = await geocodeAddress(query);
  if (point) geocodeCache.set(key, point);
  return point;
}

/**
 * Bus live journey: unlocks 30 min before departure.
 * Uses device GPS + destination geocode for remaining km,
 * and can open Google Maps directions.
 */
export function useBusJourney(ticket: Ticket): BusJourneyState {
  const destinationName = useMemo(() => destinationLabel(ticket), [ticket]);
  const ticketTotalKm = useMemo(
    () => parseTicketDistanceKm(ticket.distance),
    [ticket.distance]
  );

  const [nowTick, setNowTick] = useState(() => Date.now());
  const { phase, window } = useMemo(
    () => getBusJourneyPhase(ticket, new Date(nowTick)),
    [ticket, nowTick]
  );

  const showLiveTrack = phase === 'soon' || phase === 'live';
  const copy = useMemo(
    () => busPhaseCopy(phase, window, destinationName),
    [phase, window, destinationName]
  );

  const [permission, setPermission] = useState<
    'undetermined' | 'granted' | 'denied'
  >('undetermined');
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [kmLeft, setKmLeft] = useState<number | null>(null);
  const [totalKm, setTotalKm] = useState<number | null>(ticketTotalKm);
  const destRef = useRef<LatLng | null>(null);
  const originAtStartRef = useRef<LatLng | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  // Re-evaluate phase every 30s
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
      if (!ok) setError('Location permission is required for live bus distance.');
      return ok;
    } catch (e) {
      setPermission('denied');
      setError(e instanceof Error ? e.message : 'Unable to request location');
      return false;
    }
  }, []);

  // Geocode destination when tracking window opens
  useEffect(() => {
    if (!showLiveTrack) return;
    let cancelled = false;
    void (async () => {
      const dest = await geocodePlace(destinationQuery(ticket));
      if (cancelled) return;
      if (!dest) {
        setError('Could not locate destination on the map.');
        return;
      }
      destRef.current = dest;
      // Also geocode boarding for total km if ticket has no distance
      if (ticketTotalKm == null) {
        const origin = await geocodePlace(boardingQuery(ticket));
        if (!cancelled && origin) {
          originAtStartRef.current = origin;
          setTotalKm(Math.round(haversineKm(origin, dest)));
        }
      } else {
        setTotalKm(ticketTotalKm);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showLiveTrack, ticket, ticketTotalKm]);

  // Watch GPS while in tracking window
  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      subRef.current?.remove();
      subRef.current = null;
      if (!cancelled) setTracking(false);
    };

    const start = async () => {
      if (!showLiveTrack) {
        stop();
        setKmLeft(null);
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
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 25,
            mayShowUserSettingsDialog: true,
          },
          (pos) => {
            if (cancelled) return;
            const here = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            if (!originAtStartRef.current) {
              originAtStartRef.current = here;
            }
            const dest = destRef.current;
            if (!dest) return;
            const left = haversineKm(here, dest);
            setKmLeft(left);
            if (ticketTotalKm == null && originAtStartRef.current) {
              const total = haversineKm(originAtStartRef.current, dest);
              if (total > 0) setTotalKm(Math.round(total));
            }
            // Arrived
            if (left < 0.4) {
              setKmLeft(0);
            }
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
  }, [showLiveTrack, requestPermission, ticketTotalKm]);

  const openGoogleMapsJourney = useCallback(async () => {
    const url = googleMapsDirectionsUrl(
      boardingQuery(ticket),
      destinationQuery(ticket)
    );
    await Linking.openURL(url);
  }, [ticket]);

  const kmLeftLabel =
    kmLeft == null
      ? '—'
      : kmLeft < 0.4
        ? 'Arriving'
        : `${formatKmLeft(kmLeft)} km LEFT FOR ${destinationName}`;

  return {
    phase,
    destinationName,
    kmLeft,
    totalKm,
    kmLeftLabel,
    statusTitle: copy.title,
    statusBody: copy.body,
    tracking,
    permission,
    error,
    showLiveTrack,
    openGoogleMapsJourney,
    requestPermission,
  };
}
