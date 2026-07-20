/**
 * Parse RailRadar coachPosition strings and provide seat/berth layouts.
 * Example: "ENG-SLRD-GEN-S1-S2-PC-B1-A1-H1-LPR-VP"
 */

export type CoachKind =
  | 'engine'
  | 'sleeper'
  | '3a'
  | '2a'
  | '1a'
  | 'cc'
  | 'ec'
  | 'gen'
  | 'pantry'
  | 'slr'
  | 'luggage'
  | 'other';

export type CoachUnit = {
  /** Position from engine (1-based among all units including ENG) */
  position: number;
  /** Raw code e.g. S3, B1, ENG, GEN */
  code: string;
  kind: CoachKind;
  label: string;
  /** True when this unit has a passenger seat map */
  hasLayout: boolean;
};

export type SeatCell = {
  number: number;
  /** Berth / seat type label */
  type: string;
  /** Row / bay index for layout */
  bay: number;
  /** left | mid | right side of aisle */
  side: 'left' | 'right' | 'side';
};

export type CoachSeatLayout = {
  code: string;
  kind: CoachKind;
  title: string;
  subtitle: string;
  total: number;
  cells: SeatCell[];
  /** Columns hint for UI */
  style: 'sleeper-bay' | 'chair' | 'cabin' | 'none';
};

const KIND_LABEL: Record<CoachKind, string> = {
  engine: 'Engine',
  sleeper: 'Sleeper',
  '3a': 'AC 3 Tier',
  '2a': 'AC 2 Tier',
  '1a': 'AC First',
  cc: 'Chair Car',
  ec: 'Exec. Chair',
  gen: 'General',
  pantry: 'Pantry',
  slr: 'SLR / Guard',
  luggage: 'Luggage',
  other: 'Coach',
};

export function classifyCoachCode(raw: string): CoachKind {
  const c = raw.trim().toUpperCase();
  if (!c) return 'other';
  if (c === 'ENG' || c === 'ENGINE' || c === 'LOCO') return 'engine';
  if (c === 'PC' || c === 'PANTRY') return 'pantry';
  if (c === 'GEN' || c === 'GS' || c === 'UR') return 'gen';
  if (c.startsWith('SLR') || c === 'SLRD' || c === 'SLRB') return 'slr';
  if (c === 'LPR' || c === 'VP' || c === 'VPU' || c === 'FCX') return 'luggage';
  if (/^S\d+$/.test(c) || c === 'SL') return 'sleeper';
  if (/^B\d+$/.test(c) || c === '3A') return '3a';
  if (/^A\d+$/.test(c) || c === '2A' || /^AE\d+$/.test(c)) return '2a';
  if (/^H\d+$/.test(c) || c === '1A') return '1a';
  if (/^C\d+$/.test(c) || c === 'CC' || c === '2S') return 'cc';
  if (/^E\d+$/.test(c) || c === 'EC' || c === 'EA') return 'ec';
  return 'other';
}

