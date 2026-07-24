import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MetroGateQrModal } from '../metro/MetroGateQrModal';
import { MetroStationPicker } from '../metro/MetroStationPicker';
import { useMetroJourney } from '../../hooks/useMetroJourney';
import {
  formatClockLabel,
  hasOfficialMetroQr,
  officialMetroQrPayload,
} from '../../metro';
import { MetroStation } from '../../metro/types';
import { Ticket } from '../../types/ticket';
import { useSecureScreen } from '../../hooks/useSecureScreen';

const Orange = '#FF6A00';
const Ink = '#141414';
const Muted = '#6B7280';
const Soft = '#F6F4F1';
const Card = '#FFFFFF';
const Line = '#ECEAE6';
const Green = '#159A4A';

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

/**
 * Simple metro boarding pass — route, live next stop, official gate QR.
 * Never invents an operator QR.
 */
export function MetroBoardingPass({ ticket, onBack, onMenu, embedded }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cardW = Math.min(width - 28, 400);
  const journey = useMetroJourney(ticket);
  const [gateOpen, setGateOpen] = useState(false);
  const [confirmPicker, setConfirmPicker] = useState(false);
  useSecureScreen(gateOpen);

  const from = ticket.boardingPoint || ticket.from || 'Origin';
  const to = ticket.droppingPoint || ticket.to || 'Destination';
  const networkName = ticket.bookingPlatform || 'Namma Metro';
  const hasOfficialQr = hasOfficialMetroQr(ticket);
  const officialQr = officialMetroQrPayload(ticket);
  const guide = journey.guide;
  const route = journey.route;
  const leg0 = route?.legs[0];
  const qrSize = Math.min(168, cardW * 0.42);

  const ticketId =
    ticket.bookingId ||
    ticket.pnr ||
    `M-${(ticket.id || '000000').slice(-6).toUpperCase()}`;

  const status = guide?.arrived
    ? { label: 'Arrived', color: Green }
    : journey.tracking
      ? { label: 'Live', color: Green }
      : { label: 'Ready', color: Orange };

  const highlightStops = useMemo(() => {
    const stops = guide?.progressStops || [];
    if (!stops.length) {
      return [
        { name: from, kind: 'from' as const },
        { name: to, kind: 'to' as const },
      ];
    }
    const current = stops.find((s) => s.status === 'current');
    const next = stops.find((s) => s.status === 'next');
    const dest = stops[stops.length - 1];
    const list: { name: string; kind: 'from' | 'now' | 'next' | 'to' }[] = [];
    if (current) list.push({ name: current.name, kind: 'now' });
    else list.push({ name: from, kind: 'from' });
    if (next && next.name !== list[0]?.name) {
      list.push({ name: next.name, kind: 'next' });
    }
    if (dest && !list.some((x) => x.name === dest.name)) {
      list.push({ name: dest.name, kind: 'to' });
    }
    return list.slice(0, 3);
  }, [guide?.progressStops, from, to]);

  const body = (
    <View style={[styles.card, { width: cardW }]}>
      <View style={styles.cardTop}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}>
            <MaterialCommunityIcons name="subway-variant" size={18} color={Orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.network}>{networkName}</Text>
            <Text style={styles.operator}>{ticket.operator || 'BMRCL'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: `${status.color}18` }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.routeBlock}>
          <Text style={styles.stationBig} numberOfLines={2}>
            {from}
          </Text>
          <View style={styles.routeMid}>
            <View style={styles.routeRail} />
            <View style={styles.routeDot} />
            <MaterialCommunityIcons name="subway" size={16} color={Orange} />
            <View style={styles.routeDot} />
            <View style={styles.routeRail} />
          </View>
          <Text style={styles.stationBig} numberOfLines={2}>
            {to}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {leg0 ? (
            <View style={[styles.metaChip, { backgroundColor: leg0.lineColor || '#7B2D8E' }]}>
              <Text style={styles.metaChipLight}>{leg0.lineName}</Text>
            </View>
          ) : null}
          {leg0?.towardName ? (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipDark} numberOfLines={1}>
                Towards {leg0.towardName}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaChip}>
            <Text style={styles.metaChipDark}>
              {route?.stopCount ?? '—'} stops · ~{journey.travelTimeLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.liveStrip}>
        {highlightStops.map((s, i) => (
          <View key={`${s.kind}-${s.name}`} style={styles.liveItem}>
            <Text
              style={[
                styles.liveKind,
                s.kind === 'now' && { color: Green },
                s.kind === 'to' && { color: Orange },
              ]}
            >
              {s.kind === 'now'
                ? 'NOW'
                : s.kind === 'next'
                  ? 'NEXT'
                  : s.kind === 'to'
                    ? 'TO'
                    : 'FROM'}
            </Text>
            <Text style={styles.liveName} numberOfLines={1}>
              {s.name}
            </Text>
            {i < highlightStops.length - 1 ? (
              <Ionicons
                name="chevron-forward"
                size={14}
                color="#C4C0B8"
                style={styles.liveChevron}
              />
            ) : null}
          </View>
        ))}
      </View>

      {guide?.confidenceLabel ? (
        <Text style={styles.hint}>{guide.confidenceLabel}</Text>
      ) : null}

      <View style={styles.qrBlock}>
        <Text style={styles.qrTitle}>Gate QR</Text>
        <Pressable
          onPress={() => hasOfficialQr && setGateOpen(true)}
          style={styles.qrFrame}
          disabled={!hasOfficialQr}
        >
          {officialQr ? (
            <QRCode
              value={officialQr}
              size={qrSize}
              backgroundColor="#fff"
              color="#111"
              ecl="M"
            />
          ) : (
            <View style={[styles.qrEmpty, { width: qrSize, height: qrSize }]}>
              <Ionicons name="qr-code-outline" size={42} color="#C9C5BE" />
              <Text style={styles.qrEmptyText}>Scan your metro ticket QR</Text>
            </View>
          )}
        </Pressable>
        <Text style={styles.qrCaption}>
          {hasOfficialQr ? 'Tap to open full screen at the gate' : 'Official QR not saved yet'}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.footLabel}>Ticket</Text>
          <Text style={styles.footValue} numberOfLines={1}>
            {ticketId}
          </Text>
        </View>
        <View style={styles.footDivider} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.footLabel}>Fare</Text>
          <Text style={styles.footValue}>{ticket.fare || '—'}</Text>
        </View>
        <View style={styles.footDivider} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.footLabel}>Valid</Text>
          <Text style={styles.footValue} numberOfLines={1}>
            {ticket.metroValidUntil ||
              guide?.estimatedArrivalLabel ||
              formatClockLabel(new Date())}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {journey.permission !== 'granted' ? (
          <Pressable
            style={styles.ghostBtn}
            onPress={() => void journey.requestPermission()}
          >
            <Ionicons name="locate-outline" size={16} color={Ink} />
            <Text style={styles.ghostText}>Enable GPS</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.ghostBtn}
            onPress={() => {
              journey.startJourneyClock();
              setConfirmPicker(true);
            }}
          >
            <Ionicons name="pin-outline" size={16} color={Ink} />
            <Text style={styles.ghostText}>Confirm station</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.primaryBtn, !hasOfficialQr && styles.primaryBtnDisabled]}
          onPress={() => setGateOpen(true)}
          disabled={!hasOfficialQr}
        >
          <Ionicons name="qr-code" size={18} color="#fff" />
          <Text style={styles.primaryText}>Show QR</Text>
        </Pressable>
      </View>
    </View>
  );

  if (embedded) {
    return (
      <View style={styles.embedded}>
        {body}
        <MetroGateQrModal
          visible={gateOpen}
          ticket={ticket}
          onClose={() => setGateOpen(false)}
        />
        <MetroStationPicker
          visible={confirmPicker}
          title="I am at this station"
          networkId={journey.networkId}
          onClose={() => setConfirmPicker(false)}
          onSelect={(station: MetroStation) => {
            journey.confirmStation(station.id);
            setConfirmPicker(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FF8A3D', Orange, '#E85A00']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.heroBar}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.heroBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.heroBrand}>
              Travel <Text style={{ fontWeight: '900' }}>ID</Text>
            </Text>
            <Text style={styles.heroSub}>Metro Pass</Text>
          </View>
          <Pressable onPress={onMenu} hitSlop={10} style={styles.heroBtn}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.heroCurve} />
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: 8,
          paddingBottom: 28 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>

      <MetroGateQrModal
        visible={gateOpen}
        ticket={ticket}
        onClose={() => setGateOpen(false)}
      />
      <MetroStationPicker
        visible={confirmPicker}
        title="I am at this station"
        networkId={journey.networkId}
        onClose={() => setConfirmPicker(false)}
        onSelect={(station: MetroStation) => {
          journey.confirmStation(station.id);
          setConfirmPicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Soft },
  embedded: { backgroundColor: Soft, borderRadius: 20, overflow: 'hidden' },
  hero: {
    paddingHorizontal: 14,
    paddingBottom: 28,
  },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBrand: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '800',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
    marginTop: 1,
    letterSpacing: 0.4,
  },
  heroCurve: {
    height: 18,
    marginHorizontal: -14,
    marginBottom: -28,
    marginTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Soft,
  },
  scroll: { flex: 1, marginTop: -4 },
  card: {
    backgroundColor: Card,
    borderRadius: 24,
    padding: 18,
    marginHorizontal: 6,
    shadowColor: '#1A1208',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardTop: { marginBottom: 14 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFF3E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  network: {
    color: Ink,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Outfit_700Bold',
  },
  operator: {
    color: Muted,
    fontSize: 12,
    marginTop: 1,
    fontFamily: 'DMSans_400Regular',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  routeBlock: { gap: 8, marginBottom: 14 },
  stationBig: {
    color: Ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    fontFamily: 'Outfit_700Bold',
  },
  routeMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  routeRail: {
    flex: 1,
    height: 2,
    backgroundColor: '#E8E2DA',
    borderRadius: 1,
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Orange,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    backgroundColor: Soft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  metaChipLight: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  metaChipDark: {
    color: Ink,
    fontSize: 12,
    fontWeight: '700',
  },
  liveStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Soft,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  liveItem: {
    flex: 1,
    paddingHorizontal: 4,
    position: 'relative',
  },
  liveKind: {
    color: Muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  liveName: {
    color: Ink,
    fontSize: 13,
    fontWeight: '700',
  },
  liveChevron: {
    position: 'absolute',
    right: -6,
    top: 14,
  },
  hint: {
    color: Muted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'DMSans_400Regular',
  },
  qrBlock: {
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Line,
    marginBottom: 14,
  },
  qrTitle: {
    color: Muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  qrFrame: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Line,
  },
  qrEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  qrEmptyText: {
    color: Muted,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  qrCaption: {
    marginTop: 10,
    color: Muted,
    fontSize: 12,
    fontFamily: 'DMSans_400Regular',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  footLabel: {
    color: Muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  footValue: {
    color: Ink,
    fontSize: 13,
    fontWeight: '800',
  },
  footDivider: {
    width: 1,
    height: 28,
    backgroundColor: Line,
    marginHorizontal: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  ghostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 16,
    backgroundColor: Soft,
    borderWidth: 1,
    borderColor: Line,
  },
  ghostText: {
    color: Ink,
    fontWeight: '700',
    fontSize: 13,
  },
  primaryBtn: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: Orange,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
