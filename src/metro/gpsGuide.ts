import { haversineKm } from '../utils/geo';
import { formatClockLabel, getMetroNetwork, getStation } from './router';
import {
  MetroLiveGuide,
  MetroNetworkId,
  MetroProgressStop,
  MetroRoutePlan,
  MetroTrackingMode,
} from './types';

const ON_ROUTE_RADIUS_M = 450;
const ARRIVE_RADIUS_M = 120;
const GOOD_GPS_ACCURACY_M = 80;

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return haversineKm(a, b) * 1000;
}

function stationName(
  networkId: MetroNetworkId,
  id: string | null | undefined
): string | null {
  if (!id) return null;
  const s = getStation(networkId, id);
  return s?.shortName || s?.name || id;
}

function buildProgressStops(
  route: MetroRoutePlan,
  progressIndex: number,
  networkId: MetroNetworkId
): MetroProgressStop[] {
  return route.stationIds.map((id, i) => {
    let status: MetroProgressStop['status'] = 'upcoming';
    if (progressIndex < 0) {
      status = i === 0 ? 'next' : 'upcoming';
    } else if (i < progressIndex) status = 'completed';
    else if (i === progressIndex) status = 'current';
    else if (i === progressIndex + 1) status = 'next';
    return {
      stationId: id,
      name: stationName(networkId, id) || id,
      status,
    };
  });
}

function findCurrentLeg(route: MetroRoutePlan, progressIndex: number) {
  if (progressIndex < 0) return { leg: route.legs[0] || null, legIndex: 0 };
  for (let li = 0; li < route.legs.length; li++) {
    const leg = route.legs[li];
    const fromIdx = route.stationIds.indexOf(leg.fromStationId);
    const toIdx = route.stationIds.indexOf(leg.toStationId);
    if (progressIndex >= fromIdx && progressIndex <= toIdx) {
      return { leg, legIndex: li };
    }
  }
  return { leg: route.legs[0] || null, legIndex: 0 };
}

export type MetroGuideOptions = {
  /** User tapped "I am at this station" */
  confirmedStationId?: string | null;
  /** GPS accuracy in meters when known */
  gpsAccuracyM?: number | null;
  /** Journey start timestamp for elapsed-time estimation */
  journeyStartedAt?: number | null;
};

/**
 * Snap GPS / confirmation / elapsed time to the planned route.
 * Labels confidence honestly — underground GPS is never "live verified".
 */
