import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CoachUnit } from '../../utils/coachComposition';

const ORANGE = '#FF6500';
const TRACK = '#4B5563';
const GREEN = '#00E676';
const YELLOW = '#F5C542';
const RED = '#FF5252';
const MUTED = '#64748B';

/** Vande Bharat side assets (app brand train). */
const VANDE_LOCO = require('../../../assets/vehicles/vande-loco.png');
const VANDE_COACH = require('../../../assets/vehicles/vande-coach.png');

export type TrackSignalAspect = 'green' | 'yellow' | 'red' | 'off';

type Props = {
  coaches: CoachUnit[];
  highlightCoach?: string;
  onPressCoach?: (coach: CoachUnit) => void;
  onPressMap?: () => void;
  height?: number;
  /** Right-side train signal on the coach track */
  signalAspect?: TrackSignalAspect;
};

/**
 * Coach position map using Vande Bharat loco + coach images.
 * Codes printed on each car. Swipe Engine → last.
 * Train Signal sits on the right of the track.
 */
export function CoachTrainMap({
  coaches,
  highlightCoach,
  onPressCoach,
  onPressMap,
  height = 96,
  signalAspect = 'off',
}: Props) {
  const hi = highlightCoach?.trim().toUpperCase();
  const coachW = 118;
  const locoW = 138;
  const carH = height - 6;

  if (!coaches.length) return null;

  return (
    <View style={[styles.wrap, { minHeight: height + 28 }]}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        style={[styles.trackScroll, { height: height + 8 }]}
      >
        <Pressable style={[styles.rake, { height }]} onPress={onPressMap}>
          <View style={styles.railBed} />
          <View style={styles.railLine} />

          {coaches.map((c, i) => {
            const mine = Boolean(hi && c.code.toUpperCase() === hi);
            const isEngine = c.kind === 'engine';
            const w = isEngine ? locoW : coachW;
            const flipLoco = isEngine;
            return (
              <React.Fragment key={`${c.position}-${c.code}`}>
                {i > 0 ? <View style={styles.coupler} /> : null}
                <Pressable
                  onPress={() =>
                    onPressCoach ? onPressCoach(c) : onPressMap?.()
                  }
                  style={[
                    styles.carHit,
                    { width: w, height },
                    mine && styles.carHitMine,
                  ]}
                >
                  {isEngine ? (
                    <View style={[styles.carFrame, { width: w, height: carH }]}>
                      <Image
                        source={VANDE_LOCO}
                        style={[styles.carImage, flipLoco && styles.flipX]}
                        resizeMode="contain"
                      />
                      <View
                        style={[
                          styles.labelBadge,
                          styles.locoBadge,
                          mine && styles.labelMine,
                        ]}
                      >
                        <Text style={styles.labelText} numberOfLines={1}>
                          {c.code}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <ImageBackground
                      source={VANDE_COACH}
                      style={[styles.carFrame, { width: w, height: carH }]}
                      imageStyle={styles.coachImage}
                      resizeMode="contain"
                    >
                      <View
                        style={[styles.labelBadge, mine && styles.labelMine]}
                      >
                        <Text style={styles.labelText} numberOfLines={1}>
                          {c.code}
                        </Text>
                      </View>
                      {mine ? (
                        <View style={styles.youPill}>
                          <Text style={styles.youText}>YOU</Text>
                        </View>
                      ) : null}
                    </ImageBackground>
                  )}
                </Pressable>
              </React.Fragment>
            );
          })}
        </Pressable>
      </ScrollView>

      <TrackTrainSignal aspect={signalAspect} />
    </View>
  );
}

function TrackTrainSignal({ aspect }: { aspect: TrackSignalAspect }) {
  const label =
    aspect === 'green'
      ? 'Approaching'
      : aspect === 'yellow'
        ? 'At station'
        : aspect === 'red'
          ? 'Crossed'
          : 'Standby';

  return (
    <View style={styles.signalCol} accessibilityLabel={`Train signal ${label}`}>
      <Text style={styles.signalTitle}>Train{'\n'}Signal</Text>
      <View style={styles.signalHousing}>
        {(['red', 'yellow', 'green'] as const).map((lamp) => {
          const on = aspect === lamp;
          const color =
            lamp === 'red' ? RED : lamp === 'yellow' ? YELLOW : GREEN;
          return (
            <View
              key={lamp}
              style={[
                styles.signalLamp,
                {
                  backgroundColor: on ? color : `${color}44`,
                  borderColor: on ? color : `${color}66`,
                  shadowColor: on ? color : 'transparent',
                },
                on && styles.signalLampOn,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.signalPole} />
      <Text
        style={[
          styles.signalLabel,
          aspect === 'green' && { color: GREEN },
          aspect === 'yellow' && { color: YELLOW },
          aspect === 'red' && { color: RED },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackScroll: {
    flex: 1,
    minWidth: 0,
  },
  scrollContent: {
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  rake: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 10,
  },
  railBed: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 2,
    height: 7,
    backgroundColor: 'rgba(75,85,99,0.22)',
    borderRadius: 2,
  },
  railLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 5,
    height: 2,
    backgroundColor: TRACK,
    opacity: 0.75,
  },
  coupler: {
    width: 5,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#1F2937',
    alignSelf: 'center',
    marginBottom: 24,
  },
  carHit: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderRadius: 10,
  },
  carHitMine: {
    backgroundColor: 'rgba(255,101,0,0.1)',
  },
  carFrame: {
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  flipX: {
    transform: [{ scaleX: -1 }],
  },
  coachImage: {
    borderRadius: 6,
  },
  labelBadge: {
    backgroundColor: 'rgba(0, 51, 153, 0.92)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    minWidth: 38,
    alignItems: 'center',
  },
  locoBadge: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
  },
  labelMine: {
    backgroundColor: ORANGE,
    borderColor: '#fff',
  },
  labelText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
    letterSpacing: 0.4,
  },
  youPill: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: ORANGE,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  youText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 9,
    color: '#fff',
  },
  signalCol: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
    paddingRight: 2,
  },
  signalTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 8,
    color: MUTED,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 10,
    marginBottom: 4,
  },
  signalHousing: {
    width: 30,
    borderRadius: 11,
    paddingVertical: 6,
    paddingHorizontal: 5,
    gap: 5,
    alignItems: 'center',
    backgroundColor: '#0B1220',
    borderWidth: 1.5,
    borderColor: 'rgba(15,23,42,0.35)',
  },
  signalLamp: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  signalLampOn: {
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  signalPole: {
    width: 3,
    height: 10,
    backgroundColor: 'rgba(71,85,105,0.7)',
    borderRadius: 1,
  },
  signalLabel: {
    marginTop: 4,
    fontFamily: 'DMSans_700Bold',
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 10,
  },
});
