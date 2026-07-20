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
import { RecentPassCard } from '../../src/components/home/RecentPassCard';
import { AnimatedTravelBackground } from '../../src/components/AnimatedTravelBackground';
import { useTickets } from '../../src/context/TicketContext';
import { PassengerNamesSheet } from '../../src/components/PassengerNamesSheet';
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

type Filter = 'all' | 'bus' | 'rail' | 'flight';

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

  const counts = useMemo(
    () => ({
      all: tickets.length,
      bus: tickets.filter((t) => t.kind === 'bus').length,
      rail: tickets.filter((t) => t.kind === 'rail').length,
      flight: tickets.filter((t) => t.kind === 'flight').length,
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
      setBusyLabel('Reading PDF…');
      setUploading(true);
      const draft = await pickAndProcessPdf();
      if (!draft) return;
      setPendingDraft(draft);
      router.push('/review');
    } catch (error) {
      Alert.alert(
        'Upload PDF',
        error instanceof Error ? error.message : 'Failed to read PDF'
      );
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
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
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
          <Text style={styles.subtitle}>All your travel passes,{'\n'}in one secure wallet.</Text>

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

          <View style={styles.filters}>
            {(
              [
                { key: 'all', title: 'All', count: counts.all, color: colors.orange, icon: 'wallet' },
                { key: 'bus', title: 'Bus', count: counts.bus, color: colors.orange, icon: 'bus' },
                { key: 'rail', title: 'Train', count: counts.rail, color: colors.blue, icon: 'train' },
                { key: 'flight', title: 'Flight', count: counts.flight, color: colors.purple, icon: 'flight' },
              ] as const
            ).map((f) => {
              const selected = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: `${f.color}1F`, borderColor: f.color },
                  ]}
                  onPress={() => setFilter(f.key)}
                >
                  {f.icon === 'bus' || f.icon === 'train' ? (
                    <MaterialCommunityIcons
                      name={f.icon}
                      size={18}
                      color={selected ? f.color : '#fff'}
                    />
                  ) : (
                    <Ionicons
                      name={f.icon === 'flight' ? 'airplane' : 'wallet'}
                      size={18}
                      color={selected ? f.color : '#fff'}
                    />
                  )}
                  <Text style={styles.chipTitle}>{f.title}</Text>
                  <Text style={[styles.chipCount, { color: f.color }]}>{f.count}</Text>
                </Pressable>
              );
            })}
          </View>

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
              description="PDF text or PNR API when a PNR is found."
              tone="blue"
              icon="pdf"
              onPress={onUploadPdf}
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
            <Text style={styles.sectionTitle}>Recent Passes</Text>
            <Pressable onPress={() => router.push('/(tabs)/passes')}>
              <Text style={styles.viewAll}>View All ›</Text>
            </Pressable>
          </View>

          {loading || uploading ? (
            <ActivityIndicator color={colors.orange} style={{ marginVertical: 24 }} />
          ) : recent.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No passes yet</Text>
              <Text style={styles.emptyBody}>
                {canEditWallet
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
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 23,
    color: '#fff',
    marginTop: 8,
    marginBottom: 120,
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
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  chip: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 2,
  },
  chipTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: '#fff',
  },
  chipCount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
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
