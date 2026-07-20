/** Common Indian / global IATA labels for boarding-pass UI. */
const AIRPORTS: Record<string, { city: string; name: string }> = {
  BLR: { city: 'Bengaluru', name: 'Kempegowda Int. Airport' },
  DEL: { city: 'Delhi', name: 'Indira Gandhi Int. Airport' },
  BOM: { city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj Int.' },
  MAA: { city: 'Chennai', name: 'Chennai International Airport' },
  HYD: { city: 'Hyderabad', name: 'Rajiv Gandhi Int. Airport' },
  CCU: { city: 'Kolkata', name: 'Netaji Subhas Chandra Bose Int.' },
  GOI: { city: 'Goa', name: 'Manohar International Airport' },
  GOX: { city: 'Goa', name: 'Manohar International Airport' },
  PNQ: { city: 'Pune', name: 'Pune Airport' },
  AMD: { city: 'Ahmedabad', name: 'Sardar Vallabhbhai Patel Int.' },
  COK: { city: 'Kochi', name: 'Cochin International Airport' },
  TRV: { city: 'Thiruvananthapuram', name: 'Trivandrum Int. Airport' },
  IXC: { city: 'Chandigarh', name: 'Chandigarh Airport' },
  JAI: { city: 'Jaipur', name: 'Jaipur International Airport' },
  LKO: { city: 'Lucknow', name: 'Chaudhary Charan Singh Int.' },
  PAT: { city: 'Patna', name: 'Jay Prakash Narayan Airport' },
  GAU: { city: 'Guwahati', name: 'Lokpriya Gopinath Bordoloi Int.' },
  IXB: { city: 'Bagdogra', name: 'Bagdogra Airport' },
  SXR: { city: 'Srinagar', name: 'Sheikh ul-Alam Airport' },
  IXZ: { city: 'Port Blair', name: 'Veer Savarkar Int. Airport' },
};

export function airportMeta(code?: string, fallbackName?: string) {
  const c = (code || '').toUpperCase();
  const hit = AIRPORTS[c];
  if (hit) return { code: c || '—', city: hit.city, name: hit.name };
  const city = fallbackName || c || 'City';
  return { code: c || '—', city, name: fallbackName || 'Airport' };
}

/** Format 6E234 → "6E 234" */
export function formatFlightDisplay(flightNumber?: string, airlineCode?: string) {
  const raw = (flightNumber || '').toUpperCase().replace(/\s+/g, '');
  if (!raw) return '—';
  const m = raw.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
  if (m) return `${m[1]} ${m[2]}`;
  if (airlineCode && /^\d/.test(raw)) return `${airlineCode.toUpperCase()} ${raw}`;
  return raw;
}

export function seatSide(seat?: string): string | undefined {
  if (!seat) return undefined;
  const letter = seat.replace(/[^A-Za-z]/g, '').toUpperCase().slice(-1);
  if (!letter) return undefined;
  if ('AF'.includes(letter)) return 'Window';
  if ('CD'.includes(letter) || 'GH'.includes(letter)) return 'Aisle';
  return 'Middle';
}

/** Subtract minutes from HH:mm */
export function timeMinusMinutes(time: string, mins: number): string | undefined {
  const m = time.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  let total = Number(m[1]) * 60 + Number(m[2]) - mins;
  if (total < 0) total += 24 * 60;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
