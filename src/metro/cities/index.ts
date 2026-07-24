import { DELHI_METRO } from './delhi';
import { MUMBAI_METRO } from './mumbai';
import { CHENNAI_METRO } from './chennai';
import { KOLKATA_METRO } from './kolkata';
import { HYDERABAD_METRO } from './hyderabad';
import { PUNE_METRO } from './pune';
import { AHMEDABAD_METRO } from './ahmedabad';
import { KOCHI_METRO } from './kochi';
import { LUCKNOW_METRO } from './lucknow';
import { JAIPUR_METRO } from './jaipur';
import { NAGPUR_METRO } from './nagpur';
import { BANGALORE_METRO } from '../bangalore';
import { MetroNetwork, MetroNetworkId } from '../types';

export { DELHI_METRO } from './delhi';
export { MUMBAI_METRO } from './mumbai';
export { CHENNAI_METRO } from './chennai';
export { KOLKATA_METRO } from './kolkata';
export { HYDERABAD_METRO } from './hyderabad';
export { PUNE_METRO } from './pune';
export { AHMEDABAD_METRO } from './ahmedabad';
export { KOCHI_METRO } from './kochi';
export { LUCKNOW_METRO } from './lucknow';
export { JAIPUR_METRO } from './jaipur';
export { NAGPUR_METRO } from './nagpur';

export const CITY_METROS = {
  del: DELHI_METRO,
  bom: MUMBAI_METRO,
  blr: BANGALORE_METRO,
  maa: CHENNAI_METRO,
  ccu: KOLKATA_METRO,
  hyd: HYDERABAD_METRO,
  pnq: PUNE_METRO,
  amd: AHMEDABAD_METRO,
  cok: KOCHI_METRO,
  lko: LUCKNOW_METRO,
  jai: JAIPUR_METRO,
  nag: NAGPUR_METRO,
} as const satisfies Record<MetroNetworkId, MetroNetwork>;

export function getCityMetro(id: MetroNetworkId): MetroNetwork {
  return CITY_METROS[id];
}
