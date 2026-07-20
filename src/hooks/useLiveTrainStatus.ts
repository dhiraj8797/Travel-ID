import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ticket } from '../types/ticket';
import {
  BoardingLiveTimes,
  clearLiveTrainCache,
  fetchLiveTrainStatus,
  formatJourneyDateLabel,
  getExpectedArrivalDate,
  LiveTrainStatus,
  minutesUntil,
  resolveBoardingLiveTimes,
} from '../services/railRadar';
import {
  getLiveJourneyPhase,
  livePhaseCopy,
  LiveJourneyPhase,
  resolveJourneyWindow,
  shouldFetchLiveStatus,
} from '../utils/journeyLive';

export type LiveTrainQuery = {
  trainNumber?: string;
  journeyDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  travelTime?: string;
  fromCode?: string;
  toCode?: string;
  pnr?: string;
  platform?: string;
  /** When true, always fetch (debug / explicit refresh). */
  force?: boolean;
};

type State = {
  loading: boolean;
  error?: string;
  live?: LiveTrainStatus;
  times?: BoardingLiveTimes;
  refreshedAt?: number;
  expectedArrivalAt?: Date;
  minutesToArrival?: number;
  phase: LiveJourneyPhase;
  journeyDateLabel?: string;
};

const REFRESH_MS = 150_000;

