import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const BG = require('../../assets/scenes/passes-settings-bg.jpg');

type Props = {
  /** Extra darkening so white text stays readable */
  dim?: number;
};

/**
 * Fixed travel artwork background for My Passes / Settings.
 */
export function StaticSceneBackground({ dim = 0.42 }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={BG} style={styles.image} resizeMode="cover" />
      <View style={[styles.dim, { backgroundColor: `rgba(6,16,31,${dim})` }]} />
      <LinearGradient
        colors={['rgba(6,16,31,0.55)', 'transparent', 'rgba(6,16,31,0.75)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
  },
});
