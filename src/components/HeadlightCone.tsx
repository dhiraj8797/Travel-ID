import React, { useId } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

type Props = {
  /** Beam length along travel direction */
  length?: number;
  /** Max height of the cone flare */
  spread?: number;
  /** Degrees clockwise — dips the beam onto the road */
  tiltDeg?: number;
  style?: ViewStyle;
};

/**
 * Soft triangular headlight cone.
 * Tip (bulb) sits at the real lamp height; beam fans forward + slightly down onto the road.
 */
export function HeadlightCone({
  length = 150,
  spread = 56,
  tiltDeg = 10,
  style,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const beamId = `headBeam_${uid}`;
  const coreId = `headCore_${uid}`;

  // Tip near the TOP of the wrap (= bumper lamp). Flare opens right and DOWN onto asphalt.
  const tipY = spread * 0.22;
  const cone = `M 0 ${tipY} L ${length} 0 L ${length} ${spread} Z`;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: length,
          height: spread,
          transform: [{ rotate: `${tiltDeg}deg` }],
        },
        style,
      ]}
      pointerEvents="none"
    >
      <Svg width={length} height={spread}>
        <Defs>
          <SvgLinearGradient id={beamId} x1="0" y1="0" x2="1" y2="0.35">
            <Stop offset="0" stopColor="#FFFCE8" stopOpacity="0.95" />
            <Stop offset="0.2" stopColor="#FFE08A" stopOpacity="0.55" />
            <Stop offset="0.55" stopColor="#FFC040" stopOpacity="0.2" />
            <Stop offset="1" stopColor="#FFB020" stopOpacity="0" />
          </SvgLinearGradient>
          <RadialGradient id={coreId} cx="6%" cy="22%" rx="16%" ry="24%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="0.4" stopColor="#FFE9A8" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#FFD060" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* Road wash near far end, low */}
        <Ellipse
          cx={length * 0.58}
          cy={spread * 0.82}
          rx={length * 0.4}
          ry={spread * 0.2}
          fill="#FFD060"
          opacity={0.3}
        />
        <Path d={cone} fill={`url(#${beamId})`} />
        <Ellipse
          cx={length * 0.1}
          cy={tipY}
          rx={length * 0.12}
          ry={spread * 0.14}
          fill={`url(#${coreId})`}
        />
      </Svg>
      <View style={[styles.bulb, { top: tipY - 5 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
  },
  bulb: {
    position: 'absolute',
    left: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFF9E6',
    shadowColor: '#FFD060',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
