import { MetroNetworkId } from './types';

export type MetroCityHint = {
  id: MetroNetworkId;
  city: string;
  /** Approximate city centre */
  lat: number;
  lng: number;
  /** Match radius in km */
  radiusKm: number;
};

/** Operational / major Indian metro cities (centre + catch radius). */
export const METRO_CITY_HINTS: MetroCityHint[] = [
  { id: 'del', city: 'Delhi NCR', lat: 28.6139, lng: 77.209, radiusKm: 55 },
  { id: 'bom', city: 'Mumbai', lat: 19.076, lng: 72.8777, radiusKm: 45 },
  { id: 'blr', city: 'Bengaluru', lat: 12.9716, lng: 77.5946, radiusKm: 40 },
  { id: 'hyd', city: 'Hyderabad', lat: 17.385, lng: 78.4867, radiusKm: 35 },
  { id: 'maa', city: 'Chennai', lat: 13.0827, lng: 80.2707, radiusKm: 35 },
  { id: 'ccu', city: 'Kolkata', lat: 22.5726, lng: 88.3639, radiusKm: 30 },
  { id: 'pnq', city: 'Pune', lat: 18.5204, lng: 73.8567, radiusKm: 25 },
  { id: 'amd', city: 'Ahmedabad', lat: 23.0225, lng: 72.5714, radiusKm: 25 },
  { id: 'cok', city: 'Kochi', lat: 9.9312, lng: 76.2673, radiusKm: 25 },
  { id: 'lko', city: 'Lucknow', lat: 26.8467, lng: 80.9462, radiusKm: 25 },
  { id: 'jai', city: 'Jaipur', lat: 26.9124, lng: 75.7873, radiusKm: 25 },
  { id: 'nag', city: 'Nagpur', lat: 21.1458, lng: 79.0882, radiusKm: 25 },
];

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type LocateMetroResult = {
  networkId: MetroNetworkId;
  city: string;
  distanceKm: number;
} | null;

/**
 * Pick the nearest metro city within its radius (or null if outside all metros).
 */
export function locateMetroCity(
  lat: number,
  lng: number
): LocateMetroResult {
  let best: LocateMetroResult = null;
  for (const hint of METRO_CITY_HINTS) {
    const d = haversineKm(lat, lng, hint.lat, hint.lng);
    if (d > hint.radiusKm) continue;
    if (!best || d < best.distanceKm) {
      best = { networkId: hint.id, city: hint.city, distanceKm: d };
    }
  }
  return best;
}

export function isMetroNetworkId(value: string | null | undefined): value is MetroNetworkId {
  return METRO_CITY_HINTS.some((h) => h.id === value);
}
