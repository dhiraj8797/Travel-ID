import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedTravelBackground } from '../src/components/AnimatedTravelBackground';
import { MetroStationPicker } from '../src/components/metro/MetroStationPicker';
import { TicketPass } from '../src/components/TicketDetail';
import { useTickets } from '../src/context/TicketContext';
import { formatTravelTime, isMetroNetworkId, planMetroRoute } from '../src/metro';
import { getPendingDraft } from '../src/state/pendingDraft';
import { ParsedTicketDraft, Ticket, TicketKind } from '../src/types/ticket';
import { colors, radii, spacing } from '../src/theme';
import {
  applyCompletedIfPast,
  getPassPhase,
  isPastPass,
} from '../src/utils/passTime';
import {
  isPlaceholderHotelValue,
} from '../src/parsers/hotelDetect';

function parseReviewDate(value?: string): Date | null {
  if (!value || isPlaceholderHotelValue(value)) return null;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = value.match(
    /(\d{1,2})[\s\-\/]([A-Za-z]{3,9}|\d{1,2})[\s\-\/,]*(\d{2,4})/
  );
  if (!m) return null;
  const day = Number(m[1]);
  let month: number;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (/[A-Za-z]/.test(m[2])) {
    month = months[m[2].slice(0, 3).toLowerCase()];
  } else {
    month = Number(m[2]) - 1;
  }
  if (!Number.isFinite(day) || month == null || month < 0 || month > 11) return null;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function ReviewScreen() {
  const router = useRouter();
  const { addFromDraft } = useTickets();
  const [draft, setDraft] = useState<ParsedTicketDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(true);
  const [metroPicker, setMetroPicker] = useState<'from' | 'to' | null>(null);

  useFocusEffect(
    useCallback(() => {
      const pending = getPendingDraft();
      if (!pending) {
        Alert.alert('Nothing to review', 'Add a PDF or scan a QR first.', [
          { text: 'OK', onPress: () => router.replace('/') },
        ]);
        return;
      }
      setDraft(applyCompletedIfPast(pending));
    }, [router])
  );

  if (!draft) return <View style={styles.screen} />;

  const preview: Ticket = {
    ...draft,
    id: 'preview',
    createdAt: new Date().toISOString(),
  };
  const previewPast =
    !!draft.journeyCompleted || isPastPass(preview) || getPassPhase(preview) === 'past';

  const patch = (partial: Partial<ParsedTicketDraft>) =>
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));

  const patchPassenger = (
    index: number,
    partial: Partial<ParsedTicketDraft['passengers'][0]>
  ) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = prev.passengers.map((p, i) =>
        i === index ? { ...p, ...partial } : p
      );
      return { ...prev, passengers: next };
    });

  const setKind = (kind: TicketKind) => {
    if (kind === 'bus') {
      patch({
        kind: 'bus',
        title: draft.operator || 'Bus Pass',
        bookingId: draft.bookingId || draft.pnr,
      });
    } else if (kind === 'flight') {
      patch({
        kind: 'flight',
        title: draft.flightNumber || draft.operator || 'Flight Pass',
      });
    } else if (kind === 'hotel') {
      patch({
        kind: 'hotel',
        title: draft.hotelName || draft.to || draft.operator || 'Hotel Pass',
        hotelName: draft.hotelName || draft.to || draft.operator,
        bookingId: draft.bookingId || draft.pnr,
        departureTime: draft.departureTime || '14:00',
        arrivalTime: draft.arrivalTime || '11:00',
      });
    } else if (kind === 'metro') {
      const net =
        draft.metroNetworkId && isMetroNetworkId(draft.metroNetworkId)
          ? draft.metroNetworkId
          : 'blr';
      patch({
        kind: 'metro',
        title: draft.title || `${draft.from} → ${draft.to}`,
        operator: draft.operator || 'Metro',
        bookingPlatform: draft.bookingPlatform || 'Metro',
        metroNetworkId: net,
      });
    } else {
      patch({ kind: 'rail', title: draft.trainName || 'Train Pass' });
    }
  };

  const save = async () => {
    if (draft.kind === 'hotel') {
      const hotelName = draft.hotelName || draft.to;
      const guestOk = draft.passengers.some(
        (p) => p.name && !isPlaceholderHotelValue(p.name)
      );
      const bookingOk = !isPlaceholderHotelValue(draft.bookingId || draft.pnr);
      const checkInOk = !isPlaceholderHotelValue(draft.departureDate);
      const checkOutOk = !isPlaceholderHotelValue(draft.arrivalDate);
      const inDate = parseReviewDate(draft.departureDate);
      const outDate = parseReviewDate(draft.arrivalDate);
      const orderOk = !inDate || !outDate || outDate.getTime() >= inDate.getTime();

      const issues: string[] = [];
      if (isPlaceholderHotelValue(hotelName)) issues.push('Hotel name');
      if (!guestOk) issues.push('Guest name');
      if (!bookingOk) issues.push('Booking ID');
      if (!checkInOk) issues.push('Check-in date');
      if (!checkOutOk) issues.push('Check-out date');
      if (!orderOk) issues.push('Check-out must be on/after check-in');

      if (issues.length || draft.needsManualCompletion) {
        Alert.alert(
          'Review booking details',
          issues.length
            ? `Please confirm or fill: ${issues.join(', ')}. Room number can stay blank — it is assigned at check-in.`
            : 'Some fields look incomplete. Edit them below before creating the Hotel Pass.',
          [
            { text: 'Keep editing', style: 'cancel' },
            { text: 'Create Hotel Pass anyway', onPress: () => void doSave() },
          ]
        );
        return;
      }
      await doSave();
      return;
    }

    const missing =
      !draft.from ||
      draft.from === 'Origin' ||
      draft.from === 'City' ||
      !draft.to ||
      draft.to === 'Destination' ||
      (draft.kind !== 'metro' &&
        (draft.passengers.length === 0 ||
          draft.passengers.some(
            (p) => !p.name || p.name === 'Traveller' || p.name === 'Guest'
          )));

    if (draft.kind === 'metro' && (!draft.metroFromStationId || !draft.metroToStationId)) {
      Alert.alert(
        'Metro stations',
        'Pick From and To stations (search list) so we can build offline route guidance.'
      );
      return;
    }

    if (draft.needsManualCompletion || missing) {
      Alert.alert(
        'Check details',
        'Some fields look incomplete. Edit them below, or upload the PDF if the QR only had a booking ref.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Create pass anyway', onPress: () => void doSave() },
        ]
      );
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    try {
      setSaving(true);
      const ticket = await addFromDraft(draft);
      router.replace(`/ticket/${ticket.id}`);
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const bgVariant =
    draft.kind === 'bus' || draft.kind === 'hotel'
      ? 'bus'
      : draft.kind === 'flight'
        ? 'bus'
        : 'rail';

  return (
    <View style={styles.screen}>
      <AnimatedTravelBackground variant={bgVariant} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>We found these ticket details</Text>
          <Text style={styles.confidence}>
            {draft.kind.toUpperCase()}
            {draft.extractionMethod ? ` · ${draft.extractionMethod}` : ''}
            {` · ${Math.round(draft.confidence * 100)}%`}
          </Text>
          {!!draft.extractionNote && (
            <Text style={styles.note}>{draft.extractionNote}</Text>
          )}
          {draft.needsManualCompletion && (
            <Text style={styles.warn}>
              Missing information — edit fields below or upload the original PDF.
            </Text>
          )}

          {(previewPast || draft.journeyCompleted) && (
            <View style={styles.completedBanner}>
              <Text style={styles.completedBannerTitle}>Completed journey</Text>
              <Text style={styles.completedBannerBody}>
                Travel date is in the past — this pass will be saved as Past (no live tracking).
              </Text>
            </View>
          )}

          <Pressable
            style={[
              styles.completedToggle,
              draft.journeyCompleted && styles.completedToggleOn,
            ]}
            onPress={() =>
              patch({
                journeyCompleted: !draft.journeyCompleted,
                bookingStatus: !draft.journeyCompleted
                  ? 'Completed'
                  : draft.bookingStatus === 'Completed'
                    ? 'Confirmed'
                    : draft.bookingStatus,
              })
            }
          >
            <Text
              style={[
                styles.completedToggleText,
                draft.journeyCompleted && styles.completedToggleTextOn,
              ]}
            >
              {draft.journeyCompleted
                ? '✓ Marked as completed'
                : 'Mark as completed journey'}
            </Text>
          </Pressable>

          <View style={styles.summary}>
            <SummaryRow
              label="Passengers"
              value={
                draft.passengers.length
                  ? draft.passengers
                      .map((p, i) => {
                        const seat = [p.coach, p.seat, p.berth].filter(Boolean).join('/');
                        const st = p.currentStatus || p.status || '';
                        return `${i + 1}. ${p.name || 'Traveller'}${seat ? ` · ${seat}` : ''}${
                          st ? ` · ${st}` : ''
                        }`;
                      })
                      .join('\n')
                  : '—'
              }
            />
            <SummaryRow
              label={draft.kind === 'hotel' ? 'City' : 'From'}
              value={
                draft.fromCode
                  ? `${draft.fromCode}${draft.from ? ` · ${draft.from}` : ''}`
                  : draft.from
              }
            />
            <SummaryRow
              label={draft.kind === 'hotel' ? 'Hotel' : 'To'}
              value={
                draft.kind === 'hotel'
                  ? draft.hotelName || draft.to
                  : draft.toCode
                    ? `${draft.toCode}${draft.to ? ` · ${draft.to}` : ''}`
                    : draft.to
              }
            />
            <SummaryRow label="Date" value={draft.departureDate || '—'} />
            <SummaryRow
              label={draft.kind === 'hotel' ? 'Check-in' : 'Departure'}
              value={draft.departureTime}
            />
            <SummaryRow
              label={draft.kind === 'hotel' ? 'Check-out' : 'Arrival'}
              value={draft.arrivalTime || '—'}
            />
            <SummaryRow
              label={draft.kind === 'hotel' ? 'Confirmation' : 'PNR'}
              value={draft.pnr || draft.bookingId || '—'}
            />
            {draft.kind === 'flight' ? (
              <>
                <SummaryRow
                  label="Flight"
                  value={draft.flightNumber || draft.operator || '—'}
                />
                <SummaryRow
                  label="Seat"
                  value={draft.passengers[0]?.seat || '—'}
                />
                <SummaryRow
                  label="Sequence"
                  value={
                    draft.passengers[0]?.currentStatus ||
                    draft.passengers[0]?.status ||
                    '—'
                  }
                />
              </>
            ) : draft.kind === 'hotel' ? (
              <>
                <SummaryRow
                  label="Hotel"
                  value={draft.hotelName || draft.to || draft.operator || '—'}
                />
                <SummaryRow label="Room" value={draft.roomType || draft.classType || '—'} />
              </>
            ) : (
              <SummaryRow
                label="Operator"
                value={
                  draft.kind === 'bus'
                    ? draft.operator
                    : draft.trainName || draft.operator
                }
              />
            )}
          </View>

          <View style={{ height: 100 }} />
          <TicketPass ticket={preview} embedded />

          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit details</Text>
            <View style={styles.kindRow}>
              {(
                [
                  { key: 'rail' as const, label: 'Train', on: styles.kindChipOn },
                  { key: 'bus' as const, label: 'Bus', on: styles.kindChipOnBus },
                  { key: 'flight' as const, label: 'Flight', on: styles.kindChipOnFlight },
                  { key: 'hotel' as const, label: 'Hotel', on: styles.kindChipOnHotel },
                  { key: 'metro' as const, label: 'Metro', on: styles.kindChipOnMetro },
                ] as const
              ).map((k) => (
                <Pressable
                  key={k.key}
                  style={[styles.kindChip, draft.kind === k.key && k.on]}
                  onPress={() => setKind(k.key)}
                >
                  <Text style={[styles.kindText, draft.kind === k.key && styles.kindTextOn]}>
                    {k.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {draft.kind === 'metro' ? (
              <>
                <Text style={styles.metroHint}>
                  {draft.metroHasOfficialQr || draft.originalQrValue
                    ? 'Official gate QR is saved. Confirm stations for live guidance.'
                    : 'Pick stations for guidance. Add an official QR later for gate entry.'}
                </Text>
                <Pressable
                  style={styles.metroStationBtn}
                  onPress={() => setMetroPicker('from')}
                >
                  <Text style={styles.fieldLabel}>From station</Text>
                  <Text style={styles.metroStationValue}>{draft.from}</Text>
                </Pressable>
                <Pressable
                  style={styles.metroStationBtn}
                  onPress={() => setMetroPicker('to')}
                >
                  <Text style={styles.fieldLabel}>To station</Text>
                  <Text style={styles.metroStationValue}>{draft.to}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Field
                  label={draft.kind === 'hotel' ? 'City' : 'From'}
                  value={draft.from}
                  onChange={(from) => patch({ from })}
                />
                <Field
                  label={draft.kind === 'hotel' ? 'Hotel name' : 'To'}
                  value={draft.kind === 'hotel' ? draft.hotelName || draft.to : draft.to}
                  onChange={(value) =>
                    draft.kind === 'hotel'
                      ? patch({ hotelName: value, to: value, title: value, operator: value })
                      : patch({ to: value })
                  }
                />
              </>
            )}
            <Field
              label={draft.kind === 'hotel' ? 'Check-in date' : 'Journey date'}
              value={draft.departureDate}
              onChange={(departureDate) => patch({ departureDate })}
            />
            <Field
              label={draft.kind === 'hotel' ? 'Check-in time' : 'Departure time'}
              value={draft.departureTime}
              onChange={(departureTime) => patch({ departureTime })}
            />
            {draft.kind === 'hotel' ? (
              <Field
                label="Check-out date"
                value={draft.arrivalDate ?? ''}
                onChange={(arrivalDate) => patch({ arrivalDate })}
              />
            ) : null}
            <Field
              label={draft.kind === 'hotel' ? 'Check-out time' : 'Arrival time'}
              value={draft.arrivalTime ?? ''}
              onChange={(arrivalTime) => patch({ arrivalTime })}
            />
            <Field
              label={draft.kind === 'hotel' ? 'Confirmation / Booking ID' : 'PNR / Booking ID'}
              value={draft.pnr || draft.bookingId || ''}
              onChange={(value) => patch({ pnr: value, bookingId: value })}
            />
            <Field
              label={
                draft.kind === 'bus'
                  ? 'Operator'
                  : draft.kind === 'flight'
                    ? 'Airline / flight'
                    : draft.kind === 'hotel'
                      ? 'Room type'
                      : 'Train name'
              }
              value={
                draft.kind === 'bus'
                  ? draft.operator
                  : draft.kind === 'flight'
                    ? draft.flightNumber || draft.operator
                    : draft.kind === 'hotel'
                      ? draft.roomType || draft.classType || ''
                      : draft.trainName ?? ''
              }
              onChange={(value) => {
                if (draft.kind === 'bus') {
                  patch({ operator: value, title: value });
                } else if (draft.kind === 'flight') {
                  patch({ flightNumber: value, operator: value, title: value });
                } else if (draft.kind === 'hotel') {
                  patch({ roomType: value, classType: value });
                } else {
                  patch({ trainName: value, title: value });
                }
              }}
            />
            {draft.kind === 'hotel' ? (
              <>
                <Field
                  label="Booking through"
                  value={draft.bookingPlatform ?? ''}
                  onChange={(bookingPlatform) => patch({ bookingPlatform })}
                />
                <Field
                  label="Hotel address"
                  value={draft.hotelAddress ?? ''}
                  onChange={(hotelAddress) => patch({ hotelAddress })}
                />
                <Field
                  label="Phone (tap to call on pass)"
                  value={draft.operatorContact || draft.supportNumber || ''}
                  onChange={(value) =>
                    patch({ operatorContact: value, supportNumber: value })
                  }
                />
                <Field
                  label="Email"
                  value={draft.hotelEmail ?? ''}
                  onChange={(hotelEmail) => patch({ hotelEmail })}
                />
                <Field
                  label="Room number"
                  value={draft.roomNumber ?? ''}
                  onChange={(roomNumber) => patch({ roomNumber })}
                />
                <Field
                  label="Meal plan"
                  value={draft.mealPlan ?? ''}
                  onChange={(mealPlan) => patch({ mealPlan })}
                />
              </>
            ) : (
              <Field
                label="Class / type"
                value={draft.classType ?? ''}
                onChange={(classType) => patch({ classType })}
              />
            )}
            {draft.kind === 'rail' ? (
              <>
                <Field
                  label="Train number"
                  value={draft.trainNumber ?? ''}
                  onChange={(trainNumber) => patch({ trainNumber })}
                />
                <Field
                  label="From station code"
                  value={draft.fromCode ?? ''}
                  onChange={(fromCode) => patch({ fromCode })}
                />
                <Field
                  label="To station code"
                  value={draft.toCode ?? ''}
                  onChange={(toCode) => patch({ toCode })}
                />
              </>
            ) : null}

            <Field
              label="Final amount paid (₹)"
              value={draft.fare ?? ''}
              onChange={(fare) => patch({ fare })}
            />

            <Text style={styles.paxSection}>
              Passengers ({draft.passengers.length})
            </Text>
            {draft.passengers.map((person, index) => (
              <View key={`pax-edit-${index}`} style={styles.paxBlock}>
                <Text style={styles.paxHeading}>Passenger {index + 1}</Text>
                <Field
                  label="Name"
                  value={person.name ?? ''}
                  onChange={(name) => patchPassenger(index, { name })}
                />
                {draft.kind === 'rail' ? (
                  <>
                    <Field
                      label="Coach"
                      value={person.coach ?? ''}
                      onChange={(coach) => patchPassenger(index, { coach })}
                    />
                    <Field
                      label="Seat / berth no"
                      value={person.seat ?? ''}
                      onChange={(seat) => patchPassenger(index, { seat })}
                    />
                    <Field
                      label="Berth type"
                      value={person.berth ?? ''}
                      onChange={(berth) => patchPassenger(index, { berth })}
                    />
                    <Field
                      label="Current status"
                      value={person.currentStatus || person.status || ''}
                      onChange={(status) =>
                        patchPassenger(index, {
                          status,
                          currentStatus: status,
                        })
                      }
                    />
                  </>
                ) : draft.kind === 'flight' ? (
                  <>
                    <Field
                      label="Seat"
                      value={person.seat ?? ''}
                      onChange={(seat) => patchPassenger(index, { seat })}
                    />
                    <Field
                      label="Sequence no"
                      value={person.currentStatus || person.status || ''}
                      onChange={(sequence) =>
                        patchPassenger(index, {
                          currentStatus: sequence,
                          status: sequence ? `SEQ ${sequence}` : undefined,
                        })
                      }
                    />
                  </>
                ) : (
                  <Field
                    label="Seat"
                    value={person.seat ?? ''}
                    onChange={(seat) => patchPassenger(index, { seat })}
                  />
                )}
              </View>
            ))}
            {draft.kind === 'flight' ? (
              <>
                <Field
                  label="From (IATA)"
                  value={draft.fromCode ?? ''}
                  onChange={(fromCode) =>
                    patch({
                      fromCode,
                      from: fromCode || draft.from,
                    })
                  }
                />
                <Field
                  label="To (IATA)"
                  value={draft.toCode ?? ''}
                  onChange={(toCode) =>
                    patch({
                      toCode,
                      to: toCode || draft.to,
                    })
                  }
                />
                <Field
                  label="Airline code"
                  value={draft.airlineCode ?? ''}
                  onChange={(airlineCode) => patch({ airlineCode })}
                />
              </>
            ) : null}
            {draft.kind === 'bus' && (
              <>
                <Field
                  label="Boarding point"
                  value={draft.boardingPoint ?? ''}
                  onChange={(boardingPoint) => patch({ boardingPoint })}
                />
                <Field
                  label="Drop point"
                  value={draft.droppingPoint ?? ''}
                  onChange={(droppingPoint) => patch({ droppingPoint })}
                />
                <Field
                  label="Reporting time"
                  value={draft.reportingTime ?? ''}
                  onChange={(reportingTime) => patch({ reportingTime })}
                />
                <Field
                  label="Bus type"
                  value={draft.classType ?? ''}
                  onChange={(classType) => patch({ classType, serviceName: classType })}
                />
              </>
            )}

            <Text style={styles.disclaimer}>
              This is a wallet-style pass, not a replacement issued by the operator. Original PDF/QR
              stay attached for official checks.
            </Text>

            <Pressable onPress={() => setShowRaw((v) => !v)}>
              <Text style={styles.rawToggle}>
                {showRaw ? 'Hide' : 'Show'} scanned barcode (
                {(draft.originalQrValue || draft.rawText || '').length} chars)
              </Text>
            </Pressable>
            {showRaw && (
              <Text style={styles.rawText} selectable>
                {draft.originalQrValue || draft.rawText || 'No barcode payload'}
              </Text>
            )}

          </View>

          <Pressable
            style={[styles.save, saving && { opacity: 0.7 }]}
            onPress={save}
            disabled={saving}
          >
            <Text style={styles.saveText}>
              {saving
                ? 'Saving…'
                : draft.kind === 'hotel'
                  ? 'Create Hotel Pass'
                  : draft.kind === 'metro'
                    ? 'Create Metro Live Pass'
                    : 'Create Pass'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <MetroStationPicker
        visible={metroPicker === 'from'}
        title="From station"
        networkId={
          draft.metroNetworkId && isMetroNetworkId(draft.metroNetworkId)
            ? draft.metroNetworkId
            : 'blr'
        }
        excludeId={draft.metroToStationId}
        onClose={() => setMetroPicker(null)}
        onSelect={(station) => {
          const net =
            draft.metroNetworkId && isMetroNetworkId(draft.metroNetworkId)
              ? draft.metroNetworkId
              : 'blr';
          const toId = draft.metroToStationId;
          const route =
            toId && station.id !== toId
              ? planMetroRoute(station.id, toId, net)
              : null;
          patch({
            metroNetworkId: net,
            metroFromStationId: station.id,
            from: station.shortName || station.name,
            fromCode: station.id,
            boardingPoint: station.name,
            title: `${station.shortName || station.name} → ${draft.to}`,
            travelTime: route
              ? formatTravelTime(route.estimatedMinutes)
              : draft.travelTime,
            classType: route
              ? route.legs.map((l) => l.lineName).join(' → ')
              : draft.classType,
            needsManualCompletion:
              draft.needsManualCompletion &&
              (!toId || toId === 'Destination' || !draft.metroToStationId),
          });
        }}
      />
      <MetroStationPicker
        visible={metroPicker === 'to'}
        title="To station"
        networkId={
          draft.metroNetworkId && isMetroNetworkId(draft.metroNetworkId)
            ? draft.metroNetworkId
            : 'blr'
        }
        excludeId={draft.metroFromStationId}
        onClose={() => setMetroPicker(null)}
        onSelect={(station) => {
          const net =
            draft.metroNetworkId && isMetroNetworkId(draft.metroNetworkId)
              ? draft.metroNetworkId
              : 'blr';
          const fromId = draft.metroFromStationId;
          const route =
            fromId && station.id !== fromId
              ? planMetroRoute(fromId, station.id, net)
              : null;
          patch({
            metroNetworkId: net,
            metroToStationId: station.id,
            to: station.shortName || station.name,
            toCode: station.id,
            droppingPoint: station.name,
            title: `${draft.from} → ${station.shortName || station.name}`,
            travelTime: route
              ? formatTravelTime(route.estimatedMinutes)
              : draft.travelTime,
            classType: route
              ? route.legs.map((l) => l.lineName).join(' → ')
              : draft.classType,
            needsManualCompletion: !(
              fromId &&
              draft.metroFromStationId &&
              draft.from !== 'Origin'
            ),
          });
        }}
      />
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const multiline = value.includes('\n');
  return (
    <View style={[styles.summaryRow, multiline && styles.summaryRowStacked]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[styles.summaryValue, multiline && styles.summaryValueLeft]}
      >
        {value}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 40 },
  headline: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#fff',
    marginBottom: 6,
  },
  confidence: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    marginBottom: 4,
  },
  note: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.orange,
    marginBottom: 8,
  },
  warn: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: '#FFB454',
    marginBottom: 10,
  },
  completedBanner: {
    backgroundColor: 'rgba(46, 160, 100, 0.18)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(46, 160, 100, 0.45)',
    padding: 12,
    marginBottom: 10,
    gap: 4,
  },
  completedBannerTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#7DDEA5',
  },
  completedBannerBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  completedToggle: {
    alignSelf: 'flex-start',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: colors.panel,
  },
  completedToggleOn: {
    borderColor: 'rgba(46, 160, 100, 0.55)',
    backgroundColor: 'rgba(46, 160, 100, 0.14)',
  },
  completedToggleText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.muted,
  },
  completedToggleTextOn: {
    color: '#7DDEA5',
  },
  summary: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  summaryLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: colors.muted,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  summaryValueLeft: {
    textAlign: 'left',
    marginTop: 4,
    lineHeight: 20,
    fontSize: 13,
  },
  paxSection: {
    marginTop: 10,
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  paxBlock: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 4,
  },
  paxHeading: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 13,
    color: colors.orange,
    marginBottom: 2,
  },
  editCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.sm,
  },
  editTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
  },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  kindChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  kindChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  kindChipOnBus: { backgroundColor: colors.orange, borderColor: colors.orange },
  kindChipOnFlight: { backgroundColor: colors.purple, borderColor: colors.purple },
  kindChipOnHotel: { backgroundColor: colors.hotel, borderColor: colors.hotel },
  kindChipOnMetro: { backgroundColor: colors.metro, borderColor: colors.metro },
  kindText: { fontFamily: 'DMSans_500Medium', color: '#fff' },
  kindTextOn: { color: '#fff' },
  field: { marginBottom: 4 },
  fieldLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  metroHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    lineHeight: 18,
  },
  metroStationBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  metroStationValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontFamily: 'DMSans_400Regular',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  disclaimer: {
    marginTop: 8,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
  },
  rawToggle: {
    marginTop: 8,
    fontFamily: 'DMSans_500Medium',
    color: colors.orange,
    fontSize: 13,
  },
  rawText: {
    marginTop: 6,
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
  },
  save: {
    marginTop: spacing.lg,
    backgroundColor: colors.orange,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
});
