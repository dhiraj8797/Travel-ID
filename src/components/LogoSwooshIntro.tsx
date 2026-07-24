import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from 'react-native-svg';

const logo = require('../../assets/travel-id-logo.jpg');

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SWOOSH_D =
  'M 28 148 C 70 148, 90 70, 140 55 C 185 42, 210 38, 232 48';
const PATH_LEN = 420;
const SWOOSH_MS = 1150;
const LOGO_DELAY = 350;
const TOTAL_MS = 2100;

type Props = {
  onFinished: () => void;
};

/**
 * Cold-start intro matching the Travel ID logo: sunrise + swoosh + logo settle.
 * Must be mounted inside a flex:1 parent; homepage mounts only after onFinished.
 */
export function LogoSwooshIntro({ onFinished }: Props) {
  const draw = useSharedValue(0);
  const logoIn = useSharedValue(0);
  const planeT = useSharedValue(0);
  const fadeOut = useSharedValue(1);
  const finishedRef = React.useRef(false);

  const finishOnce = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  useEffect(() => {
    draw.value = withTiming(1, {
      duration: SWOOSH_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    planeT.value = withTiming(1, {
      duration: SWOOSH_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    logoIn.value = withDelay(
      LOGO_DELAY,
      withTiming(1, {
        duration: 1100,
        easing: Easing.bezier(0.2, 0.85, 0.25, 1),
      })
    );

    fadeOut.value = withDelay(
      TOTAL_MS,
      withTiming(0, { duration: 280 }, (finished) => {
        if (finished) runOnJS(finishOnce)();
      })
    );

    // Safety: always hand off even if the fade callback is skipped
    const safety = setTimeout(() => finishOnce(), TOTAL_MS + 500);
    return () => clearTimeout(safety);
  }, [draw, fadeOut, finishOnce, logoIn, planeT]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: fadeOut.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoIn.value,
    transform: [
      {
        scale: interpolate(
          logoIn.value,
          [0, 1],
          [0.92, 1],
          Extrapolation.CLAMP
        ),
      },
      {
        translateY: interpolate(
          logoIn.value,
          [0, 1],
          [10, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const pathProps = useAnimatedProps(() => ({
    strokeDashoffset: PATH_LEN * (1 - draw.value),
  }));

  const planeStyle = useAnimatedStyle(() => {
    const t = planeT.value;
    const x =
      (1 - t) * (1 - t) * (1 - t) * 28 +
      3 * (1 - t) * (1 - t) * t * 70 +
      3 * (1 - t) * t * t * 185 +
      t * t * t * 232;
    const y =
      (1 - t) * (1 - t) * (1 - t) * 148 +
      3 * (1 - t) * (1 - t) * t * 100 +
      3 * (1 - t) * t * t * 42 +
      t * t * t * 48;
    const px = (x - 130) * (250 / 260);
    const py = (y - 90) * (180 / 180);
    const opacity = t < 0.08 ? t / 0.08 : t > 0.88 ? (1 - t) / 0.12 : 1;
    const rot = -35 + t * 55;
    return {
      opacity,
      transform: [
        { translateX: px },
        { translateY: py },
        { rotate: `${rot}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.root, rootStyle]}>
      <LinearGradient
        colors={['#FFF3E6', '#FFC48A', '#FF8A3D', '#E85D00']}
        locations={[0, 0.35, 0.68, 1]}
        start={{ x: 0.5, y: 0.15 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.stage}>
          <View style={styles.orbitBox}>
            <Svg
              width={250}
              height={180}
              viewBox="0 0 260 180"
              style={StyleSheet.absoluteFill}
            >
              <Defs>
                <SvgGradient
                  id="swooshGrad"
                  x1="0%"
                  y1="100%"
                  x2="100%"
                  y2="0%"
                >
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.95} />
                  <Stop offset="55%" stopColor="#FF6800" />
                  <Stop offset="100%" stopColor="#FF6800" />
                </SvgGradient>
              </Defs>
              <AnimatedPath
                d={SWOOSH_D}
                stroke="url(#swooshGrad)"
                strokeWidth={5}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${PATH_LEN} ${PATH_LEN}`}
                animatedProps={pathProps}
              />
            </Svg>

            <Animated.View style={[styles.plane, planeStyle]} pointerEvents="none">
              <Ionicons name="airplane" size={22} color="#FF6800" />
            </Animated.View>

            <Animated.View style={[styles.logoWrap, logoStyle]}>
              <Image source={logo} style={styles.logo} resizeMode="cover" />
            </Animated.View>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FF8A3D',
  },
  gradient: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitBox: {
    width: 250,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plane: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  logoWrap: {
    width: 200,
    height: 200,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: '#FFB06A',
    zIndex: 2,
  },
  logo: {
    width: '104%',
    height: '104%',
    marginLeft: '-2%',
    marginTop: '-2%',
  },
});
