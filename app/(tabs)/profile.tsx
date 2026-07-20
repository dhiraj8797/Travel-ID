import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import {
  canCreateTravelId,
  formatTravelIdDisplay,
} from '../../src/auth/travelId';
import { SocialAuthButtons } from '../../src/components/auth/SocialAuthButtons';
import { useTickets } from '../../src/context/TicketContext';
import { isPastPass, isUpcomingPass } from '../../src/utils/passTime';
import { colors, radii, spacing } from '../../src/theme';

const logo = require('../../assets/travel-id-logo.png');
const nightBg = require('../../assets/scenes/passes-settings-bg.jpg');
const flightArt = require('../../assets/vehicles/hero-flight.png');
const trainArt = require('../../assets/heroes/train.jpg');
const busArt = require('../../assets/heroes/bus.jpg');

export default function ProfileScreen() {
  const router = useRouter();
  const {
    user,
    loading,
    displayName,
    session,
    travelId,
    hasTravelId,
    refreshProfile,
    logout,
    loginWithGoogle,
    createTravelId,
  } = useAuth();
  const { tickets } = useTickets();
  const [socialBusy, setSocialBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [creatingId, setCreatingId] = useState(false);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.firstName) setFirstName(user.firstName);
    else if (user.fullName || user.name) {
      const parts = String(user.fullName || user.name)
        .trim()
        .split(/\s+/);
      if (parts[0]) setFirstName(parts[0]);
      if (parts.length > 1 && !user.lastName) {
        setLastName(parts.slice(1).join(' '));
      }
    }
    if (user.lastName) setLastName(user.lastName);
    if (user.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(user.dateOfBirth)) {
      const [y, m, d] = user.dateOfBirth.split('-');
      setDobYear(y);
      setDobMonth(m);
      setDobDay(d);
    }
  }, [user?.id]);

  const dateOfBirthIso = useMemo(() => {
    const d = dobDay.replace(/\D/g, '').padStart(2, '0').slice(-2);
    const m = dobMonth.replace(/\D/g, '').padStart(2, '0').slice(-2);
    const y = dobYear.replace(/\D/g, '').slice(0, 4);
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      return `${y}-${m}-${d}`;
    }
    return '';
  }, [dobDay, dobMonth, dobYear]);

  const formReady = canCreateTravelId({
    firstName,
    lastName,
    dateOfBirth: dateOfBirthIso,
  });

  const onCreateTravelId = async () => {
    if (!formReady || creatingId || hasTravelId) return;
    try {
      setCreatingId(true);
      await createTravelId({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirthIso,
      });
      setJustCreated(true);
    } catch (e) {
      Alert.alert(
        'Travel ID',
        e instanceof Error ? e.message : 'Could not create Travel ID.'
      );
    } finally {
      setCreatingId(false);
    }
  };

  const onGoogle = async () => {
    try {
      setSocialBusy(true);
      await loginWithGoogle();
    } catch {
      // stay on profile; user can retry or use Log in
    } finally {
      setSocialBusy(false);
    }
  };

  const stats = useMemo(() => {
    const upcoming = tickets.filter(isUpcomingPass);
    const completed = tickets.filter(isPastPass);
    const flights = completed.filter((t) => t.kind === 'flight').length;
    const trains = completed.filter((t) => t.kind === 'rail').length;
    const buses = completed.filter((t) => t.kind === 'bus').length;
    const cities = new Set(
      tickets.flatMap((t) => [t.fromCode || t.from, t.toCode || t.to].filter(Boolean))
    ).size;
    return {
      trips: tickets.length,
      cities,
      days: Math.max(tickets.length * 2, upcoming.length),
      countries: Math.min(3, Math.max(1, Math.ceil(cities / 8))),
      flights,
      trains,
      buses,
    };
  }, [tickets]);

  if (loading) {
    return (
      <View style={styles.root}>
        <ProfileBackdrop />
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={colors.purple} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  if (!session || !user?.id) {
    return (
      <View style={styles.root}>
        <ProfileBackdrop />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.topRow}>
              <Text style={styles.pageTitle}>Profile</Text>
              <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')}>
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </Pressable>
            </View>

            <View style={styles.glass}>
              <View style={styles.guestHeader}>
                <View style={styles.avatarRing}>
                  <Image source={logo} style={styles.avatar} />
                </View>
                <View style={styles.helloBlock}>
                  <Text style={styles.hello}>Hello,</Text>
                  <Text style={styles.name}>Traveller</Text>
                  <Text style={styles.tagline}>
                    Sign in with Google to personalize your travel identity
                  </Text>
                </View>
              </View>

              <View style={styles.socialWrap}>
                <SocialAuthButtons
                  busy={socialBusy}
                  onGoogle={() => void onGoogle()}
                  caption="Sign in with Google"
                />
              </View>

              <Text style={styles.guestHint}>
                Sign in with Google to save passes to your account. Passes on
                this phone move to your account the first time you sign in.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  const photo = user.profilePic || user.photo || user.picture;
  const location =
    (user as { city?: string; location?: string }).city ||
    (user as { city?: string; location?: string }).location ||
    'Bengaluru, India';

  return (
    <View style={styles.root}>
      <ProfileBackdrop />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <Text style={styles.pageTitle}>Profile</Text>
            <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Glass profile card */}
          <View style={styles.glass}>
            <View style={styles.proBadge}>
              <Ionicons name="diamond" size={12} color="#E8D4FF" />
              <Text style={styles.proText}>PRO</Text>
            </View>

            <View style={styles.headerRow}>
              <View style={styles.avatarWrap}>
                <LinearGradient
                  colors={['#7B5CFF', '#4DA3FF', '#984DFF']}
                  style={styles.avatarGlow}
                />
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.initials}>
                      {displayName
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.camBadge}>
                  <Ionicons name="camera" size={12} color="#0B1530" />
                </View>
              </View>

              <View style={styles.helloBlock}>
                <Text style={styles.hello}>Hello,</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
                {hasTravelId && travelId ? (
                  <View style={styles.tidBlock}>
                    <Text style={styles.tidLabel}>Your Travel ID</Text>
                    <Text style={styles.tidValue} selectable>
                      {formatTravelIdDisplay(travelId)}
                    </Text>
                    {justCreated && (
                      <Text style={styles.tidSuccess}>Created successfully</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.tagline}>
                    Complete your details to create your Travel ID
                  </Text>
                )}
                <View style={styles.locRow}>
                  <Ionicons name="location-outline" size={14} color="#9EC5FF" />
                  <Text style={styles.locText}>{location}</Text>
                </View>
              </View>
            </View>

            {!hasTravelId && (
              <View style={styles.tidForm}>
                <Text style={styles.tidFormTitle}>Create your Travel ID</Text>
                <Text style={styles.tidFormHint}>
                  First name, last name, and date of birth are required. Your ID
                  is permanent once created.
                </Text>

                <Text style={styles.fieldLabel}>First name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Dhiraj"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Last name</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Kumar"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                />

                <Text style={styles.fieldLabel}>Date of birth</Text>
                <View style={styles.dobRow}>
                  <TextInput
                    style={[styles.fieldInput, styles.dobInput]}
                    value={dobDay}
                    onChangeText={(t) => setDobDay(t.replace(/\D/g, '').slice(0, 2))}
                    placeholder="DD"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <TextInput
                    style={[styles.fieldInput, styles.dobInput]}
                    value={dobMonth}
                    onChangeText={(t) =>
                      setDobMonth(t.replace(/\D/g, '').slice(0, 2))
                    }
                    placeholder="MM"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <TextInput
                    style={[styles.fieldInput, styles.dobYear]}
                    value={dobYear}
                    onChangeText={(t) =>
                      setDobYear(t.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="YYYY"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>

                <Pressable
                  style={[
                    styles.createTidBtn,
                    (!formReady || creatingId) && styles.createTidBtnDisabled,
                  ]}
                  disabled={!formReady || creatingId}
                  onPress={() => void onCreateTravelId()}
                >
                  {creatingId ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.createTidBtnText}>Create My Travel ID</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* Stats */}
            <View style={styles.statsRow}>
              <Stat
                icon="ticket-confirmation-outline"
                color="#4DA3FF"
                value={pad2(stats.trips)}
                label="Trips"
              />
              <Stat
                icon="map-marker-radius-outline"
                color="#E06BFF"
                value={pad2(stats.cities)}
                label="Cities"
              />
              <Stat
                icon="calendar-month-outline"
                color="#FF8A3D"
                value={pad2(stats.days)}
                label="Days"
              />
              <Stat
                icon="passport"
                color="#B388FF"
                value={String(stats.countries)}
                label="Countries"
              />
            </View>

            {/* Travel collection — completed trips only, single row */}
            <View style={styles.collectionHead}>
              <Text style={styles.collectionTitle}>Your Travel Collection</Text>
              <Text style={styles.collectionHint}>Completed</Text>
            </View>

            <View style={styles.collectionRow}>
              <CollectionCell
                title="Flights"
                count={stats.flights}
                accent="#3476FF"
                icon="airplane"
                image={flightArt}
              />
              <CollectionCell
                title="Trains"
                count={stats.trains}
                accent="#984DFF"
                icon="train"
                image={trainArt}
              />
              <CollectionCell
                title="Buses"
                count={stats.buses}
                accent="#FF6800"
                icon="bus"
                image={busArt}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={() => refreshProfile()}>
              <Ionicons name="refresh" size={18} color="#B8C7FF" />
              <Text style={styles.secondaryText}>Refresh Google profile</Text>
            </Pressable>
            <Pressable style={styles.dangerBtn} onPress={() => void logout()}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.dangerText}>Sign out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function ProfileBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ImageBackground source={nightBg} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient
          colors={['rgba(4,10,28,0.55)', 'rgba(8,16,40,0.72)', 'rgba(6,12,28,0.88)']}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>
    </View>
  );
}

function Stat({
  icon,
  color,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { shadowColor: color }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CollectionCell({
  title,
  count,
  accent,
  icon,
  image,
}: {
  title: string;
  count: number;
  accent: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  image: number;
}) {
  return (
    <ImageBackground
      source={image}
      style={[styles.collectionCell, { borderColor: `${accent}88` }]}
      imageStyle={styles.collectionImg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(4,10,28,0.35)', 'rgba(4,10,28,0.82)']}
        style={styles.collectionScrim}
      >
        <View style={[styles.collectionIcon, { backgroundColor: `${accent}55` }]}>
          <MaterialCommunityIcons name={icon} size={16} color="#fff" />
        </View>
        <Text style={styles.collectionCount}>{pad2(count)}</Text>
        <Text style={styles.collectionName}>{title}</Text>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060E1F' },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md, paddingBottom: 120 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  pageTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#fff',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  glass: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(160,190,255,0.22)',
    backgroundColor: 'rgba(12, 22, 48, 0.72)',
    padding: 18,
    overflow: 'hidden',
  },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1A2748',
  },
  socialWrap: {
    marginTop: 18,
    marginBottom: 4,
  },
  guestHint: {
    marginTop: 14,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  proBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(152,77,255,0.35)',
    borderColor: 'rgba(200,160,255,0.65)',
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  proText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: '#F0E6FF',
    letterSpacing: 0.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 56,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    opacity: 0.95,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarFallback: {
    backgroundColor: '#1A2748',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#fff' },
  camBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helloBlock: { flex: 1 },
  hello: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  name: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    color: '#fff',
    marginTop: 2,
  },
  tidBlock: {
    marginTop: 8,
    gap: 2,
  },
  tidLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: 'rgba(158,197,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tidValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: colors.orange,
    letterSpacing: 0.8,
  },
  tidSuccess: {
    marginTop: 2,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#6EE7A8',
  },
  tidForm: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(160,190,255,0.18)',
  },
  tidFormTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  tidFormHint: {
    marginTop: 6,
    marginBottom: 12,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  fieldLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
    marginTop: 8,
  },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(160,190,255,0.22)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
  },
  dobRow: { flexDirection: 'row', gap: 10 },
  dobInput: { flex: 1, textAlign: 'center' },
  dobYear: { flex: 1.4, textAlign: 'center' },
  createTidBtn: {
    marginTop: 16,
    backgroundColor: colors.orange,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createTidBtnDisabled: { opacity: 0.45 },
  createTidBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: '#fff',
    fontSize: 15,
  },
  tagline: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#9EC5FF',
    marginTop: 4,
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  locText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: '#9EC5FF',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  stat: { alignItems: 'center', width: '23%' },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  statValue: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
  },
  statLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  collectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 12,
  },
  collectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  collectionHint: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#9EC5FF',
  },
  collectionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  collectionCell: {
    flex: 1,
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0B1530',
  },
  collectionImg: {
    borderRadius: 15,
  },
  collectionScrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 6,
  },
  collectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  collectionCount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 24,
    lineHeight: 28,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  collectionName: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  actions: { marginTop: 16, gap: 10 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(158,197,255,0.35)',
    backgroundColor: 'rgba(80,120,220,0.12)',
    paddingVertical: 13,
  },
  secondaryText: { fontFamily: 'DMSans_700Bold', color: '#B8C7FF' },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,93,93,0.4)',
    backgroundColor: 'rgba(232,93,93,0.1)',
    paddingVertical: 13,
  },
  dangerText: { fontFamily: 'DMSans_700Bold', color: colors.danger },
});
