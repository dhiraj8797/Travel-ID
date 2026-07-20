import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket } from '../../types/ticket';
import { buildQrPayload, cityName } from '../../utils/ticketFormat';
import { getPassPhase } from '../../utils/passTime';
import { colors, radii } from '../../theme';

type Props = {
  ticket: Ticket;
  onPress?: () => void;
};

export function RecentPassCard({ ticket, onPress }: Props) {
  const isBus = ticket.kind === 'bus';
  const isFlight = ticket.kind === 'flight';
  const accent = isBus ? colors.orange : isFlight ? colors.purple : colors.blue;
  const pnr = ticket.pnr || ticket.bookingId || '—';
  const qr = ticket.originalQrValue?.trim() || buildQrPayload(ticket);
  const phase = getPassPhase(ticket);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.94 }}>
      <LinearGradient
        colors={[accent, '#111C31']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.card}
      >
        <View style={styles.rail}>
          <MaterialCommunityIcons
            name={isBus ? 'bus' : isFlight ? 'airplane' : 'train'}
            size={34}
            color="#fff"
          />
          <Text style={styles.type}>{isBus ? 'BUS' : isFlight ? 'FLIGHT' : 'TRAIN'}</Text>
          {phase === 'ongoing' ? (
            <View style={styles.phasePill}>
              <Text style={styles.phaseText}>ONGOING</Text>
            </View>
          ) : phase === 'past' ? (
            <View style={[styles.phasePill, styles.phasePast]}>
              <Text style={styles.phaseText}>PAST</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.operator} numberOfLines={1}>
            {ticket.operator}
          </Text>
          <View style={styles.routeRow}>
            <Text style={styles.city}>{cityName(ticket.fromCode || ticket.from)}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" style={{ marginHorizontal: 8 }} />
            <Text style={styles.city}>{cityName(ticket.toCode || ticket.to)}</Text>
          </View>
          <Text style={styles.meta}>
            {ticket.departureDate} · {ticket.departureTime}
            {ticket.arrivalTime ? ` → ${ticket.arrivalTime}` : ''}
          </Text>
          <Text style={styles.pnr}>PNR: {pnr}</Text>
        </View>

        <View style={styles.qrBox}>
          <QRCode value={qr} size={56} backgroundColor="#fff" color="#111" ecl="M" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    height: 150,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  rail: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    gap: 6,
  },
  type: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 13,
  },
  phasePill: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,230,118,0.28)',
  },
  phasePast: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  phaseText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 8,
    color: '#fff',
    letterSpacing: 0.4,
  },
  body: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  operator: {
    fontFamily: 'DMSans_700Bold',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginBottom: 4,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  city: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 16,
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  pnr: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 11,
    marginTop: 8,
  },
  qrBox: {
    margin: 14,
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
