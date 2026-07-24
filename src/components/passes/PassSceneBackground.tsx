import React, { useEffect } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { getIndiaSkySnapshot } from '../../utils/indiaSky';
import { HeadlightCone } from '../HeadlightCone';

type Variant = 'rail' | 'bus';

type Props = {
  variant: Variant;
};

const SCENES = {
  rail: require('../../../assets/scenes/pass-bg-train.jpg'),
  bus: require('../../../assets/scenes/pass-bg-bus.jpg'),
};

const VEHICLES = {
  rail: require('../../../assets/vehicles/hero-vande-bharat.png'),
  bus: require('../../../assets/vehicles/hero-bus.png'),
};

/**
 * Vehicles stay locked to the track/road band in the artwork (lower third)
 * and only slide horizontally — night headlamps light the surface after sunset.
 */
export function PassSceneBackground({ variant }: Props) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const nightAmt = useSharedValue(getIndiaSkySnapshot().isNight ? 1 : 0);
  const pulse = useSharedValue(0.55);

  const surfaceFromBottom =
    variant === 'rail'
      ? Math.round(height * 0.205)
      : Math.round(height * 0.185);

  const vehicleWidth =
    variant === 'rail' ? Math.round(width * 1.2) : Math.round(width * 0.58);
  const vehicleHeight =
    variant === 'rail'
      ? Math.round(vehicleWidth / 9.5)
      : Math.round(vehicleWidth * 0.38);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: variant === 'rail' ? 13000 : 11000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [progress, pulse, variant]);

  useEffect(() => {
    const sync = () => {
      const snap = getIndiaSkySnapshot();
      nightAmt.value = withTiming(snap.isNight ? 1 : 0, { duration: 900 });
    };
    sync();
    const id = setInterval(sync, 30_000);
    return () => clearInterval(id);
  }, [nightAmt]);

  const vehicleStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = interpolate(
      t,
      [0, 1],
      [-vehicleWidth * 1.05, width + vehicleWidth * 0.15],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      t,
      [0, 0.04, 0.92, 1],
      [0, 1, 1, 0.35],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateX: x }],
    };
  });

  const headlampStyle = useAnimatedStyle(() => ({
    opacity: nightAmt.value * (0.7 + pulse.value * 0.3),
  }));

  const isRail = variant === 'rail';
  const coneLength = isRail
    ? Math.round(vehicleWidth * 0.22)
    : Math.round(vehicleWidth * 0.48);
  const coneSpread = isRail
    ? Math.round(vehicleHeight * 0.85)
    : Math.round(vehicleHeight * 0.42);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={SCENES[variant]} style={styles.scene} resizeMode="cover" />

      <LinearGradient
        colors={
          variant === 'bus'
            ? [
                'rgba(255,170,80,0.08)',
                'transparent',
                'rgba(10,20,40,0.1)',
                'rgba(6,16,31,0.22)',
              ]
            : [
                'rgba(100,180,255,0.06)',
                'transparent',
                'rgba(20,50,40,0.08)',
                'rgba(6,16,31,0.2)',
              ]
        }
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          styles.vehicle,
          {
            bottom: surfaceFromBottom,
            width: vehicleWidth,
            height: vehicleHeight,
          },
          vehicleStyle,
        ]}
      >
        <Animated.View
          style={[
            styles.beamAnchor,
            isRail ? styles.railAnchor : styles.busAnchor,
            headlampStyle,
          ]}
        >
          <HeadlightCone
            length={coneLength}
            spread={coneSpread}
            tiltDeg={isRail ? 8 : 12}
          />
        </Animated.View>
        <Image
          source={VEHICLES[variant]}
          style={styles.vehicleImg}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  vehicle: {
    position: 'absolute',
    left: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  vehicleImg: {
    width: '100%',
    height: '100%',
  },
  beamAnchor: {
    position: 'absolute',
    zIndex: 2,
  },
  busAnchor: {
    // Bumper headlight height — not cabin / driver seat
    right: -2,
    bottom: '2%',
  },
  railAnchor: {
    right: 0,
    bottom: '-4%',
  },
});
