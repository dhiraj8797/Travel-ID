import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { promptWalletSignIn } from '../src/auth/requireWalletAccount';
import { enrichDraftWithPnr, parseIncomingPayload } from '../src/parsers';
import { pickBestBarcodePayload } from '../src/parsers/bcbp';
import {
  buildMetroQrImportDraft,
  locateMetroCity,
  looksLikeOpaqueMetroQr,
  MetroNetworkId,
} from '../src/metro';
import * as Location from 'expo-location';
import { setPendingDraft } from '../src/state/pendingDraft';
import { colors, radii, spacing } from '../src/theme';

/** QR + common ticket / boarding barcodes */
const BARCODE_TYPES = [
  'qr',
  'pdf417',
  'aztec',
  'datamatrix',
  'code128',
  'code39',
  'code93',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
] as const;

const SAMPLE_QR =
  'type=bus&pnr=SNSQ7HJWD779&booking=SNSQ7HJWD779&platform=Scapia&operator=SNS Holidays&from=Shimoga&to=Bangalore&boarding=Shivamogga Bus Stand&dropping=GPR Travels Tankbund Road&date=Sat, 18 Jul, 2026&time=23:25&report=23:10&arrdate=Sun, 19 Jul, 2026&arrtime=05:00&duration=5h 35m&distance=310 KM&class=A/C Sleeper (2+1)&vehicletype=Volvo Multi-Axle&name=Dhiraj Kumar&gender=MALE&age=27&seat=U9&seattype=Upper sleeper&status=Confirmed&bookingdate=17 Jul, 2026 | 7:35 PM&support=080-12345678&instructions=Arrive 15 minutes early. Show QR and photo ID.';

/** Sample IndiGo-style IATA BCBP (Aztec / PDF417 payload) — fixed-width IATA fields */
const SAMPLE_INDIGO_BCBP =
  'M1KUMAR/DHIRAJ        E6E8G2X BLRDEL6E 0521201Y012A00012';

export default function ScanScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const locked = useRef(false);
  const [torch, setTorch] = useState(false);
  const [lastType, setLastType] = useState<string | undefined>();

  useEffect(() => {
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      router.back();
    }
  }, [session?.user?.id, router]);

  const handleData = useCallback(
    (payload: string, type?: string) => {
      if (locked.current) return;
      locked.current = true;
      setLastType(type);
      void (async () => {
        try {
          const value = payload.trim();
          if (!value) {
            throw new Error('Empty barcode — try again with better light');
          }

          let draft = parseIncomingPayload(value, type);
          // Opaque / encrypted metro QR: preserve payload, ask for stations on review
          if (
            (type === 'qr' || !type) &&
            looksLikeOpaqueMetroQr(value) &&
            draft.kind !== 'flight' &&
            !/\bPNR\b/i.test(value)
          ) {
            let networkId: MetroNetworkId | undefined;
            try {
              const { status } = await Location.getForegroundPermissionsAsync();
              if (status === 'granted') {
                const pos = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });
                const hit = locateMetroCity(
                  pos.coords.latitude,
                  pos.coords.longitude
                );
                if (hit) networkId = hit.networkId;
              }
            } catch {
              /* keep default */
            }
            draft = buildMetroQrImportDraft({
              qrPayload: value,
              networkId,
            });
            setPendingDraft(draft);
            router.replace('/review');
            return;
          }

          // Never run rail PNR enrichment on flight boarding barcodes
          if (draft.kind !== 'flight') {
            draft = await enrichDraftWithPnr(draft);
          }

          // Always keep what the camera returned for debugging / fallback display
          draft = {
            ...draft,
            originalQrValue: draft.originalQrValue || value,
            qrPayload: draft.qrPayload || value,
            rawText: draft.rawText || value.slice(0, 500),
            extractionNote:
              draft.extractionNote ||
              `Scanned ${type || 'barcode'} (${value.length} chars)`,
          };

          const incomplete =
            draft.kind === 'flight' &&
            (!draft.pnr ||
              draft.from === 'Origin' ||
              draft.to === 'Destination' ||
              !draft.flightNumber ||
              draft.passengers[0]?.name === 'Traveller');

          if (incomplete) {
            // Unlock so user can retry; still offer to continue with raw
            locked.current = false;
            Alert.alert(
              'Could not decode boarding fields',
              `Type: ${type || '?'}\nLength: ${value.length}\n\n` +
                `Preview:\n${value.slice(0, 120)}\n\n` +
                'Tip: scan the wide PDF417 / square Aztec on the boarding pass (not a tiny QR link).',
              [
                { text: 'Scan again', style: 'cancel' },
                {
                  text: 'Open anyway',
                  onPress: () => {
                    locked.current = true;
                    setPendingDraft(draft);
                    router.replace('/review');
                  },
                },
              ]
            );
            return;
          }

          setPendingDraft(draft);
          router.replace('/review');
        } catch (error) {
          locked.current = false;
          Alert.alert(
            'Scan failed',
            error instanceof Error
              ? error.message
              : 'Could not read barcode / QR payload'
          );
        }
      })();
    },
    [router]
  );

  if (!permission) {
    return <View style={styles.screen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>
          Allow camera permission to scan ticket QR codes and barcodes.
        </Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </Pressable>
        <Pressable
          style={styles.ghost}
          onPress={() => {
            handleData(SAMPLE_QR, 'qr');
          }}
        >
          <Text style={styles.ghostText}>Use sample QR payload</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={styles.camera}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: [...BARCODE_TYPES],
        }}
        onBarcodeScanned={(result) => {
          // Android ML Kit: `raw` often has the real BCBP; `data` can differ
          const payload = pickBestBarcodePayload(result.data, result.raw);
          handleData(payload, result.type);
        }}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>
          Align the boarding barcode (PDF417 / Aztec)
          {lastType ? ` · last: ${lastType}` : ''}
        </Text>
        <View style={styles.row}>
          <Pressable style={styles.chip} onPress={() => setTorch((v) => !v)}>
            <Text style={styles.chipText}>{torch ? 'Torch off' : 'Torch on'}</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => handleData(SAMPLE_QR, 'qr')}>
            <Text style={styles.chipText}>Sample bus</Text>
          </Pressable>
          <Pressable
            style={styles.chip}
            onPress={() => handleData(SAMPLE_INDIGO_BCBP, 'aztec')}
          >
            <Text style={styles.chipText}>Sample IndiGo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  frame: {
    position: 'absolute',
    top: '22%',
    width: 300,
    height: 160,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.bus,
    alignSelf: 'center',
  },
  hint: {
    fontFamily: 'DMSans_500Medium',
    color: colors.ink,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(11,31,42,0.72)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: {
    fontFamily: 'Outfit_600SemiBold',
    color: colors.ink,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  btn: {
    backgroundColor: colors.bus,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  btnText: {
    fontFamily: 'Outfit_700Bold',
    color: colors.bg,
    fontSize: 16,
  },
  ghost: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  ghostText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.rail,
  },
});
