import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { Ticket } from '../../types/ticket';
import {
  buildQrPayload,
  cityName,
  formatPassengerLine,
  railSeatStatus,
} from '../../utils/ticketFormat';
import { colors, radii } from '../../theme';

type Props = { ticket: Ticket };

export function ComposeStylePass({ ticket }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 36, 420);
  const isBus = ticket.kind === 'bus';
  const isFlight = ticket.kind === 'flight';
  const accent = isBus ? colors.orange : isFlight ? colors.purple : colors.blue;
  const pnr = ticket.pnr || ticket.bookingId || '—';
  const qr = ticket.originalQrValue?.trim() || buildQrPayload(ticket);
  const duration = ticket.travelTime || '—';
  const bookingDate =
    ticket.bookingDate ||
    new Date(ticket.createdAt).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const passengerTitle = ticket.passengers[0]?.name || 'Traveller';
  const passengerDetails = isBus
    ? [
        ticket.passengers[0]?.gender,
        ticket.passengers[0]?.age,
        ticket.passengers[0]?.seat ? `Seat ${ticket.passengers[0].seat}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || formatPassengerLine(ticket)
    : isFlight
      ? [
          ticket.passengers[0]?.seat ? `Seat ${ticket.passengers[0].seat}` : null,
          ticket.gate ? `Gate ${ticket.gate}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Confirmed'
      : [
          ticket.passengers[0]?.age ? `Age ${ticket.passengers[0].age}` : null,
          ticket.passengers[0]?.gender,
          railSeatStatus(ticket),
        ]
          .filter(Boolean)
          .join(' · ');

  const operatorTitle = isBus
    ? ticket.operator
    : isFlight
      ? ticket.flightNumber || ticket.operator
      : [ticket.trainNumber, ticket.trainName].filter(Boolean).join(' ') || ticket.title;
  const operatorDetails = isBus
    ? ticket.classType || ticket.serviceName || 'Bus'
    : isFlight
      ? [ticket.operator, ticket.classType].filter(Boolean).join(' · ')
      : [ticket.classType, ticket.quota || 'GN'].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      {(ticket.originalPdfUri || ticket.originalQrValue) && (
        <Text style={styles.officialNote}>
          Wallet-style pass — keep original {ticket.originalPdfUri ? 'PDF' : 'QR'} for official checks
        </Text>
      )}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.label}>PNR</Text>
          <Text style={styles.pnr}>{pnr}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>BOOKING DATE</Text>
          <Text style={styles.booking}>{bookingDate}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.routeRow}>
        <View style={styles.routeCol}>
          <Text style={styles.label}>FROM</Text>
          <Text style={styles.city}>{cityName(ticket.fromCode || ticket.from)}</Text>
          <Text style={[styles.time, { color: accent }]}>{ticket.departureTime}</Text>
          <Text style={styles.date}>{ticket.departureDate}</Text>
          <Text style={styles.station}>{ticket.boardingPoint || ticket.from}</Text>
        </View>

        <View style={styles.mid}>
          <MaterialCommunityIcons
            name={isBus ? 'bus' : isFlight ? 'airplane' : 'train'}
            size={42}
            color={accent}
          />
          <View style={styles.durationPill}>
            <Text style={styles.duration}>{duration}</Text>
          </View>
        </View>

        <View style={[styles.routeCol, { alignItems: 'flex-end' }]}>
          <Text style={styles.label}>TO</Text>
          <Text style={[styles.city, { textAlign: 'right' }]}>
            {cityName(ticket.toCode || ticket.to)}
          </Text>
          <Text style={[styles.time, { color: accent }]}>{ticket.arrivalTime || '--:--'}</Text>
          <Text style={[styles.date, { textAlign: 'right' }]}>
            {ticket.arrivalDate || ticket.departureDate}
          </Text>
          <Text style={[styles.station, { textAlign: 'right' }]}>
            {ticket.droppingPoint || ticket.to}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { borderColor: '#B9C0CC' }]} />

      <View style={styles.infoRow}>
        <View style={styles.infoBox}>
          <Text style={styles.label}>PASSENGER</Text>
          <Text style={styles.infoTitle}>{passengerTitle}</Text>
          <Text style={styles.infoSub}>{passengerDetails}</Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.label}>{isBus ? 'OPERATOR' : isFlight ? 'FLIGHT' : 'TRAIN'}</Text>
          <Text style={styles.infoTitle}>{operatorTitle}</Text>
          <Text style={styles.infoSub}>{operatorDetails}</Text>
        </View>
      </View>

      <View style={styles.qrWrap}>
        <QRCode value={qr} size={185} backgroundColor="#fff" color="#111" ecl="M" />
      </View>
      <Text style={styles.qrHint}>
        {isBus
          ? 'Show this QR at boarding point'
          : isFlight
            ? 'Show this QR at boarding gate'
            : 'Show this QR at station'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    backgroundColor: colors.cardLight,
    borderRadius: 28,
    padding: 21,
  },
  officialNote: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: '#596275',
    marginBottom: 14,
    textAlign: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: colors.fieldMuted,
    letterSpacing: 0.3,
  },
  pnr: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 23,
    color: colors.fieldInk,
    marginTop: 2,
  },
  booking: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: colors.fieldInk,
    marginTop: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: colors.lineDark,
    marginVertical: 20,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeCol: {
    flex: 1,
  },
  city: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#0B1530',
    marginTop: 2,
  },
  time: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 29,
    marginTop: 13,
  },
  date: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: '#313B4F',
    marginTop: 2,
  },
  station: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 17,
    color: '#596275',
    marginTop: 8,
  },
  mid: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  durationPill: {
    backgroundColor: '#EDF1F6',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  duration: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: '#243047',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: '#F4F6F9',
    borderRadius: 16,
    padding: 13,
  },
  infoTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#0E1831',
    marginTop: 5,
  },
  infoSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    lineHeight: 17,
    color: '#596275',
    marginTop: 4,
  },
  qrWrap: {
    marginTop: 24,
    alignSelf: 'center',
    width: 210,
    height: 210,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHint: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'DMSans_700Bold',
    color: '#243047',
  },
});
