import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MAX_SPEED = 200;
/** Tick labels around the semi-circle (km/h). */
const TICKS = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200] as const;

type Props = {
  speedKmh?: number;
  live?: boolean;
  size?: 'sm' | 'md';
};

export function SpeedMeter({ speedKmh = 0, live, size = 'md' }: Props) {
  const speed = Math.max(0, Math.min(MAX_SPEED, Math.round(speedKmh || 0)));
  const progress = useSharedValue(0);
  const scale = size === 'sm' ? 0.85 : 1;
  const w = Math.round(200 * scale);
  const h = Math.round(128 * scale);

  useEffect(() => {
    progress.value = withTiming(speed / MAX_SPEED, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [speed, progress]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-90 + progress.value * 180}deg` }],
  }));

  const tickLabels = useMemo(() => {
    // Semi-circle geometry in viewBox coords, mapped to layout size
    const cx = w / 2;
    const cy = h - 22 * scale;
    const r = 78 * scale;
    const labelR = r + 14 * scale;
    return TICKS.map((kmh) => {
      // 0 → left (−π), MAX → right (0) along upper semi-circle
      const t = kmh / MAX_SPEED;
      const angle = Math.PI - t * Math.PI;
      const x = cx + labelR * Math.cos(angle);
      const y = cy - labelR * Math.sin(angle);
      return { kmh, x, y };
    });
  }, [w, h, scale]);

  return (
    <View style={styles.wrap}>
      <View style={{ width: w, height: h + 8, alignItems: 'center' }}>
        <Svg width={w} height={h} viewBox="0 0 200 128">
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#00E5FF" />
              <Stop offset="55%" stopColor="#32D74B" />
              <Stop offset="100%" stopColor="#FF6B35" />
            </LinearGradient>
          </Defs>
          {/* Background arc */}
          <Path
            d="M 22 108 A 78 78 0 0 1 178 108"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />
          {/* Active arc */}
          <Path
            d={arcForSpeed(speed)}
            stroke="url(#g)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />
          {/* Tick marks on the arc */}
          {TICKS.map((kmh) => {
            const t = kmh / MAX_SPEED;
            const angle = Math.PI - t * Math.PI;
            const cx = 100;
            const cy = 108;
            const rOuter = 78;
            const rInner = 68;
            const x1 = cx + rInner * Math.cos(angle);
            const y1 = cy - rInner * Math.sin(angle);
            const x2 = cx + rOuter * Math.cos(angle);
            const y2 = cy - rOuter * Math.sin(angle);
            return (
              <Path
                key={kmh}
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1.5}
              />
            );
          })}
        </Svg>

        {/* Speed number labels around the semi-circle */}
        {tickLabels.map(({ kmh, x, y }) => (
          <Text
            key={kmh}
            style={[
              styles.tick,
              size === 'sm' && styles.tickSm,
              {
                left: x - 12,
                top: y - 7,
              },
            ]}
          >
            {kmh}
          </Text>
        ))}

        <View style={[styles.pivot, { top: h - 20 * scale, left: w / 2 - 1 }]}>
          <Animated.View style={[styles.needleArm, needleStyle]}>
            <View style={[styles.needle, { height: 54 * scale, marginTop: -54 * scale }]} />
          </Animated.View>
          <View style={styles.hub} />
        </View>

        <View style={[styles.center, { top: h * 0.38 }]} pointerEvents="none">
          <Text style={[styles.value, size === 'sm' && styles.valueSm]}>{speed}</Text>
          <Text style={styles.unit}>km/h</Text>
        </View>
      </View>

      <View style={[styles.pill, live && styles.pillLive]}>
        <View style={[styles.dot, live && styles.dotOn]} />
        <Text style={styles.pillText}>Live Speed</Text>
      </View>
    </View>
  );
}

function arcForSpeed(speed: number): string {
  const t = Math.max(0.001, Math.min(1, speed / MAX_SPEED));
  const cx = 100;
  const cy = 108;
  const r = 78;
  const angle = Math.PI - t * Math.PI;
  const endX = cx + r * Math.cos(angle);
  const endY = cy - r * Math.sin(angle);
  const large = t > 0.5 ? 1 : 0;
  return `M 22 108 A ${r} ${r} 0 ${large} 1 ${endX} ${endY}`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  tick: {
    position: 'absolute',
    width: 24,
    textAlign: 'center',
    fontFamily: 'DMSans_500Medium',
    fontSize: 8,
    color: 'rgba(226,248,255,0.75)',
  },
  tickSm: { fontSize: 7 },
  pivot: {
    position: 'absolute',
    width: 2,
    height: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needleArm: {
    position: 'absolute',
    width: 2,
    height: 2,
    alignItems: 'center',
  },
  needle: {
    width: 2.5,
    borderRadius: 2,
    backgroundColor: '#00D4FF',
  },
  hub: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#00D4FF',
    marginTop: -4,
  },
  center: { position: 'absolute', alignItems: 'center' },
  value: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: '#fff',
    lineHeight: 36,
  },
  valueSm: { fontSize: 26, lineHeight: 30 },
  unit: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: '#94A3B8',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.4)',
  },
  pillLive: { borderColor: '#00E676' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  dotOn: { backgroundColor: '#00E676' },
  pillText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
    color: '#E2F8FF',
  },
});
