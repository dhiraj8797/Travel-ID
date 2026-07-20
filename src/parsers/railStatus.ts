import { Passenger } from '../types/ticket';

/** Parse IRCTC status like CNF/A2/13/LOWER → coach, seat, berth. */
export function parseRailStatus(status?: string): {
  bookingStatus?: string;
  coach?: string;
  seat?: string;
  berth?: string;
} {
  if (!status) return {};
  const cleaned = status.trim().toUpperCase().replace(/\s+/g, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length >= 4) {
    return {
      bookingStatus: parts[0],
      coach: parts[1],
      seat: parts[2],
      berth: parts[3],
    };
  }
  if (parts.length === 3) {
    // CNF/A2/13 or A2/13/LOWER
    if (/^(CNF|RAC|WL)/.test(parts[0])) {
      return { bookingStatus: parts[0], coach: parts[1], seat: parts[2] };
    }
    return { coach: parts[0], seat: parts[1], berth: parts[2] };
  }
  return { bookingStatus: cleaned };
}

export function applyStatusToPassenger(
  passenger: Passenger,
  status?: string
): Passenger {
  const parsed = parseRailStatus(status || passenger.status || passenger.currentStatus);
  return {
    ...passenger,
    status: status || passenger.status || passenger.currentStatus,
    currentStatus: status || passenger.currentStatus || passenger.status,
    coach: passenger.coach || parsed.coach,
    seat: passenger.seat || parsed.seat,
    berth: passenger.berth || parsed.berth,
  };
}

/** Expand class codes to display labels used on Scapia / IRCTC passes. */
export function formatTravelClass(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const upper = v.toUpperCase();
  const map: Record<string, string> = {
    '2A': 'Second AC (2A)',
    '3A': 'Third AC (3A)',
    '1A': 'First AC (1A)',
    '3E': 'AC Economy (3E)',
    SL: 'Sleeper (SL)',
    CC: 'Chair Car (CC)',
    EC: 'Exec. Chair Car (EC)',
    '2S': 'Second Sitting (2S)',
  };
  if (map[upper]) return map[upper];
  if (/SECOND\s*AC/i.test(v)) return 'Second AC (2A)';
  if (/THIRD\s*AC/i.test(v)) return 'Third AC (3A)';
  if (/FIRST\s*AC/i.test(v)) return 'First AC (1A)';
  if (/SLEEPER/i.test(v) && !/AC/i.test(v)) return 'Sleeper (SL)';
  return v;
}
