import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket } from '../../types/ticket';
import { hasOfficialMetroQr } from '../../metro';
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
  const isHotel = ticket.kind === 'hotel';
  const isMetro = ticket.kind === 'metro';
  const accent = isHotel
    ? colors.hotel
    : isMetro
      ? colors.metro
      : isBus
        ? colors.orange
        : isFlight
          ? colors.purple
          : colors.blue;
  const pnr = ticket.pnr || ticket.bookingId || '—';
  const qr = ticket.originalQrValue?.trim() || buildQrPayload(ticket);
  const phase = getPassPhase(ticket);
  const typeLabel = isHotel
    ? 'HOTEL'
    : isMetro
      ? 'METRO'
      : isBus
        ? 'BUS'
        : isFlight
          ? 'FLIGHT'
          : 'TRAIN';
  const left =
    isHotel
      ? cityName(ticket.from)
      : cityName(ticket.fromCode || ticket.from);
  const right = isHotel
    ? ticket.hotelName || ticket.to || ticket.operator
    : cityName(ticket.toCode || ticket.to);

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
            name={
              isHotel
                ? 'office-building'
                : isMetro
                  ? 'subway-variant'
                  : isBus
                    ? 'bus'
                    : isFlight
                      ? 'airplane'
                      : 'train'
            }
            size={34}
            color="#fff"
          />
          <Text style={styles.type}>{typeLabel}</Text>
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
            {isHotel
              ? ticket.hotelName || ticket.operator
              : isMetro
                ? ticket.bookingPlatform || ticket.operator
                : ticket.operator}
          </Text>
          <View style={styles.routeRow}>
            <Text style={styles.city} numberOfLines={1}>
              {left}
            </Text>
            <Ionicons
              name={isHotel ? 'bed-outline' : 'arrow-forward'}
              size={14}
              color="#fff"
              style={{ marginHorizontal: 8 }}
            />
            <Text style={styles.city} numberOfLines={1}>
              {right}
            </Text>
          </View>
          <Text style={styles.meta}>
            {isHotel ? 'In ' : ''}
            {ticket.departureDate} · {ticket.departureTime}
            {ticket.arrivalTime
              ? isHotel
                ? ` → out ${ticket.arrivalTime}`
                : ` → ${ticket.arrivalTime}`
              : ''}
          </Text>
          <Text style={styles.pnr}>
            {isHotel
              ? 'CONF'
              : isMetro
                ? hasOfficialMetroQr(ticket)
                  ? 'GATE QR'
                  : 'GUIDE'
                : 'PNR'}
            : {pnr}
          </Text>
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
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rail: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  type: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    color: '#fff',
    letterSpacing: 0.8,
  },
  phasePill: {
    marginTop: 4,
    backgroundColor: 'rgba(31,199,122,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  phasePast: { backgroundColor: 'rgba(174,187,208,0.35)' },
  phaseText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 8,
    color: '#fff',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
    paddingRight: 8,
  },
  operator: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  city: {
    flexShrink: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  meta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 4,
  },
  pnr: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
  },
  qrBox: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
