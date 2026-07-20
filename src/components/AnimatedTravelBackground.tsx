import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { getIndiaSkySnapshot, IndiaSkySnapshot } from '../utils/indiaSky';

type Props = {
  variant?: 'bus' | 'rail' | 'both';
};

/** Horizontal cruise behind Travel ID title (no flip). */
const PLANE_MS = 14000;

/**
 * Homepage scenic background — IST sun/moon, light-pouring sun,
 * plane cruising behind Travel ID title (no flip), train/bus lanes.
 */
export function AnimatedTravelBackground({ variant = 'both' }: Props) {
  const { width, height } = useWindowDimensions();
  const [sky, setSky] = useState<IndiaSkySnapshot>(() => getIndiaSkySnapshot());

  const busX = useSharedValue(-0.4);
  const trainX = useSharedValue(1.2);
  const bird1 = useSharedValue(0);
  const bird2 = useSharedValue(0.3);
  const roadScroll = useSharedValue(0);
  const planeT = useSharedValue(0);
  const rayPulse = useSharedValue(0.55);
  const dayPhase = useSharedValue(sky.dayPhase);
  const nightAmt = useSharedValue(sky.isNight ? 1 : 0);

  // Fixed celestial anchor — aligned with Welcome back / traveler name row
  const celestialLeft = width * 0.68;
  const celestialTop = Math.max(128, height * 0.185);
  const celestialSize = 92;

  // Cruise line through the Travel ID brand (plane stays nose-right)
  const brandCy = Math.max(52, height * 0.055);
  const brandCenterX = width * 0.5;
  const planeW = 78;

  useEffect(() => {
    const sync = () => {
      const snap = getIndiaSkySnapshot();
      setSky(snap);
      dayPhase.value = withTiming(snap.dayPhase, { duration: 900 });
      nightAmt.value = withTiming(snap.isNight ? 1 : 0, { duration: 1200 });
    };
    sync();
    const id = setInterval(sync, 30_000);
    return () => clearInterval(id);
  }, [dayPhase, nightAmt]);

  useEffect(() => {
    busX.value = withRepeat(
      withTiming(1.25, { duration: 12000, easing: Easing.linear }),
      -1,
      false
    );
    trainX.value = withDelay(
      2200,
      withRepeat(
        withTiming(-0.5, { duration: 15000, easing: Easing.linear }),
        -1,
        false
      )
    );
    bird1.value = withRepeat(
      withTiming(1.1, { duration: 18000, easing: Easing.linear }),
      -1,
      false
    );
    bird2.value = withDelay(
      4000,
      withRepeat(
        withTiming(1.15, { duration: 22000, easing: Easing.linear }),
        -1,
        false
      )
    );
    roadScroll.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.linear }),
      -1,
      false
    );
    rayPulse.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    planeT.value = withRepeat(
      withTiming(1, { duration: PLANE_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [busX, trainX, bird1, bird2, roadScroll, rayPulse, planeT]);

  const busStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: busX.value * (width + 300) - 180 }],
  }));

  const trainStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: trainX.value * (width + 520) - 80 },
      { scaleX: -1 },
    ],
  }));

  const bird1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bird1.value * width * 0.9 - 20 }],
    opacity: interpolate(nightAmt.value, [0, 1], [0.55, 0.08]),
  }));

  const bird2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: bird2.value * width * 0.85 + 10 }],
    opacity: interpolate(nightAmt.value, [0, 1], [0.4, 0.06]),
  }));

  const dashStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -roadScroll.value * 52 }],
  }));

  const morningSky = useAnimatedStyle(() => ({
    opacity:
      (1 - nightAmt.value) *
      interpolate(
        dayPhase.value,
        [0, 0.15, 0.35, 0.5],
        [1, 0.85, 0.25, 0],
        Extrapolation.CLAMP
      ),
  }));
  const noonSky = useAnimatedStyle(() => ({
    opacity:
      (1 - nightAmt.value) *
      interpolate(
        dayPhase.value,
        [0.2, 0.4, 0.55, 0.7],
        [0, 1, 1, 0],
        Extrapolation.CLAMP
      ),
  }));
  const eveningSky = useAnimatedStyle(() => ({
    opacity:
      (1 - nightAmt.value) *
      interpolate(
        dayPhase.value,
        [0.55, 0.7, 0.88, 1],
        [0, 0.7, 1, 1],
        Extrapolation.CLAMP
      ),
  }));
  const nightSky = useAnimatedStyle(() => ({
    opacity: nightAmt.value,
  }));

  const sunBlockStyle = useAnimatedStyle(() => ({
    opacity: 1 - nightAmt.value,
  }));
  const moonBlockStyle = useAnimatedStyle(() => ({
    opacity: nightAmt.value,
  }));

  const raysStyle = useAnimatedStyle(() => {
    const pulse = 0.35 + rayPulse.value * 0.55;
    const dayBoost = interpolate(
      dayPhase.value,
      [0, 0.2, 0.5, 0.85, 1],
      [0.75, 1, 1, 0.9, 0.65]
    );
    return {
      opacity: (1 - nightAmt.value) * pulse * dayBoost,
      transform: [{ scale: 0.92 + rayPulse.value * 0.12 }],
    };
  });

  const sunGlowStyle = useAnimatedStyle(() => ({
    opacity: (1 - nightAmt.value) * (0.4 + rayPulse.value * 0.35),
    transform: [{ scale: 0.95 + rayPulse.value * 0.15 }],
  }));

  const starsStyle = useAnimatedStyle(() => ({
    opacity: nightAmt.value * 0.9,
  }));

  // Always faces right: enter left → slip behind Travel ID → exit right → loop
  const planeStyle = useAnimatedStyle(() => {
    const t = planeT.value;
    const startX = -planeW;
    const endX = width + 8;
    const x = interpolate(t, [0, 1], [startX, endX]);
    // Soft bob while cruising
    const y = brandCy + Math.sin(t * Math.PI * 2) * 5;
    // Fade while crossing brand center (goes “behind” the title)
    const dist = Math.abs(x + planeW * 0.35 - brandCenterX);
    const behind = interpolate(dist, [0, 56, 110], [0.12, 0.45, 1], Extrapolation.CLAMP);

    return {
      opacity: behind,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${-6 + Math.sin(t * Math.PI * 2) * 3}deg` },
        { scale: 0.72 },
      ],
    };
  });

  const showBus = variant === 'bus' || variant === 'both';
  const showTrain = variant === 'rail' || variant === 'both';
  const sceneTop = Math.max(118, height * 0.19);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#06101F' }]} />

      <Animated.View style={[StyleSheet.absoluteFill, morningSky]}>
        <LinearGradient
          colors={['#7BB3E0', '#B5D4F0', '#F5D9A8', '#F8E8C4', '#C4783A', '#1A2744']}
          locations={[0, 0.22, 0.42, 0.55, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, noonSky]}>
        <LinearGradient
          colors={['#4A90D9', '#8EC4F0', '#D0E8FA', '#E8C878', '#C4783A', '#1A2744']}
          locations={[0, 0.2, 0.4, 0.55, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, eveningSky]}>
        <LinearGradient
          colors={['#1A2744', '#4A2A3A', '#A04028', '#E07030', '#F0A040', '#1A2744', '#06101F']}
          locations={[0, 0.15, 0.32, 0.45, 0.55, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, nightSky]}>
        <LinearGradient
          colors={['#030814', '#071428', '#0C1C38', '#152848', '#0A1428', '#040A14']}
          locations={[0, 0.25, 0.45, 0.6, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.stars, starsStyle]}>
        {STAR_DOTS.map((s, i) => (
          <View
            key={i}
            style={[
              styles.star,
              {
                top: height * s.y,
                left: width * s.x,
                width: s.size,
                height: s.size,
                borderRadius: s.size / 2,
                opacity: s.o,
              },
            ]}
          />
        ))}
      </Animated.View>

      {/* Fixed sun: image + pouring light rays */}
      <Animated.View
        style={[
          styles.celestialAnchor,
          { top: celestialTop, left: celestialLeft, width: celestialSize, height: celestialSize },
          sunBlockStyle,
        ]}
      >
        <Animated.View style={[styles.sunGlow, sunGlowStyle]} />
        <Animated.View style={[styles.rayWheel, raysStyle]}>
          {SUN_RAYS.map((ray, i) => (
            <View
              key={i}
              style={[styles.rayPivot, { transform: [{ rotate: `${ray.deg}deg` }] }]}
            >
              <View
                style={[
                  styles.ray,
                  {
                    height: ray.len,
                    opacity: ray.o,
                    marginTop: -ray.len,
                  },
                ]}
              />
            </View>
          ))}
        </Animated.View>
        <Image
          source={require('../../assets/sky/sky-sun.png')}
          style={styles.celestialImg}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Fixed moon after IST sunset */}
      <Animated.View
        style={[
          styles.celestialAnchor,
          { top: celestialTop, left: celestialLeft, width: celestialSize * 0.82, height: celestialSize * 0.82 },
          moonBlockStyle,
        ]}
      >
        <View style={styles.moonGlow} />
        <Image
          source={require('../../assets/sky/sky-moon.png')}
          style={styles.celestialImg}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Plane roams around Travel ID brand — always on screen */}
      <Animated.View style={[styles.planeWrap, planeStyle]}>
        <Image
          source={require('../../assets/vehicles/hero-flight.png')}
          style={styles.planeImg}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View style={[styles.birdRow, { top: height * 0.12 }, bird1Style]}>
        <Bird />
        <Bird small />
      </Animated.View>
      <Animated.View style={[styles.birdRow, { top: height * 0.155 }, bird2Style]}>
        <Bird />
      </Animated.View>

      <View style={[styles.mountainFar, { top: sceneTop, width: width * 1.4 }]} />
      <View
        style={[
          styles.mountainMid,
          { top: sceneTop + 28, left: -width * 0.15, width: width * 0.9 },
        ]}
      />
      <View
        style={[
          styles.mountainNear,
          { top: sceneTop + 42, right: -width * 0.2, width: width * 0.95 },
        ]}
      />

      {showTrain && (
        <View style={[styles.lane, { top: sceneTop + 78 }]}>
          <View style={styles.railBed} />
          <View style={styles.railLine} />
          <View style={[styles.railLine, { bottom: 20 }]} />
          <View style={styles.sleeperRow}>
            {Array.from({ length: 18 }).map((_, i) => (
              <View key={i} style={styles.sleeper} />
            ))}
          </View>
          <Animated.View style={[styles.trainWrap, trainStyle]}>
            <Image
              source={require('../../assets/vehicles/hero-vande-bharat.png')}
              style={styles.trainImg}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      )}

      {showBus && (
        <View style={[styles.lane, { top: sceneTop + (showTrain ? 158 : 100) }]}>
          <View style={styles.road}>
            <Animated.View style={[styles.dashRow, dashStyle]}>
              {Array.from({ length: 28 }).map((_, i) => (
                <View key={i} style={styles.dash} />
              ))}
            </Animated.View>
          </View>
          <Animated.View style={[styles.busWrap, busStyle]}>
            <Image
              source={require('../../assets/vehicles/hero-bus.png')}
              style={styles.busImg}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(6,16,31,0.72)', '#06101F']}
        style={[styles.bottomFade, { height: Math.min(420, height * 0.48) }]}
      />
    </View>
  );
}

function Bird({ small }: { small?: boolean }) {
  return (
    <View style={[styles.bird, small && styles.birdSmall]}>
      <View style={[styles.wing, styles.wingL]} />
      <View style={[styles.wing, styles.wingR]} />
    </View>
  );
}

const SUN_RAYS = [
  { deg: 0, len: 78, o: 0.55 },
  { deg: 22.5, len: 62, o: 0.35 },
  { deg: 45, len: 88, o: 0.5 },
  { deg: 67.5, len: 58, o: 0.3 },
  { deg: 90, len: 82, o: 0.5 },
  { deg: 112.5, len: 60, o: 0.32 },
  { deg: 135, len: 90, o: 0.48 },
  { deg: 157.5, len: 56, o: 0.28 },
  { deg: 180, len: 76, o: 0.5 },
  { deg: 202.5, len: 58, o: 0.3 },
  { deg: 225, len: 86, o: 0.45 },
  { deg: 247.5, len: 54, o: 0.28 },
  { deg: 270, len: 80, o: 0.5 },
  { deg: 292.5, len: 58, o: 0.3 },
  { deg: 315, len: 88, o: 0.48 },
  { deg: 337.5, len: 56, o: 0.28 },
];

const STAR_DOTS = [
  { x: 0.12, y: 0.08, size: 2, o: 0.9 },
  { x: 0.28, y: 0.05, size: 1.5, o: 0.7 },
  { x: 0.4, y: 0.11, size: 2.2, o: 0.85 },
  { x: 0.55, y: 0.06, size: 1.5, o: 0.65 },
  { x: 0.78, y: 0.09, size: 2, o: 0.8 },
  { x: 0.88, y: 0.14, size: 1.5, o: 0.7 },
  { x: 0.18, y: 0.16, size: 1.5, o: 0.55 },
  { x: 0.66, y: 0.04, size: 2.4, o: 0.9 },
  { x: 0.08, y: 0.2, size: 1.5, o: 0.5 },
  { x: 0.92, y: 0.07, size: 1.5, o: 0.6 },
];

const styles = StyleSheet.create({
  stars: {
    ...StyleSheet.absoluteFillObject,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#F5F7FF',
  },
  celestialAnchor: {
    position: 'absolute',
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  celestialImg: {
    width: '100%',
    height: '100%',
    zIndex: 3,
  },
  sunGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 200, 90, 0.45)',
    zIndex: 1,
  },
  moonGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(200, 220, 255, 0.28)',
  },
  rayWheel: {
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: 2,
  },
  rayPivot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  ray: {
    position: 'absolute',
    left: -1.5,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 220, 120, 0.85)',
  },
  planeWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 8,
  },
  planeImg: {
    width: 78,
    height: 38,
  },
  birdRow: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 18,
  },
  bird: {
    width: 14,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  birdSmall: {
    transform: [{ scale: 0.75 }],
  },
  wing: {
    position: 'absolute',
    width: 8,
    height: 2,
    backgroundColor: 'rgba(20,28,40,0.75)',
    borderRadius: 2,
  },
  wingL: {
    left: 0,
    transform: [{ rotate: '-28deg' }],
  },
  wingR: {
    right: 0,
    transform: [{ rotate: '28deg' }],
  },
  mountainFar: {
    position: 'absolute',
    left: -40,
    height: 110,
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
    backgroundColor: 'rgba(40,55,70,0.55)',
  },
  mountainMid: {
    position: 'absolute',
    height: 100,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 90,
    backgroundColor: 'rgba(35,48,58,0.72)',
  },
  mountainNear: {
    position: 'absolute',
    height: 95,
    borderTopLeftRadius: 80,
    borderTopRightRadius: 130,
    backgroundColor: 'rgba(22,34,48,0.85)',
  },
  lane: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 96,
  },
  railBed: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 16,
    backgroundColor: 'rgba(50,42,36,0.7)',
  },
  railLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 26,
    height: 2,
    backgroundColor: 'rgba(210,210,220,0.75)',
  },
  sleeperRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    height: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  sleeper: {
    width: 10,
    height: 14,
    backgroundColor: 'rgba(90,70,50,0.55)',
  },
  trainWrap: {
    position: 'absolute',
    bottom: 14,
  },
  trainImg: {
    width: 460,
    height: 52,
  },
  road: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    height: 30,
    backgroundColor: 'rgba(28,32,42,0.88)',
    overflow: 'hidden',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
    paddingLeft: 6,
    width: 2000,
  },
  dash: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,210,90,0.9)',
  },
  busWrap: {
    position: 'absolute',
    bottom: 4,
  },
  busImg: {
    width: 230,
    height: 92,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
