import * as Location from 'expo-location';
import { proxyFetch } from './apiProxy';

export type LatLng = { lat: number; lng: number };

export type PlaceLabel = {
  label: string;
  area?: string | null;
  city?: string | null;
};

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

/** Reverse geocode place (area + city) via proxy; falls back to expo-location. */
export async function reverseGeocodePlace(
  lat: number,
  lng: number
): Promise<PlaceLabel | null> {
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
      area?: string | null;
      city?: string | null;
      formattedAddress?: string | null;
    };
    if (json.success) {
      const label = json.label || json.formattedAddress;
      if (label) {
        return {
          label,
          area: json.area || null,
          city: json.city || null,
        };
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const places = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    const p = places[0];
    if (!p) return null;
    const area = p.district || p.name || p.street || null;
    const city = p.city || p.subregion || p.region || null;
    const label =
      area && city && area !== city
        ? `${area}, ${city}`
        : city || area || null;
    return label ? { label, area, city } : null;
  } catch {
    return null;
  }
}

/** Reverse geocode label via proxy; falls back to expo-location. */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number
): Promise<string | null> {
  const place = await reverseGeocodePlace(lat, lng);
  return place?.label || null;
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
