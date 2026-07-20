import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { connectGmailAccount } from '../src/services/gmail/gmailAuth';
import {
  GmailImportCandidate,
  scanGmailForBoardingPasses,
} from '../src/services/gmail/importBoardingPasses';
import { useTickets } from '../src/context/TicketContext';
import {
  GmailAccount,
  listGmailAccounts,
  markGmailSynced,
  removeGmailAccount,
} from '../src/storage/gmailAccounts';
import { colors, radii, spacing } from '../src/theme';

export default function ImportGmailScreen() {
  const router = useRouter();
  const { session, user, hasTravelId } = useAuth();
  const { importDraftsIfNew, canEditWallet } = useTickets();
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [candidates, setCandidates] = useState<GmailImportCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const reloadAccounts = useCallback(async () => {
    setAccounts(await listGmailAccounts());
  }, []);

  useEffect(() => {
    void reloadAccounts();
  }, [reloadAccounts]);

  if (!session?.user?.id) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sign in required</Text>
          <Text style={styles.emptyBody}>
            Sign in to Travel ID first, then connect Gmail to import passes into
            your account.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const profileReady =
    Boolean(user?.firstName && user?.lastName) ||
    Boolean(user?.fullName || user?.name);

  const onConnect = async () => {
    try {
      setBusy(true);
      setProgress('Opening Google account picker…');
      await connectGmailAccount();
      await reloadAccounts();
      Alert.alert(
        'Gmail connected',
        'Allow Travel ID to read mail when prompted. You can connect more accounts the same way.'
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not connect Gmail';
      if (!/cancel/i.test(msg)) Alert.alert('Gmail', msg);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const onRemove = (account: GmailAccount) => {
    Alert.alert('Disconnect Gmail?', account.email, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () =>
          void removeGmailAccount(account.id).then(() => reloadAccounts()),
      },
    ]);
  };

  const onScan = async () => {
    if (!canEditWallet) {
      Alert.alert('Sign in', 'Sign in to save passes to your account.');
      return;
    }
    if (!profileReady) {
      Alert.alert(
        'Profile name needed',
        'Set your first and last name on Profile (Create Travel ID) so we only import passes in your name.'
      );
      return;
    }
    if (!accounts.length) {
      Alert.alert('Connect Gmail', 'Connect at least one Gmail account first.');
      return;
    }

    try {
      setBusy(true);
      setCandidates([]);
      const all: GmailImportCandidate[] = [];
      for (const account of accounts) {
        setProgress(`Scanning ${account.email}…`);
        const found = await scanGmailForBoardingPasses(
          account.id,
          account.email,
          user!,
          (p) =>
            setProgress(
              `${account.email}: ${p.phase}${
                p.total ? ` (${p.current}/${p.total})` : ''
              }`
            )
        );
        all.push(...found);
        await markGmailSynced(account.id);
      }
      // Prefer past passes; still show upcoming so user can choose
      const past = all.filter((c) => c.isPast);
      const upcoming = all.filter((c) => !c.isPast);
      const ordered = [...past, ...upcoming];
      setCandidates(ordered);
      const sel: Record<string, boolean> = {};
      for (const c of past) sel[c.key] = true; // auto-select past
      setSelected(sel);
      setProgress(
        ordered.length
          ? `Found ${past.length} past · ${upcoming.length} upcoming in your name`
          : 'No matching boarding passes found'
      );
    } catch (e) {
      Alert.alert(
        'Scan failed',
        e instanceof Error ? e.message : 'Could not scan Gmail'
      );
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    const picks = candidates.filter((c) => selected[c.key]);
    if (!picks.length) {
      Alert.alert('Import', 'Select at least one pass.');
      return;
    }
    try {
      setBusy(true);
      setProgress('Saving to your wallet…');
      const { added, skipped } = await importDraftsIfNew(
        picks.map((p) => p.draft)
      );
      Alert.alert(
        'Import complete',
        `Added ${added} pass${added === 1 ? '' : 'es'}${
          skipped ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''
        }.`
      );
      router.replace('/(tabs)/passes');
    } catch (e) {
      Alert.alert(
        'Import failed',
        e instanceof Error ? e.message : 'Could not save passes'
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          Connect one or more Gmail accounts. Travel ID scans ticket PDFs and
          imports boarding passes that match your name
          {hasTravelId ? ' (from your Travel ID profile)' : ''}. Past trips are
          selected by default.
        </Text>

        {!profileReady && (
          <Pressable
            style={styles.warnCard}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.warnTitle}>Set your name on Profile</Text>
            <Text style={styles.warnBody}>
              We only import passes that list you as a passenger.
            </Text>
          </Pressable>
        )}

        <Text style={styles.section}>Connected Gmail</Text>
        {accounts.length === 0 ? (
          <Text style={styles.muted}>No Gmail accounts connected yet.</Text>
        ) : (
          accounts.map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountEmail}>{a.email}</Text>
                <Text style={styles.accountMeta}>
                  {a.lastSyncAt
                    ? `Last scan ${new Date(a.lastSyncAt).toLocaleString()}`
                    : 'Not scanned yet'}
                </Text>
              </View>
              <Pressable onPress={() => onRemove(a)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))
        )}

        <Pressable
          style={[styles.secondaryBtn, busy && styles.disabled]}
          onPress={() => void onConnect()}
          disabled={busy}
        >
          <Ionicons name="mail-outline" size={18} color="#fff" />
          <Text style={styles.secondaryText}>Connect Gmail account</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryBtn, busy && styles.disabled]}
          onPress={() => void onScan()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Scan for boarding passes</Text>
          )}
        </Pressable>

        {!!progress && <Text style={styles.progress}>{progress}</Text>}

        {candidates.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: 22 }]}>
              Matches ({candidates.length})
            </Text>
            {candidates.map((c) => {
              const on = !!selected[c.key];
              return (
                <Pressable
                  key={c.key}
                  style={[styles.candidate, on && styles.candidateOn]}
                  onPress={() =>
                    setSelected((s) => ({ ...s, [c.key]: !s[c.key] }))
                  }
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={on ? colors.orange : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateTitle}>
                      {c.draft.kind.toUpperCase()} · {c.draft.from} → {c.draft.to}
                    </Text>
                    <Text style={styles.candidateMeta}>
                      {c.matchedName}
                      {c.isPast ? ' · Past' : ' · Upcoming'}
                      {c.draft.pnr ? ` · ${c.draft.pnr}` : ''}
                    </Text>
                    <Text style={styles.candidateMail} numberOfLines={1}>
                      {c.email} · {c.filename}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              style={[styles.primaryBtn, busy && styles.disabled]}
              onPress={() => void onImport()}
              disabled={busy}
            >
              <Text style={styles.primaryText}>Import selected to My Passes</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </Pressable>
      <Text style={styles.title}>Import from Gmail</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: 'Outfit_700Bold', fontSize: 18, color: '#fff' },
  content: { padding: spacing.md, paddingBottom: 40 },
  lead: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 16,
  },
  section: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  muted: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    marginBottom: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 10,
  },
  accountEmail: { fontFamily: 'DMSans_700Bold', color: '#fff', fontSize: 15 },
  accountMeta: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: colors.orange,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: 'Outfit_700Bold', color: '#fff', fontSize: 15 },
  secondaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 13,
  },
  secondaryText: { fontFamily: 'Outfit_700Bold', color: '#fff', fontSize: 14 },
  disabled: { opacity: 0.55 },
  progress: {
    marginTop: 12,
    fontFamily: 'DMSans_400Regular',
    color: '#9EC5FF',
    fontSize: 13,
  },
  candidate: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    marginBottom: 10,
  },
  candidateOn: { borderColor: 'rgba(255,104,0,0.55)' },
  candidateTitle: {
    fontFamily: 'DMSans_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  candidateMeta: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  candidateMail: {
    fontFamily: 'DMSans_400Regular',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginTop: 2,
  },
  warnCard: {
    backgroundColor: 'rgba(255,104,0,0.12)',
    borderColor: 'rgba(255,104,0,0.35)',
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: 16,
  },
  warnTitle: { fontFamily: 'Outfit_700Bold', color: colors.orange, fontSize: 14 },
  warnBody: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'DMSans_400Regular',
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
});
