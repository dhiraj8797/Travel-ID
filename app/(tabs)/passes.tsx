import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { promptWalletSignIn } from '../../src/auth/requireWalletAccount';
import { StaticSceneBackground } from '../../src/components/StaticSceneBackground';
import { RecentPassCard } from '../../src/components/home/RecentPassCard';
import { useTickets } from '../../src/context/TicketContext';
import { colors, radii, spacing } from '../../src/theme';
import {
  compareByTravelDate,
  getPassPhase,
  isOngoingPass,
  isPastPass,
  isUpcomingPass,
  PassPhase,
} from '../../src/utils/passTime';

type TimeFilter = PassPhase;
type KindFilter = 'all' | 'bus' | 'rail' | 'flight';

export default function PassesScreen() {
  const router = useRouter();
  const { tickets, loading, seedDemoTickets, canEditWallet } = useTickets();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ongoing');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');

  const list = useMemo(() => {
    let next = tickets.filter((t) => getPassPhase(t) === timeFilter);
    if (kindFilter !== 'all') {
      next = next.filter((t) => t.kind === kindFilter);
    }
    const ascending = timeFilter !== 'past';
    return [...next].sort((a, b) => compareByTravelDate(a, b, ascending));
  }, [tickets, timeFilter, kindFilter]);

  const upcomingCount = useMemo(
    () => tickets.filter(isUpcomingPass).length,
    [tickets]
  );
  const ongoingCount = useMemo(
    () => tickets.filter(isOngoingPass).length,
    [tickets]
  );
  const pastCount = useMemo(() => tickets.filter(isPastPass).length, [tickets]);

  const emptyCopy =
    timeFilter === 'upcoming'
      ? {
          title: 'No upcoming passes',
          sub: 'Add a ticket from Home, or check Ongoing / Past.',
        }
      : timeFilter === 'ongoing'
        ? {
            title: 'Nothing ongoing',
            sub: 'Passes appear here between departure and arrival.',
          }
        : {
            title: 'No past passes',
            sub: 'Completed journeys (after arrival) show up here.',
          };

  return (
    <View style={styles.root}>
      <StaticSceneBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>My Passes</Text>
          <Text style={styles.sub}>
            {timeFilter === 'upcoming'
              ? `${upcomingCount} upcoming`
              : timeFilter === 'ongoing'
                ? `${ongoingCount} ongoing`
                : `${pastCount} past`}{' '}
            · {tickets.length} total
          </Text>
        </View>

        <View style={styles.filters}>
          {(
            [
              { key: 'ongoing', label: 'Ongoing', count: ongoingCount },
              { key: 'upcoming', label: 'Upcoming', count: upcomingCount },
              { key: 'past', label: 'Past', count: pastCount },
            ] as const
          ).map((f) => {
            const active = timeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setTimeFilter(f.key)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label} {f.count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.kindRow}>
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'bus', label: 'Bus' },
              { key: 'rail', label: 'Train' },
              { key: 'flight', label: 'Flight' },
            ] as const
          ).map((f) => {
            const active = kindFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.kindChip, active && styles.kindChipActive]}
                onPress={() => setKindFilter(f.key)}
              >
                <Text
                  style={[styles.kindText, active && styles.kindTextActive]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={colors.orange} />
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {canEditWallet ? emptyCopy.title : 'Sign in to see passes'}
              </Text>
              <Text style={styles.emptySub}>
                {canEditWallet
                  ? emptyCopy.sub
                  : 'Your wallet is tied to your Google account.'}
              </Text>
              <Pressable
                style={styles.btn}
                onPress={() => {
                  if (!canEditWallet) {
                    promptWalletSignIn(router);
                    return;
                  }
                  void seedDemoTickets();
                }}
              >
                <Text style={styles.btnText}>
                  {canEditWallet ? 'Load samples' : 'Sign in'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {list.map((ticket) => (
                <RecentPassCard
                  key={ticket.id}
                  ticket={ticket}
                  onPress={() => router.push(`/ticket/${ticket.id}`)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 28, color: '#fff' },
  sub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  chipText: { fontFamily: 'DMSans_500Medium', color: '#fff', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  kindRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  kindChipActive: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255,106,0,0.15)',
  },
  kindText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
    fontSize: 12,
  },
  kindTextActive: { color: colors.orange },
  content: { paddingHorizontal: spacing.md, paddingBottom: 110 },
  empty: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 12,
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.orange,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: { fontFamily: 'Outfit_700Bold', color: '#fff' },
});
