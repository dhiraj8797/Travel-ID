import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

type Props = {
  busy?: boolean;
  onGoogle: () => void;
  caption?: string;
};

function GoogleGlyph({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

/** Single Google sign-in control (native account picker). */
export function SocialAuthButtons({
  busy = false,
  onGoogle,
  caption = 'Or continue with Google',
}: Props) {
  return (
    <View style={styles.wrap}>
      {!!caption && (
        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.or}>{caption}</Text>
          <View style={styles.line} />
        </View>
      )}

      <Pressable
        style={[styles.googleBtn, busy && styles.disabled]}
        onPress={onGoogle}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {busy ? (
          <ActivityIndicator color="#4285F4" />
        ) : (
          <GoogleGlyph size={22} />
        )}
        <Text style={styles.googleLabel}>Continue with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  or: { fontFamily: 'DMSans_500Medium', color: colors.muted, fontSize: 12 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 18,
  },
  googleLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#1F1F1F',
  },
  disabled: { opacity: 0.6 },
});
