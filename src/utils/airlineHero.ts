import { ImageSourcePropType } from 'react-native';

/**
 * Boarding-pass hero artwork keyed by IATA airline designator.
 * Falls back to a neutral jet when the carrier is unknown.
 */
const AIRLINE_HEROES: Record<string, ImageSourcePropType> = {
  '6E': require('../../assets/scenes/airlines/6e-indigo.jpg'),
  AI: require('../../assets/scenes/airlines/ai-airindia.jpg'),
  UK: require('../../assets/scenes/airlines/uk-vistara.jpg'),
  SG: require('../../assets/scenes/airlines/sg-spicejet.jpg'),
  QP: require('../../assets/scenes/airlines/qp-akasa.jpg'),
  IX: require('../../assets/scenes/airlines/ix-aiexpress.jpg'),
  I5: require('../../assets/scenes/airlines/i5-airasia.jpg'),
  '9I': require('../../assets/scenes/airlines/9i-alliance.jpg'),
};

const DEFAULT_HERO = require('../../assets/scenes/airlines/default.jpg');

/** Resolve boarding-pass hero image for an airline code / operator name. */
export function airlineHeroImage(
  airlineCode?: string,
  operator?: string
): ImageSourcePropType {
  const code = (airlineCode || '').trim().toUpperCase();
  if (code && AIRLINE_HEROES[code]) return AIRLINE_HEROES[code];

  const name = (operator || '').toLowerCase();
  if (name.includes('indigo')) return AIRLINE_HEROES['6E'];
  if (name.includes('air india express')) return AIRLINE_HEROES.IX;
  if (name.includes('air india')) return AIRLINE_HEROES.AI;
  if (name.includes('vistara')) return AIRLINE_HEROES.UK;
  if (name.includes('spice')) return AIRLINE_HEROES.SG;
  if (name.includes('akasa')) return AIRLINE_HEROES.QP;
  if (name.includes('airasia') || name.includes('air asia')) {
    return AIRLINE_HEROES.I5;
  }
  if (name.includes('alliance')) return AIRLINE_HEROES['9I'];

  return DEFAULT_HERO;
}
