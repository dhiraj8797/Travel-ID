import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BoardingLiveTimes, LiveTrainStatus } from '../../services/railRadar';

const Navy = '#07132D';
const Orange = '#FF6500';
const Green = '#1FC77A';

type Props = {
  visible: boolean;
  onClose: () => void;
  onRefresh: () => void;
  loading?: boolean;
  live?: LiveTrainStatus;
  times?: BoardingLiveTimes;
  pnr?: string;
  fromCode?: string;
  toCode?: string;
  error?: string;
};

export function LiveTrainSheet({
  visible,
  onClose,
  onRefresh,
  loading,
  live,
  times,
  pnr,
  fromCode,
  toCode,
  error,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.liveDot} />
              <Text style={styles.title}>Live train status</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Navy} />
            </Pressable>
          </View>

          {loading && !live ? (
            <ActivityIndicator color={Orange} style={{ marginVertical: 24 }} />
          ) : error && !live ? (
            <Text style={styles.error}>{error}</Text>
          ) : live ? (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.train}>
                {live.trainNumber}
                {live.trainName ? ` · ${live.trainName}` : ''}
              </Text>
              <Text style={styles.meta}>
                PNR {pnr || '—'} · {fromCode || '—'} → {toCode || '—'}
              </Text>

              <View style={styles.grid}>
                <Stat label="STATUS" value={live.status.toUpperCase()} />
                <Stat
                  label="DELAY"
                  value={
                    live.delayMinutes <= 0 ? 'On time' : `${live.delayMinutes} min`
                  }
                />
                <Stat label="LIVE" value={live.isLive ? 'Yes' : 'No'} />
                <Stat
                  label="SPEED"
                  value="GPS on live screen"
                />
              </View>

              <Row label="Location" value={live.locationLabel || '—'} />
              <Row
                label="Next halt"
                value={
                  live.nextHaltName
                    ? `${live.nextHaltName}${live.nextHaltCode ? ` (${live.nextHaltCode})` : ''}`
                    : '—'
                }
              />
              <Row
                label="Your dep"
                value={
                  times?.expectedDeparture
                    ? `${times.expectedDeparture}${times.fromPlatform ? ` · PF ${times.fromPlatform}` : ''}`
                    : '—'
                }
              />
              <Row
                label="Your arr"
                value={
                  times?.expectedArrival
                    ? `${times.expectedArrival}${times.toPlatform ? ` · PF ${times.toPlatform}` : ''}`
                    : '—'
                }
              />
              <Row label="Started" value={live.startDate || '—'} />
              {!!live.lastUpdatedAt && (
                <Row
                  label="Updated"
                  value={new Date(live.lastUpdatedAt).toLocaleString('en-IN')}
                />
              )}
            </ScrollView>
          ) : (
            <Text style={styles.error}>No live data yet</Text>
          )}

          <Pressable style={styles.refreshBtn} onPress={onRefresh}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.refreshText}>Refresh live status</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
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
    marginBottom: 10,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Green,
  },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 17, color: Navy },
  train: { fontFamily: 'Outfit_700Bold', fontSize: 15, color: Navy },
  meta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#667085',
    marginTop: 2,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  stat: {
    width: '47%',
    backgroundColor: '#F5F7FB',
    borderRadius: 12,
    padding: 10,
  },
  statLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 9,
    color: '#667085',
    letterSpacing: 0.4,
  },
  statValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: Navy,
    marginTop: 3,
  },
  row: { marginBottom: 8 },
  rowLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11, color: '#667085' },
  rowValue: { fontFamily: 'Outfit_700Bold', fontSize: 13, color: Navy, marginTop: 1 },
  error: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: Orange,
    marginVertical: 18,
    textAlign: 'center',
  },
  refreshBtn: {
    marginTop: 12,
    backgroundColor: Navy,
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  refreshText: { fontFamily: 'Outfit_700Bold', fontSize: 14, color: '#fff' },
});
