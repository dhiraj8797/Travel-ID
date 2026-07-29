import * as Location from 'expo-location';
import { proxyFetch } from './apiProxy';

export type LatLng = { lat: number; lng: number };

const cache = new Map<string, LatLng>();

/** Forward geocode via proxy (Google Maps API key on server only). */
export async function geocodeAddress(query: string): Promise<LatLng | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const qs = new URLSearchParams({ address: query.trim() });
    const res = await proxyFetch(`/maps/geocode?${qs.toString()}`, undefined, {
      timeoutMs: 12_000,
    });
    const json = (await res.json()) as {
      success?: boolean;
      lat?: number;
      lng?: number;
    };
    if (json.success && typeof json.lat === 'number' && typeof json.lng === 'number') {
      const point = { lat: json.lat, lng: json.lng };
      cache.set(key, point);
      return point;
    }
  } catch {
    /* fall through to device geocoder */
  }

  try {
    const results = await Location.geocodeAsync(query.trim());
    const first = results[0];
    if (!first) return null;
    const point = { lat: first.latitude, lng: first.longitude };
    cache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

/** Reverse geocode label via proxy; falls back to expo-location. */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const qs = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    const res = await proxyFetch(`/maps/reverse-geocode?${qs.toString()}`, undefined, {
      timeoutMs: 12_000,
    });
    const json = (await res.json()) as {
      success?: boolean;
      label?: string | null;
      formattedAddress?: string | null;
    };
    if (json.success) {
      return json.label || json.formattedAddress || null;
    }
  } catch {
    /* fall through */
  }

  try {
    const places = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const p = places[0];
    if (!p) return null;
    return (
      p.city ||
      p.subregion ||
      p.district ||
      p.region ||
      p.name ||
      null
    );
  } catch {
    return null;
  }
}

/** Google Maps deep link — no API key in the app. */
export function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsDirectionsUrl(origin: string, destination: string): string {
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&travelmode=driving`
  );
}
