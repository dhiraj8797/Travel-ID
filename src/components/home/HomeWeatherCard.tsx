import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WeatherSnapshot } from '../../services/weather';
import { colors, radii } from '../../theme';

type Props = {
  weather: WeatherSnapshot | null;
  loading?: boolean;
  error?: string | null;
  placeLabel?: string | null;
  onPress?: () => void;
};

const ICON_MAP: Record<
  WeatherSnapshot['icon'],
  keyof typeof Ionicons.glyphMap
> = {
  sunny: 'sunny',
  'partly-sunny': 'partly-sunny',
  cloudy: 'cloudy',
  rainy: 'rainy',
  thunderstorm: 'thunderstorm',
  snow: 'snow',
  'cloudy-night': 'cloudy-night',
};

/**
 * Compact weather strip for the home screen — tied to current GPS area.
 */
export function HomeWeatherCard({
  weather,
  loading,
  error,
  placeLabel,
  onPress,
}: Props) {
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={
        weather
          ? `Weather ${weather.temperatureC} degrees, ${weather.condition}`
          : 'Weather'
      }
    >
      <View style={styles.left}>
        {loading && !weather ? (
          <ActivityIndicator size="small" color={colors.blue} />
        ) : (
          <Ionicons
            name={weather ? ICON_MAP[weather.icon] : 'partly-sunny-outline'}
            size={22}
            color={colors.blue}
          />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {weather
              ? `${weather.temperatureC}° · ${weather.condition}`
              : loading
                ? 'Fetching weather…'
                : error
                  ? 'Weather unavailable'
                  : 'Weather'}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {placeLabel
              ? `Near ${placeLabel}`
              : weather?.highC != null && weather.lowC != null
                ? `H ${weather.highC}° · L ${weather.lowC}°`
                : 'Based on your current location'}
          </Text>
        </View>
      </View>
      {weather?.highC != null && weather.lowC != null ? (
        <Text style={styles.hiLo}>
          {weather.highC}°/{weather.lowC}°
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(52,118,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,118,255,0.28)',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  title: {
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  sub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  hiLo: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: colors.blue,
  },
});