export function useLiveTrainQuery(query: LiveTrainQuery) {
  const trainNumber = query.trainNumber;
  const journeyDate = query.journeyDate;
  const fromCode = query.fromCode;
  const toCode = query.toCode;
  const pnr = query.pnr;
  const force = Boolean(query.force);

  const window = useMemo(
    () =>
      resolveJourneyWindow({
        departureDate: journeyDate,
        departureTime: query.departureTime,
        arrivalDate: query.arrivalDate,
        arrivalTime: query.arrivalTime,
        travelTime: query.travelTime,
      }),
    [
      journeyDate,
      query.departureTime,
      query.arrivalDate,
      query.arrivalTime,
      query.travelTime,
    ]
  );

  const [state, setState] = useState<State>(() => ({
    loading: false,
    phase: getLiveJourneyPhase({
      departureDate: journeyDate,
      departureTime: query.departureTime,
      arrivalDate: query.arrivalDate,
      arrivalTime: query.arrivalTime,
      travelTime: query.travelTime,
    }),
    journeyDateLabel: formatJourneyDateLabel(journeyDate),
  }));

  const journeyDateLabel = formatJourneyDateLabel(journeyDate);

  const refresh = useCallback(async (opts?: { bypassCache?: boolean }) => {
    if (!trainNumber) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const phaseBefore = getLiveJourneyPhase({
      departureDate: journeyDate,
      departureTime: query.departureTime,
      arrivalDate: query.arrivalDate,
      arrivalTime: query.arrivalTime,
      travelTime: query.travelTime,
    });

    if (!shouldFetchLiveStatus(phaseBefore, force)) {
      setState({
        loading: false,
        live: undefined,
        times: undefined,
        error: undefined,
        phase: phaseBefore,
        journeyDateLabel: formatJourneyDateLabel(journeyDate),
      });
      return;
    }

    setState((s) => ({
      ...s,
      loading: true,
      error: undefined,
      phase: phaseBefore,
      journeyDateLabel: formatJourneyDateLabel(journeyDate),
    }));

    try {
      const bypass = Boolean(opts?.bypassCache || force);
      if (bypass) clearLiveTrainCache(trainNumber);
      const live = await fetchLiveTrainStatus(
        trainNumber,
        journeyDate,
        fromCode,
        toCode,
        { bypassCache: bypass }
      );
      const times = resolveBoardingLiveTimes(live, fromCode, toCode);
      const expectedArrivalAt = getExpectedArrivalDate(live, toCode);
      const minutesToArrival = minutesUntil(expectedArrivalAt);
      const destStatus = live.route.find(
        (s) =>
          toCode &&
          String(s.stationCode).toUpperCase() === toCode.toUpperCase()
      )?.status;

      const phase = getLiveJourneyPhase({
        departureDate: journeyDate,
        departureTime: query.departureTime,
        arrivalDate: query.arrivalDate,
        arrivalTime: query.arrivalTime,
        travelTime: query.travelTime,
        liveStatus: live.status,
        destinationStopStatus: destStatus,
      });

      setState({
        loading: false,
        live,
        times,
        refreshedAt: Date.now(),
        expectedArrivalAt,
        minutesToArrival,
        phase,
        journeyDateLabel: formatJourneyDateLabel(journeyDate),
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        phase: phaseBefore,
        error: e instanceof Error ? e.message : 'Unable to load live status',
      }));
    }
  }, [
    trainNumber,
    journeyDate,
    fromCode,
    toCode,
    force,
    query.departureTime,
    query.arrivalDate,
    query.arrivalTime,
    query.travelTime,
  ]);

  const phaseNow = getLiveJourneyPhase({
    departureDate: journeyDate,
    departureTime: query.departureTime,
    arrivalDate: query.arrivalDate,
    arrivalTime: query.arrivalTime,
    travelTime: query.travelTime,
    liveStatus: state.live?.status,
  });
  const shouldPoll =
    Boolean(trainNumber) && shouldFetchLiveStatus(phaseNow, force);

  useEffect(() => {
    void refresh();
    if (!shouldPoll) return;
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, shouldPoll]);

  // Re-evaluate phase when waiting (too-early → soon → live) without API traffic.
  useEffect(() => {
    if (force || !trainNumber) return;
    if (phaseNow === 'live' || phaseNow === 'completed') return;
    const id = setInterval(() => {
      const next = getLiveJourneyPhase({
        departureDate: journeyDate,
        departureTime: query.departureTime,
        arrivalDate: query.arrivalDate,
        arrivalTime: query.arrivalTime,
        travelTime: query.travelTime,
      });
      setState((s) => (s.phase === next ? s : { ...s, phase: next }));
      if (shouldFetchLiveStatus(next, false)) {
        void refresh();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [
    force,
    trainNumber,
    phaseNow,
    journeyDate,
    query.departureTime,
    query.arrivalDate,
    query.arrivalTime,
    query.travelTime,
    refresh,
  ]);

  useEffect(() => {
    if (!state.expectedArrivalAt || state.phase !== 'live') return;
    const id = setInterval(() => {
      setState((s) => {
        if (!s.expectedArrivalAt) return s;
        return { ...s, minutesToArrival: minutesUntil(s.expectedArrivalAt) };
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [state.expectedArrivalAt, state.phase]);

  const summary = useMemo(() => {
    const phase = state.phase;
    const copy = livePhaseCopy(phase, window);
    const boardingPlatform =
      state.times?.fromPlatform || query.platform || undefined;

    // Waiting window — no API payload yet
    if (
      (phase === 'too-early' || phase === 'soon' || phase === 'completed') &&
      !state.live
    ) {
      return {
        delayLabel: '—',
        delayMinutes: 0,
        statusLabel: copy.title,
        nextHalt: undefined as string | undefined,
        locationLabel: copy.body,
        boardingPlatform: query.platform,
        arrivalPlatform: undefined as string | undefined,
        activePlatform: query.platform,
        isLive: false,
        speedKmh: undefined as number | undefined,
        startDate: undefined as string | undefined,
        trainNumber: trainNumber || '',
        pnr,
        etaLabel: undefined as string | undefined,
        minutesToArrival: undefined as number | undefined,
        expectedArrivalAt: undefined as Date | undefined,
        waitingForJourneyDate: phase === 'too-early',
        waitingForSourceDeparture: phase === 'soon',
        journeyCompleted: phase === 'completed',
        phase,
        phaseTitle: copy.title,
        phaseBody: copy.body,
        showLiveDetails: false,
        journeyDateLabel,
        departureLabel: window.departureLabel,
      };
    }

    // Journey finished — keep quiet even if cache still has a payload
    if (phase === 'completed') {
      const done = livePhaseCopy('completed', window);
      return {
        delayLabel: '—',
        delayMinutes: 0,
        statusLabel: done.title,
        nextHalt: undefined as string | undefined,
        locationLabel: done.body,
        boardingPlatform: query.platform,
        arrivalPlatform: undefined as string | undefined,
        activePlatform: query.platform,
        isLive: false,
        speedKmh: undefined as number | undefined,
        startDate: state.live?.startDate,
        trainNumber: state.live?.trainNumber || trainNumber || '',
        pnr,
        etaLabel: undefined as string | undefined,
        minutesToArrival: undefined as number | undefined,
        expectedArrivalAt: undefined as Date | undefined,
        waitingForJourneyDate: false,
        waitingForSourceDeparture: false,
        journeyCompleted: true,
        phase: 'completed' as const,
        phaseTitle: done.title,
        phaseBody: done.body,
        showLiveDetails: false,
        journeyDateLabel,
        departureLabel: window.departureLabel,
      };
    }

    // phase === 'live' (or soon with payload) but still loading
    if (!state.live) {
      return {
        delayLabel: '—',
        delayMinutes: 0,
        statusLabel: 'Live tracking',
        nextHalt: undefined as string | undefined,
        locationLabel: 'Fetching live location…',
        boardingPlatform: query.platform,
        arrivalPlatform: undefined as string | undefined,
        activePlatform: query.platform,
        isLive: false,
        speedKmh: undefined as number | undefined,
        startDate: undefined as string | undefined,
        trainNumber: trainNumber || '',
        pnr,
        etaLabel: undefined as string | undefined,
        minutesToArrival: undefined as number | undefined,
        expectedArrivalAt: undefined as Date | undefined,
        waitingForJourneyDate: false,
        waitingForSourceDeparture: false,
        journeyCompleted: false,
        phase: 'live' as const,
        phaseTitle: copy.title,
        phaseBody: copy.body,
        showLiveDetails: true,
        journeyDateLabel,
        departureLabel: window.departureLabel,
      };
    }

    // Train not left origin yet — still show route / platforms from live API
    if (state.live.status === 'not-started') {
      const soonCopy = livePhaseCopy('soon', window);
      return {
        delayLabel: '—',
        delayMinutes: state.live.delayMinutes || 0,
        statusLabel: 'Not departed yet',
        nextHalt: state.live.nextHaltName
          ? `${state.live.nextHaltName}${
              state.live.nextHaltCode ? ` (${state.live.nextHaltCode})` : ''
            }`
          : undefined,
        locationLabel:
          state.live.locationLabel ||
          soonCopy.body ||
          'Train has not started from origin. Route and platforms below.',
        boardingPlatform,
        arrivalPlatform: undefined as string | undefined,
        activePlatform: boardingPlatform,
        isLive: Boolean(state.live.isLive),
        speedKmh: undefined as number | undefined,
        startDate: state.live.startDate,
        trainNumber: state.live.trainNumber || trainNumber || '',
        pnr,
        etaLabel: undefined as string | undefined,
        minutesToArrival: undefined as number | undefined,
        expectedArrivalAt: undefined as Date | undefined,
        waitingForJourneyDate: false,
        waitingForSourceDeparture: true,
        journeyCompleted: false,
        phase: 'soon' as const,
        phaseTitle: soonCopy.title,
        phaseBody: soonCopy.body,
        showLiveDetails: true,
        journeyDateLabel,
        departureLabel: window.departureLabel,
      };
    }

    const delay = state.live.delayMinutes || 0;
    const delayLabel =
      delay <= 0 ? 'On time' : delay === 1 ? '1 min late' : `${delay} min late`;

    let etaLabel: string | undefined;
    if (typeof state.minutesToArrival === 'number') {
      const m = state.minutesToArrival;
      if (m <= -5) etaLabel = 'Arrived / departed';
      else if (m < 0) etaLabel = 'Arriving now';
      else if (m === 0) etaLabel = 'Arriving now';
      else if (m < 60) etaLabel = `${m} min to your station`;
      else {
        const h = Math.floor(m / 60);
        const mins = m % 60;
        etaLabel = `${h}h ${mins}m to your station`;
      }
    }

    return {
      delayLabel,
      delayMinutes: delay,
      statusLabel: formatRunStatus(state.live.status),
      nextHalt: state.live.nextHaltName
        ? `${state.live.nextHaltName}${
            state.live.nextHaltCode ? ` (${state.live.nextHaltCode})` : ''
          }`
        : undefined,
      locationLabel: state.live.locationLabel,
      boardingPlatform,
      arrivalPlatform: undefined as string | undefined,
      activePlatform: boardingPlatform,
      isLive: state.live.isLive,
      speedKmh: undefined as number | undefined,
      startDate: state.live.startDate,
      trainNumber: state.live.trainNumber,
      pnr,
      etaLabel,
      minutesToArrival: state.minutesToArrival,
      expectedArrivalAt: state.expectedArrivalAt,
      waitingForJourneyDate: false,
      waitingForSourceDeparture: false,
      journeyCompleted: false,
      phase: 'live' as const,
      phaseTitle: copy.title,
      phaseBody: copy.body,
      showLiveDetails: true,
      journeyDateLabel,
      departureLabel: window.departureLabel,
    };
  }, [
    state.phase,
    state.live,
    state.times,
    state.minutesToArrival,
    state.expectedArrivalAt,
    query.platform,
    pnr,
    trainNumber,
    journeyDateLabel,
    window,
  ]);

  return {
    ...state,
    available: shouldPoll,
    summary,
    refresh,
    window,
  };
}

export function useLiveTrainStatus(ticket: Ticket | null | undefined) {
  return useLiveTrainQuery({
    trainNumber: ticket?.kind === 'rail' ? ticket.trainNumber : undefined,
    journeyDate: ticket?.departureDate,
    departureTime: ticket?.departureTime,
    arrivalDate: ticket?.arrivalDate,
    arrivalTime: ticket?.arrivalTime,
    travelTime: ticket?.travelTime,
    fromCode: ticket?.fromCode,
    toCode: ticket?.toCode,
    pnr: ticket?.pnr || ticket?.bookingId,
    platform: ticket?.platform,
    // Always try — showLiveDetails still respects completed journeys
    force: ticket?.kind === 'rail',
  });
}

function formatRunStatus(status: string): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'not-started':
      return 'Not started';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status || 'Live';
  }
}
