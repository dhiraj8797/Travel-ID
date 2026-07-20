import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/AuthContext';
import { promptWalletSignIn } from '../src/auth/requireWalletAccount';
import { PassengerNamesSheet } from '../src/components/PassengerNamesSheet';
import {
  parseIncomingPayload,
  pickAndProcessPdf,
  pickAndProcessTicketPhoto,
  fetchPnrDetails,
  passengersNeedNames,
  pnrResultToDraft,
} from '../src/parsers';
import { setPendingDraft } from '../src/state/pendingDraft';
import { ParsedTicketDraft } from '../src/types/ticket';
import { colors, radii, spacing } from '../src/theme';

export default function AddTicketScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Working…');
  const [paste, setPaste] = useState('');
  const [pnr, setPnr] = useState('');
  const [nameDraft, setNameDraft] = useState<ParsedTicketDraft | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      promptWalletSignIn(router);
      router.back();
    }
  }, [session?.user?.id, router]);

  const goReview = (draft: ParsedTicketDraft) => {
    setPendingDraft(draft);
    router.push('/review');
  };

  const onFetchPnr = async () => {
    const digits = pnr.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('PNR', 'Enter the 10-digit IRCTC PNR from your ticket.');
      return;
    }
    try {
      setBusyLabel('Fetching PNR details…');
      setBusy(true);
      const result = await fetchPnrDetails(digits);
      const draft = pnrResultToDraft(result);
      if (passengersNeedNames(draft.passengers)) {
        setNameDraft(draft);
      } else {
        goReview(draft);
      }
    } catch (error) {
      Alert.alert(
        'PNR lookup',
        error instanceof Error ? error.message : 'Could not fetch PNR details'
      );
    } finally {
      setBusy(false);
    }
  };

  const onUploadPdf = async () => {
    try {
      setBusyLabel('Reading PDF…');
      setBusy(true);
      const draft = await pickAndProcessPdf();
      if (!draft) return;
      goReview(draft);
    } catch (error) {
      Alert.alert(
        'PDF upload',
        error instanceof Error ? error.message : 'Failed to read PDF'
      );
    } finally {
      setBusy(false);
    }
  };

  const onUploadPhoto = () => {
    Alert.alert('Ticket photo', 'Choose how to add a photo of your ticket.', [
      {
        text: 'Take photo',
        onPress: () => void runPhoto('camera'),
      },
      {
        text: 'Choose from gallery',
        onPress: () => void runPhoto('library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const runPhoto = async (source: 'camera' | 'library') => {
    try {
      setBusyLabel('Reading photo…');
      setBusy(true);
      const draft = await pickAndProcessTicketPhoto(source);
      if (!draft) return;
      goReview(draft);
    } catch (error) {
      Alert.alert(
        'Photo upload',
        error instanceof Error ? error.message : 'Failed to read ticket photo'
      );
    } finally {
      setBusy(false);
    }
  };

  const onPaste = () => {
    if (!paste.trim()) {
      Alert.alert('Paste ticket text', 'Paste ticket details or a QR / barcode payload first.');
      return;
    }
    goReview(parseIncomingPayload(paste.trim()));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.lead}>
        Best option: enter your 10-digit PNR — we fetch train, stations, times, platform, coach and
        berth from the IRCTC PNR API. PDF/photo also auto-use PNR when found.
      </Text>

      <View style={styles.pnrCard}>
        <Text style={[styles.cardEyebrow, { color: colors.orange }]}>PNR API</Text>
        <Text style={styles.cardTitle}>Fetch by PNR</Text>
        <Text style={styles.cardBody}>
          Works even when PDF/photo text is hard to read.
        </Text>
        <TextInput
          style={styles.pnrInput}
          placeholder="10-digit PNR e.g. 4761434418"
          placeholderTextColor={colors.faint}
          keyboardType="number-pad"
          maxLength={14}
          value={pnr}
          onChangeText={setPnr}
          editable={!busy}
        />
        <Pressable
          style={[styles.secondaryBtn, { backgroundColor: colors.orange }]}
          onPress={() => void onFetchPnr()}
          disabled={busy}
        >
          <Text style={styles.secondaryBtnText}>Get ticket details</Text>
        </Pressable>
      </View>

      <Pressable style={styles.card} onPress={onUploadPdf} disabled={busy}>
        <Text style={styles.cardEyebrow}>PDF</Text>
        <Text style={styles.cardTitle}>Upload ticket PDF</Text>
        <Text style={styles.cardBody}>
          Best for IRCTC e-tickets and bus booking PDFs with selectable text.
        </Text>
      </Pressable>

      <Pressable style={styles.card} onPress={onUploadPhoto} disabled={busy}>
        <Text style={[styles.cardEyebrow, { color: '#E8A317' }]}>PHOTO</Text>
        <Text style={styles.cardTitle}>Upload ticket photo</Text>
        <Text style={styles.cardBody}>
          Take a picture or pick from gallery. On-device OCR reads PNR, train, and seats.
        </Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => router.push('/scan')} disabled={busy}>
        <Text style={[styles.cardEyebrow, { color: colors.rail }]}>QR / BARCODE</Text>
        <Text style={styles.cardTitle}>Scan QR or barcode</Text>
        <Text style={styles.cardBody}>
          Point at a boarding QR, Code 128, PDF417, or other ticket barcode.
        </Text>
      </Pressable>

      <View style={styles.pasteCard}>
        <Text style={styles.cardTitle}>Paste ticket text / QR payload</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="PNR:4521987630|FROM:NDLS|TO:MMCT|DATE:22-Jul-2026|TIME:16:55|NAME:Aarav"
          placeholderTextColor={colors.faint}
          value={paste}
          onChangeText={setPaste}
        />
        <Pressable style={styles.secondaryBtn} onPress={onPaste} disabled={busy}>
          <Text style={styles.secondaryBtnText}>Parse & review</Text>
        </Pressable>
      </View>

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.bus} />
          <Text style={styles.busyText}>{busyLabel}</Text>
        </View>
      )}

      <PassengerNamesSheet
        visible={!!nameDraft}
        passengers={nameDraft?.passengers || []}
        onCancel={() => {
          if (nameDraft) goReview(nameDraft);
          setNameDraft(null);
        }}
        onDone={(passengers) => {
          if (!nameDraft) return;
          goReview({
            ...nameDraft,
            passengers,
            extractionNote: 'Filled from IRCTC PNR API',
            needsManualCompletion: false,
          });
          setNameDraft(null);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  lead: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.md,
  },
  cardEyebrow: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.bus,
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: colors.ink,
    marginBottom: 6,
  },
  cardBody: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  pnrCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.orange,
    marginBottom: spacing.md,
  },
  pnrInput: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    letterSpacing: 1,
  },
  pasteCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    minHeight: 96,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    color: colors.ink,
    fontFamily: 'DMSans_400Regular',
    textAlignVertical: 'top',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.rail,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: colors.bg,
    fontSize: 14,
  },
  busy: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  busyText: {
    fontFamily: 'DMSans_500Medium',
    color: colors.muted,
  },
});
