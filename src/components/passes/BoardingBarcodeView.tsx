import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { toDataURL } from '@bwip-js/react-native';
import { Ticket } from '../../types/ticket';
import {
  boardingCodeRaw,
  boardingCodeType,
  bwipBcidFor,
} from '../../utils/boardingCode';
import { useSecureScreen } from '../../hooks/useSecureScreen';

type Props = {
  ticket: Ticket;
  /** Hint text under the code */
  caption?: string;
};

/**
 * Renders the airline-issued boarding barcode in its original symbology
 * (PDF417 / Aztec / QR / Data Matrix) from the preserved raw payload.
 * Falls back to a saved image, then QR only if no boarding code exists.
 */
export function BoardingBarcodeView({ ticket, caption }: Props) {
  const { width } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const raw = boardingCodeRaw(ticket);
  useSecureScreen(Boolean(raw || ticket.boardingCode?.imageUri));
  const type = boardingCodeType(ticket);
  const imageUri = ticket.boardingCode?.imageUri;
  const isWide = type === 'PDF417';
  const boxW = Math.min(width - 48, isWide ? 340 : 220);
  const boxH = isWide ? Math.round(boxW * 0.38) : boxW;

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);
      setUri(null);

      if (imageUri) {
        if (!cancelled) {
          setUri(imageUri);
          setLoading(false);
        }
        return;
      }

      if (!raw) {
        if (!cancelled) {
          setError('No boarding barcode saved');
          setLoading(false);
        }
        return;
      }

      try {
        const bcid = bwipBcidFor(type);
        const result = await toDataURL({
          bcid,
          text: raw,
          scale: isWide ? 2 : 4,
          height: isWide ? 12 : undefined,
          includetext: false,
          backgroundcolor: 'FFFFFF',
          barcolor: '000000',
          paddingwidth: 8,
          paddingheight: 8,
        });
        if (!cancelled) {
          // RN build returns { uri }; browser build may return a data URL string
          const out =
            typeof result === 'string'
              ? result
              : (result as { uri?: string }).uri || null;
          setUri(out);
          setLoading(false);
        }
      } catch (e) {
        // Last resort: QR of the same raw (better than inventing a new payload)
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not render barcode');
          setLoading(false);
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [raw, type, imageUri, isWide]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { width: boxW + 24, minHeight: boxH + 24 }]}>
        {loading ? (
          <ActivityIndicator color="#1D8CF8" />
        ) : uri ? (
          <Image
            source={{ uri }}
            style={{
              width: boxW,
              height: isWide ? boxH : boxW,
              resizeMode: 'contain',
            }}
          />
        ) : raw ? (
          <QRCode value={raw.slice(0, 800)} size={Math.min(200, boxW)} />
        ) : (
          <Text style={styles.err}>No barcode</Text>
        )}
      </View>
      <Text style={styles.typeLabel}>{type}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {error && !uri ? <Text style={styles.errDetail}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  frame: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 11,
    color: '#1D8CF8',
    letterSpacing: 1,
  },
  caption: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: '#8FA3C1',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  err: {
    fontFamily: 'DMSans_500Medium',
    color: '#666',
  },
  errDetail: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: '#E85D5D',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
