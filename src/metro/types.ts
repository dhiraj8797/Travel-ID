export type MetroNetworkId =
  | 'blr'
  | 'del'
  | 'bom'
  | 'hyd'
  | 'maa'
  | 'ccu'
  | 'pnq'
  | 'amd'
  | 'cok'
  | 'lko'
  | 'jai'
  | 'nag';

/** Line id is free-form per city (blue, aqua, line1, …). */
export type MetroLineId = string;

export type MetroStation = {
  id: string;
  name: string;
  /** Short label for pass UI */
  shortName?: string;
  lat: number;
  lng: number;
  lines: MetroLineId[];
};

export type MetroLine = {
  id: MetroLineId;
  name: string;
  color: string;
  /** Ordered station ids terminus → terminus */
  stations: string[];
};

export type MetroNetwork = {
  id: MetroNetworkId;
  name: string;
  city: string;
  operator: string;
  lines: MetroLine[];
  stations: Record<string, MetroStation>;
};

export type MetroRouteLeg = {
  lineId: MetroLineId;
  lineName: string;
  lineColor: string;
  fromStationId: string;
  toStationId: string;
  stationIds: string[];
  /** Terminus name the train is headed toward, e.g. "Challaghatta" */
  towardName: string;
  instruction: string;
};

export type MetroRoutePlan = {
  networkId: MetroNetworkId;
  fromStationId: string;
  toStationId: string;
  /** Full path including interchange stations once */
  stationIds: string[];
  legs: MetroRouteLeg[];
  interchangeStationIds: string[];
  stopCount: number;
  estimatedMinutes: number;
  /** Human summary lines for offline instructions */
  instructions: string[];
};

export type MetroTrackingMode = 'accurate' | 'assisted' | 'offline_estimated';

export type MetroProgressStop = {
  stationId: string;
  name: string;
  status: 'completed' | 'current' | 'next' | 'upcoming';
};

export type MetroLiveGuide = {
  nearestStationId: string | null;
  nearestStationName: string | null;
  distanceToNearestM: number | null;
  /** Index into route.stationIds for progress (−1 before boarding) */
  progressIndex: number;
  nextStationId: string | null;
  nextStationName: string | null;
  currentLineId: MetroLineId | null;
  currentLineName: string | null;
  currentLineColor: string | null;
  currentTowardName: string | null;
  /** Upcoming interchange on this trip, if any */
  nextInterchangeId: string | null;
  nextInterchangeName: string | null;
  nextInterchangeLineName: string | null;
  nextInterchangeTowardName: string | null;
  stationsRemaining: number;
  progressPercent: number;
  estimatedArrivalLabel: string | null;
  arrived: boolean;
  onRoute: boolean;
  guidance: string;
  trackingMode: MetroTrackingMode;
  /** 0–100; be honest when GPS is weak / underground */
  confidencePercent: number;
  confidenceLabel: string;
  progressStops: MetroProgressStop[];
  confirmedByUser: boolean;
};
