import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, spacing } from '../../theme';

const TRACK_TITLE = 'Tokyo Speed';
const YOUTUBE_MUSIC =
  'https://music.youtube.com/search?q=' + encodeURIComponent('Tokyo Speed');
const YOUTUBE =
  'https://www.youtube.com/results?search_query=' +
  encodeURIComponent('Tokyo Speed');

type Props = {
  visible: boolean;
  speedKmh: number;
  onClose: () => void;
};

/**
 * Shown when GPS speed crosses 100 km/h — invite to play Tokyo Speed.
 */
export function SpeedMusicPrompt({ visible, speedKmh, onClose }: Props) {
  const play = async () => {
    try {
      const can = await Linking.canOpenURL(YOUTUBE_MUSIC);
      await Linking.openURL(can ? YOUTUBE_MUSIC : YOUTUBE);
    } catch {
      await Linking.openURL(YOUTUBE).catch(() => undefined);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <LinearGradient
          colors={['#1A0A2E', '#0C192F', '#06101F']}
          style={styles.card}
        >
          <View style={styles.badge}>
            <MaterialCommunityIcons name="speedometer" size={18} color="#FF6B35" />
            <Text style={styles.badgeText}>{Math.round(speedKmh)} km/h</Text>
          </View>

          <Ionicons name="musical-notes" size={42} color={colors.orange} />
          <Text style={styles.title}>Cruising over 100?</Text>
          <Text style={styles.body}>
            Enjoy the ride with <Text style={styles.track}>{TRACK_TITLE}</Text>
            {'\n'}Play it while the train flies.
          </Text>

          <Pressable style={styles.playBtn} onPress={() => void play()}>
            <Ionicons name="play-circle" size={22} color="#fff" />
            <Text style={styles.playText}>Play Tokyo Speed</Text>
          </Pressable>

          <Pressable style={styles.later} onPress={onClose} hitSlop={8}>
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,104,0,0.35)',
    gap: 10,
  },
  badge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.4)',
    marginBottom: 4,
  },
  badgeText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#FF6B35',
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 22,
    color: '#fff',
    textAlign: 'center',
    marginTop: 4,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  track: {
    fontFamily: 'DMSans_700Bold',
    color: colors.orange,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.orange,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: radii.pill,
    width: '100%',
    justifyContent: 'center',
  },
  playText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  later: { paddingVertical: 10 },
  laterText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: colors.muted,
  },
});
