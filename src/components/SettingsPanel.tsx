import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../auth/AuthContext';
import { formatTravelIdDisplay, isCreatedTravelId } from '../auth/travelId';
import { useTickets } from '../context/TicketContext';
import { LEGAL_INDEX } from '../legal/documents';
import {
  clearApiProxyUrlOverride,
  getApiProxyUrl,
  getApiProxyUrlDefault,
  setApiProxyUrlOverride,
} from '../services/apiProxy';
import { colors, radii, spacing } from '../theme';

const PREFS_KEY = 'wallet.ui.prefs';

type Prefs = {
  notifyTrips: boolean;
  biometricsHint: boolean;
};

type Props = {
  showHeaderBack?: boolean;
};

export function SettingsPanel({ showHeaderBack }: Props) {
  const router = useRouter();
  const { session, user, logout, refreshProfile } = useAuth();
  const { tickets, seedDemoTickets, clearAllTickets } = useTickets();
  const [biometricsHint, setBiometricsHint] = useState(true);
  const [notifyTrips, setNotifyTrips] = useState(true);
  const [proxyUrl, setProxyUrl] = useState(getApiProxyUrl());
  const [proxyBusy, setProxyBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (!raw) return;
        const prefs = JSON.parse(raw) as Prefs;
        if (typeof prefs.notifyTrips === 'boolean') setNotifyTrips(prefs.notifyTrips);
        if (typeof prefs.biometricsHint === 'boolean') {
          setBiometricsHint(prefs.biometricsHint);
        }
      } catch {
        /* ignore */
      }
    })();
    setProxyUrl(getApiProxyUrl());
  }, []);

  const saveProxyUrl = async () => {
    const next = proxyUrl.trim().replace(/\/$/, '');
    if (next && !/^https?:\/\//i.test(next)) {
      Alert.alert(
        'Proxy URL',
        'Use the Cloudflare tunnel URL, e.g. https://….trycloudflare.com'
      );
      return;
    }
    try {
      setProxyBusy(true);
      if (!next || next === getApiProxyUrlDefault()) {
        await clearApiProxyUrlOverride();
        setProxyUrl(getApiProxyUrlDefault());
      } else {
        await setApiProxyUrlOverride(next);
        setProxyUrl(next);
      }
      Alert.alert('Saved', `Live data proxy:\n${getApiProxyUrl()}`);
    } catch {
      Alert.alert('Error', 'Could not save proxy URL.');
    } finally {
      setProxyBusy(false);
    }
  };

  const testProxy = async () => {
    const base = (proxyUrl.trim() || getApiProxyUrl()).replace(/\/$/, '');
    if (!base) {
      Alert.alert('Proxy', 'Enter a proxy URL first.');
      return;
    }
    try {
      setProxyBusy(true);
      const res = await fetch(`${base}/health`);
      const json = (await res.json()) as { ok?: boolean };
      if (res.ok && json.ok) {
        Alert.alert('Proxy OK', `Reached ${base}`);
      } else {
        Alert.alert('Proxy', `Unexpected response (${res.status})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unreachable';
      Alert.alert(
        'Cannot reach proxy',
        `${msg}\n\nPhone and PC must share Wi‑Fi. On PC run npm run proxy.\nTried: ${base}`
      );
    } finally {
      setProxyBusy(false);
    }
  };

  const persistPrefs = async (next: Prefs) => {
    setNotifyTrips(next.notifyTrips);
    setBiometricsHint(next.biometricsHint);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const clearLocalCache = () => {
    Alert.alert(
      'Clear local cache?',
      'Removes temporary draft data. Saved passes stay unless you delete the wallet separately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(['wallet.pendingDraft']);
              Alert.alert('Done', 'Local cache cleared.');
            } catch {
              Alert.alert('Error', 'Could not clear cache.');
            }
          },
        },
      ]
    );
  };

  const deleteAllPasses = () => {
    if (!session) {
      Alert.alert('Sign in required', 'Sign in to manage passes on your account.');
      return;
    }
    if (!tickets.length) {
      Alert.alert('Wallet empty', 'There are no saved passes on this account.');
      return;
    }
    Alert.alert(
      'Delete all passes?',
      `This permanently removes ${tickets.length} pass${tickets.length === 1 ? '' : 'es'} from this Google account on this phone. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllTickets();
              Alert.alert('Done', 'All passes removed from this account.');
            } catch (e) {
              Alert.alert(
                'Error',
                e instanceof Error ? e.message : 'Could not delete passes.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {showHeaderBack ? (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="Account">
          <Row
            icon="person-circle-outline"
            label={
              session
                ? user?.fullName || user?.name || user?.email || 'Google account'
                : 'Log in / Sign up'
            }
            sub={
              session
                ? [
                    isCreatedTravelId(user?.travelId)
                      ? formatTravelIdDisplay(user!.travelId!)
                      : null,
                    user?.email,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Signed in with Google'
                : 'Google account for Travel ID'
            }
            onPress={() =>
              session ? router.push('/(tabs)/profile') : router.push('/login')
            }
          />
          {session && (
            <>
              <Row
                icon="refresh-outline"
                label="Refresh profile"
                sub="Pull latest name and photo from Google"
                onPress={() =>
                  refreshProfile()
                    .then(() => Alert.alert('Profile', 'Updated from Google.'))
                    .catch((e) =>
                      Alert.alert(
                        'Refresh failed',
                        e instanceof Error ? e.message : 'Try again'
                      )
                    )
                }
              />
              <Row
                icon="log-out-outline"
                label="Sign out"
                danger
                onPress={() =>
                  Alert.alert(
                    'Sign out?',
                    'You can sign back in with Google anytime. Your passes stay on this account and will show again after you sign in.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Sign out',
                        style: 'destructive',
                        onPress: () => void logout(),
                      },
                    ]
                  )
                }
              />
            </>
          )}
        </Section>

        <Section title="Wallet">
          <Row
            icon="wallet-outline"
            label="My passes"
            sub={
              session
                ? `${tickets.length} saved on this account`
                : 'Sign in to use your wallet'
            }
            onPress={() => router.push('/(tabs)/passes')}
          />
          <Row
            icon="mail-outline"
            label="Import from Gmail"
            sub="Connect accounts · pull boarding passes in your name"
            onPress={() => {
              if (!session) {
                Alert.alert(
                  'Sign in required',
                  'Sign in with Google first, then connect Gmail.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign in', onPress: () => router.push('/login') },
                  ]
                );
                return;
              }
              router.push('/import-gmail');
            }}
          />
          <Row
            icon="flask-outline"
            label="Load sample tickets"
            sub="Demo bus & train passes"
            onPress={() => {
              if (!session) {
                Alert.alert(
                  'Sign in required',
                  'Sign in with Google to save passes to your account.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign in', onPress: () => router.push('/login') },
                  ]
                );
                return;
              }
              void seedDemoTickets()
                .then(() => Alert.alert('Travel ID', 'Sample passes loaded.'))
                .catch((e) =>
                  Alert.alert(
                    'Error',
                    e instanceof Error ? e.message : 'Could not load samples.'
                  )
                );
            }}
          />
          <Row
            icon="document-outline"
            label="Upload ticket PDF"
            onPress={() => {
              if (!session) {
                Alert.alert(
                  'Sign in required',
                  'Sign in with Google to add passes.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign in', onPress: () => router.push('/login') },
                  ]
                );
                return;
              }
              router.push('/(tabs)');
            }}
          />
          <Row
            icon="qr-code-outline"
            label="Scan ticket QR"
            onPress={() => {
              if (!session) {
                Alert.alert(
                  'Sign in required',
                  'Sign in with Google to add passes.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign in', onPress: () => router.push('/login') },
                  ]
                );
                return;
              }
              router.push('/scan');
            }}
          />
        </Section>

        <Section title="Preferences">
          <ToggleRow
            icon="notifications-outline"
            label="Trip reminders"
            value={notifyTrips}
            onValueChange={(v) =>
              void persistPrefs({ notifyTrips: v, biometricsHint })
            }
          />
          <ToggleRow
            icon="shield-checkmark-outline"
            label="Lock tips for wallet"
            value={biometricsHint}
            onValueChange={(v) =>
              void persistPrefs({ notifyTrips, biometricsHint: v })
            }
          />
        </Section>

        <Section title="Live data proxy">
          <View style={styles.proxyBlock}>
            <Text style={styles.proxyHint}>
              Live data needs the PC proxy on the public internet (phone uses
              mobile data). Run npm run proxy and npm run proxy:tunnel, then
              paste the https://….trycloudflare.com URL here.
            </Text>
            <TextInput
              style={styles.proxyInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://….trycloudflare.com"
              placeholderTextColor={colors.muted}
              value={proxyUrl}
              onChangeText={setProxyUrl}
            />
            <View style={styles.proxyActions}>
              <Pressable
                style={[styles.proxyBtn, proxyBusy && styles.proxyBtnDisabled]}
                onPress={() => void saveProxyUrl()}
                disabled={proxyBusy}
              >
                <Text style={styles.proxyBtnText}>Save</Text>
              </Pressable>
              <Pressable
                style={[styles.proxyBtnGhost, proxyBusy && styles.proxyBtnDisabled]}
                onPress={() => void testProxy()}
                disabled={proxyBusy}
              >
                <Text style={styles.proxyBtnGhostText}>Test</Text>
              </Pressable>
            </View>
          </View>
        </Section>

        <Section title="Legal">
          {LEGAL_INDEX.map((item) => (
            <Row
              key={item.id}
              icon={
                item.id === 'privacy'
                  ? 'shield-outline'
                  : item.id === 'terms'
                    ? 'document-text-outline'
                    : item.id === 'data-privacy'
                      ? 'lock-closed-outline'
                      : 'code-slash-outline'
              }
              label={item.title}
              sub={item.blurb}
              onPress={() => router.push(`/legal/${item.id}`)}
            />
          ))}
          <Row
            icon="open-outline"
            label="Google privacy"
            sub="How Google handles account data"
            onPress={() =>
              void Linking.openURL('https://policies.google.com/privacy')
            }
          />
        </Section>

        <Section title="Data & privacy">
          <Row
            icon="information-circle-outline"
            label="How your data is used"
            sub="On-device wallet, account & live status"
            onPress={() => router.push('/legal/data-privacy')}
          />
          <Row
            icon="trash-outline"
            label="Clear local cache"
            sub="Drafts & temporary scan data"
            onPress={clearLocalCache}
          />
          <Row
            icon="trash-bin-outline"
            label="Delete all passes"
            sub="Remove every ticket from this account"
            danger
            onPress={deleteAllPasses}
          />
        </Section>

        <Section title="About">
          <Row
            icon="information-circle-outline"
            label="About Travel ID"
            sub="v1.0.0 · com.travelid.app"
            onPress={() =>
              Alert.alert(
                'Travel ID',
                'Your journey, your ID.\n\nLocal boarding-pass wallet for bus, train & flight.\nSign in with Google (optional).\n\nRead Privacy Policy and Terms in Settings → Legal.'
              )
            }
          />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  sub,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={[styles.iconWrap, danger && { backgroundColor: 'rgba(232,93,93,0.12)' }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.orange} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
        {!!sub && (
          <Text style={styles.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={colors.orange} />
      </View>
      <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#334', true: 'rgba(255,104,0,0.55)' }}
        thumbColor={value ? colors.orange : '#ccc'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
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
  title: { fontFamily: 'Outfit_700Bold', fontSize: 20, color: '#fff' },
  content: { padding: spacing.md, paddingBottom: 120 },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' },
  rowSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  proxyBlock: { padding: 14, gap: 10 },
  proxyHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  proxyInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
  },
  proxyActions: { flexDirection: 'row', gap: 10 },
  proxyBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proxyBtnGhost: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proxyBtnDisabled: { opacity: 0.55 },
  proxyBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 14,
  },
  proxyBtnGhostText: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 14,
  },
});
