import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'red',
    name: 'Red Line',
    color: '#E53935',
    stops: [
      ['thaltej_gam', 'Thaltej Gam', 23.0524, 72.4986, 'Thaltej Gam'],
      ['thaltej', 'Thaltej', 23.0486, 72.5084],
      ['doordarshan_kendra', 'Doordarshan Kendra', 23.0448, 72.5186, 'Doordarshan'],
      ['gurukul_road', 'Gurukul Road', 23.0412, 72.5284],
      ['gujarat_university', 'Gujarat University', 23.0386, 72.5386, 'Gujarat Univ'],
      ['commerce_six_roads', 'Commerce Six Roads', 23.0348, 72.5484, 'Commerce Six Rd'],
      ['sp_stadium', 'S.P. Stadium', 23.0312, 72.5586, 'SP Stadium'],
      ['old_high_court', 'Old High Court', 23.0286, 72.5684],
      ['shahpur', 'Shahpur', 23.0312, 72.5786],
      ['gheekanta', 'Gheekanta', 23.0286, 72.5884],
      ['kalupur_railway', 'Kalupur Railway Station', 23.0286, 72.6012, 'Kalupur'],
      ['kankaria_east', 'Kankaria East', 23.0148, 72.6084],
      ['apparel_park', 'Apparel Park', 23.0084, 72.6186],
      ['amraiwadi', 'Amraiwadi', 23.0012, 72.6284],
      ['rabari_colony', 'Rabari Colony', 22.9948, 72.6386],
      ['vastral_gam', 'Vastral Gam', 22.9884, 72.6484],
      ['nirant_cross_road', 'Nirant Cross Road', 22.9824, 72.6586, 'Nirant Cross'],
      ['vastral', 'Vastral', 22.9768, 72.6684],
    ],
  },
  {
    id: 'blue',
    name: 'Blue Line',
    color: '#1565C0',
    stops: [
      ['apmc', 'APMC', 23.0084, 72.5486],
      ['jivraj_park', 'Jivraj Park', 23.0148, 72.5584],
      ['rajiv_nagar', 'Rajiv Nagar', 23.0186, 72.5612],
      ['shreyas', 'Shreyas', 23.0212, 72.5648],
      ['paldi', 'Paldi', 23.0148, 72.5712],
      ['gandhigram', 'Gandhigram', 23.0212, 72.5748],
      ['old_high_court', 'Old High Court', 23.0286, 72.5684],
      ['usmanpura', 'Usmanpura', 23.0384, 72.5612],
      ['vijay_nagar', 'Vijay Nagar', 23.0486, 72.5548],
      ['vadaj', 'Vadaj', 23.0584, 72.5486],
      ['ranip', 'Ranip', 23.0686, 72.5412],
      ['sabarmati_railway', 'Sabarmati Railway Station', 23.0784, 72.5486, 'Sabarmati Rly'],
      ['aec', 'AEC', 23.0886, 72.5548],
      ['sabarmati', 'Sabarmati', 23.0984, 72.5612],
      ['motera_stadium', 'Motera Stadium', 23.1086, 72.5684, 'Motera'],
    ],
  },
];

export const AHMEDABAD_METRO = buildMetroNetwork(
  { id: 'amd', name: 'Ahmedabad Metro', city: 'Ahmedabad', operator: 'MEGA' },
  lines
);