export function buildMetroLiveGuide(
  route: MetroRoutePlan,
  coords: { lat: number; lng: number } | null,
  networkId: MetroNetworkId = route.networkId,
  options: MetroGuideOptions = {}
): MetroLiveGuide {
  const network = getMetroNetwork(networkId);
  const dest = getStation(networkId, route.toStationId);
  const firstLeg = route.legs[0];

  const baseGuidance = firstLeg
    ? `${firstLeg.instruction}${
        route.interchangeStationIds[0]
          ? ` · change at ${stationName(networkId, route.interchangeStationIds[0])}`
          : ''
      }`
    : 'Select stations to plan your route';

  let progressIndex = -1;
  let confirmedByUser = false;
  let trackingMode: MetroTrackingMode = 'offline_estimated';
  let confidencePercent = 35;
  let onRoute = false;
  let nearestId: string | null = null;
  let bestDist: number | null = null;

  // 1) Manual confirmation wins
  if (options.confirmedStationId) {
    const idx = route.stationIds.indexOf(options.confirmedStationId);
    if (idx >= 0) {
      progressIndex = idx;
      confirmedByUser = true;
      onRoute = true;
      nearestId = options.confirmedStationId;
      confidencePercent = 96;
      trackingMode = 'assisted';
    }
  }

  // 2) GPS snap when accuracy is acceptable
  if (
    progressIndex < 0 &&
    coords &&
    route.stationIds.length &&
    (options.gpsAccuracyM == null ||
      options.gpsAccuracyM <= GOOD_GPS_ACCURACY_M * 2)
  ) {
    let bestIdx = 0;
    let dist = Infinity;
    for (let i = 0; i < route.stationIds.length; i++) {
      const st = network.stations[route.stationIds[i]];
      if (!st) continue;
      const d = metersBetween(coords, { lat: st.lat, lng: st.lng });
      if (d < dist) {
        dist = d;
        bestIdx = i;
      }
    }
    nearestId = route.stationIds[bestIdx];
    bestDist = Math.round(dist);
    if (dist <= ON_ROUTE_RADIUS_M) {
      progressIndex = bestIdx;
      onRoute = true;
      trackingMode = 'assisted';
      const acc = options.gpsAccuracyM ?? dist;
      confidencePercent = Math.max(
        45,
        Math.min(88, Math.round(90 - acc / 8 - dist / 20))
      );
    } else {
      confidencePercent = 28;
      trackingMode = 'offline_estimated';
    }
  }

  // 3) Elapsed-time estimate when still unknown (underground)
  if (
    progressIndex < 0 &&
    options.journeyStartedAt &&
    route.stopCount > 0
  ) {
    const elapsedMin = (Date.now() - options.journeyStartedAt) / 60000;
    const avg = route.estimatedMinutes / route.stopCount;
    const inferred = Math.min(
      route.stopCount,
      Math.max(0, Math.floor(elapsedMin / Math.max(avg, 1.5)))
    );
    progressIndex = inferred;
    onRoute = inferred > 0;
    nearestId = route.stationIds[inferred] || nearestId;
    confidencePercent = Math.min(62, 30 + inferred * 3);
    trackingMode = 'offline_estimated';
  }

  const arrived =
    (Boolean(dest) &&
      coords &&
      metersBetween(coords, { lat: dest!.lat, lng: dest!.lng }) <=
        ARRIVE_RADIUS_M) ||
    (progressIndex >= 0 &&
      progressIndex >= route.stationIds.length - 1);

  const { leg: currentLeg, legIndex } = findCurrentLeg(route, progressIndex);
  const nextIxId =
    legIndex + 1 < route.legs.length
      ? route.legs[legIndex + 1].fromStationId
      : progressIndex < 0
        ? route.interchangeStationIds[0] || null
        : null;
  const nextIxLeg =
    legIndex + 1 < route.legs.length ? route.legs[legIndex + 1] : null;

  const nextIdx =
    progressIndex >= 0
      ? Math.min(progressIndex + 1, route.stationIds.length - 1)
      : 1;
  const nextId =
    progressIndex >= route.stationIds.length - 1
      ? null
      : route.stationIds[Math.max(nextIdx, 0)] || null;

  const stationsRemaining =
    progressIndex < 0
      ? route.stopCount
      : Math.max(0, route.stationIds.length - 1 - progressIndex);

  const progressPercent =
    route.stopCount <= 0
      ? 100
      : Math.round(
          (Math.max(0, progressIndex) / route.stopCount) * 100
        );

  const remainingMinutes = Math.max(
    0,
    Math.round(
      stationsRemaining * 2.2 +
        (nextIxId &&
        progressIndex >= 0 &&
        route.stationIds.indexOf(nextIxId) > progressIndex
          ? 4
          : 0)
    )
  );
  const estimatedArrivalLabel =
    arrived || remainingMinutes <= 0
      ? null
      : formatClockLabel(new Date(Date.now() + remainingMinutes * 60000));

  let guidance: string;
  if (arrived) {
    guidance = `Arrived · ${stationName(networkId, route.toStationId)}`;
  } else if (progressIndex < 0) {
    guidance = baseGuidance;
  } else if (
    nextIxId &&
    route.stationIds.indexOf(nextIxId) === progressIndex
  ) {
    guidance = `Change here → ${nextIxLeg?.lineName || 'next line'} toward ${
      nextIxLeg?.towardName || ''
    }`.trim();
  } else if (nextIxId && progressIndex >= 0) {
    const stopsToIx = route.stationIds.indexOf(nextIxId) - progressIndex;
    if (stopsToIx > 0 && stopsToIx <= 3) {
      guidance = `In ${stopsToIx} stop${stopsToIx === 1 ? '' : 's'} change at ${stationName(
        networkId,
        nextIxId
      )} → ${nextIxLeg?.lineName}`;
    } else {
      guidance = `Next: ${stationName(networkId, nextId)} · ${
        currentLeg?.lineName || 'metro'
      } toward ${currentLeg?.towardName || ''}`.trim();
    }
  } else {
    guidance = `Next: ${stationName(networkId, nextId)} · ${
      currentLeg?.lineName || 'metro'
    } toward ${currentLeg?.towardName || ''}`.trim();
  }

  const confidenceLabel = confirmedByUser
    ? 'Confirmed by you'
    : trackingMode === 'assisted'
      ? `Estimated · ${confidencePercent}% confidence`
      : `Offline estimated · ${confidencePercent}% confidence`;

  return {
    nearestStationId: nearestId,
    nearestStationName: stationName(networkId, nearestId),
    distanceToNearestM: bestDist,
    progressIndex,
    nextStationId: nextId,
    nextStationName: stationName(networkId, nextId),
    currentLineId: currentLeg?.lineId || null,
    currentLineName: currentLeg?.lineName || null,
    currentLineColor: currentLeg?.lineColor || null,
    currentTowardName: currentLeg?.towardName || null,
    nextInterchangeId: nextIxId,
    nextInterchangeName: stationName(networkId, nextIxId),
    nextInterchangeLineName: nextIxLeg?.lineName || null,
    nextInterchangeTowardName: nextIxLeg?.towardName || null,
    stationsRemaining,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
    estimatedArrivalLabel,
    arrived,
    onRoute,
    guidance,
    trackingMode,
    confidencePercent,
    confidenceLabel,
    progressStops: buildProgressStops(route, progressIndex, networkId),
    confirmedByUser,
  };
}
