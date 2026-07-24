import { CITY_METROS, getCityMetro } from './cities';
import {
  MetroLineId,
  MetroNetwork,
  MetroNetworkId,
  MetroRouteLeg,
  MetroRoutePlan,
  MetroStation,
} from './types';

export function getMetroNetwork(id: MetroNetworkId = 'blr'): MetroNetwork {
  return getCityMetro(id) || CITY_METROS.blr;
}

export function listMetroNetworks(): MetroNetwork[] {
  return Object.values(CITY_METROS);
}

export function getStation(
  networkId: MetroNetworkId,
  stationId: string
): MetroStation | undefined {
  return getMetroNetwork(networkId).stations[stationId];
}

export function findStationByName(
  networkId: MetroNetworkId,
  name: string
): MetroStation | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  const stations = Object.values(getMetroNetwork(networkId).stations);
  return (
    stations.find((s) => s.id === q) ||
    stations.find((s) => s.name.toLowerCase() === q) ||
    stations.find((s) => s.shortName?.toLowerCase() === q) ||
    stations.find(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.shortName?.toLowerCase().includes(q)
    )
  );
}

type Edge = { to: string; lineId: MetroLineId };

function buildAdjacency(network: MetroNetwork): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>();
  const push = (from: string, to: string, lineId: MetroLineId) => {
    const list = adj.get(from) || [];
    if (!list.some((e) => e.to === to && e.lineId === lineId)) {
      list.push({ to, lineId });
      adj.set(from, list);
    }
  };
  for (const line of network.lines) {
    for (let i = 0; i < line.stations.length - 1; i++) {
      const a = line.stations[i];
      const b = line.stations[i + 1];
      push(a, b, line.id);
      push(b, a, line.id);
    }
  }
  return adj;
}

const adjCache = new Map<MetroNetworkId, Map<string, Edge[]>>();

function adjacency(network: MetroNetwork): Map<string, Edge[]> {
  let hit = adjCache.get(network.id);
  if (!hit) {
    hit = buildAdjacency(network);
    adjCache.set(network.id, hit);
  }
  return hit;
}

/**
 * Shortest path by stop count (offline). Line changes are derived when
 * splitting the path into legs.
 */
export function planMetroRoute(
  fromStationId: string,
  toStationId: string,
  networkId: MetroNetworkId = 'blr'
): MetroRoutePlan | null {
  const network = getMetroNetwork(networkId);
  if (!network.stations[fromStationId] || !network.stations[toStationId]) {
    return null;
  }
  if (fromStationId === toStationId) {
    return {
      networkId,
      fromStationId,
      toStationId,
      stationIds: [fromStationId],
      legs: [],
      interchangeStationIds: [],
      stopCount: 0,
      estimatedMinutes: 0,
      instructions: ['You are already at your destination station.'],
    };
  }

  const adj = adjacency(network);
  const prev = new Map<string, { from: string; lineId: MetroLineId }>();
  const queue = [fromStationId];
  const seen = new Set<string>([fromStationId]);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === toStationId) break;
    for (const edge of adj.get(cur) || []) {
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      prev.set(edge.to, { from: cur, lineId: edge.lineId });
      queue.push(edge.to);
    }
  }

  if (!prev.has(toStationId) && fromStationId !== toStationId) return null;

  const stationIds: string[] = [toStationId];
  const edgeLines: MetroLineId[] = [];
  let walk = toStationId;
  while (walk !== fromStationId) {
    const step = prev.get(walk);
    if (!step) return null;
    edgeLines.push(step.lineId);
    walk = step.from;
    stationIds.push(walk);
  }
  stationIds.reverse();
  edgeLines.reverse();

  const legs: MetroRouteLeg[] = [];
  if (edgeLines.length) {
    let legStart = 0;
    let legLine = edgeLines[0];
    for (let i = 1; i <= edgeLines.length; i++) {
      if (i === edgeLines.length || edgeLines[i] !== legLine) {
        const ids = stationIds.slice(legStart, i + 1);
        legs.push(makeLeg(network, legLine, ids));
        if (i < edgeLines.length) {
          legStart = i;
          legLine = edgeLines[i];
        }
      }
    }
  }

  const interchangeStationIds: string[] = [];
  for (let i = 1; i < legs.length; i++) {
    interchangeStationIds.push(legs[i].fromStationId);
  }

  const stopCount = Math.max(0, stationIds.length - 1);
  const estimatedMinutes = Math.max(
    3,
    Math.round(stopCount * 2.2 + interchangeStationIds.length * 4)
  );

  const instructions = buildInstructions(network, legs, toStationId);

  return {
    networkId,
    fromStationId,
    toStationId,
    stationIds,
    legs,
    interchangeStationIds,
    stopCount,
    estimatedMinutes,
    instructions,
  };
}

function towardNameForLeg(
  network: MetroNetwork,
  lineId: MetroLineId,
  stationIds: string[]
): string {
  const line = network.lines.find((l) => l.id === lineId);
  if (!line || stationIds.length < 2) {
    const end = network.stations[stationIds[stationIds.length - 1]];
    return end?.shortName || end?.name || 'terminus';
  }
  const a = line.stations.indexOf(stationIds[0]);
  const b = line.stations.indexOf(stationIds[1]);
  const forward = a >= 0 && b >= 0 ? b > a : true;
  const terminusId = forward
    ? line.stations[line.stations.length - 1]
    : line.stations[0];
  const terminus = network.stations[terminusId];
  return terminus?.shortName || terminus?.name || terminusId;
}

function makeLeg(
  network: MetroNetwork,
  lineId: MetroLineId,
  stationIds: string[]
): MetroRouteLeg {
  const line = network.lines.find((l) => l.id === lineId);
  const towardName = towardNameForLeg(network, lineId, stationIds);
  const lineName = line?.name || lineId;
  return {
    lineId,
    lineName,
    lineColor: line?.color || '#666',
    fromStationId: stationIds[0],
    toStationId: stationIds[stationIds.length - 1],
    stationIds,
    towardName,
    instruction: `Take ${lineName} toward ${towardName}`,
  };
}

function buildInstructions(
  network: MetroNetwork,
  legs: MetroRouteLeg[],
  toStationId: string
): string[] {
  const dest = network.stations[toStationId];
  const destName = dest?.shortName || dest?.name || toStationId;
  const lines: string[] = [];
  legs.forEach((leg, i) => {
    lines.push(leg.instruction);
    if (i < legs.length - 1) {
      const ix = network.stations[legs[i + 1].fromStationId];
      lines.push(
        `Change at ${ix?.shortName || ix?.name || legs[i + 1].fromStationId}`
      );
    }
  });
  if (legs.length) {
    lines.push(`Get down at ${destName}`);
  }
  return lines;
}

export function formatTravelTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClockLabel(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
