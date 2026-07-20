import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useLiveTrainQuery } from '../../hooks/useLiveTrainStatus';
import { useTrainDetails } from '../../hooks/useTrainDetails';
import {
  formatIsoTime,
  formatJourneyDateLabel,
  LiveTrainStatus,
  RailRadarStop,
  toJourneyDateIso,
} from '../../services/railRadar';
import { SpeedMeter } from './SpeedMeter';
import { CoachCompositionSheet } from './CoachCompositionSheet';
import { parseCoachPosition } from '../../utils/coachComposition';
import { useGpsSpeed } from '../../hooks/useGpsSpeed';

const BG = '#07111F';
const CARD = '#0C1729';
const CYAN = '#00D4FF';
const BLUE = '#2979FF';
const GREEN = '#00E676';
const ORANGE = '#FF8A50';
const MUTED = '#94A3B8';
const BORDER = 'rgba(255,255,255,0.1)';

type Props = {
  trainNumber: string;
  journeyDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  travelTime?: string;
  fromCode?: string;
  toCode?: string;
  fromName?: string;
  toName?: string;
  pnr?: string;
  trainName?: string;
  /** Passenger coach to highlight in composition */
  coach?: string;
  /** Passenger berth/seat number */
  seat?: string;
  onBack?: () => void;
};

