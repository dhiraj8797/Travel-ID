import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'pink',
    name: 'Pink Line',
    color: '#E91E8C',
    stops: [
      ['mansarovar', 'Mansarovar', 26.8708, 75.7642],
      ['new_aatish_market', 'New Aatish Market', 26.8756, 75.7718, 'Aatish Market'],
      ['vivek_vihar', 'Vivek Vihar', 26.8802, 75.7794],
      ['shyam_nagar', 'Shyam Nagar', 26.8848, 75.7872],
      ['ram_nagar', 'Ram Nagar', 26.8894, 75.7948],
      ['civil_lines', 'Civil Lines', 26.8942, 75.8024],
      ['railway_station', 'Railway Station', 26.9194, 75.7882, 'Railway Stn'],
      ['sindhi_camp', 'Sindhi Camp', 26.9238, 75.7968],
      ['chandpole', 'Chandpole', 26.9286, 75.8054],
      ['chhoti_chaupar', 'Chhoti Chaupar', 26.9242, 75.8186],
      ['badi_chaupar', 'Badi Chaupar', 26.9218, 75.8264],
    ],
  },
];

export const JAIPUR_METRO = buildMetroNetwork(
  { id: 'jai', name: 'Jaipur Metro', city: 'Jaipur', operator: 'JMRC' },
  lines
);
