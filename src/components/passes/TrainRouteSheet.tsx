import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Polyline } from 'react-native-svg';
import {
  fetchTrainRouteGeometry,
  TrainDetailHalt,
  TrainDetails,
  TrainRouteGeometry,
} from '../../services/railRadar';

const Navy = '#07132D';
const Orange = '#FF6500';
const Green = '#1FC77A';

type Props = {
  visible: boolean;
  onClose: () => void;
  trainNumber?: string;
  details?: TrainDetails | null;
  fromCode?: string;
  toCode?: string;
  currentStationCode?: string;
};

export function TrainRouteSheet({
  visible,
  onClose,
  trainNumber,
  details,
  fromCode,
  toCode,
  currentStationCode,
}: Props) {
  const [geometry, setGeometry] = useState<TrainRouteGeometry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!visible || !trainNumber) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(undefined);
      try {
        const next = await fetchTrainRouteGeometry(trainNumber);
        if (!cancelled) setGeometry(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load route');
          setGeometry(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trainNumber]);

  const map = useMemo(
    () =>
      buildRouteMap(geometry?.coordinates || [], details?.halts || [], {
        fromCode,
        toCode,
        currentStationCode,
      }),
    [geometry, details, fromCode, toCode, currentStationCode]
  );

  const halts = details?.halts?.filter((h) => h.isHalt) || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="map-outline" size={20} color={Orange} />
              <Text style={styles.title}>Train route</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Navy} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {details?.trainNumber || trainNumber || '—'}
            {details?.trainName ? ` · ${details.trainName}` : ''}
          </Text>
          {!!details && (
            <Text style={styles.meta}>
              {details.sourceCode || '—'} → {details.destinationCode || '—'}
              {details.distanceKm ? ` · ${Math.round(details.distanceKm)} km` : ''}
              {details.totalHalts ? ` · ${details.totalHalts} halts` : ''}
            </Text>
          )}

          <View style={styles.mapBox}>
            {loading && !geometry ? (
              <ActivityIndicator color={Orange} />
            ) : error && !geometry ? (
              <Text style={styles.error}>{error}</Text>
            ) : map ? (
              <Svg width="100%" height="180" viewBox={`0 0 ${map.width} ${map.height}`}>
                <Polyline
                  points={map.points}
                  fill="none"
                  stroke={Orange}
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {map.markers.map((m) => (
                  <Circle
                    key={m.key}
                    cx={m.x}
                    cy={m.y}
                    r={m.r}
                    fill={m.fill}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                ))}
              </Svg>
            ) : (
              <Text style={styles.error}>No geometry</Text>
            )}
          </View>

          <View style={styles.legend}>
            <LegendDot color={Green} label="You board" />
            <LegendDot color={Orange} label="Live / now" />
            <LegendDot color={Navy} label="You alight" />
          </View>

          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            {halts.map((h) => {
              const code = h.stationCode.toUpperCase();
              const mine =
                code === (fromCode || '').toUpperCase() ||
                code === (toCode || '').toUpperCase();
              const here = code === (currentStationCode || '').toUpperCase();
              return (
                <View
                  key={`${h.sequence}-${h.stationCode}`}
                  style={[styles.haltRow, (mine || here) && styles.haltRowHi]}
                >
                  <Text style={styles.haltSeq}>{h.sequence}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.haltName} numberOfLines={1}>
                      {h.stationName}
                    </Text>
                    <Text style={styles.haltCode}>
                      {h.stationCode}
                      {h.platform ? ` · PF ${h.platform}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.haltTime}>
                    {h.departure || h.arrival || '—'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function buildRouteMap(
  coordinates: Array<[number, number]>,
  halts: TrainDetailHalt[],
  codes: { fromCode?: string; toCode?: string; currentStationCode?: string }
) {
  if (!coordinates.length) return null;
  const width = 320;
  const height = 180;
  const pad = 14;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const [lat, lng] of coordinates) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  }
  const dLat = Math.max(maxLat - minLat, 0.01);
  const dLng = Math.max(maxLng - minLng, 0.01);

  const project = (lat: number, lng: number) => {
    const x = pad + ((lng - minLng) / dLng) * (width - pad * 2);
    const y = pad + ((maxLat - lat) / dLat) * (height - pad * 2);
    return { x, y };
  };

  // Downsample for SVG performance
  const step = Math.max(1, Math.floor(coordinates.length / 180));
  const pts: string[] = [];
  for (let i = 0; i < coordinates.length; i += step) {
    const [lat, lng] = coordinates[i];
    const p = project(lat, lng);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  const last = coordinates[coordinates.length - 1];
  const lastP = project(last[0], last[1]);
  pts.push(`${lastP.x.toFixed(1)},${lastP.y.toFixed(1)}`);

  const markers: Array<{ key: string; x: number; y: number; r: number; fill: string }> = [];
  const pushHalt = (code: string | undefined, fill: string, r: number) => {
    if (!code) return;
    const halt = halts.find((h) => h.stationCode.toUpperCase() === code.toUpperCase());
    if (!halt || halt.lat == null || halt.lng == null) return;
    const p = project(halt.lat, halt.lng);
    markers.push({ key: `${code}-${fill}`, x: p.x, y: p.y, r, fill });
  };
  pushHalt(codes.fromCode, Green, 5.5);
  pushHalt(codes.currentStationCode, Orange, 6);
  pushHalt(codes.toCode, Navy, 5.5);

  return { width, height, points: pts.join(' '), markers };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D0D5DD',
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: Navy },
  subtitle: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: Navy, marginTop: 6 },
  meta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#667085',
    marginTop: 2,
    marginBottom: 10,
  },
  mapBox: {
    height: 180,
    borderRadius: 16,
    backgroundColor: '#F3F6FB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'DMSans_500Medium', fontSize: 10, color: '#667085' },
  haltRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6E9F0',
  },
  haltRowHi: { backgroundColor: 'rgba(255,104,0,0.08)', borderRadius: 8, paddingHorizontal: 4 },
  haltSeq: {
    width: 28,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: '#98A2B3',
  },
  haltName: { fontFamily: 'Outfit_700Bold', fontSize: 12, color: Navy },
  haltCode: { fontFamily: 'DMSans_500Medium', fontSize: 10, color: '#667085' },
  haltTime: { fontFamily: 'Outfit_700Bold', fontSize: 12, color: Orange },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: Orange,
    textAlign: 'center',
    padding: 16,
  },
});
