import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { promptWalletSignIn } from '../../src/auth/requireWalletAccount';
import { colors } from '../../src/theme';

function TravelTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();

  const items = [
    { key: 'index', label: 'Home', icon: 'home' as const },
    { key: 'passes', label: 'My Passes', icon: 'wallet' as const },
    { key: 'add', label: 'Add', icon: 'scan' as const, center: true },
    { key: 'profile', label: 'Profile', icon: 'person' as const },
    { key: 'more', label: 'Settings', icon: 'ellipsis-horizontal' as const },
  ];

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {items.map((item) => {
        if (item.center) {
          return (
            <Pressable
              key={item.key}
              style={styles.centerWrap}
              onPress={() => {
                if (!session?.user?.id) {
                  promptWalletSignIn(router);
                  return;
                }
                router.push('/add');
              }}
            >
              <View style={styles.centerBtn}>
                <Ionicons name="add" size={32} color="#fff" />
              </View>
              <Text style={styles.centerLabel}>Add</Text>
            </Pressable>
          );
        }

        const route = state.routes.find((r: any) => r.name === item.key);
        if (!route) return <View key={item.key} style={styles.item} />;
        const focused = state.index === state.routes.indexOf(route);
        const color = focused ? colors.orange : colors.muted;

        return (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => navigation.navigate(route.name)}
          >
            <Ionicons
              name={
                item.icon === 'home'
                  ? focused
                    ? 'home'
                    : 'home-outline'
                  : item.icon === 'wallet'
                    ? focused
                      ? 'wallet'
                      : 'wallet-outline'
                    : item.icon === 'person'
                      ? focused
                        ? 'person'
                        : 'person-outline'
                      : 'ellipsis-horizontal'
              }
              size={22}
              color={color}
            />
            <Text style={[styles.label, { color }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TravelTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="passes" options={{ title: 'My Passes' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="more" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.panelSolid,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 2,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    marginTop: -22,
  },
  centerBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  centerLabel: {
    marginTop: 4,
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: colors.orange,
  },
});
