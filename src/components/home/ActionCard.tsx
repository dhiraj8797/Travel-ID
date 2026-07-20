import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radii } from '../../theme';

type Tone = 'orange' | 'blue' | 'green';

type Props = {
  title: string;
  description: string;
  tone: Tone;
  icon: 'pdf' | 'scan' | 'wallet' | 'cloud' | 'photo' | 'pnr';
  onPress: () => void;
  disabled?: boolean;
};

const toneColor: Record<Tone, string> = {
  orange: colors.orange,
  blue: colors.blue,
  green: colors.green,
};

export function ActionCard({ title, description, tone, icon, onPress, disabled }: Props) {
  const color = toneColor[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        { borderColor: `${color}8C` },
        pressed && { opacity: 0.92 },
        disabled && { opacity: 0.55 },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}29` }]}>
        {icon === 'pdf' && <Ionicons name="document-text" size={32} color={color} />}
        {icon === 'scan' && <MaterialCommunityIcons name="qrcode-scan" size={32} color={color} />}
        {icon === 'wallet' && <Ionicons name="wallet" size={32} color={color} />}
        {icon === 'cloud' && <Ionicons name="cloud-upload" size={32} color={color} />}
        {icon === 'photo' && <Ionicons name="camera" size={32} color={color} />}
        {icon === 'pnr' && <MaterialCommunityIcons name="ticket-confirmation" size={32} color={color} />}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    minHeight: 190,
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    padding: 15,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: colors.white,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 7,
  },
});