/** Parse "SLRD-GEN-S1-…" → ordered coach units (engine first). */
export function parseCoachPosition(raw?: string | null): CoachUnit[] {
  try {
    if (!raw?.trim()) return [];
    const parts = String(raw)
      .toUpperCase()
      .split(/[-|,/\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const units: CoachUnit[] = [];
    let pos = 1;
    const hasEngine = parts.some((p) => classifyCoachCode(p) === 'engine');

    if (!hasEngine) {
      units.push({
        position: pos++,
        code: 'ENG',
        kind: 'engine',
        label: KIND_LABEL.engine,
        hasLayout: false,
      });
    }

    for (const code of parts) {
      const kind = classifyCoachCode(code);
      units.push({
        position: pos++,
        code,
        kind,
        label: KIND_LABEL[kind],
        hasLayout: ['sleeper', '3a', '2a', '1a', 'cc', 'ec'].includes(kind),
      });
    }

    return units;
  } catch {
    return [];
  }
}

export function coachColor(kind: CoachKind): string {
  switch (kind) {
    case 'engine':
      return '#FF8A50';
    case 'sleeper':
      return '#5B8DEF';
    case '3a':
      return '#7C5CFF';
    case '2a':
      return '#00B4D8';
    case '1a':
      return '#C9A227';
    case 'cc':
    case 'ec':
      return '#2DD4BF';
    case 'gen':
      return '#94A3B8';
    case 'pantry':
      return '#F59E0B';
    case 'slr':
    case 'luggage':
      return '#64748B';
    default:
      return '#6B7280';
  }
}

/** IR bay layout: left stack + right stack + side lower/upper. */
function buildTierCells(
  total: number,
  stack: string[]
): SeatCell[] {
  const cells: SeatCell[] = [];
  let n = 1;
  let bay = 0;
  while (n <= total) {
    bay += 1;
    for (const t of stack) {
      if (n > total) break;
      cells.push({ number: n++, type: t, bay, side: 'left' });
    }
    for (const t of stack) {
      if (n > total) break;
      cells.push({ number: n++, type: t, bay, side: 'right' });
    }
    if (n <= total) cells.push({ number: n++, type: 'SL', bay, side: 'side' });
    if (n <= total) cells.push({ number: n++, type: 'SU', bay, side: 'side' });
    if (bay > 40) break;
  }
  return cells;
}

/** Build a seat/berth map for a coach code. */
export function buildSeatLayout(code: string): CoachSeatLayout {
  const kind = classifyCoachCode(code);

  if (kind === 'sleeper') {
    return {
      code,
      kind,
      title: code,
      subtitle: 'Sleeper (SL) · 72 berths',
      total: 72,
      cells: buildTierCells(72, ['LB', 'MB', 'UB']),
      style: 'sleeper-bay',
    };
  }
  if (kind === '3a') {
    return {
      code,
      kind,
      title: code,
      subtitle: 'AC 3 Tier (3A) · 64 berths',
      total: 64,
      cells: buildTierCells(64, ['LB', 'MB', 'UB']),
      style: 'sleeper-bay',
    };
  }
  if (kind === '2a') {
    return {
      code,
      kind,
      title: code,
      subtitle: 'AC 2 Tier (2A) · 46 berths',
      total: 46,
      cells: buildTierCells(46, ['LB', 'UB']),
      style: 'sleeper-bay',
    };
  }
  if (kind === '1a') {
    const cells: SeatCell[] = [];
    for (let n = 1; n <= 18; n++) {
      const type = n % 2 === 1 ? 'LB' : 'UB';
      cells.push({
        number: n,
        type,
        bay: Math.ceil(n / 2),
        side: n % 4 <= 2 ? 'left' : 'right',
      });
    }
    return {
      code,
      kind,
      title: code,
      subtitle: 'AC First Class (1A) · cabins / coupes',
      total: 18,
      cells,
      style: 'cabin',
    };
  }
  if (kind === 'cc' || kind === 'ec') {
    const total = kind === 'ec' ? 56 : 78;
    const cells: SeatCell[] = [];
    for (let n = 1; n <= total; n++) {
      const col = ((n - 1) % 4) + 1;
      cells.push({
        number: n,
        type: 'Seat',
        bay: Math.ceil(n / 4),
        side: col <= 2 ? 'left' : 'right',
      });
    }
    return {
      code,
      kind,
      title: code,
      subtitle:
        kind === 'ec'
          ? 'Executive Chair Car · 56 seats'
          : 'Chair Car (CC) · 78 seats',
      total,
      cells,
      style: 'chair',
    };
  }

  return {
    code,
    kind,
    title: code,
    subtitle: `${KIND_LABEL[kind]} · no reserved seat map`,
    total: 0,
    cells: [],
    style: 'none',
  };
}

export function berthTypeLabel(code: string): string {
  const m: Record<string, string> = {
    LB: 'Lower',
    MB: 'Middle',
    UB: 'Upper',
    SL: 'Side Lower',
    SU: 'Side Upper',
  };
  return m[code] || code;
}
