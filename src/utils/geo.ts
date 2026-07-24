/** Earth-radius haversine distance in km. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Parse ticket distance strings like "310 KM", "310km", "310". */
export function parseTicketDistanceKm(raw?: string | null): number | null {
  if (!raw) return null;
  const m = String(raw).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(km|kms)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatKmLeft(km: number): string {
  if (km < 0.5) return 'Less than 1';
  if (km < 10) return km.toFixed(1);
  return String(Math.round(km));
}
