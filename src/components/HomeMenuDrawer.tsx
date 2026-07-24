import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { formatTravelIdDisplay, isCreatedTravelId } from '../auth/travelId';
import { colors, radii, spacing } from '../theme';

const logo = require('../../assets/travel-id-logo.jpg');

type Props = {
  visible: boolean;
  onClose: () => void;
};

type MenuItem = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle?: string;
  onPress: () => void;
  danger?: boolean;
};

/**
 * Home hamburger menu — slide-in panel with clear sections.
 */
export function HomeMenuDrawer({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, user, displayName, logout } = useAuth();

  const go = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as never), 180);
  };

  const travelId =
    user?.travelId && isCreatedTravelId(user.travelId)
      ? formatTravelIdDisplay(user.travelId)
      : null;

  const accountItems: MenuItem[] = session
    ? [
        {
          icon: 'person-outline',
          label: 'Profile',
          subtitle: displayName,
          onPress: () => go('/(tabs)/profile'),
        },
        {
          icon: 'id-card-outline',
          label: 'Travel ID',
          subtitle: travelId || 'Create your Travel ID',
          onPress: () => go('/(tabs)/profile'),
        },
      ]
    : [
        {
          icon: 'log-in-outline',
          label: 'Sign in',
          subtitle: 'Google · save passes to your account',
          onPress: () => go('/login'),
        },
      ];

  const walletItems: MenuItem[] = [
    {
      icon: 'wallet-outline',
      label: 'My passes',
      onPress: () => go('/(tabs)/passes'),
    },
    {
      icon: 'add-circle-outline',
      label: 'Add pass',
      subtitle: 'PDF · photo · PNR · scan',
      onPress: () => go('/add'),
    },
    {
      icon: 'qr-code-outline',
      label: 'Scan ticket QR',
      onPress: () => go('/scan'),
    },
  ];

  const settingsItems: MenuItem[] = [
    {
      icon: 'settings-outline',
      label: 'All settings',
      subtitle: 'Proxy, reminders, legal',
      onPress: () => go('/settings'),
    },
    {
      icon: 'shield-outline',
      label: 'Privacy policy',
      onPress: () => go('/legal/privacy'),
    },
    {
      icon: 'document-text-outline',
      label: 'Terms of use',
      onPress: () => go('/legal/terms'),
    },
    {
      icon: 'information-circle-outline',
      label: 'About & open source',
      onPress: () => go('/legal/open-source'),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.drawer,
            { paddingTop: Math.max(insets.top, 16), paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={styles.brandRow}>
            <Image source={logo} style={styles.logo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>
                Travel <Text style={{ color: colors.orange }}>ID</Text>
              </Text>
              <Text style={styles.tag}>Your Journey, Your ID</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>

          {session ? (
            <Pressable
              style={styles.userCard}
              onPress={() => go('/(tabs)/profile')}
            >
              {user?.photo || user?.profilePic || user?.picture ? (
                <Image
                  source={{
                    uri: (user.photo || user.profilePic || user.picture)!,
                  }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={22} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.userName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {user?.email || 'Signed in'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <MenuSection title="Account" items={accountItems} />
            <MenuSection title="Wallet" items={walletItems} />
            <MenuSection title="Settings & legal" items={settingsItems} />

            {session ? (
              <Pressable
                style={styles.signOut}
                onPress={() => {
                  onClose();
                  void logout();
                }}
              >
                <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
        <Pressable style={styles.dismiss} onPress={onClose} />
      </View>
    </Modal>
  );
}

function MenuSection({
  title,
  items,
}: {
  title: string;
  items: MenuItem[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>
        {items.map((item, i) => (
          <Pressable
            key={item.label}
            style={[
              styles.row,
              i < items.length - 1 && styles.rowBorder,
            ]}
            onPress={item.onPress}
          >
            <View style={styles.rowIcon}>
              <Ionicons name={item.icon} size={18} color={colors.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              {item.subtitle ? (
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: colors.panelSolid,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  dismiss: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brand: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  tag: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,101,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,101,0,0.28)',
    borderRadius: radii.md,
    padding: 12,
    marginBottom: 8,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  userEmail: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  scroll: { paddingBottom: 24, gap: 4 },
  section: { marginTop: 14 },
  sectionTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,101,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  rowSub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  signOut: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.08)',
  },
  signOutText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: '#FF6B6B',
  },
});
