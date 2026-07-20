import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const Green = '#1FC77A';
const Navy = '#07132D';

type Props = {
  number: string;
  active?: boolean;
  onPress?: () => void;
  style?: object;
};

/** Clickable train number with green blink when live. */
export function GreenBlinkNumber({ number, active, onPress, style }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [active, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: active ? pulse.value : 1,
  }));

  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.wrap, style]}>
      <Animated.View style={[styles.dot, active && styles.dotOn, glowStyle]} />
      <Text style={[styles.number, active && styles.numberLive]}>{number}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#9AA3B5',
  },
  dotOn: {
    backgroundColor: Green,
    shadowColor: Green,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  number: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 12,
    color: Navy,
    textDecorationLine: 'underline',
  },
  numberLive: {
    color: Green,
  },
});
