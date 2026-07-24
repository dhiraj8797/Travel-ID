import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { SocialAuthButtons } from '../src/components/auth/SocialAuthButtons';
import { colors, spacing } from '../src/theme';

const logo = require('../assets/travel-id-logo.jpg');

export default function SignupScreen() {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const [socialBusy, setSocialBusy] = useState(false);

  const onGoogle = async () => {
    try {
      setSocialBusy(true);
      await loginWithGoogle();
      router.replace('/(tabs)/profile');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try again';
      if (msg.toLowerCase().includes('cancel')) return;
      Alert.alert('Google sign-up', msg);
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A2744', '#0C192F', '#06101F']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>

          <Image source={logo} style={styles.logo} />
          <Text style={styles.brand}>
            Travel <Text style={{ color: colors.orange }}>ID</Text>
          </Text>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>
            Use Google to sign up. Your name and photo come from your Google
            account and stay on this device.
          </Text>

          <SocialAuthButtons
            busy={socialBusy}
            onGoogle={() => void onGoogle()}
            caption="Sign up with Google"
          />

          <Pressable style={styles.switchRow} onPress={() => router.replace('/login')}>
            <Text style={styles.switchText}>
              Already have an account?{' '}
              <Text style={styles.switchLink}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingBottom: 40 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center', marginTop: 8 },
  brand: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#fff',
    textAlign: 'center',
    marginTop: 10,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#fff',
    textAlign: 'center',
    marginTop: 18,
  },
  sub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  switchRow: { marginTop: spacing.lg, alignItems: 'center' },
  switchText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: colors.muted,
  },
  switchLink: {
    fontFamily: 'DMSans_700Bold',
    color: colors.orange,
  },
});
