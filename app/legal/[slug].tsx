import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLegalDocument } from '../../src/legal/documents';
import { colors, radii, spacing } from '../../src/theme';

export default function LegalDocumentScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const doc = useMemo(() => getLegalDocument(String(slug || '')), [slug]);

  if (!doc) {
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={['#1A2744', '#0C192F', '#06101F']}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.headerTitle}>Legal</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.missing}>
            <Text style={styles.missingTitle}>Document not found</Text>
            <Text style={styles.missingBody}>
              This page is unavailable. Go back to Settings and open another document.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A2744', '#0C192F', '#06101F']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {doc.title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.updated}>Last updated · {doc.updated}</Text>
          <Text style={styles.summary}>{doc.summary}</Text>

          {doc.sections.map((section) => (
            <View key={section.heading} style={styles.card}>
              <Text style={styles.heading}>{section.heading}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}

          <Text style={styles.footer}>
            Travel ID · Your journey, your ID
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Outfit_700Bold',
    fontSize: 17,
    color: '#fff',
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: 48,
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 28,
    color: '#fff',
    marginTop: 4,
  },
  updated: {
    marginTop: 6,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: colors.orange,
  },
  summary: {
    marginTop: 10,
    marginBottom: 18,
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginBottom: 12,
  },
  heading: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.82)',
  },
  footer: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.faint,
  },
  missing: { padding: 24 },
  missingTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  missingBody: {
    marginTop: 8,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
});
