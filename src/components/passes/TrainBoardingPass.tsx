import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useArrivalAlarm } from '../../hooks/useArrivalAlarm';
import { useLiveTrainStatus } from '../../hooks/useLiveTrainStatus';
import { useTrainDetails } from '../../hooks/useTrainDetails';
import { Ticket } from '../../types/ticket';
import { buildQrPayload } from '../../utils/ticketFormat';
import { formatRailRadarError } from '../../services/railRadar';
import { parseCoachPosition } from '../../utils/coachComposition';
import { CoachCompositionSheet } from './CoachCompositionSheet';
import { GreenBlinkNumber } from './GreenBlinkNumber';
import { PassSceneBackground } from './PassSceneBackground';
import { TrainRouteSheet } from './TrainRouteSheet';

const Navy = '#07132D';
const Orange = '#FF6500';
const Green = '#118C3A';
const BlueText = '#123A92';
const Label = '#596173';

const TRAIN_TIP_KEY = 'wallet.ui.trainNumberTip.v1';

type Props = {
  ticket: Ticket;
  onBack?: () => void;
  onMenu?: () => void;
  embedded?: boolean;
};

/**
 * Train boarding pass — full card scrolls so all passengers and live info stay reachable.
 */
export function TrainBoardingPass({ ticket, onBack, onMenu, embedded }: Props) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentWidth = Math.min(width - 20, 420);
  const compact = height < 780;
  const qrSize = compact ? 78 : 92;
  const {
    live,
    times,
    summary,
    loading,
    error,
    expectedArrivalAt,
    minutesToArrival,
    phase,
  } = useLiveTrainStatus(ticket);
  const { details } = useTrainDetails(ticket.trainNumber);
  const alarm = useArrivalAlarm({
    ticket,
    expectedArrivalAt,
    minutesToArrival,
  });
  const [routeOpen, setRouteOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const passengers = ticket.passengers?.length
    ? ticket.passengers
    : [{ name: 'Traveller' }];
  const passengerCoach = passengers[0]?.coach;
  const passengerSeat = passengers[0]?.seat;
  const coachUnits = (() => {
    try {
      return parseCoachPosition(details?.coachPosition);
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(TRAIN_TIP_KEY);
        if (!seen && alive) setTipVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismissTrainTip = async () => {
    setTipVisible(false);
    try {
      await AsyncStorage.setItem(TRAIN_TIP_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const openLiveStatus = () => {
    const number = String(ticket.trainNumber || '').replace(/\D/g, '');
    if (!number) return;
    router.push({
      pathname: '/train/live',
      params: {
        trainNumber: number,
        journeyDate: ticket.departureDate || '',
        departureTime: ticket.departureTime || '',
        arrivalDate: ticket.arrivalDate || '',
        arrivalTime: ticket.arrivalTime || '',
        travelTime: ticket.travelTime || '',
        fromCode: ticket.fromCode || '',
        toCode: ticket.toCode || '',
        fromName: ticket.from || '',
        toName: ticket.to || '',
        pnr: ticket.pnr || ticket.bookingId || '',
        trainName: ticket.trainName || ticket.title || '',
        coach: passengerCoach || '',
        seat: passengerSeat || '',
      },
    });
  };

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
  const fromCode = (ticket.fromCode || '—').toUpperCase();
  const toCode = (ticket.toCode || '—').toUpperCase();
  const fromName = (ticket.from || 'Origin').toUpperCase();
  const toName = (ticket.to || 'Destination').toUpperCase();
  const duration =
    ticket.travelTime ||
    (details?.durationMin
      ? `${Math.floor(details.durationMin / 60)}h ${details.durationMin % 60}m`
      : '—');
  const trainName =
    details?.trainName || ticket.trainName || ticket.title || '';
  const trainNumber = ticket.trainNumber || details?.trainNumber || '—';
  const trainType = details?.type || details?.category;

  const showLiveDetails = Boolean(summary?.showLiveDetails);
  const depTime = showLiveDetails
    ? times?.expectedDeparture || ticket.departureTime || '--:--'
    : ticket.departureTime || '--:--';
  const arrTime = showLiveDetails
    ? times?.expectedArrival || ticket.arrivalTime || '--:--'
    : ticket.arrivalTime || '--:--';
  const late = showLiveDetails && (summary?.delayMinutes || 0) > 0;
  const detailsFromPf = details?.halts?.find(
    (h) => h.stationCode.toUpperCase() === fromCode
  )?.platform;
  // Platform only for source / boarding station (not destination)
  const boardingPf =
    (showLiveDetails ? summary?.boardingPlatform : undefined) ||
    detailsFromPf ||
    ticket.platform;
  const livePfLabel =
    showLiveDetails && boardingPf ? `PF ${boardingPf}` : undefined;
  const phaseTitle = summary?.phaseTitle;
  const phaseBody = summary?.phaseBody;

  const topBar = !embedded ? (
    <View style={[styles.topBar, { width: contentWidth }]}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
        <Ionicons name="arrow-back" size={22} color={Navy} />
      </Pressable>
      <Text style={styles.topTitle}>Train Boarding Pass</Text>
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

        <Text style={styles.ticketTitle}>TRAIN TICKET</Text>

        <View style={styles.pnrRow}>
          <View style={styles.pnrPill}>
            <Text style={styles.pnrLabel}>PNR</Text>
            <Text style={styles.pnrValue}>{pnr}</Text>
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
              <Text style={styles.city} numberOfLines={2}>
                {fromName}
              </Text>
              <Text style={styles.code}>({fromCode})</Text>
            </View>
            <View style={styles.routeMid}>
              <View style={styles.routeLineRow}>
                <View style={styles.routeLine} />
                <Pressable
                  style={styles.midCircle}
                  onPress={() => setRouteOpen(true)}
                  hitSlop={8}
                  accessibilityLabel="Open train route map"
                >
                  <MaterialCommunityIcons name="train" size={18} color={Navy} />
                </Pressable>
                <View style={styles.routeLine} />
              </View>
              <Text style={styles.duration}>{duration}</Text>
              <Text style={styles.routeHint}>tap map</Text>
            </View>
            <View style={[styles.routeSide, { alignItems: 'flex-end' }]}>
              <Text style={styles.label}>TO</Text>
              <Text style={[styles.city, { textAlign: 'right' }]} numberOfLines={2}>
                {toName}
              </Text>
              <Text style={styles.code}>({toCode})</Text>
            </View>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>
                {showLiveDetails && times?.expectedDeparture
                  ? 'Exp. Departure'
                  : 'Departure'}
              </Text>
              <Text style={[styles.timeValue, late && styles.timeLate]}>{depTime}</Text>
              <Text style={styles.dateValue} numberOfLines={1}>
                {showLiveDetails &&
                times?.scheduledDeparture &&
                times.expectedDeparture
                  ? `Sch ${times.scheduledDeparture}`
                  : ticket.departureDate}
              </Text>
              {!!boardingPf && (
                <Text style={styles.pfBadge}>PF {boardingPf}</Text>
              )}
            </View>
            <View style={[styles.timeCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.timeLabel}>
                {showLiveDetails && times?.expectedArrival
                  ? 'Exp. Arrival'
                  : 'Arrival'}
              </Text>
              <Text style={[styles.timeValue, late && styles.timeLate]}>{arrTime}</Text>
              <Text style={[styles.dateValue, { textAlign: 'right' }]} numberOfLines={1}>
                {showLiveDetails &&
                times?.scheduledArrival &&
                times.expectedArrival
                  ? `Sch ${times.scheduledArrival}`
                  : ticket.arrivalDate || ticket.departureDate}
              </Text>
            </View>
          </View>

          <Pressable
            style={[
              styles.liveBox,
              !showLiveDetails && styles.liveBoxQuiet,
              phase === 'completed' && styles.liveBoxDone,
            ]}
            onPress={openLiveStatus}
          >
            <View style={styles.liveTop}>
              <View style={styles.liveLeft}>
                <View
                  style={[
                    styles.liveDot,
                    showLiveDetails && live?.isLive && styles.liveDotOn,
                    phase === 'soon' && styles.liveDotSoon,
                    phase === 'completed' && styles.liveDotDone,
                  ]}
                />
                {loading && showLiveDetails && !live ? (
                  <ActivityIndicator size="small" color={Orange} />
                ) : (
                  <Text style={styles.liveTitle} numberOfLines={2}>
                    {showLiveDetails
                      ? error
                        ? formatRailRadarError(error)
                        : summary
                          ? `LIVE · ${summary.statusLabel} · ${summary.delayLabel}`
                          : 'Tap for live running status'
                      : phaseTitle || 'Journey status'}
                  </Text>
                )}
              </View>
              {!!livePfLabel && showLiveDetails && (
                <View style={[styles.pfPill, live?.isLive && styles.pfPillLive]}>
                  <Text style={styles.pfPillText}>
                    {live?.isLive ? 'LIVE ' : ''}
                    {livePfLabel}
                  </Text>
                </View>
              )}
            </View>
            {showLiveDetails ? (
              <>
                <View style={styles.liveMetaRow}>
                  <GreenBlinkNumber
                    number={String(trainNumber)}
                    active={Boolean(live?.isLive && live.status === 'running')}
                    onPress={openLiveStatus}
                  />
                  <Text style={styles.liveMeta} numberOfLines={1}>
                    {' '}
                    · PNR {pnr}
                    {live?.startDate ? ` · started ${live.startDate}` : ''}
                  </Text>
                </View>
                <View style={styles.liveLocRow}>
                  <Ionicons name="navigate" size={12} color={Orange} />
                  <Text style={styles.liveLoc} numberOfLines={3}>
                    {summary?.locationLabel ||
                      (error
                        ? formatRailRadarError(error)
                        : 'Fetching live location…')}
                  </Text>
                </View>
                {!!summary?.etaLabel && (
                  <Text style={styles.etaText} numberOfLines={1}>
                    {summary.etaLabel}
                    {times?.expectedArrival
                      ? ` · ETA ${times.expectedArrival}`
                      : ''}
                  </Text>
                )}
              </>
            ) : (
              <View style={styles.liveLocRow}>
                <Ionicons
                  name={
                    phase === 'completed'
                      ? 'checkmark-circle'
                      : phase === 'soon'
                        ? 'time-outline'
                        : 'calendar-outline'
                  }
                  size={14}
                  color={Orange}
                />
                <Text style={styles.liveLoc} numberOfLines={4}>
                  {phaseBody || summary?.locationLabel || ''}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={[styles.alarmRow, alarm.armed && styles.alarmRowOn, alarm.sounding && styles.alarmRowAlert]}
            onPress={() => {
              if (alarm.sounding) {
                void alarm.silence();
                return;
              }
              if (alarm.armed) {
                Alert.alert(
                  'Arrival alarm',
                  `Alarm is on for ${toName} (${toCode}). Sound plays 5 min before arrival.`,
                  [
                    { text: 'Keep on', style: 'cancel' },
                    {
                      text: 'Turn off',
                      style: 'destructive',
                      onPress: () => void alarm.disarm(),
                    },
                  ]
                );
                return;
              }
              if (!alarm.canArm) {
                Alert.alert(
                  'Arrival alarm',
                  'Need live ETA for your station first. Pull live status, then try again.'
                );
                return;
              }
              void alarm.arm().then((r) => {
                if (!r.ok) {
                  Alert.alert('Arrival alarm', 'Could not set alarm yet.');
                  return;
                }
                Alert.alert(
                  'Alarm set',
                  `You'll get a sound alert ~5 minutes before arrival at ${toName} (${toCode}).`
                );
              });
            }}
            disabled={alarm.busy}
          >
            <Ionicons
              name={alarm.sounding ? 'alarm' : alarm.armed ? 'notifications' : 'notifications-outline'}
              size={16}
              color={alarm.sounding || alarm.armed ? '#fff' : Navy}
            />
            <Text
              style={[
                styles.alarmText,
                (alarm.armed || alarm.sounding) && styles.alarmTextOn,
              ]}
              numberOfLines={1}
            >
              {alarm.sounding
                ? 'Arriving soon · tap to silence'
                : alarm.armed
                  ? 'Alarm on · 5 min before your station'
                  : 'Set alarm · 5 min before arrival'}
            </Text>
          </Pressable>
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
          <View style={styles.infoCell}>
            <MaterialCommunityIcons name="train" size={16} color={Navy} />
            <View style={{ flex: 1, marginLeft: 4 }}>
              <Text style={styles.label}>TRAIN</Text>
              <GreenBlinkNumber
                number={String(trainNumber)}
                active={Boolean(live?.isLive && live.status === 'running')}
                onPress={openLiveStatus}
                style={{ marginTop: 2 }}
              />
              <Text style={styles.infoValue} numberOfLines={2}>
                {trainName || '—'}
              </Text>
              {!!trainType && (
                <Text style={styles.trainType} numberOfLines={1}>
                  {trainType}
                  {details?.runDays?.length
                    ? ` · ${details.runDays.map((d) => d.slice(0, 3)).join(' ')}`
                    : ''}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.vDivider} />
          <InfoCell icon="seat-passenger" label="CLASS" value={ticket.classType || '—'} />
          <View style={styles.vDivider} />
          <InfoCell
            icon="door"
            label={live?.isLive ? 'LIVE PF' : 'PLATFORM'}
            value={boardingPf ? String(boardingPf) : '—'}
          />
        </View>

        <Pressable style={styles.coachSection} onPress={() => setCoachOpen(true)}>
          <View style={styles.coachHead}>
            <MaterialCommunityIcons name="train" size={18} color={Orange} />
            <Text style={styles.coachTitle}>COACH POSITION</Text>
            <Text style={styles.coachCount}>
              {coachUnits.length
                ? `${coachUnits.length} units · Engine → last`
                : 'Tap to view'}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Label} />
          </View>
          {coachUnits.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.coachStrip}
            >
              {coachUnits.slice(0, 18).map((c) => {
                const mine =
                  passengerCoach &&
                  c.code.toUpperCase() === passengerCoach.toUpperCase();
                return (
                  <View
                    key={`${c.position}-${c.code}`}
                    style={[styles.miniCoach, mine && styles.miniCoachMine]}
                  >
                    <Text style={[styles.miniCode, mine && { color: Orange }]}>
                      {c.code}
                    </Text>
                    <Text style={styles.miniPos}>{c.position}</Text>
                  </View>
                );
              })}
              {coachUnits.length > 18 ? (
                <Text style={styles.miniMore}>+{coachUnits.length - 18}</Text>
              ) : null}
            </ScrollView>
          ) : (
            <Text style={styles.coachHint}>
              {passengerCoach
                ? `Your coach ${passengerCoach} · open for full rake & seat layout`
                : 'Open for engine → last coach order and seat layout'}
            </Text>
          )}
        </Pressable>

        <View style={styles.hDivider} />

        <View style={styles.bottomRow}>
          <View style={styles.passengerList}>
            <Text style={styles.label}>
              PASSENGERS ({passengers.length})
            </Text>
            {passengers.map((person, index) => {
              const seatLine = [
                person.coach ? `Coach ${person.coach}` : null,
                person.seat ? `Berth ${person.seat}` : null,
                formatBerth(person.berth),
              ]
                .filter(Boolean)
                .join(' · ');
              const st = person.currentStatus || person.status || 'CNF';
              return (
                <View
                  key={`${person.name}-${index}`}
                  style={[
                    styles.passengerRow,
                    index < passengers.length - 1 && styles.passengerRowBorder,
                  ]}
                >
                  <View style={styles.blueIcon}>
                    <Ionicons name="person" size={12} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.passengerName} numberOfLines={1}>
                      {index + 1}. {person.name || `Passenger ${index + 1}`}
                    </Text>
                    <Text style={styles.passengerMeta} numberOfLines={1}>
                      {seatLine || 'Seat TBA'}
                    </Text>
                    <Text style={styles.statusValue} numberOfLines={1}>
                      {st}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.qrCard}>
            <QRCode value={qr || pnr} size={qrSize} backgroundColor="#fff" color="#111" ecl="M" />
            <Text style={styles.scanTitle}>SCAN</Text>
          </View>
        </View>
    </View>
  );

  const sheets = (
    <>
      <Modal
        visible={tipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => void dismissTrainTip()}
      >
        <View style={styles.tipBackdrop}>
          <View style={styles.tipCard}>
            <View style={styles.tipIconWrap}>
              <MaterialCommunityIcons name="train" size={28} color={Orange} />
            </View>
            <Text style={styles.tipTitle}>Tap the train number</Text>
            <Text style={styles.tipBody}>
              On your boarding pass, tap the glowing train number to open live
              tracking. You’ll find:
            </Text>
            <View style={styles.tipList}>
              <TipLine icon="speedometer-outline" text="Live speed (GPS)" />
              <TipLine icon="navigate-outline" text="Live running status" />
              <TipLine icon="train-outline" text="Coach positions" />
            </View>
            <Pressable
              style={styles.tipPrimary}
              onPress={() => {
                void dismissTrainTip();
                openLiveStatus();
              }}
            >
              <Text style={styles.tipPrimaryText}>Got it · open live</Text>
            </Pressable>
            <Pressable style={styles.tipSecondary} onPress={() => void dismissTrainTip()}>
              <Text style={styles.tipSecondaryText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <TrainRouteSheet
        visible={routeOpen}
        onClose={() => setRouteOpen(false)}
        trainNumber={ticket.trainNumber}
        details={details}
        fromCode={ticket.fromCode}
        toCode={ticket.toCode}
        currentStationCode={live?.currentStationCode || live?.nextHaltCode}
      />
      <CoachCompositionSheet
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        coachPosition={details?.coachPosition}
        trainNumber={ticket.trainNumber}
        trainName={trainName}
        highlightCoach={passengerCoach}
        highlightSeat={passengerSeat}
      />
    </>
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
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PassSceneBackground variant="rail" />
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
      {sheets}
    </View>
  );
}

function TipLine({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  return (
    <View style={styles.tipLine}>
      <Ionicons name={icon} size={18} color={Orange} />
      <Text style={styles.tipLineText}>{text}</Text>
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

function formatBerth(berth?: string): string | undefined {
  if (!berth) return undefined;
  const map: Record<string, string> = {
    LOWER: 'Lower',
    UPPER: 'Upper',
    MIDDLE: 'Middle',
    LB: 'Lower',
    MB: 'Middle',
    UB: 'Upper',
    SL: 'Side Lower',
    SU: 'Side Upper',
  };
  return map[berth.toUpperCase()] || berth;
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
  pnrValue: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#fff', marginTop: 1 },
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
    fontSize: 13,
    color: Navy,
    marginTop: 1,
  },
  code: { fontFamily: 'Outfit_700Bold', fontSize: 12, color: Navy, marginTop: 1 },
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
  routeHint: {
    marginTop: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 8,
    color: Label,
  },
  trainType: {
    marginTop: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 9,
    color: Label,
  },
  timeRow: { flexDirection: 'row', marginTop: 8 },
  timeCol: { flex: 1 },
  timeLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10, color: '#333' },
  timeValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#3476FF',
    marginTop: 1,
  },
  timeLate: { color: Orange },
  dateValue: { fontFamily: 'DMSans_700Bold', fontSize: 10, color: Navy, marginTop: 1 },
  pfBadge: {
    marginTop: 3,
    alignSelf: 'flex-start',
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: Orange,
  },
  liveBox: {
    marginTop: 8,
    backgroundColor: 'rgba(255,104,0,0.12)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  liveTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#9AA3B5',
  },
  liveDotOn: { backgroundColor: '#1FC77A' },
  liveDotSoon: { backgroundColor: '#F5C542' },
  liveDotDone: { backgroundColor: '#6B7280' },
  liveBoxQuiet: {
    backgroundColor: 'rgba(7,19,45,0.06)',
  },
  liveBoxDone: {
    backgroundColor: 'rgba(17,140,58,0.12)',
  },
  liveTitle: {
    flex: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: Navy,
  },
  pfPill: {
    backgroundColor: Navy,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pfPillLive: {
    backgroundColor: Green,
  },
  pfPillText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: '#fff',
  },
  liveLocRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  liveLoc: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    lineHeight: 13,
    color: Label,
  },
  liveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  liveMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 9,
    color: Navy,
    opacity: 0.75,
    flexShrink: 1,
  },
  etaText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: Orange,
  },
  alarmRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(7,19,45,0.12)',
  },
  alarmRowOn: {
    backgroundColor: Navy,
    borderColor: Navy,
  },
  alarmRowAlert: {
    backgroundColor: Orange,
    borderColor: Orange,
  },
  alarmText: {
    flex: 1,
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: Navy,
  },
  alarmTextOn: { color: '#fff' },
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
    backgroundColor: '#2A4A3A',
    marginLeft: -7,
  },
  notchRight: { marginLeft: 0, marginRight: -7 },
  notchDash: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dash: { flex: 1, height: 1, marginHorizontal: 2, backgroundColor: '#C8CDD6' },
  infoRow3: { flexDirection: 'row', alignItems: 'flex-start' },
  coachSection: {
    marginTop: 4,
    marginBottom: 2,
    backgroundColor: 'rgba(255,101,0,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  coachHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  coachTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: Navy,
    letterSpacing: 0.5,
  },
  coachCount: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: Label,
    textAlign: 'right',
  },
  coachStrip: { gap: 4, paddingRight: 4 },
  miniCoach: {
    minWidth: 36,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(7,19,45,0.1)',
    alignItems: 'center',
  },
  miniCoachMine: {
    borderColor: Orange,
    backgroundColor: 'rgba(255,101,0,0.1)',
  },
  miniCode: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: Navy,
  },
  miniPos: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 9,
    color: Label,
  },
  miniMore: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: Label,
    alignSelf: 'center',
    paddingHorizontal: 6,
  },
  coachHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: Label,
  },
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
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
  },
  passengerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D5DBE6',
  },
  blueIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3476FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  passengerName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: Navy,
  },
  passengerMeta: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: Label,
    marginTop: 1,
  },
  statusValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: BlueText,
    marginTop: 1,
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
  tipBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,19,45,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  tipCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },
  tipIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,101,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tipTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: Navy,
  },
  tipBody: {
    marginTop: 8,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: Label,
  },
  tipList: { marginTop: 16, gap: 10 },
  tipLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipLineText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 14,
    color: Navy,
  },
  tipPrimary: {
    marginTop: 20,
    backgroundColor: Orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tipPrimaryText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  tipSecondary: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tipSecondaryText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: Label,
  },
});
