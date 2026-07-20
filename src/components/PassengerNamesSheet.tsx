import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Passenger } from '../types/ticket';
import { colors, radii, spacing } from '../theme';

type Props = {
  visible: boolean;
  passengers: Passenger[];
  onCancel: () => void;
  onDone: (passengers: Passenger[]) => void;
};

function seatHint(p: Passenger): string {
  const seat = [p.coach, p.seat, p.berth].filter(Boolean).join('/');
  const st = p.currentStatus || p.status || '';
  return [seat, st].filter(Boolean).join(' · ') || 'Seat TBA';
}

/**
 * IRCTC public PNR status never includes passenger names.
 * Collect them here so the pass shows real names.
 */
export function PassengerNamesSheet({
  visible,
  passengers,
  onCancel,
  onDone,
}: Props) {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setNames(
      passengers.map((p) =>
        /^passenger\s*\d+$/i.test(p.name || '') ||
        /^(traveller|traveler)$/i.test(p.name || '')
          ? ''
          : p.name || ''
      )
    );
  }, [visible, passengers]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Passenger names</Text>
          <Text style={styles.sub}>
            IRCTC PNR status does not share names. Enter them from your ticket
            (optional but recommended).
          </Text>
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {passengers.map((p, i) => (
              <View key={`name-${i}`} style={styles.row}>
                <Text style={styles.label}>
                  Passenger {i + 1}
                  {seatHint(p) ? ` · ${seatHint(p)}` : ''}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full name as on ticket"
                  placeholderTextColor={colors.faint}
                  value={names[i] ?? ''}
                  onChangeText={(t) =>
                    setNames((prev) => {
                      const next = [...prev];
                      next[i] = t;
                      return next;
                    })
                  }
                  autoCapitalize="characters"
                />
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={styles.primary}
            onPress={() => {
              const next = passengers.map((p, i) => ({
                ...p,
                name: (names[i] || '').trim() || p.name || `Passenger ${i + 1}`,
              }));
              onDone(next);
            }}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onCancel}>
            <Text style={styles.secondaryText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panelSolid,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: 12,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  sub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
  },
  row: { marginTop: 8, gap: 6 },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.orange,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  primary: {
    marginTop: 8,
    backgroundColor: colors.orange,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  secondary: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.muted,
  },
});
