import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WhereIsMyTrainView } from '../../src/components/passes/WhereIsMyTrainView';

export default function LiveTrainScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    trainNumber?: string;
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
    coach?: string;
    seat?: string;
  }>();

  const trainNumber = String(params.trainNumber || '').replace(/\D/g, '');

  return (
    <WhereIsMyTrainView
      trainNumber={trainNumber}
      journeyDate={params.journeyDate ? String(params.journeyDate) : undefined}
      departureTime={
        params.departureTime ? String(params.departureTime) : undefined
      }
      arrivalDate={params.arrivalDate ? String(params.arrivalDate) : undefined}
      arrivalTime={params.arrivalTime ? String(params.arrivalTime) : undefined}
      travelTime={params.travelTime ? String(params.travelTime) : undefined}
      fromCode={params.fromCode ? String(params.fromCode) : undefined}
      toCode={params.toCode ? String(params.toCode) : undefined}
      fromName={params.fromName ? String(params.fromName) : undefined}
      toName={params.toName ? String(params.toName) : undefined}
      pnr={params.pnr ? String(params.pnr) : undefined}
      trainName={params.trainName ? String(params.trainName) : undefined}
      coach={params.coach ? String(params.coach) : undefined}
      seat={params.seat ? String(params.seat) : undefined}
      onBack={() => router.back()}
    />
  );
}
