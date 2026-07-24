import React from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { useBusJourney } from '../../hooks/useBusJourney';
import { Ticket } from '../../types/ticket';
import { buildQrPayload } from '../../utils/ticketFormat';
import { PassSceneBackground } from './PassSceneBackground';
import { useSecureScreen } from '../../hooks/useSecureScreen';

const Navy = '#07132D';
const Orange = '#FF6500';
const Green = '#118C3A';
const BlueText = '#123A92';
const Label = '#596173';

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

/**
 * Bus boarding pass — full card scrolls so all details stay reachable.
 */
export function BusBoardingPass({ ticket, onBack, onMenu, embedded }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(width - 20, 420);
  const compact = height < 780;
  useSecureScreen(true);
  const qrSize = compact ? 78 : 92;
  const journey = useBusJourney(ticket);

  const passengers = ticket.passengers?.length ? ticket.passengers : [];
  const pnr = ticket.pnr || ticket.bookingId || '—';
  const qr = ticket.originalQrValue?.trim() || buildQrPayload(ticket);
  const bookingDate =
    ticket.bookingDate ||
    new Date(ticket.createdAt).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  const platform = ticket.bookingPlatform || 'Travel ID';
  const fromCity = (ticket.from || 'Origin').toUpperCase();
  const toCity = (ticket.to || 'Destination').toUpperCase();
  const boarding = ticket.boardingPoint || ticket.from || '—';
  const dropping = ticket.droppingPoint || ticket.to || '—';
  const busType = ticket.classType || ticket.serviceName || 'Bus';
  const seats = passengers.map((p) => p.seat).filter(Boolean) as string[];
  const seat = seats.length ? seats.join(', ') : '—';
  const seatType =
    passengers.find((p) => p.seatType || p.deck)?.seatType ||
    passengers.find((p) => p.seatType || p.deck)?.deck ||
    'Confirmed';
  const duration = ticket.travelTime || '—';
  const report = ticket.reportingTime || '—';

  const topBar = !embedded ? (
    <View style={[styles.topBar, { width: contentWidth }]}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
        <Ionicons name="arrow-back" size={22} color={Navy} />
      </Pressable>
      <Text style={styles.topTitle}>Bus Boarding Pass</Text>
      <Pressable onPress={onMenu} hitSlop={10} style={styles.iconBtn}>
        <Ionicons name="ellipsis-vertical" size={20} color={Navy} />
      </Pressable>
    </View>
  ) : null;

  const passBody = (
    <View style={[styles.passCard, { width: contentWidth }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandCol}>
            <MaterialCommunityIcons name="bag-suitcase" size={22} color={Orange} />
            <View>
              <Text style={styles.brandName}>{platform.toLowerCase()}</Text>
              <Text style={styles.brandTravel}>TRAVEL</Text>
            </View>
          </View>
          <View style={styles.confirmedPill}>
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.confirmedText}>CONFIRMED</Text>
          </View>
        </View>

        <Text style={styles.ticketTitle}>BUS TICKET</Text>

        <View style={styles.pnrRow}>
          <View style={styles.pnrPill}>
            <Text style={styles.pnrLabel}>PNR</Text>
            <Text style={styles.pnrValue} numberOfLines={1}>
              {pnr}
            </Text>
          </View>
          <View style={styles.bookingBox}>
            <Text style={styles.bookingLabel}>BOOKED</Text>
            <Text style={styles.bookingValue} numberOfLines={2}>
              {bookingDate}
            </Text>
          </View>
        </View>

        <View style={styles.routeGlass}>
          <View style={styles.routeTop}>
            <View style={styles.routeSide}>
              <Text style={styles.label}>FROM</Text>
              <Text style={styles.city} numberOfLines={1}>
                {fromCity}
              </Text>
              <Text style={styles.point} numberOfLines={1}>
                {boarding}
              </Text>
            </View>
            <View style={styles.routeMid}>
              <View style={styles.routeLineRow}>
                <View style={styles.routeLine} />
                <View style={styles.midCircle}>
                  <MaterialCommunityIcons name="bus" size={18} color={Navy} />
                </View>
                <View style={styles.routeLine} />
              </View>
              <Text style={styles.duration}>{duration}</Text>
            </View>
            <View style={[styles.routeSide, { alignItems: 'flex-end' }]}>
              <Text style={styles.label}>TO</Text>
              <Text style={[styles.city, { textAlign: 'right' }]} numberOfLines={1}>
                {toCity}
              </Text>
              <Text style={[styles.point, { textAlign: 'right' }]} numberOfLines={1}>
                {dropping}
              </Text>
            </View>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Departure</Text>
              <Text style={styles.timeValue}>{ticket.departureTime || '--:--'}</Text>
              <Text style={styles.dateValue} numberOfLines={1}>
                {ticket.departureDate}
              </Text>
            </View>
            <View style={[styles.timeCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.timeLabel}>Arrival</Text>
              <Text style={styles.timeValue}>{ticket.arrivalTime || '--:--'}</Text>
              <Text style={[styles.dateValue, { textAlign: 'right' }]} numberOfLines={1}>
                {ticket.arrivalDate || ticket.departureDate}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.liveBox,
            !journey.showLiveTrack && styles.liveBoxQuiet,
            journey.phase === 'completed' && styles.liveBoxDone,
          ]}
        >
          <View style={styles.liveTop}>
            <View style={styles.liveLeft}>
              <View
                style={[
                  styles.liveDot,
                  journey.showLiveTrack && journey.tracking && styles.liveDotOn,
                  journey.phase === 'soon' && styles.liveDotSoon,
                  journey.phase === 'completed' && styles.liveDotDone,
                ]}
              />
              <Text style={styles.liveTitle} numberOfLines={2}>
                {journey.statusTitle}
              </Text>
            </View>
            {journey.showLiveTrack && journey.totalKm != null ? (
              <View style={styles.totalPill}>
                <Text style={styles.totalPillText}>{journey.totalKm} km trip</Text>
              </View>
            ) : null}
          </View>

          {journey.showLiveTrack ? (
            <>
              <View style={styles.kmRow}>
                <Ionicons name="navigate" size={16} color={Orange} />
                {journey.kmLeft == null && !journey.error ? (
                  <ActivityIndicator size="small" color={Orange} />
                ) : (
                  <Text style={styles.kmLeftText} numberOfLines={2}>
                    {journey.error || journey.kmLeftLabel}
                  </Text>
                )}
              </View>
              <Pressable
                style={styles.mapsBtn}
                onPress={() => void journey.openGoogleMapsJourney()}
              >
                <Ionicons name="map" size={16} color="#fff" />
                <Text style={styles.mapsBtnText}>Open Google Maps journey</Text>
              </Pressable>
              {ticket.trackingUrl ? (
                <Pressable
                  onPress={() => void Linking.openURL(ticket.trackingUrl!)}
                  style={styles.trackLink}
                >
                  <Text style={styles.trackLinkText}>Operator live tracking</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.liveBody} numberOfLines={3}>
              {journey.statusBody}
            </Text>
          )}
        </View>

        <View style={styles.notchRow} pointerEvents="none">
          <View style={styles.notch} />
          <View style={styles.notchDash}>
            {Array.from({ length: 16 }).map((_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </View>
          <View style={[styles.notch, styles.notchRight]} />
        </View>

        <View style={styles.infoRow3}>
          <InfoCell icon="bus" label="OPERATOR" value={ticket.operator || '—'} />
          <View style={styles.vDivider} />
          <InfoCell icon="seat-passenger" label="BUS TYPE" value={busType} />
          <View style={styles.vDivider} />
          <InfoCell icon="calendar" label="DATE" value={ticket.departureDate || '—'} />
        </View>

        <View style={styles.hDivider} />

        <View style={styles.infoRow3}>
          <InfoCell icon="clock-outline" label="REPORT" value={report} />
          <View style={styles.vDivider} />
          <InfoCell icon="numeric" label="SEAT" value={seat} />
          <View style={styles.vDivider} />
          <InfoCell icon="bed" label="TYPE" value={seatType} />
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.passengerList}>
            <Text style={styles.label}>
              PASSENGERS ({passengers.length || 1})
            </Text>
            {(passengers.length ? passengers : [{ name: 'Traveller' }]).map(
              (person, index, list) => {
                const meta = [
                  person.age ? `Age ${person.age}` : null,
                  person.gender
                    ? String(person.gender).toUpperCase().startsWith('F')
                      ? 'F'
                      : String(person.gender).toUpperCase().startsWith('M')
                        ? 'M'
                        : person.gender
                    : null,
                  person.seat ? `Seat ${person.seat}` : null,
                  person.seatType || person.deck || null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                const st = person.status || 'Confirmed';
                return (
                  <View
                    key={`${person.name}-${index}`}
                    style={[
                      styles.passengerRow,
                      index < list.length - 1 && styles.passengerRowBorder,
                    ]}
                  >
                    <View style={styles.orangeIcon}>
                      <Ionicons name="person" size={12} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerName} numberOfLines={1}>
                        {index + 1}. {person.name || `Passenger ${index + 1}`}
                      </Text>
                      {meta ? (
                        <Text style={styles.passengerMeta} numberOfLines={1}>
                          {meta}
                        </Text>
                      ) : null}
                      <Text style={styles.statusValue} numberOfLines={1}>
                        {st}
                      </Text>
                    </View>
                  </View>
                );
              }
            )}
          </View>

          <View style={styles.qrCard}>
            <QRCode value={qr || pnr} size={qrSize} backgroundColor="#fff" color="#111" ecl="M" />
            <Text style={styles.scanTitle}>SCAN</Text>
          </View>
        </View>
    </View>
  );

  if (embedded) {
    return (
      <View style={styles.embeddedWrap}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {passBody}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PassSceneBackground variant="bus" />
      <View style={[styles.content, { paddingTop: 2 }]}>
        {topBar}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {passBody}
        </ScrollView>
      </View>
    </View>
  );
}

function InfoCell({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoCell}>
      <MaterialCommunityIcons name={icon} size={16} color={Navy} />
      <View style={{ flex: 1, marginLeft: 4 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  embeddedWrap: { alignItems: 'center', maxHeight: 520 },
  content: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  scroll: { flex: 1, width: '100%' },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    alignSelf: 'center',
  },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: Navy },
  passCard: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: Orange, lineHeight: 20 },
  brandTravel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: '#2E73CC',
    letterSpacing: 0.8,
  },
  confirmedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Green,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmedText: { fontFamily: 'Outfit_700Bold', fontSize: 10, color: '#fff' },
  ticketTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: Navy,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 6,
  },
  pnrRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  pnrPill: {
    flex: 1.1,
    backgroundColor: Navy,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pnrLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  pnrValue: { fontFamily: 'Outfit_700Bold', fontSize: 16, color: '#fff', marginTop: 1 },
  bookingBox: {
    flex: 1,
    backgroundColor: 'rgba(243,245,249,0.72)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  bookingLabel: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: Label },
  bookingValue: { fontFamily: 'Outfit_700Bold', fontSize: 11, color: Navy, marginTop: 2 },
  routeGlass: {
    marginTop: 8,
    backgroundColor: 'rgba(247,249,252,0.7)',
    borderRadius: 16,
    padding: 10,
  },
  routeTop: { flexDirection: 'row', alignItems: 'flex-start' },
  routeSide: { flex: 1 },
  label: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 9,
    color: Label,
    letterSpacing: 0.3,
  },
  city: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: Navy,
    marginTop: 1,
  },
  point: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    color: Label,
    marginTop: 2,
  },
  routeMid: { width: 64, alignItems: 'center', paddingTop: 4 },
  routeLineRow: { flexDirection: 'row', alignItems: 'center' },
  routeLine: { width: 12, height: 1, backgroundColor: 'rgba(7,19,45,0.35)' },
  midCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  duration: { marginTop: 4, fontFamily: 'DMSans_700Bold', fontSize: 10, color: Navy },
  timeRow: { flexDirection: 'row', marginTop: 8 },
  timeCol: { flex: 1 },
  timeLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10, color: '#333' },
  timeValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: Orange,
    marginTop: 1,
  },
  dateValue: { fontFamily: 'DMSans_700Bold', fontSize: 10, color: Navy, marginTop: 1 },
  notchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -12,
    marginVertical: 8,
  },
  notch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#6D89A5',
    marginLeft: -7,
  },
  notchRight: { marginLeft: 0, marginRight: -7 },
  notchDash: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dash: { flex: 1, height: 1, marginHorizontal: 2, backgroundColor: '#C8CDD6' },
  infoRow3: { flexDirection: 'row', alignItems: 'flex-start' },
  infoCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 2,
  },
  infoValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    lineHeight: 14,
    color: BlueText,
    marginTop: 2,
  },
  vDivider: { width: 1, height: 40, backgroundColor: '#E1E4EA' },
  hDivider: { height: 1, backgroundColor: '#E1E4EA', marginVertical: 8 },
  bottomRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'stretch',
  },
  passengerList: {
    flex: 1,
    backgroundColor: 'rgba(248,249,252,0.72)',
    borderRadius: 14,
    padding: 10,
    gap: 2,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  passengerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E4EA',
  },
  orangeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: Navy,
    marginTop: 2,
  },
  passengerMeta: {
    fontFamily: 'Outfit_500Medium',
    fontSize: 11,
    color: Label,
    marginTop: 1,
  },
  statusValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: BlueText,
    marginTop: 2,
  },
  qrCard: {
    width: 108,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 14,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: {
    marginTop: 4,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: Navy,
  },
  liveBox: {
    marginTop: 10,
    backgroundColor: 'rgba(255,101,0,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.28)',
    padding: 12,
    gap: 8,
  },
  liveBoxQuiet: {
    backgroundColor: 'rgba(7,19,45,0.05)',
    borderColor: 'rgba(7,19,45,0.12)',
  },
  liveBoxDone: {
    backgroundColor: 'rgba(17,140,58,0.08)',
    borderColor: 'rgba(17,140,58,0.28)',
  },
  liveTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9AA3B2',
  },
  liveDotOn: { backgroundColor: '#1FC77A' },
  liveDotSoon: { backgroundColor: Orange },
  liveDotDone: { backgroundColor: Green },
  liveTitle: {
    flex: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: Navy,
  },
  totalPill: {
    backgroundColor: Navy,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  totalPillText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    color: '#fff',
  },
  kmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kmLeftText: {
    flex: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: Orange,
    lineHeight: 20,
  },
  liveBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: Label,
    lineHeight: 17,
  },
  mapsBtn: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Orange,
    borderRadius: 12,
    paddingVertical: 10,
  },
  mapsBtnText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  trackLink: { alignItems: 'center', paddingTop: 2 },
  trackLinkText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: BlueText,
    textDecorationLine: 'underline',
  },
});
