import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { promptWalletSignIn } from '../../src/auth/requireWalletAccount';
import { ActionCard } from '../../src/components/home/ActionCard';
import { YearlyExpenseCard } from '../../src/components/home/YearlyExpenseCard';
import { HomeMenuDrawer } from '../../src/components/HomeMenuDrawer';
import { RecentPassCard } from '../../src/components/home/RecentPassCard';
import { AnimatedTravelBackground } from '../../src/components/AnimatedTravelBackground';
import { useTickets } from '../../src/context/TicketContext';
import { PassengerNamesSheet } from '../../src/components/PassengerNamesSheet';
import { useHomeLocation } from '../../src/hooks/useHomeLocation';
import {
  fetchPnrDetails,
  passengersNeedNames,
  pickAndProcessPdf,
  pickAndProcessTicketPhoto,
  pnrResultToDraft,
} from '../../src/parsers';
import { setPendingDraft } from '../../src/state/pendingDraft';
import { ParsedTicketDraft } from '../../src/types/ticket';
import { colors, radii, spacing } from '../../src/theme';
import {
  compareByTravelDate,
  getPassPhase,
} from '../../src/utils/passTime';

type Filter = 'all' | 'bus' | 'rail' | 'flight' | 'hotel' | 'metro';

export default function HomeScreen() {
  const router = useRouter();
  const { tickets, loading, seedDemoTickets, canEditWallet } = useTickets();
  const { displayName, session } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [uploading, setUploading] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Reading…');
  const [query, setQuery] = useState('');
  const [pnrOpen, setPnrOpen] = useState(false);
  const [pnrInput, setPnrInput] = useState('');
  const [nameDraft, setNameDraft] = useState<ParsedTicketDraft | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const homeLoc = useHomeLocation();

  const counts = useMemo(
    () => ({
      all: tickets.length,
      bus: tickets.filter((t) => t.kind === 'bus').length,
      rail: tickets.filter((t) => t.kind === 'rail').length,
      flight: tickets.filter((t) => t.kind === 'flight').length,
      hotel: tickets.filter((t) => t.kind === 'hotel').length,
      metro: tickets.filter((t) => t.kind === 'metro').length,
    }),
    [tickets]
  );

  const recent = useMemo(() => {
    let list =
      filter === 'all' ? tickets : tickets.filter((t) => t.kind === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (t) =>
          t.from.toLowerCase().includes(q) ||
          t.to.toLowerCase().includes(q) ||
          t.pnr?.toLowerCase().includes(q) ||
          t.bookingId?.toLowerCase().includes(q) ||
          t.operator.toLowerCase().includes(q)
      );
    }
    // Prefer ongoing, then upcoming on Home (past lives under Passes → Past)
    const active = list.filter((t) => getPassPhase(t) !== 'past');
    const pool = active.length ? active : list;
    const rank = (t: (typeof list)[0]) => {
      const p = getPassPhase(t);
      if (p === 'ongoing') return 0;
      if (p === 'upcoming') return 1;
      return 2;
    };
    return [...pool]
      .sort((a, b) => {
        const rd = rank(a) - rank(b);
        if (rd !== 0) return rd;
        return compareByTravelDate(a, b, true);
      })
      .slice(0, 6);
  }, [tickets, filter, query]);

  const onUploadPdf = async () => {
    if (uploading) return;
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      return;
    }
    try {
      setBusyLabel('Reading booking with Gemini…');
      setUploading(true);
      const draft = await pickAndProcessPdf();
      if (!draft) return;
      setPendingDraft(draft);
      router.push('/review');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to read PDF';
      console.warn('[TravelID/PDF] upload alert:', message);
      Alert.alert('Upload PDF', message);
    } finally {
      setUploading(false);
    }
  };

  const onUploadPhoto = () => {
    if (uploading) return;
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      return;
    }
    Alert.alert('Ticket photo', 'Choose how to add a photo of your ticket.', [
      { text: 'Take photo', onPress: () => void runPhoto('camera') },
      { text: 'Choose from gallery', onPress: () => void runPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runPhoto = async (source: 'camera' | 'library') => {
    if (uploading) return;
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      return;
    }
    try {
      setBusyLabel('Reading photo…');
      setUploading(true);
      const draft = await pickAndProcessTicketPhoto(source);
      if (!draft) return;
      setPendingDraft(draft);
      router.push('/review');
    } catch (error) {
      Alert.alert(
        'Upload photo',
        error instanceof Error ? error.message : 'Failed to read ticket photo'
      );
    } finally {
      setUploading(false);
    }
  };

  const goReview = (draft: ParsedTicketDraft) => {
    setPendingDraft(draft);
    router.push('/review');
  };

  const onFetchPnr = async () => {
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      return;
    }
    const digits = pnrInput.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('PNR', 'Enter a valid 10-digit IRCTC PNR.');
      return;
    }
    try {
      setBusyLabel('Fetching PNR…');
      setUploading(true);
      setPnrOpen(false);
      const result = await fetchPnrDetails(digits);
      const draft = pnrResultToDraft(result);
      if (passengersNeedNames(draft.passengers)) {
        setNameDraft(draft);
      } else {
        goReview(draft);
      }
    } catch (error) {
      Alert.alert(
        'PNR lookup',
        error instanceof Error ? error.message : 'Could not fetch PNR details'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.root}>
      <AnimatedTravelBackground variant="both" />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => setMenuOpen(true)} hitSlop={8}>
              <Ionicons name="menu" size={32} color="#fff" />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.brand}>
                Travel <Text style={{ color: colors.orange }}>ID</Text>
              </Text>
              <Text style={styles.tagline}>Your Journey, Your ID</Text>
            </View>
            <Pressable
              onPress={() => router.push(session ? '/(tabs)/profile' : '/login')}
              hitSlop={8}
            >
              <Ionicons name="notifications-outline" size={28} color="#fff" />
            </Pressable>
          </View>

          <Text style={styles.welcome}>Welcome back,</Text>
          <Text style={styles.name}>{displayName} 👋</Text>
          <View style={styles.locationRow}>
            <Pressable
              style={styles.locationChip}
              onPress={() => {
                if (homeLoc.loading) return;
                if (homeLoc.hasLocation) {
                  Alert.alert(
                    homeLoc.label || 'Location',
                    'Update your city from GPS, or remove it from the home screen.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => void homeLoc.clear(),
                      },
                      {
                        text: 'Refresh',
                        onPress: () => void homeLoc.addOrRefresh(),
                      },
                    ]
                  );
                  return;
                }
                void homeLoc.addOrRefresh();
              }}
              accessibilityRole="button"
              accessibilityLabel={
                homeLoc.hasLocation
                  ? `Location ${homeLoc.label}`
                  : 'Add location'
              }
            >
              {homeLoc.loading ? (
                <ActivityIndicator size="small" color={colors.orange} />
              ) : (
                <Ionicons
                  name={homeLoc.hasLocation ? 'location' : 'location-outline'}
                  size={15}
                  color={colors.orange}
                />
              )}
              <Text style={styles.locationChipText} numberOfLines={1}>
                {homeLoc.loading
                  ? 'Finding you…'
                  : homeLoc.hasLocation
                    ? homeLoc.label
                    : homeLoc.error
                      ? 'Retry location'
                      : 'Add location'}
              </Text>
              {!homeLoc.loading && !homeLoc.hasLocation ? (
                <Ionicons name="add" size={14} color={colors.orange} />
              ) : null}
            </Pressable>
            <Text style={styles.subtitle}>
              All your travel passes,{'\n'}in one secure wallet.
            </Text>
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={20} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search trips, routes or passes..."
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
            />
            <Ionicons name="options-outline" size={20} color="#fff" />
          </View>

          <View style={styles.filterBlock}>
            <Text style={styles.filterLabel}>Browse by type</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {(
                [
                  { key: 'all', title: 'All', count: counts.all, color: colors.orange, icon: 'wallet' as const },
                  { key: 'bus', title: 'Bus', count: counts.bus, color: colors.bus, icon: 'bus' as const },
                  { key: 'rail', title: 'Train', count: counts.rail, color: colors.blue, icon: 'train' as const },
                  { key: 'flight', title: 'Flight', count: counts.flight, color: colors.purple, icon: 'flight' as const },
                  { key: 'hotel', title: 'Hotel', count: counts.hotel, color: colors.hotel, icon: 'hotel' as const },
                  { key: 'metro', title: 'Metro', count: counts.metro, color: colors.metro, icon: 'metro' as const },
                ] as const
              ).map((f) => {
                const selected = filter === f.key;
                const iconColor = selected ? '#fff' : f.color;
                return (
                  <Pressable
                    key={f.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${f.title}, ${f.count} passes`}
                    style={[
                      styles.chip,
                      selected && {
                        backgroundColor: f.color,
                        borderColor: f.color,
                        shadowColor: f.color,
                        shadowOpacity: 0.35,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 4 },
                        elevation: 6,
                      },
                    ]}
                    onPress={() => setFilter(f.key)}
                  >
                    <View
                      style={[
                        styles.chipIconWrap,
                        {
                          backgroundColor: selected
                            ? 'rgba(255,255,255,0.22)'
                            : `${f.color}28`,
                        },
                      ]}
                    >
                      {f.icon === 'bus' || f.icon === 'train' ? (
                        <MaterialCommunityIcons name={f.icon} size={18} color={iconColor} />
                      ) : f.icon === 'hotel' ? (
                        <MaterialCommunityIcons
                          name="office-building"
                          size={18}
                          color={iconColor}
                        />
                      ) : f.icon === 'metro' ? (
                        <MaterialCommunityIcons
                          name="subway-variant"
                          size={18}
                          color={iconColor}
                        />
                      ) : (
                        <Ionicons
                          name={f.icon === 'flight' ? 'airplane' : 'wallet'}
                          size={18}
                          color={iconColor}
                        />
                      )}
                    </View>
                    <View style={styles.chipTextCol}>
                      <Text
                        style={[styles.chipTitle, selected && styles.chipTitleSelected]}
                        numberOfLines={1}
                      >
                        {f.title}
                      </Text>
                      <Text
                        style={[
                          styles.chipCount,
                          selected ? styles.chipCountSelected : { color: f.color },
                        ]}
                      >
                        {f.count} {f.count === 1 ? 'pass' : 'passes'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <YearlyExpenseCard tickets={tickets} />

          <View style={styles.actions}>
            <ActionCard
              title={uploading ? busyLabel : 'Fetch by PNR'}
              description="Enter 10-digit PNR — get full train, seat & platform details."
              tone="orange"
              icon="pnr"
              onPress={() => {
                if (!session?.user?.id) {
                  promptWalletSignIn(router);
                  return;
                }
                setPnrOpen(true);
              }}
              disabled={uploading}
            />
            <ActionCard
              title={uploading ? busyLabel : 'Upload Photo'}
              description="Photo → find PNR → fill ticket from API."
              tone="orange"
              icon="photo"
              onPress={onUploadPhoto}
              disabled={uploading}
            />
            <ActionCard
              title={uploading ? busyLabel : 'Upload PDF'}
              description="Hotel, train, bus & flight PDFs • text or scanned."
              tone="blue"
              icon="pdf"
              onPress={onUploadPdf}
              disabled={uploading}
            />
            <ActionCard
              title="India Metro"
              description="GPS picks your city · all stations · offline route + gate QR."
              tone="metro"
              icon="metro"
              onPress={() => {
                if (!session?.user?.id) {
                  promptWalletSignIn(router);
                  return;
                }
                router.push('/add');
              }}
              disabled={uploading}
            />
            <ActionCard
              title="Scan QR / Barcode"
              description="Scan boarding QR, Code 128, PDF417, and more."
              tone="green"
              icon="scan"
              onPress={() => {
                if (!session?.user?.id) {
                  promptWalletSignIn(router);
                  return;
                }
                router.push('/scan');
              }}
              disabled={uploading}
            />
          </View>

          <PassengerNamesSheet
            visible={!!nameDraft}
            passengers={nameDraft?.passengers || []}
            onCancel={() => {
              if (nameDraft) goReview(nameDraft);
              setNameDraft(null);
            }}
            onDone={(passengers) => {
              if (!nameDraft) return;
              goReview({
                ...nameDraft,
                passengers,
                extractionNote: 'Filled from IRCTC PNR API',
                needsManualCompletion: false,
              });
              setNameDraft(null);
            }}
          />

          <Modal visible={pnrOpen} transparent animationType="fade" onRequestClose={() => setPnrOpen(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Fetch by PNR</Text>
                <Text style={styles.modalBody}>
                  Enter your 10-digit IRCTC PNR. We load train, route, times, platform, coach and
                  berth — then you can type passenger names from your ticket.
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="4761434418"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  maxLength={14}
                  value={pnrInput}
                  onChangeText={setPnrInput}
                  autoFocus
                />
                <View style={styles.modalRow}>
                  <Pressable style={styles.modalGhost} onPress={() => setPnrOpen(false)}>
                    <Text style={styles.modalGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalBtn} onPress={() => void onFetchPnr()}>
                    <Text style={styles.modalBtnText}>Get details</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              {filter === 'all'
                ? 'Recent Passes'
                : filter === 'rail'
                  ? 'Train Passes'
                  : `${filter.charAt(0).toUpperCase()}${filter.slice(1)} Passes`}
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/passes')}>
              <Text style={styles.viewAll}>View All ›</Text>
            </Pressable>
          </View>

          {loading || uploading ? (
            <ActivityIndicator color={colors.orange} style={{ marginVertical: 24 }} />
          ) : recent.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {filter === 'all' && !query.trim()
                  ? 'No passes yet'
                  : 'No matching passes'}
              </Text>
              <Text style={styles.emptyBody}>
                {filter !== 'all'
                  ? `You don’t have any ${filter === 'rail' ? 'train' : filter} passes yet. Try All, or add one below.`
                  : canEditWallet
                    ? 'Tap Fetch by PNR for the fastest import. Or use photo/PDF/QR.'
                    : 'Sign in with Google to save passes to your account. Existing passes on this phone move to your account on first sign-in.'}
              </Text>
              {canEditWallet ? (
                <Pressable
                  style={styles.demoBtn}
                  onPress={() => void seedDemoTickets()}
                >
                  <Text style={styles.demoBtnText}>Load sample tickets</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.demoBtn}
                  onPress={() => router.push('/login')}
                >
                  <Text style={styles.demoBtnText}>Sign in with Google</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {recent.map((ticket) => (
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

      <HomeMenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: { padding: 18, paddingBottom: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 44,
  },
  brand: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 30,
    color: '#fff',
  },
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: '#fff',
    marginTop: 2,
  },
  welcome: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 26,
    color: '#fff',
  },
  name: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: colors.orange,
    marginTop: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
    marginBottom: 120,
  },
  locationChip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,104,0,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,104,0,0.35)',
    maxWidth: '48%',
  },
  locationChipText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.orange,
    flexShrink: 1,
  },
  subtitle: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#fff',
    textAlign: 'right',
  },
  search: {
    height: 58,
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
  },
  filterBlock: {
    marginBottom: 22,
  },
  filterLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  filters: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(12, 25, 47, 0.92)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chipIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTextCol: {
    gap: 1,
    paddingRight: 2,
  },
  chipTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#fff',
  },
  chipTitleSelected: {
    color: '#fff',
  },
  chipCount: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
  },
  chipCountSelected: {
    color: 'rgba(255,255,255,0.88)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 28,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 21,
    color: '#fff',
  },
  viewAll: {
    fontFamily: 'DMSans_700Bold',
    color: colors.orange,
  },
  empty: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
  },
  emptyBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 19,
  },
  demoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.orange,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  demoBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.panelSolid || colors.panel,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  modalBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
    lineHeight: 19,
  },
  modalInput: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    letterSpacing: 2,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalGhost: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalGhostText: {
    fontFamily: 'Outfit_600SemiBold',
    color: colors.muted,
  },
  modalBtn: {
    backgroundColor: colors.orange,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
  },
});
