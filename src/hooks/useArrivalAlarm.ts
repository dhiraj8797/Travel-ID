import { useCallback, useEffect, useState } from 'react';
import { Ticket } from '../types/ticket';
import {
  armArrivalAlarm,
  disarmArrivalAlarm,
  isArrivalAlarmArmed,
  silenceArrivalAlarm,
  stopArrivalAlarmSound,
  tickArrivalAlarm,
} from '../services/arrivalAlarm';

type Props = {
  ticket: Ticket | null | undefined;
  expectedArrivalAt?: Date;
  minutesToArrival?: number;
};

export function useArrivalAlarm({
  ticket,
  expectedArrivalAt,
  minutesToArrival,
}: Props) {
  const [armed, setArmed] = useState(false);
  const [sounding, setSounding] = useState(false);
  const [busy, setBusy] = useState(false);

  const ticketId = ticket?.id;
  const stationName = ticket?.to || 'your station';
  const stationCode = ticket?.toCode;
  const trainNumber = ticket?.trainNumber;
  const pnr = ticket?.pnr || ticket?.bookingId;

  useEffect(() => {
    if (!ticketId) {
      setArmed(false);
      return;
    }
    void isArrivalAlarmArmed(ticketId).then(setArmed);
  }, [ticketId]);

  useEffect(() => {
    if (!ticketId || !armed) return;
    let cancelled = false;
    (async () => {
      const status = await tickArrivalAlarm({
        ticketId,
        minutesUntilArrival: minutesToArrival,
        eta: expectedArrivalAt,
        trainNumber,
        pnr,
        stationName,
        stationCode,
        minutesBefore: 20,
      });
      if (!cancelled) {
        setSounding(status === 'sounding');
        if (status === 'disarmed') setArmed(false);
        if (status === 'silenced') setSounding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    ticketId,
    armed,
    minutesToArrival,
    expectedArrivalAt,
    trainNumber,
    pnr,
    stationName,
    stationCode,
  ]);

  const arm = useCallback(async () => {
    if (!ticketId || !expectedArrivalAt) {
      return { ok: false as const, reason: 'no-eta' as const };
    }
    setBusy(true);
    try {
      const result = await armArrivalAlarm(
        {
          ticketId,
          trainNumber,
          pnr,
          stationName,
          stationCode,
          eta: expectedArrivalAt,
          minutesBefore: 20,
        },
        { fromUser: true, allowFireNow: true }
      );
      if (!result.ok) {
        setArmed(false);
        setSounding(false);
        return {
          ok: false as const,
          reason: (result.reason || 'failed') as 'disabled' | 'failed',
        };
      }
      setArmed(true);
      if (result.reason === 'fired-now') setSounding(true);
      else setSounding(false);
      return { ok: true as const, reason: result.reason };
    } finally {
      setBusy(false);
    }
  }, [
    ticketId,
    expectedArrivalAt,
    trainNumber,
    pnr,
    stationName,
    stationCode,
  ]);

  const disarm = useCallback(async () => {
    if (!ticketId) return;
    setBusy(true);
    try {
      await disarmArrivalAlarm(ticketId);
      await stopArrivalAlarmSound();
      setArmed(false);
      setSounding(false);
    } finally {
      setBusy(false);
    }
  }, [ticketId]);

  const silence = useCallback(async () => {
    if (!ticketId) {
      await stopArrivalAlarmSound();
      setSounding(false);
      return;
    }
    setBusy(true);
    try {
      await silenceArrivalAlarm(ticketId);
      setSounding(false);
    } finally {
      setBusy(false);
    }
  }, [ticketId]);

  return {
    armed,
    sounding,
    busy,
    canArm: Boolean(ticketId && expectedArrivalAt),
    arm,
    disarm,
    silence,
  };
}
