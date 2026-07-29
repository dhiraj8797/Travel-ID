/**
 * Open-Meteo forecast (no API key). Used for home weather from GPS coords.
 * @see https://open-meteo.com/en/docs
 */

export type WeatherSnapshot = {
  temperatureC: number;
  weatherCode: number;
  humidityPct?: number;
  windKmh?: number;
  /** Short human label, e.g. "Partly cloudy" */
  condition: string;
  /** Ionicons-ish weather glyph name used by UI */
  icon: 'sunny' | 'partly-sunny' | 'cloudy' | 'rainy' | 'thunderstorm' | 'snow' | 'cloudy-night';
  /** Today high / low when available */
  highC?: number;
  lowC?: number;
  fetchedAt: string;
};

function conditionFromCode(code: number): Pick<WeatherSnapshot, 'condition' | 'icon'> {
  if (code === 0) return { condition: 'Clear', icon: 'sunny' };
  if (code === 1 || code === 2) return { condition: 'Partly cloudy', icon: 'partly-sunny' };
  if (code === 3) return { condition: 'Overcast', icon: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: 'cloudy' };
  if (code >= 51 && code <= 67) return { condition: 'Rain', icon: 'rainy' };
  if (code >= 71 && code <= 77) return { condition: 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { condition: 'Showers', icon: 'rainy' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: 'thunderstorm' };
  return { condition: 'Cloudy', icon: 'cloudy' };
}

export async function fetchWeatherAt(
  lat: number,
  lng: number
): Promise<WeatherSnapshot> {
  const qs = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Weather upstream ${res.status}`);
  }
  const json = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
    };
    daily?: {
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
    };
  };
  const cur = json.current;
  if (!cur || typeof cur.temperature_2m !== 'number') {
    throw new Error('Weather response missing temperature');
  }
  const code = typeof cur.weather_code === 'number' ? cur.weather_code : 3;
  const meta = conditionFromCode(code);
  return {
    temperatureC: Math.round(cur.temperature_2m),
    weatherCode: code,
    humidityPct:
      typeof cur.relative_humidity_2m === 'number'
        ? Math.round(cur.relative_humidity_2m)
        : undefined,
    windKmh:
      typeof cur.wind_speed_10m === 'number'
        ? Math.round(cur.wind_speed_10m)
        : undefined,
    condition: meta.condition,
    icon: meta.icon,
    highC:
      typeof json.daily?.temperature_2m_max?.[0] === 'number'
        ? Math.round(json.daily.temperature_2m_max[0])
        : undefined,
    lowC:
      typeof json.daily?.temperature_2m_min?.[0] === 'number'
        ? Math.round(json.daily.temperature_2m_min[0])
        : undefined,
    fetchedAt: new Date().toISOString(),
  };
}
