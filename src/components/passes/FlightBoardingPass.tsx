import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ticket } from '../../types/ticket';
import { useTickets } from '../../context/TicketContext';
import { useLiveFlightStatus, formatFlightClock } from '../../hooks/useLiveFlightStatus';
import {
  airportMeta,
  formatFlightDisplay,
  seatSide,
  timeMinusMinutes,
} from '../../utils/airports';
import { airlineHeroImage } from '../../utils/airlineHero';
import { BoardingBarcodeView } from './BoardingBarcodeView';
import {
  applyCompletedIfPast,
  coerceFlightArchiveDate,
  isPastPass,
  istTodayIso,
} from '../../utils/passTime';

const BG = '#010813';
const CARD = '#0B1628';
const BLUE = '#1D8CF8';
const GREEN = '#00E676';
const MUTED = '#8FA3C1';
const DONE = '#9CA3AF';

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

export function FlightBoardingPass({ ticket, onBack, onMenu, embedded }: Props) {
  const insets = useSafeAreaInsets();
  const { updateTicket } = useTickets();
  // Re-evaluate when the IST calendar day rolls over → live becomes Completed
  const [dayKey, setDayKey] = React.useState(istTodayIso);
  useEffect(() => {
    const id = setInterval(() => {
      const today = istTodayIso();
      setDayKey((prev) => (prev === today ? prev : today));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const normalized = useMemo(
    () => applyCompletedIfPast(coerceFlightArchiveDate(ticket)),
    [ticket, dayKey]
  );
  const journeyDone =
    isPastPass(normalized) || Boolean(normalized.journeyCompleted);

  // Persist archive/completed flags so live polling stays off next open
  useEffect(() => {
    if (embedded) return;
    const dirty =
      Boolean(normalized.journeyCompleted) !== Boolean(ticket.journeyCompleted) ||
      normalized.departureDate !== ticket.departureDate ||
      normalized.bookingStatus !== ticket.bookingStatus ||
      (normalized.flightStatus || '') !== (ticket.flightStatus || '');
    if (!dirty) return;
    void updateTicket(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when archive fields drift
  }, [
    embedded,
    normalized.journeyCompleted,
    normalized.departureDate,
    normalized.bookingStatus,
    normalized.flightStatus,
    ticket.id,
  ]);

  const onUpdate = useCallback(
    async (next: Ticket) => {
      await updateTicket(next);
    },
    [updateTicket]
  );

  const { loading, refresh, waitingForKeys, error, status, lastOkAt } =
    useLiveFlightStatus({
      ticket: normalized,
      enabled: !embedded && !journeyDone,
      onUpdate,
    });

  const flightLabel = formatFlightDisplay(ticket.flightNumber, ticket.airlineCode);
  const airline = ticket.operator || ticket.airlineCode || 'Airline';
  const heroImg = airlineHeroImage(ticket.airlineCode, ticket.operator);
  const from = airportMeta(ticket.fromCode, ticket.from);
  const to = airportMeta(ticket.toCode, ticket.to);
  const terminal =
    status?.departureTerminal || ticket.terminal || ticket.boardingPoint || '—';
  const arrivalTerminal =
    status?.arrivalTerminal || ticket.arrivalTerminal || '—';
  const gate = status?.departureGate || ticket.gate || 'TBA';
  const seat = ticket.passengers?.[0]?.seat || '—';
  const side = seatSide(ticket.passengers?.[0]?.seat);
  const paxName = ticket.passengers?.[0]?.name || 'Traveller';
  const pnr = ticket.pnr || '—';
  const bookingRef = ticket.bookingId && ticket.bookingId !== pnr ? ticket.bookingId : undefined;
  const duration = ticket.travelTime || estimateDuration(ticket.departureTime, ticket.arrivalTime);

  // Ticket times from scan/PDF are source of truth; live fills gaps (BCBP has no clocks).
  const schDep =
    ticket.departureTime && ticket.departureTime !== '--:--'
      ? ticket.departureTime
      : undefined;
  const schArr =
    ticket.arrivalTime && ticket.arrivalTime !== '--:--'
      ? ticket.arrivalTime
      : undefined;
  const apiDep =
    formatFlightClock(status?.estimatedDeparture) ||
    formatFlightClock(status?.actualDeparture) ||
    formatFlightClock(status?.scheduledDeparture) ||
    ticket.estimatedDeparture ||
    undefined;
  const apiArr =
    formatFlightClock(status?.estimatedArrival) ||
    formatFlightClock(status?.actualArrival) ||
    formatFlightClock(status?.scheduledArrival) ||
    ticket.estimatedArrival ||
    undefined;
  const depTime = schDep || apiDep || '—';
  const arrTime = schArr || apiArr || '—';
  const depIsLive = Boolean(apiDep && schDep && apiDep !== schDep);
  const arrIsLive = Boolean(apiArr && schArr && apiArr !== schArr);
  const depFromApi = Boolean(!schDep && apiDep);
  const arrFromApi = Boolean(!schArr && apiArr);

  // Boarding from ticket — else ~40 min before known departure.
  const boardingTime =
    ticket.reportingTime ||
    timeMinusMinutes(schDep || apiDep || '', 40) ||
    '—';
  const missingTimes = depTime === '—' && arrTime === '—';
  const statusLabel = useMemo(() => {
    if (journeyDone) return 'COMPLETED';
    if (ticket.delayMinutes && ticket.delayMinutes > 0) return 'DELAYED';
    const s = (
      status?.statusLabel ||
      normalized.flightStatus ||
      ticket.flightStatus ||
      ''
    ).toUpperCase();
    if (!s || s === 'SCHEDULED' || s === 'S' || s === 'ON TIME') return 'ON TIME';
    if (s.includes('CANCEL')) return 'CANCELLED';
    if (s.includes('LAND')) return 'LANDED';
    if (s.includes('ACTIVE') || s.includes('AIR') || s === 'IN AIR') return 'IN AIR';
    return s;
  }, [
    journeyDone,
    ticket.delayMinutes,
    ticket.flightStatus,
    normalized.flightStatus,
    status?.statusLabel,
  ]);
  const onTime = statusLabel === 'ON TIME';
  const cabin = ticket.classType || 'Economy';
  const aircraft = ticket.vehicleType || ticket.serviceName || 'Aircraft';
  const liveHint = journeyDone
    ? 'Completed · live updates ended'
    : waitingForKeys
      ? 'Live pending — start API proxy'
      : error
        ? error.length > 64
          ? `${error.slice(0, 61)}…`
          : error
        : loading
          ? 'Updating…'
          : lastOkAt || ticket.lastStatusAt
            ? 'Live · up to date'
            : 'Tap refresh for live gate & times';

  return (
    <View style={[styles.root, embedded && styles.embedded]}>
      {!embedded && (
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>BOARDING PASS</Text>
          <Pressable onPress={onMenu} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
          </Pressable>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 28 },
          embedded && { paddingTop: 8 },
        ]}
      >
        {/* Hero */}
        <View style={styles.heroWrap}>
          <ImageBackground source={heroImg} style={styles.hero} resizeMode="cover">
            <LinearGradient
              colors={['rgba(1,8,19,0.15)', 'rgba(1,8,19,0.55)', BG]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroBadges}>
              <View
                style={[
                  styles.statusPill,
                  journeyDone
                    ? styles.statusPillDone
                    : {
                        backgroundColor: onTime
                          ? 'rgba(0,230,118,0.2)'
                          : 'rgba(255,140,60,0.25)',
                      },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: journeyDone
                        ? '#fff'
                        : onTime
                          ? GREEN
                          : '#FF8C3C',
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusPillText,
                    {
                      color: journeyDone
                        ? '#fff'
                        : onTime
                          ? GREEN
                          : '#FFB07A',
                    },
                  ]}
                >
                  {journeyDone ? 'Completed' : statusLabel}
                </Text>
                {journeyDone ? (
                  <Ionicons name="checkmark-done" size={14} color="#fff" />
                ) : onTime ? (
                  <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                ) : null}
              </View>
              {journeyDone ? (
                <View style={[styles.livePill, styles.livePillDone]}>
                  <Text style={[styles.livePillText, styles.livePillTextDone]}>
                    Completed
                  </Text>
                </View>
              ) : (
                <Pressable style={styles.livePill} onPress={() => void refresh()}>
                  <View style={[styles.dot, { backgroundColor: GREEN }]} />
                  <Text style={styles.livePillText}>LIVE UPDATES</Text>
                  {loading ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : (
                    <Ionicons name="refresh" size={13} color={GREEN} />
                  )}
                </Pressable>
              )}
            </View>
            <Text style={[styles.justNow, journeyDone && styles.justNowDone]}>
              {liveHint}
            </Text>

            <Text style={styles.airlineName}>{airline}</Text>
            <View style={styles.airlineRow}>
              <MaterialCommunityIcons name="airplane" size={16} color={BLUE} />
              <Text style={styles.flightMeta}>
                {flightLabel} • {aircraft}
              </Text>
            </View>
          </ImageBackground>

          {/* Floating PNR card */}
          <View style={styles.pnrCard}>
            <Text style={styles.pnrLabel}>PNR</Text>
            <Text style={styles.pnrValue}>{pnr}</Text>
            {bookingRef ? (
              <Text style={styles.bookingRef}>Booking Ref: {bookingRef}</Text>
            ) : (
              <Text style={styles.bookingRef}>
                {ticket.airlineCode ? `Carrier ${ticket.airlineCode}` : 'Mobile boarding pass'}
              </Text>
            )}
          </View>
        </View>

        {journeyDone ? (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.completedBannerTitle}>Completed</Text>
              <Text style={styles.completedBannerBody}>
                Travel date finished · live updates are off
              </Text>
            </View>
          </View>
        ) : null}

        {/* Route */}
        <View style={styles.section}>
          <View style={styles.routeRow}>
            <View style={styles.routeCol}>
              <Text style={styles.iata}>{from.code}</Text>
              <Text style={styles.city}>{from.city.toUpperCase()}</Text>
              <Text style={styles.airport} numberOfLines={2}>
                {from.name}
              </Text>
              <Text style={styles.terminalLine}>Terminal {terminal}</Text>
              <Text style={styles.dateBlue}>{formatDate(normalized.departureDate)}</Text>
              <Text style={styles.bigTime}>{depTime}</Text>
              {depIsLive ? (
                <Text style={styles.liveTimeTag}>
                  Est. {apiDep} · sch {schDep}
                </Text>
              ) : depFromApi ? (
                <Text style={styles.liveTimeTag}>From live schedule</Text>
              ) : null}
            </View>

            <View style={styles.routeMid}>
              <View style={styles.dashLine} />
              <View style={styles.planeCircle}>
                <MaterialCommunityIcons name="airplane" size={18} color="#fff" />
              </View>
              <View style={styles.durationChip}>
                <Ionicons name="time-outline" size={12} color={MUTED} />
                <Text style={styles.durationText}>{duration}</Text>
              </View>
            </View>

            <View style={[styles.routeCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.iata}>{to.code}</Text>
              <Text style={[styles.city, { textAlign: 'right' }]}>
                {to.city.toUpperCase()}
              </Text>
              <Text style={[styles.airport, { textAlign: 'right' }]} numberOfLines={2}>
                {to.name}
              </Text>
              <Text style={styles.terminalLine}>Terminal {arrivalTerminal}</Text>
              <Text style={styles.dateBlue}>
                {formatDate(normalized.arrivalDate || normalized.departureDate)}
              </Text>
              <Text style={styles.bigTime}>{arrTime}</Text>
              {arrIsLive ? (
                <Text style={[styles.liveTimeTag, { textAlign: 'right' }]}>
                  Est. {apiArr} · sch {schArr}
                </Text>
              ) : arrFromApi ? (
                <Text style={[styles.liveTimeTag, { textAlign: 'right' }]}>
                  From live schedule
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {missingTimes ? (
          <View style={styles.timeMissingBanner}>
            <Ionicons name="time-outline" size={16} color="#FFB07A" />
            <Text style={styles.timeMissingText}>
              Barcode has no clock times — tap LIVE UPDATES to load schedule, or
              edit departure on Review before saving.
            </Text>
          </View>
        ) : null}

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <QuickStat icon="airplane" label="FLIGHT NO." value={flightLabel} />
          <QuickStat icon="seat-recline-normal" label="CLASS" value={shortCabin(cabin)} />
          <QuickStat icon="clock-outline" label="DURATION" value={duration} />
          <QuickStat icon="office-building" label="TERMINAL" value={String(terminal)} />
        </View>

        {/* Passenger */}
        <View style={styles.paxCard}>
          <View style={styles.paxAvatar}>
            <Ionicons name="person" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paxLabel}>PASSENGER</Text>
            <Text style={styles.paxName} numberOfLines={1}>
              {paxName}
            </Text>
            <Text style={styles.paxMeta}>
              Adult • Seat {seat}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.seatLabel}>SEAT</Text>
            <Text style={styles.seatValue}>{seat}</Text>
            {side ? (
              <View style={styles.windowPill}>
                <Text style={styles.windowText}>{side}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Live / completed boarding details */}
        <View style={[styles.liveBox, journeyDone && styles.liveBoxDone]}>
          <Text style={[styles.liveBoxTitle, journeyDone && styles.liveBoxTitleDone]}>
            {journeyDone ? 'Completed' : 'Live boarding details'}
          </Text>
          {journeyDone ? (
            <Text style={styles.liveDoneBody}>
              This flight has already flown. Live gate and status updates are no
              longer available.
            </Text>
          ) : null}
          {!!error && !journeyDone && (
            <Text style={styles.liveError} numberOfLines={2}>
              {error}
            </Text>
          )}
          <View style={styles.liveGrid}>
            <View style={styles.liveCell}>
              <MaterialCommunityIcons
                name="door"
                size={20}
                color={journeyDone ? DONE : GREEN}
              />
              <Text style={styles.liveBig}>{boardingTime}</Text>
              <Text style={styles.liveSub}>Boarding</Text>
              <View style={[styles.liveTag, journeyDone && styles.liveTagDone]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: journeyDone ? DONE : GREEN },
                  ]}
                />
                <Text
                  style={[
                    styles.liveTagText,
                    journeyDone && styles.liveTagTextDone,
                  ]}
                >
                  {journeyDone ? 'Completed' : 'LIVE'}
                </Text>
              </View>
            </View>
            <View style={styles.liveCell}>
              <MaterialCommunityIcons
                name="airplane-takeoff"
                size={20}
                color={journeyDone ? DONE : GREEN}
              />
              <Text style={styles.liveBig}>{journeyDone ? gate === 'TBA' ? '—' : gate : gate}</Text>
              <Text style={styles.liveSub}>
                {journeyDone
                  ? 'Gate used'
                  : ticket.delayMinutes
                    ? `Delay ${ticket.delayMinutes}m`
                    : gate === 'TBA'
                      ? 'Gate TBA'
                      : 'Gate'}
              </Text>
              <View style={[styles.liveTag, journeyDone && styles.liveTagDone]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: journeyDone ? DONE : GREEN },
                  ]}
                />
                <Text
                  style={[
                    styles.liveTagText,
                    journeyDone && styles.liveTagTextDone,
                  ]}
                >
                  {journeyDone ? 'Completed' : 'LIVE'}
                </Text>
              </View>
            </View>
            <View style={styles.liveCell}>
              <Ionicons
                name="time-outline"
                size={20}
                color={journeyDone ? DONE : BLUE}
              />
              <Text style={styles.liveBig}>{depTime}</Text>
              <Text style={styles.liveSub}>
                {journeyDone
                  ? 'Departed'
                  : depIsLive
                    ? 'Est. dep'
                    : depFromApi
                      ? 'Sched. dep'
                      : 'Departure'}
              </Text>
            </View>
          </View>
        </View>

        {/* Original airline boarding barcode (PDF417 / QR / Aztec) */}
        <View style={styles.qrSection}>
          <View style={styles.qrDecorLeft}>
            <MaterialCommunityIcons name="lighthouse" size={48} color="rgba(29,140,248,0.18)" />
          </View>
          <View style={styles.qrDecorRight}>
            <MaterialCommunityIcons name="airplane" size={56} color="rgba(29,140,248,0.15)" />
          </View>
          <BoardingBarcodeView
            ticket={ticket}
            caption="Present this barcode at the boarding gate"
          />
        </View>

        {/* Footer tip */}
        <View style={styles.footerTip}>
          <Ionicons
            name={journeyDone ? 'checkmark-circle-outline' : 'notifications-outline'}
            size={18}
            color={journeyDone ? DONE : BLUE}
          />
          <Text style={styles.footerText}>
            {journeyDone ? (
              'Archived boarding pass — kept for your travel history.'
            ) : (
              <>
                Arrive at the airport at least{' '}
                <Text style={{ color: BLUE, fontFamily: 'Outfit_700Bold' }}>2 hours</Text> before
                departure
              </>
            )}
          </Text>
          <MaterialCommunityIcons name="bag-suitcase-outline" size={18} color={MUTED} />
        </View>
      </ScrollView>
    </View>
  );
}

function QuickStat({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={18} color={BLUE} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function formatDate(raw?: string) {
  if (!raw) return '—';
  // Already friendly
  if (/[A-Za-z]{3}/.test(raw)) return raw.toUpperCase().replace(',', '');
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `${Number(iso[3])} ${months[Number(iso[2]) - 1]} ${iso[1]}`;
  }
  return raw.toUpperCase();
}

function shortCabin(c: string) {
  if (/econom/i.test(c)) return 'Economy';
  if (/business|club/i.test(c)) return 'Business';
  if (/first/i.test(c)) return 'First';
  if (/premium/i.test(c)) return 'Premium';
  return c.length > 10 ? c.slice(0, 10) : c;
}

function estimateDuration(dep?: string, arr?: string) {
  const a = dep?.match(/^(\d{1,2}):(\d{2})/);
  const b = arr?.match(/^(\d{1,2}):(\d{2})/);
  if (!a || !b) return '—';
  let mins = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  embedded: { backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
    zIndex: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#fff',
    letterSpacing: 1.4,
  },
  scroll: { paddingBottom: 40 },
  heroWrap: { marginBottom: 8 },
  hero: {
    height: 210,
    paddingHorizontal: 16,
    paddingTop: 10,
    justifyContent: 'flex-end',
    paddingBottom: 56,
  },
  heroBadges: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.35)',
  },
  statusPillDone: {
    backgroundColor: '#3D4A5C',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  statusPillText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,40,24,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.4)',
  },
  livePillDone: {
    backgroundColor: '#3D4A5C',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  livePillText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: GREEN,
    letterSpacing: 0.3,
  },
  livePillTextDone: {
    color: '#fff',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  justNow: {
    position: 'absolute',
    top: 42,
    right: 18,
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  justNowDone: {
    color: 'rgba(255,255,255,0.85)',
  },
  completedBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2A3544',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  completedBannerTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
    marginBottom: 2,
  },
  completedBannerBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  airlineName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#fff',
  },
  airlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  flightMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
  },
  pnrCard: {
    marginHorizontal: 16,
    marginTop: -36,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(29,140,248,0.35)',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  pnrLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: BLUE,
    letterSpacing: 1,
  },
  pnrValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 30,
    color: '#fff',
    marginTop: 2,
    letterSpacing: 1,
  },
  bookingRef: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeCol: { flex: 1 },
  iata: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 36,
    color: '#fff',
  },
  city: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
    marginTop: 2,
  },
  airport: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 4,
    lineHeight: 16,
  },
  terminalLine: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  dateBlue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: BLUE,
    marginTop: 10,
  },
  bigTime: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: '#fff',
    marginTop: 2,
  },
  liveTimeTag: {
    marginTop: 2,
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: GREEN,
  },
  timeMissingBanner: {
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,140,60,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,140,60,0.35)',
  },
  timeMissingText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: '#FFB07A',
    lineHeight: 17,
  },
  routeMid: {
    width: 72,
    alignItems: 'center',
    paddingTop: 18,
  },
  dashLine: {
    position: 'absolute',
    top: 28,
    left: 8,
    right: 8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(29,140,248,0.55)',
  },
  planeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  durationChip: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  statsRow: {
    marginTop: 18,
    marginHorizontal: 12,
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  statLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 9,
    color: MUTED,
    letterSpacing: 0.3,
  },
  statValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: '#fff',
  },
  paxCard: {
    marginTop: 14,
    marginHorizontal: 16,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paxAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paxLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: MUTED,
    letterSpacing: 0.5,
  },
  paxName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    color: '#fff',
    marginTop: 1,
  },
  paxMeta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  seatLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: MUTED,
  },
  seatValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 26,
    color: '#fff',
  },
  windowPill: {
    marginTop: 2,
    backgroundColor: 'rgba(29,140,248,0.2)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  windowText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: BLUE,
  },
  liveBox: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(0,230,118,0.45)',
    backgroundColor: 'rgba(0,40,24,0.25)',
    padding: 14,
  },
  liveBoxDone: {
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(42,53,68,0.95)',
  },
  liveBoxTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: MUTED,
    marginBottom: 12,
  },
  liveBoxTitleDone: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 8,
  },
  liveDoneBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 18,
    marginBottom: 12,
  },
  liveError: {
    marginBottom: 10,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: '#FFB07A',
  },
  liveGrid: { flexDirection: 'row', gap: 8 },
  liveCell: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  liveBig: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 26,
    color: GREEN,
    textShadowColor: 'rgba(0,230,118,0.45)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  liveSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  liveTagDone: {
    opacity: 0.9,
  },
  liveTagText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: GREEN,
  },
  liveTagTextDone: {
    color: '#fff',
    fontSize: 11,
  },
  qrSection: {
    marginTop: 22,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  qrDecorLeft: {
    position: 'absolute',
    left: 24,
    top: 40,
  },
  qrDecorRight: {
    position: 'absolute',
    right: 20,
    top: 30,
  },
  footerTip: {
    marginTop: 20,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerText: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#fff',
    lineHeight: 18,
  },
});
