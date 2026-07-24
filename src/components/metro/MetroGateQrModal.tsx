import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Ticket } from '../../types/ticket';
import { officialMetroQrPayload } from '../../metro/officialQr';
import { useSecureScreen } from '../../hooks/useSecureScreen';

type Props = {
  visible: boolean;
  ticket: Ticket;
  onClose: () => void;
};

const KEEP_TAG = 'metro-gate-qr';

/**
 * Full-screen official metro QR for AFC gates.
 * Never redraws a Travel ID QR as if it were the operator ticket.
 */
export function MetroGateQrModal({ visible, ticket, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const payload = officialMetroQrPayload(ticket);
  const size = Math.min(width - 48, 280);
  const validUntil = ticket.metroValidUntil || ticket.arrivalTime;

  useSecureScreen(visible && Boolean(payload));

  useEffect(() => {
    let previous: number | null = null;
    let cancelled = false;

    async function boost() {
      if (!visible || !payload) return;
      try {
        await activateKeepAwakeAsync(KEEP_TAG);
        const { status } = await Brightness.requestPermissionsAsync();
        if (status === 'granted' && !cancelled) {
          previous = await Brightness.getBrightnessAsync();
          await Brightness.setBrightnessAsync(1);
        }
      } catch {
        // Brightness may be unavailable on some devices — QR still shows.
      }
    }

    void boost();

    return () => {
      cancelled = true;
      void deactivateKeepAwake(KEEP_TAG);
      if (previous != null) {
        void Brightness.setBrightnessAsync(previous).catch(() => undefined);
      }
    };
  }, [visible, payload]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>OFFICIAL TICKET QR</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Ionicons name="close" size={24} color="#111" />
          </Pressable>
        </View>

        <Text style={styles.title}>
          {ticket.from} → {ticket.to}
        </Text>
        <Text style={styles.sub}>
          {ticket.bookingPlatform || 'Namma Metro'} · {ticket.operator || 'BMRCL'}
        </Text>

        <View style={styles.qrWrap}>
          {payload ? (
            <QRCode
              value={payload}
              size={size}
              backgroundColor="#FFFFFF"
              color="#000000"
              ecl="M"
              quietZone={12}
            />
          ) : (
            <View style={[styles.missing, { width: size, height: size }]}>
              <Ionicons name="qr-code-outline" size={48} color="#999" />
              <Text style={styles.missingText}>
                No official metro QR saved. Scan or paste your gate QR when
                adding this pass — Travel ID never invents a gate QR.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.hint}>
          Hold steady at the gate · same QR for entry and exit where required
        </Text>
        {validUntil ? (
          <Text style={styles.valid}>Valid until {validUntil}</Text>
        ) : (
          <Text style={styles.valid}>
            {ticket.bookingId || ticket.pnr
              ? `Ref ${ticket.bookingId || ticket.pnr}`
              : 'Show this code only — do not screenshot a regenerated QR'}
          </Text>
        )}

        <Pressable style={styles.done} onPress={onClose}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#9B2D8E',
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 24,
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
  },
  sub: {
    marginTop: 6,
    color: '#666',
    fontSize: 14,
  },
  qrWrap: {
    marginTop: 36,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FAFAFA',
  },
  missingText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    marginTop: 28,
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
  },
  valid: {
    marginTop: 8,
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  done: {
    marginTop: 'auto',
    backgroundColor: '#111',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 28,
  },
  doneText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