export function WhereIsMyTrainView({
  trainNumber,
  journeyDate,
  departureTime,
  arrivalDate,
  arrivalTime,
  travelTime,
  fromCode,
  toCode,
  fromName,
  toName,
  pnr,
  trainName: trainNameHint,
  coach,
  seat,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [coachOpen, setCoachOpen] = useState(false);
  const {
    live,
    times,
    summary,
    loading: liveLoading,
    error: liveError,
    refresh: refreshLive,
    phase,
  } = useLiveTrainQuery({
    trainNumber,
    journeyDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    travelTime,
    fromCode,
    toCode,
    pnr,
    force: true,
  });
  const showLiveDetails = Boolean(summary?.showLiveDetails);
  const gps = useGpsSpeed(showLiveDetails);

  const {
    details,
    loading: detailsLoading,
    error: detailsError,
    refresh: refreshDetails,
  } = useTrainDetails(trainNumber);

  const loading = liveLoading || detailsLoading;
  const coachCount = useMemo(
    () => parseCoachPosition(details?.coachPosition).length,
    [details?.coachPosition]
  );

  const halts = useMemo(
    () =>
      mergeHalts(live?.route, details?.halts, {
        fromCode,
        toCode,
        fromName,
        toName,
      }),
    [live?.route, details?.halts, fromCode, toCode, fromName, toName]
  );

  const titleName = live?.trainName || details?.trainName || trainNameHint || '';
  const trainSource = (details?.sourceCode || '').toUpperCase();
  const src = (fromCode || details?.sourceCode || '').toUpperCase();
  const dst = (toCode || details?.destinationCode || '').toUpperCase();
  const dayHeader = useMemo(
    () => formatDayHeader(journeyDate || live?.startDate),
    [journeyDate, live?.startDate]
  );
  const rawStats = useMemo(
    () => computeJourneyStats(halts, live),
    [halts, live]
  );
  const stableKmRef = useRef<{ next?: string; km?: number }>({});
  const stableKmToNext = useMemo(() => {
    const nextKey = rawStats.nextName || live?.nextHaltCode || '';
    const raw = rawStats.kmToNext;
    const prev = stableKmRef.current;

    // New next station → reset
    if (nextKey && nextKey !== prev.next) {
      stableKmRef.current = { next: nextKey, km: raw };
      return raw;
    }

    // No fresh reading → keep last
    if (raw == null) return prev.km;

    // Reject upward spikes (typical when segmentProgress briefly missing → full segment)
    if (prev.km != null && raw > prev.km + 12) {
      return prev.km;
    }

    // Light smoothing toward new value
    const blended =
      prev.km == null ? raw : Math.round(prev.km * 0.55 + raw * 0.45);
    stableKmRef.current = { next: nextKey || prev.next, km: blended };
    return blended;
  }, [rawStats.kmToNext, rawStats.nextName, live?.nextHaltCode]);

  const stats = showLiveDetails
    ? { ...rawStats, kmToNext: stableKmToNext }
    : {
        ...rawStats,
        journeyPct: 0,
        kmToNext: undefined,
        nextName: undefined,
        nextEtaIso: undefined,
      };
  const speed = showLiveDetails ? gps.speedKmh : 0;
  const etaNext = showLiveDetails
    ? clock(stats.nextEtaIso) || times?.expectedArrival
    : undefined;

  const trainPos = useMemo(
    () =>
      showLiveDetails
        ? resolveTrainPosition(halts, live)
        : { kind: 'none' as const },
    [showLiveDetails, halts, live]
  );

  const delayMins = showLiveDetails ? live?.delayMinutes ?? 0 : 0;
  const punctualityLabel =
    !showLiveDetails
      ? undefined
      : delayMins <= 0
        ? 'On time'
        : delayMins === 1
          ? '1 min late'
          : `${delayMins} min late`;

  const refreshAll = async () => {
    await Promise.all([refreshLive({ bypassCache: true }), refreshDetails()]);
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: [
          `${trainNumber}${titleName ? ` ${titleName}` : ''}`,
          src && dst ? `${src} → ${dst}` : '',
          stats.nextName
            ? `${stats.kmToNext != null ? `${stats.kmToNext} km ` : ''}to ${stats.nextName}`
            : '',
          'via Travel ID',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.trainBadge}>
          <MaterialCommunityIcons name="train" size={18} color={CYAN} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {trainNumber}
            {titleName ? ` ${titleName}` : ''}
          </Text>
          {!!(src || dst) && (
            <View style={styles.routePill}>
              <Text style={styles.routeText}>
                {src || '—'} → {dst || '—'}
              </Text>
            </View>
          )}
        </View>
        <Pressable style={styles.iconBtn} onPress={() => void refreshAll()}>
          {loading ? (
            <ActivityIndicator color={CYAN} size="small" />
          ) : (
            <Ionicons name="ellipsis-vertical" size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <RoundChip icon="calendar-outline" label={dayHeader.short} />
        <RoundChip
          icon="alarm-outline"
          label="Alarm"
          onPress={() =>
            Alert.alert('Alarm', 'Set arrival alarm from your boarding pass.')
          }
        />
        <RoundChip
          icon="train-outline"
          label={coachCount ? `Coach · ${coachCount}` : 'Coach'}
          onPress={() => setCoachOpen(true)}
        />
        <RoundChip icon="share-social-outline" label="Share" onPress={() => void onShare()} />
      </ScrollView>

      <CoachCompositionSheet
        visible={coachOpen}
        onClose={() => setCoachOpen(false)}
        coachPosition={details?.coachPosition}
        trainNumber={trainNumber}
        trainName={titleName}
        highlightCoach={coach}
        highlightSeat={seat}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingHorizontal: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshAll()}
            tintColor={CYAN}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Dashboard: full-width fitting image on top, then stats */}
        <View style={styles.dashCard}>
          <View style={styles.heroBox}>
            <Image
              source={require('../../../assets/vehicles/live-hero-vande.png')}
              style={styles.heroImg}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(7,17,31,0.55)', CARD]}
              locations={[0.35, 0.75, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>

          <View style={styles.dashBody}>
            <View style={styles.dashLeft}>
              <Text style={styles.label}>
                {showLiveDetails
                  ? 'Next stop in'
                  : phase === 'completed'
                    ? 'Status'
                    : 'Journey'}
              </Text>
              <View style={styles.kmRow}>
                <Text style={styles.kmBig}>
                  {showLiveDetails && stats.kmToNext != null
                    ? stats.kmToNext
                    : '—'}
                </Text>
                <Text style={styles.kmUnit}>km</Text>
              </View>
              <Text style={styles.toName} numberOfLines={2}>
                {!showLiveDetails
                  ? summary?.phaseTitle || 'Journey status'
                  : stats.nextName
                    ? `to ${stats.nextName}`
                    : summary?.locationLabel || 'Next halt TBA'}
              </Text>
              <View style={styles.miniTrackWrap}>
                <View style={styles.miniTrack}>
                  <View
                    style={[
                      styles.miniFill,
                      { width: `${clamp(stats.journeyPct, 6, 100)}%` },
                    ]}
                  />
                </View>
                <MaterialCommunityIcons
                  name="train"
                  size={14}
                  color={CYAN}
                  style={[styles.miniTrain, { left: `${clamp(stats.journeyPct, 0, 88)}%` }]}
                />
              </View>
              <Text style={styles.eta}>
                {!showLiveDetails
                  ? phase === 'completed'
                    ? 'Journey completed'
                    : phase === 'soon'
                      ? 'Available soon'
                      : 'Not live yet'
                  : etaNext
                    ? `ETA ${etaNext}`
                    : liveError
                      ? liveError.toLowerCase().includes('rate')
                        ? 'Rate limited — retry soon'
                        : liveError.length > 48
                          ? `${liveError.slice(0, 45)}…`
                          : liveError
                      : 'ETA —'}
              </Text>
            </View>

            <View style={styles.dashRight}>
              <SpeedMeter
                speedKmh={showLiveDetails ? speed : 0}
                live={Boolean(showLiveDetails && gps.tracking)}
                size="sm"
              />
              {showLiveDetails && (
                <Text style={styles.gpsHint} numberOfLines={2}>
                  {gps.permission === 'denied'
                    ? 'Allow location for GPS speed'
                    : gps.error
                      ? gps.error
                      : gps.tracking
                        ? 'GPS speed · your phone'
                        : 'Waiting for GPS…'}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{dayHeader.long}</Text>
          <Text style={styles.haltCount}>
            {halts.length ? `${halts.length} stops` : 'Route'}
          </Text>
        </View>

        {showLiveDetails && !!halts.length && (
          <View style={styles.progressBanner}>
            <MaterialCommunityIcons name="train" size={18} color={CYAN} />
            <View style={{ flex: 1 }}>
              <Text style={styles.progressBannerTitle} numberOfLines={1}>
                {trainPos.kind === 'at' && trainPos.stationName
                  ? `At ${trainPos.stationName}`
                  : stats.kmToNext != null && stats.nextName
                    ? `${stats.kmToNext} km to ${stats.nextName}`
                    : summary?.locationLabel || 'En route'}
              </Text>
              <Text style={styles.progressBannerSub} numberOfLines={1}>
                {[
                  punctualityLabel,
                  etaNext ? `ETA ${etaNext}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Live running'}
              </Text>
            </View>
            <View
              style={[
                styles.punctPill,
                delayMins > 0 ? styles.punctLate : styles.punctOk,
              ]}
            >
              <Text style={styles.punctPillText}>
                {punctualityLabel || '—'}
              </Text>
            </View>
          </View>
        )}

        {/* Station list — always show something */}
        {detailsLoading && !halts.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={CYAN} />
            <Text style={styles.emptyText}>Loading stations…</Text>
          </View>
        ) : !halts.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Stations unavailable</Text>
            <Text style={styles.emptyText}>
              {detailsError ||
                'Could not load the route. Check internet and tap Refresh.'}
            </Text>
            <Pressable style={styles.retryBtn} onPress={() => void refreshAll()}>
              <Text style={styles.retryText}>Refresh route</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            {halts.map((stop, index) => {
              const code = String(stop.stationCode || '').toUpperCase();
              const isSourceStation =
                index === 0 || (!!trainSource && code === trainSource);
              const isNext =
                trainPos.kind === 'between'
                  ? trainPos.toIndex === index
                  : trainPos.kind === 'at'
                    ? trainPos.index + 1 === index
                    : false;
              return (
                <StationCard
                  key={`${stop.stationCode}-${stop.sequence}-${index}`}
                  stop={stop}
                  live={showLiveDetails ? live : undefined}
                  isFirst={index === 0}
                  isLast={index === halts.length - 1}
                  isYours={isYourStation(stop, fromCode, toCode)}
                  isCurrent={
                    showLiveDetails ? isCurrentStop(stop, live) : false
                  }
                  showPlatform={isSourceStation}
                  trainOnStation={
                    trainPos.kind === 'at' && trainPos.index === index
                  }
                  trainOnOutgoing={
                    trainPos.kind === 'between' && trainPos.fromIndex === index
                  }
                  segmentProgress={
                    trainPos.kind === 'between' ? trainPos.progress : 0
                  }
                  kmToNext={
                    trainPos.kind === 'between' && trainPos.fromIndex === index
                      ? trainPos.kmRemaining
                      : isNext
                        ? stats.kmToNext
                        : undefined
                  }
                  delayMinutes={showLiveDetails ? delayMins : 0}
                  isNextStop={isNext}
                />
              );
            })}
          </View>
        )}

        <View style={styles.journeyCard}>
          <View style={styles.journeyTop}>
            <JourneyRing pct={stats.journeyPct} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.journeyTitle} numberOfLines={3}>
                {!showLiveDetails
                  ? summary?.phaseBody ||
                    summary?.departureLabel ||
                    'Live tracking unlocks closer to departure'
                  : stats.kmToNext != null && stats.nextName
                    ? `${stats.kmToNext} km to ${stats.nextName}`
                    : summary?.locationLabel || 'Journey progress'}
              </Text>
              <Text style={styles.journeySub}>
                {!showLiveDetails
                  ? summary?.departureLabel ||
                    (phase === 'completed'
                      ? 'Tracking ended'
                      : 'Live tracking locked')
                  : halts.length
                    ? `${Math.round(stats.journeyPct)}% · ${halts.length} stops`
                    : 'Next stop'}
                {showLiveDetails && etaNext ? ` · ETA ${etaNext}` : ''}
              </Text>
            </View>
            <Pressable style={styles.refreshBtn} onPress={() => void refreshAll()}>
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="refresh" size={15} color="#fff" />
                  <Text style={styles.refreshTxt}>Refresh</Text>
                </>
              )}
            </Pressable>
          </View>
          <View style={styles.barTrack}>
            <LinearGradient
              colors={[CYAN, BLUE]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.barFill, { width: `${clamp(stats.journeyPct, 4, 100)}%` }]}
            />
            <View style={[styles.barTrain, { left: `${clamp(stats.journeyPct, 0, 90)}%` }]}>
              <MaterialCommunityIcons name="train" size={16} color={CYAN} />
            </View>
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabel}>{src || 'Origin'}</Text>
            <Text style={styles.barLabel}>Destination {dst || '—'}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function RoundChip({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.roundChip} onPress={onPress}>
      <Ionicons name={icon} size={15} color="#fff" />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function StationCard({
  stop,
  live,
  isFirst,
  isLast,
  isYours,
  isCurrent,
  showPlatform,
  trainOnStation,
  trainOnOutgoing,
  segmentProgress,
  kmToNext,
  delayMinutes,
  isNextStop,
}: {
  stop: RailRadarStop;
  live?: LiveTrainStatus;
  isFirst: boolean;
  isLast: boolean;
  isYours: boolean;
  isCurrent: boolean;
  showPlatform?: boolean;
  trainOnStation?: boolean;
  trainOnOutgoing?: boolean;
  segmentProgress?: number;
  kmToNext?: number;
  delayMinutes?: number;
  isNextStop?: boolean;
}) {
  const status = String(stop.status || '').toLowerCase();
  const done = status === 'departed' || status === 'skipped';
  const here =
    trainOnStation ||
    isCurrent ||
    status === 'arrived' ||
    status === 'at-station';
  const stopDelay = stop.delayArrival ?? stop.delayDeparture ?? delayMinutes ?? 0;
  const late = stopDelay > 0;
  const schArr = clock(stop.scheduledArrival);
  const schDep = clock(stop.scheduledDeparture);
  const expArr =
    clock(stop.actualArrival) ||
    expectedFromDelay(stop.scheduledArrival, stop.delayArrival, delayMinutes);
  const expDep =
    clock(stop.actualDeparture) ||
    expectedFromDelay(stop.scheduledDeparture, stop.delayDeparture, delayMinutes);
  const mainTime = isFirst ? schDep || '—' : schArr || schDep || '—';
  const liveTime = isFirst
    ? expDep && expDep !== schDep
      ? expDep
      : late
        ? expectedFromDelay(stop.scheduledDeparture, stopDelay, undefined)
        : undefined
    : expArr && expArr !== schArr
      ? expArr
      : late
        ? expectedFromDelay(stop.scheduledArrival, stopDelay, undefined)
        : undefined;
  const dist =
    typeof stop.distance === 'number' ? `${Math.round(stop.distance)} km` : undefined;
  const pf = showPlatform ? cleanPf(stop.platform) : undefined;
  const name = stop.stationName || stop.stationCode || 'Station';
  const punctual =
    done || here
      ? late
        ? `${stopDelay} min late`
        : 'On time'
      : late
        ? `Likely ${stopDelay} min late`
        : 'On time';

  const progressAnim = useRef(new Animated.Value(segmentProgress || 0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: clamp(segmentProgress || 0, 0, 1),
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [segmentProgress, progressAnim]);

  const trainTop = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '78%'],
  });

  return (
    <View style={styles.stationRow}>
      <View style={styles.railCol}>
        {!isFirst ? (
          <View style={[styles.railLine, (done || here) && styles.railOn]} />
        ) : (
          <View style={styles.railSpacer} />
        )}
        <View
          style={[
            styles.stationIcon,
            (here || isYours || trainOnStation) && styles.stationIconOn,
            trainOnStation && styles.stationIconTrain,
          ]}
        >
          <MaterialCommunityIcons
            name={
              trainOnStation
                ? 'train'
                : isFirst
                  ? 'city-variant-outline'
                  : isLast
                    ? 'flag-checkered'
                    : 'office-building-outline'
            }
            size={18}
            color={here || isYours || trainOnStation ? CYAN : MUTED}
          />
        </View>
        {!isLast ? (
          <View style={styles.railOutgoing}>
            <View
              style={[
                styles.railLineFill,
                (done || here || trainOnOutgoing) && styles.railOn,
              ]}
            />
            {trainOnOutgoing && (
              <Animated.View style={[styles.movingTrain, { top: trainTop }]}>
                <View style={styles.movingTrainBubble}>
                  <MaterialCommunityIcons name="train" size={16} color={BG} />
                </View>
                {kmToNext != null && (
                  <Text style={styles.movingKm}>{kmToNext} km</Text>
                )}
              </Animated.View>
            )}
          </View>
        ) : (
          <View style={styles.railSpacer} />
        )}
      </View>

      <View
        style={[
          styles.stationCard,
          here && styles.stationCardHere,
          isYours && styles.stationCardYours,
          isNextStop && styles.stationCardNext,
        ]}
      >
        <View style={styles.stationInner}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {(isFirst || here || isYours || isNextStop) && (
              <View
                style={[
                  styles.badge,
                  here
                    ? styles.badgeNow
                    : isNextStop
                      ? styles.badgeNext
                      : isYours
                        ? styles.badgeYours
                        : styles.badgeStart,
                ]}
              >
                <Text style={styles.badgeText}>
                  {here
                    ? 'TRAIN HERE'
                    : isNextStop
                      ? 'NEXT STOP'
                      : isFirst
                        ? 'START'
                        : 'YOUR STOP'}
                </Text>
              </View>
            )}
            <Text style={styles.stationName} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.stationMeta} numberOfLines={2}>
              {[
                isNextStop && kmToNext != null ? `${kmToNext} km left` : null,
                dist || (isFirst ? '0 km' : null),
                pf ? `Platform ${pf}` : null,
                stop.stationCode,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text
              style={[
                styles.punctText,
                late ? styles.punctTextLate : styles.punctTextOk,
              ]}
            >
              {punctual}
            </Text>
            {(isFirst || isYours) && (
              <Pressable style={styles.dirBtn} onPress={() => void openMaps(stop)}>
                <MaterialCommunityIcons name="google-maps" size={14} color={CYAN} />
                <Text style={styles.dirText}>Get directions</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.times}>
            <Text style={styles.timeLabelTiny}>
              {isFirst ? 'Sch dep' : 'Sch arr'}
            </Text>
            <Text style={styles.timeMain}>{mainTime}</Text>
            {!!liveTime && (
              <>
                <Text style={styles.timeLabelTiny}>
                  {late ? 'Exp' : 'Live'}
                </Text>
                <Text
                  style={[styles.timeAlt, late ? styles.timeLate : styles.timeOk]}
                >
                  {liveTime}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function JourneyRing({ pct }: { pct: number }) {
  const size = 64;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamp(pct, 0, 100) / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={CYAN}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringPct}>{Math.round(pct)}%</Text>
        <Text style={styles.ringLabel}>Journey</Text>
      </View>
    </View>
  );
}

function mergeHalts(
  liveRoute: RailRadarStop[] | undefined,
  detailsHalts:
    | Array<{
        sequence: number;
        stationCode: string;
        stationName: string;
        arrival?: string;
        departure?: string;
        platform?: string;
        distance?: number;
      }>
    | undefined,
  ticket: {
    fromCode?: string;
    toCode?: string;
    fromName?: string;
    toName?: string;
  }
): RailRadarStop[] {
  const schedule = (detailsHalts || []).map(
    (h): RailRadarStop => ({
      sequence: h.sequence,
      stationCode: h.stationCode,
      stationName: h.stationName || h.stationCode,
      isHalt: true,
      scheduledArrival: h.arrival || null,
      scheduledDeparture: h.departure || null,
      platform: h.platform,
      distance: h.distance,
      status: 'upcoming',
    })
  );

  const live = (liveRoute || []).filter(
    (s) => s.isHalt !== false && (s.stationCode || s.stationName)
  );

  if (live.length) {
    const byCode = new Map(schedule.map((h) => [h.stationCode.toUpperCase(), h]));
    return live.map((stop, i) => {
      const sch = byCode.get(String(stop.stationCode || '').toUpperCase());
      const name =
        (stop.stationName && stop.stationName !== stop.stationCode
          ? stop.stationName
          : undefined) ||
        sch?.stationName ||
        stop.stationName ||
        stop.stationCode ||
        `Stop ${i + 1}`;
      return {
        ...sch,
        ...stop,
        stationName: name,
        stationCode: stop.stationCode || sch?.stationCode || name,
        platform: cleanPf(stop.platform) || sch?.platform || stop.platform,
        distance: stop.distance ?? sch?.distance,
        scheduledArrival: stop.scheduledArrival || sch?.scheduledArrival,
        scheduledDeparture: stop.scheduledDeparture || sch?.scheduledDeparture,
      };
    });
  }

  if (schedule.length) return schedule;

  // Last resort: boarding + destination from ticket so page is never empty
  const fromCode = (ticket.fromCode || '').toUpperCase();
  const toCode = (ticket.toCode || '').toUpperCase();
  if (!fromCode && !toCode && !ticket.fromName && !ticket.toName) return [];

  return [
    {
      sequence: 1,
      stationCode: fromCode || 'FROM',
      stationName: ticket.fromName || fromCode || 'Boarding',
      isHalt: true,
      status: 'upcoming',
      distance: 0,
    },
    {
      sequence: 2,
      stationCode: toCode || 'TO',
      stationName: ticket.toName || toCode || 'Destination',
      isHalt: true,
      status: 'upcoming',
    },
  ];
}

function resolveTrainPosition(
  halts: RailRadarStop[],
  live?: LiveTrainStatus
):
  | { kind: 'none' }
  | { kind: 'at'; index: number; stationName?: string }
  | {
      kind: 'between';
      fromIndex: number;
      toIndex: number;
      progress: number;
      kmRemaining?: number;
    } {
  if (!halts.length || !live) return { kind: 'none' };

  const runStatus = String(live.status || '').toLowerCase();
  if (runStatus === 'not-started' || runStatus === 'cancelled') {
    return {
      kind: 'at',
      index: 0,
      stationName: halts[0]?.stationName,
    };
  }

  let currentIdx = halts.findIndex((h) => {
    if (live.currentStationCode) {
      return (
        h.stationCode.toUpperCase() === live.currentStationCode.toUpperCase()
      );
    }
    return ['arrived', 'at-station'].includes(
      String(h.status || '').toLowerCase()
    );
  });

  const nextIdx = halts.findIndex((h) => {
    if (live.nextHaltCode) {
      return h.stationCode.toUpperCase() === live.nextHaltCode.toUpperCase();
    }
    return ['upcoming', 'arriving'].includes(
      String(h.status || '').toLowerCase()
    );
  });

  const stopStatus = String(live.currentStopStatus || '').toLowerCase();
  const atStation =
    currentIdx >= 0 &&
    (stopStatus === 'arrived' ||
      stopStatus === 'at-station' ||
      ['arrived', 'at-station'].includes(
        String(halts[currentIdx]?.status || '').toLowerCase()
      ));

  if (atStation) {
    return {
      kind: 'at',
      index: currentIdx,
      stationName: halts[currentIdx]?.stationName,
    };
  }

  // Between last departed and next
  const departedCount = halts.filter((h) =>
    ['departed', 'skipped'].includes(String(h.status || '').toLowerCase())
  ).length;
  let fromIndex =
    currentIdx >= 0
      ? currentIdx
      : Math.max(0, departedCount - 1);
  if (fromIndex < 0) fromIndex = 0;

  let toIndex = nextIdx >= 0 ? nextIdx : fromIndex + 1;
  if (toIndex <= fromIndex) toIndex = Math.min(halts.length - 1, fromIndex + 1);
  if (toIndex <= fromIndex) {
    return {
      kind: 'at',
      index: fromIndex,
      stationName: halts[fromIndex]?.stationName,
    };
  }

  // Prefer API km when progress is known; never treat missing progress as 0%
  // (that incorrectly shows the full segment length).
  const progress =
    typeof live.segmentProgress === 'number'
      ? clamp(live.segmentProgress, 0, 1)
      : 0;
  const from = halts[fromIndex];
  const to = halts[toIndex];
  let kmRemaining: number | undefined =
    typeof live.kmToNext === 'number' ? live.kmToNext : undefined;
  if (
    kmRemaining == null &&
    typeof live.segmentProgress === 'number' &&
    typeof from?.distance === 'number' &&
    typeof to?.distance === 'number'
  ) {
    const rem = to.distance - from.distance;
    kmRemaining =
      rem > 0
        ? Math.max(0, Math.round(rem * (1 - progress)))
        : undefined;
  }

  return {
    kind: 'between',
    fromIndex,
    toIndex,
    progress,
    kmRemaining,
  };
}

function computeJourneyStats(halts: RailRadarStop[], live?: LiveTrainStatus) {
  const runStatus = String(live?.status || '').toLowerCase();
  const nextCode = live?.nextHaltCode?.toUpperCase();
  const prevCode = live?.previousHaltCode?.toUpperCase();
  const nextHalt =
    halts.find((h) => h.stationCode.toUpperCase() === nextCode) ||
    halts.find((h) =>
      ['upcoming', 'arriving'].includes(String(h.status || '').toLowerCase())
    );

  const departedCount = halts.filter((h) =>
    ['departed', 'skipped'].includes(String(h.status || '').toLowerCase())
  ).length;

  let currentIdx = halts.findIndex((h) => {
    if (live?.currentStationCode) {
      return h.stationCode.toUpperCase() === live.currentStationCode.toUpperCase();
    }
    return ['arrived', 'at-station'].includes(String(h.status || '').toLowerCase());
  });
  if (currentIdx < 0) currentIdx = Math.max(0, departedCount - 1);

  const lastWithDist = [...halts]
    .reverse()
    .find((h) => typeof h.distance === 'number' && h.distance > 0);
  const totalDist =
    typeof lastWithDist?.distance === 'number' ? lastWithDist.distance : 0;

  // Just started / not moving yet — show 0% journey, not mid-route leftovers
  if (runStatus === 'not-started' || runStatus === 'cancelled') {
    const first = halts[0];
    const second = nextHalt || halts[1];
    let kmToNext: number | undefined;
    if (
      first &&
      second &&
      typeof first.distance === 'number' &&
      typeof second.distance === 'number'
    ) {
      kmToNext = Math.max(0, Math.round(second.distance - first.distance));
    } else if (second && typeof second.distance === 'number') {
      kmToNext = Math.max(0, Math.round(second.distance));
    }
    return {
      journeyPct: 0,
      kmToNext,
      nextName: second?.stationName || live?.nextHaltName,
      nextEtaIso: second?.scheduledArrival || undefined,
    };
  }

  const prev =
    (prevCode
      ? halts.find((h) => h.stationCode.toUpperCase() === prevCode)
      : undefined) ||
    (currentIdx >= 0 ? halts[currentIdx] : undefined);
  const next =
    nextHalt || (currentIdx >= 0 ? halts[currentIdx + 1] : undefined);
  const seg =
    live?.segmentProgress != null ? clamp(live.segmentProgress, 0, 1) : undefined;

  let journeyPct = 0;
  if (totalDist > 0 && prev && typeof prev.distance === 'number') {
    let traveled = prev.distance;
    if (
      next &&
      typeof next.distance === 'number' &&
      next.distance > prev.distance &&
      typeof seg === 'number'
    ) {
      traveled += (next.distance - prev.distance) * seg;
    }
    journeyPct = (traveled / totalDist) * 100;
  } else if (halts.length > 1) {
    const idx = Math.max(0, currentIdx);
    journeyPct = ((idx + (seg ?? 0)) / (halts.length - 1)) * 100;
  }

  // Prefer API-computed remaining km (previousHalt → nextHalt × progress)
  let kmToNext: number | undefined =
    typeof live?.kmToNext === 'number' ? live.kmToNext : undefined;

  if (
    kmToNext == null &&
    prev &&
    next &&
    typeof prev.distance === 'number' &&
    typeof next.distance === 'number' &&
    typeof seg === 'number'
  ) {
    const rem = next.distance - prev.distance;
    kmToNext =
      rem > 0 ? Math.max(0, Math.round(rem * (1 - seg))) : 0;
  }
  // If progress is missing, leave kmToNext undefined — UI keeps last stable value

  return {
    journeyPct: clamp(journeyPct, 0, 100),
    kmToNext,
    nextName: next?.stationName || live?.nextHaltName,
    nextEtaIso: (() => {
      const raw = next?.actualArrival || next?.scheduledArrival;
      if (!raw) return undefined;
      if (next?.actualArrival) return next.actualArrival;
      const delay = next?.delayArrival ?? live?.delayMinutes ?? 0;
      if (!delay) return raw;
      const d = parseScheduleDate(raw);
      if (!d) return raw;
      d.setMinutes(d.getMinutes() + delay);
      return d.toISOString();
    })(),
  };
}

function isYourStation(stop: RailRadarStop, from?: string, to?: string) {
  const code = stop.stationCode.toUpperCase();
  return Boolean(
    (from && code === from.toUpperCase()) || (to && code === to.toUpperCase())
  );
}

function isCurrentStop(stop: RailRadarStop, live?: LiveTrainStatus) {
  if (!live) return false;
  if (live.currentStationCode?.toUpperCase() === stop.stationCode.toUpperCase()) return true;
  return ['arrived', 'at-station'].includes(String(stop.status || '').toLowerCase());
}

function clock(value?: string | null): string | undefined {
  if (!value) return undefined;
  const iso = formatIsoTime(value);
  if (iso) return to12h(iso);
  const m = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  return to12h(`${m[1].padStart(2, '0')}:${m[2]}`);
}

function to12h(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${ampm}`;
}

function parseScheduleDate(scheduled?: string | null): Date | null {
  if (!scheduled) return null;
  const asIso = new Date(scheduled);
  if (!Number.isNaN(asIso.getTime()) && /T|\d{4}-\d{2}/.test(scheduled)) {
    return asIso;
  }
  const m = String(scheduled).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function expectedFromDelay(
  scheduled?: string | null,
  stopDelay?: number | null,
  liveDelay?: number
): string | undefined {
  if (!scheduled) return undefined;
  const mins = stopDelay ?? liveDelay;
  if (mins == null || mins === 0) return undefined;
  const d = parseScheduleDate(scheduled);
  if (!d) return undefined;
  d.setMinutes(d.getMinutes() + mins);
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function cleanPf(value?: string | null) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null') return undefined;
  return s;
}

function formatDayHeader(input?: string): { short: string; long: string } {
  const iso = toJourneyDateIso(input);
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return { short: 'Today', long: 'Day 1' };
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const long = `Day 1 · ${months[d.getMonth()]} ${d.getDate()}, ${weekdays[d.getDay()]}`;
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const short = iso && iso === todayIso ? 'Today' : `${months[d.getMonth()]} ${d.getDate()}`;
  return { short, long };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function openMaps(stop: RailRadarStop) {
  const q = encodeURIComponent(`${stop.stationName} railway station ${stop.stationCode}`);
  try {
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  } catch {
    Alert.alert('Maps', 'Could not open Google Maps.');
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trainBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  routePill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
  },
  routeText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  chips: { paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  roundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(12,23,41,0.9)',
  },
  chipText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#fff',
  },
  dashCard: {
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.22)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  heroBox: {
    width: '100%',
    height: 168,
    backgroundColor: '#040910',
  },
  heroImg: {
    width: '100%',
    height: '100%',
  },
  dashBody: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },
  dashLeft: { flex: 1.1, minWidth: 0 },
  dashRight: {
    flex: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsHint: {
    marginTop: 6,
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    lineHeight: 13,
    color: MUTED,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: MUTED,
  },
  kmRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  kmBig: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 44,
    color: CYAN,
    lineHeight: 48,
  },
  kmUnit: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 18,
    color: CYAN,
    marginBottom: 6,
  },
  toName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 16,
    color: '#fff',
    marginTop: 2,
  },
  miniTrackWrap: {
    marginTop: 12,
    height: 16,
    justifyContent: 'center',
  },
  miniTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  miniFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: CYAN,
  },
  miniTrain: { position: 'absolute', top: -1 },
  eta: {
    marginTop: 6,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  haltCount: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  emptyText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  stationRow: { flexDirection: 'row', minHeight: 100 },
  railCol: { width: 48, alignItems: 'center' },
  railLine: {
    flex: 1,
    width: 3,
    backgroundColor: 'rgba(0,212,255,0.18)',
  },
  railOutgoing: {
    flex: 1,
    width: 48,
    alignItems: 'center',
    minHeight: 36,
    position: 'relative',
  },
  railLineFill: {
    flex: 1,
    width: 3,
    backgroundColor: 'rgba(0,212,255,0.18)',
  },
  railOn: { backgroundColor: CYAN },
  railSpacer: { flex: 1 },
  stationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,212,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(0,212,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stationIconOn: {
    borderColor: CYAN,
    backgroundColor: 'rgba(0,212,255,0.18)',
  },
  stationIconTrain: {
    borderColor: GREEN,
    backgroundColor: 'rgba(0,230,118,0.2)',
  },
  movingTrain: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  movingTrainBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CYAN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  movingKm: {
    marginTop: 2,
    fontFamily: 'Outfit_700Bold',
    fontSize: 9,
    color: CYAN,
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,212,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.28)',
  },
  progressBannerTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  progressBannerSub: {
    marginTop: 2,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  punctPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  punctOk: { backgroundColor: 'rgba(0,230,118,0.18)' },
  punctLate: { backgroundColor: 'rgba(255,138,80,0.2)' },
  punctPillText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: '#fff',
  },
  stationCardNext: {
    borderColor: 'rgba(0,212,255,0.55)',
    backgroundColor: 'rgba(0,212,255,0.08)',
  },
  badgeNext: { backgroundColor: 'rgba(0,212,255,0.22)' },
  punctText: {
    marginTop: 4,
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
  },
  punctTextOk: { color: GREEN },
  punctTextLate: { color: ORANGE },
  timeLabelTiny: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 9,
    color: MUTED,
    textAlign: 'right',
  },
  stationCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
    marginBottom: 10,
  },
  stationCardHere: {
    borderColor: 'rgba(0,212,255,0.4)',
    backgroundColor: 'rgba(0,212,255,0.06)',
  },
  stationCardYours: { borderColor: 'rgba(255,138,80,0.4)' },
  stationInner: { flexDirection: 'row', gap: 8 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 5,
  },
  badgeStart: { backgroundColor: 'rgba(0,230,118,0.18)' },
  badgeNow: { backgroundColor: 'rgba(0,212,255,0.2)' },
  badgeYours: { backgroundColor: 'rgba(255,138,80,0.2)' },
  badgeText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    color: GREEN,
    letterSpacing: 0.4,
  },
  stationName: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  stationMeta: {
    marginTop: 3,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  dirBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(41,121,255,0.22)',
  },
  dirText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: CYAN,
  },
  times: { alignItems: 'flex-end', minWidth: 66 },
  timeMain: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  timeAlt: {
    marginTop: 3,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
  },
  timeLate: { color: ORANGE },
  timeOk: { color: GREEN },
  journeyCard: {
    marginTop: 6,
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.22)',
    padding: 14,
  },
  journeyTop: { flexDirection: 'row', alignItems: 'center' },
  journeyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: CYAN,
  },
  journeySub: {
    marginTop: 3,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshTxt: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: '#fff',
  },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringPct: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  ringLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 9,
    color: MUTED,
  },
  barTrack: {
    marginTop: 14,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.2)',
    justifyContent: 'center',
  },
  barFill: { height: 7, borderRadius: 999 },
  barTrain: { position: 'absolute', top: -8 },
  barLabels: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: MUTED,
  },
});
