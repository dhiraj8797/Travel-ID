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

type Variant = 'rail' | 'bus';

type Props = {
  variant: Variant;
};

const SCENES = {
  rail: require('../../../assets/scenes/pass-bg-train.png'),
  bus: require('../../../assets/scenes/pass-bg-bus.png'),
};

const VEHICLES = {
  rail: require('../../../assets/vehicles/hero-vande-bharat.png'),
  bus: require('../../../assets/vehicles/hero-bus.png'),
};

/**
 * Vehicles stay locked to the track/road band in the artwork (lower third)
 * and only slide horizontally — no floating mid-sky motion.
 */
export function PassSceneBackground({ variant }: Props) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  // Artwork has tracks/road in the lower ~22–28% of the frame.
  // Anchor vehicle BOTTOM to that band so wheels sit on the surface.
  const surfaceFromBottom =
    variant === 'rail'
      ? Math.round(height * 0.205)
      : Math.round(height * 0.185);

  const vehicleWidth =
    variant === 'rail' ? Math.round(width * 1.2) : Math.round(width * 0.58);
  // Transparent Vande Bharat PNG is ~9.5:1 after crop
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
  }, [progress, variant]);

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
    ...StyleSheet.absoluteFillObject,
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
});
