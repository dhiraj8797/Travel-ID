/** Indian Standard Time (Asia/Kolkata) sky helpers for sun/moon UI. */

const IST = 'Asia/Kolkata';

export type IndiaSkySnapshot = {
  /** Minutes since local midnight IST */
  minutes: number;
  /** Approximate sunrise / sunset minutes (IST) for today */
  sunriseMin: number;
  sunsetMin: number;
  /** true after sunset until sunrise */
  isNight: boolean;
  /**
   * Continuous day phase for coloring:
   * 0 sunrise → 0.35 mid-morning → 0.5 noon → 0.75 evening → 1 sunset
   * Night: kept at 1 (use isNight for moon).
   */
  dayPhase: number;
  /** 0..1 how close to golden hour (sunrise or sunset) */
  golden: number;
};

function istParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const n = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour: n('hour'),
    minute: n('minute'),
    second: n('second'),
  };
}

/** Day of year 1–365/366 in IST calendar date. */
function dayOfYearIST(date = new Date()) {
  const { year, month, day } = istParts(date);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const start = Date.UTC(year, 0, 0, 12, 0, 0);
  return Math.round((utcNoon - start) / 86400000);
}

/**
 * Approximate sunrise/sunset for central-north India (Delhi-ish).
 * Good enough for UI mood; not an astronomy ephemeris.
 */
export function approxSunMinutesIST(date = new Date()) {
  const doy = dayOfYearIST(date);
  // Seasonal swing ~±75 min around equinox
  const swing = Math.sin(((doy - 80) / 365) * Math.PI * 2);
  const sunrise = 6 * 60 + 15 - swing * 75; // ~5:00 summer … ~7:30 winter
  const sunset = 18 * 60 + 20 + swing * 75; // ~17:05 winter … ~19:35 summer
  return { sunriseMin: sunrise, sunsetMin: sunset };
}

export function getIndiaSkySnapshot(date = new Date()): IndiaSkySnapshot {
  const { hour, minute, second } = istParts(date);
  const minutes = hour * 60 + minute + second / 60;
  const { sunriseMin, sunsetMin } = approxSunMinutesIST(date);

  const isNight = minutes < sunriseMin || minutes >= sunsetMin;

  let dayPhase = 1;
  if (!isNight) {
    const span = Math.max(1, sunsetMin - sunriseMin);
    dayPhase = (minutes - sunriseMin) / span;
  }

  const goldenWindow = 75; // minutes
  const nearRise =
    1 -
    Math.min(
      1,
      Math.abs(minutes - sunriseMin) / goldenWindow
    );
  const nearSet =
    1 -
    Math.min(
      1,
      Math.abs(minutes - sunsetMin) / goldenWindow
    );
  const golden = Math.max(0, Math.max(nearRise, nearSet));

  return {
    minutes,
    sunriseMin,
    sunsetMin,
    isNight,
    dayPhase: Math.min(1, Math.max(0, dayPhase)),
    golden,
  };
}
