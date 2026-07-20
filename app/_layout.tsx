import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { AuthProvider } from '../src/auth/AuthContext';
import { TicketProvider } from '../src/context/TicketContext';
import { loadApiProxyOverride, warmApiProxy } from '../src/services/apiProxy';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    void (async () => {
      await loadApiProxyOverride();
      await warmApiProxy();
    })();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  if (!loaded) return null;

  return (
    <AuthProvider>
      <TicketProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: '#fff',
            headerTitleStyle: { fontFamily: 'Outfit_600SemiBold' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="signup" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="import-gmail" options={{ headerShown: false }} />
          <Stack.Screen name="legal/[slug]" options={{ headerShown: false }} />
          <Stack.Screen name="add" options={{ title: 'Add ticket' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan QR', presentation: 'modal' }} />
          <Stack.Screen name="review" options={{ headerShown: false }} />
          <Stack.Screen name="ticket/[id]" options={{ headerShown: false }} />
          <Stack.Screen
            name="train/live"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
        </Stack>
      </TicketProvider>
    </AuthProvider>
  );
}
