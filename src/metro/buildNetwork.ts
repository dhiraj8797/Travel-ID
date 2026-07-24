import { MetroLine, MetroNetwork, MetroNetworkId, MetroStation } from './types';

/** Compact stop: id, name, lat, lng, optional shortName */
export type StopDef =
  | [string, string, number, number]
  | [string, string, number, number, string];

export type LineDef = {
  id: string;
  name: string;
  color: string;
  stops: StopDef[];
};

export function buildMetroNetwork(
  meta: {
    id: MetroNetworkId;
    name: string;
    city: string;
    operator: string;
  },
  lineDefs: LineDef[]
): MetroNetwork {
  const stations: Record<string, MetroStation> = {};
  const lines: MetroLine[] = [];

  for (const line of lineDefs) {
    const ids: string[] = [];
    for (const stop of line.stops) {
      const [id, name, lat, lng, shortName] = stop;
      ids.push(id);
      const existing = stations[id];
      if (existing) {
        if (!existing.lines.includes(line.id)) {
          existing.lines = [...existing.lines, line.id];
        }
      } else {
        stations[id] = {
          id,
          name,
          shortName: shortName || name,
          lat,
          lng,
          lines: [line.id],
        };
      }
    }
    lines.push({
      id: line.id,
      name: line.name,
      color: line.color,
      stations: ids,
    });
  }

  return { ...meta, lines, stations };
}

export function sortedStationList(network: MetroNetwork): MetroStation[] {
  return Object.values(network.stations).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}
