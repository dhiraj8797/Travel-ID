import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'purple',
    name: 'Purple Line',
    color: '#7B1FA2',
    stops: [
      ['pcmc', 'PCMC', 18.6284, 73.7992],
      ['sant_tukaram', 'Sant Tukaram Nagar', 18.6212, 73.8086, 'Sant Tukaram'],
      ['bhosari', 'Bhosari (Nashik Phata)', 18.6148, 73.8184, 'Bhosari'],
      ['kasarwadi', 'Kasarwadi', 18.6084, 73.8286],
      ['phugewadi', 'Phugewadi', 18.6012, 73.8384],
      ['dapodi', 'Dapodi', 18.5848, 73.8486],
      ['bopodi', 'Bopodi', 18.5684, 73.8412],
      ['khadki', 'Khadki', 18.5624, 73.8518],
      ['range_hills', 'Range Hills', 18.5486, 73.8484],
      ['shivajinagar', 'Shivajinagar', 18.5312, 73.8486],
      ['civil_court', 'Civil Court', 18.5248, 73.8542],
      ['budhwar_peth', 'Budhwar Peth', 18.5186, 73.8584],
      ['mandai', 'Mandai', 18.5124, 73.8628],
      ['swargate', 'Swargate', 18.5012, 73.8586],
    ],
  },
  {
    id: 'aqua',
    name: 'Aqua Line',
    color: '#00ACC1',
    stops: [
      ['vanaz', 'Vanaz', 18.5086, 73.8084],
      ['anand_nagar', 'Anand Nagar', 18.5124, 73.8186],
      ['ideal_colony', 'Ideal Colony', 18.5168, 73.8284],
      ['nal_stop', 'Nal Stop', 18.5212, 73.8386],
      ['garware_college', 'Garware College', 18.5164, 73.8412],
      ['deccan_gymkhana', 'Deccan Gymkhana', 18.5184, 73.8448, 'Deccan'],
      ['civil_court', 'Civil Court', 18.5248, 73.8542],
      ['mangalwar_peth', 'Mangalwar Peth', 18.5286, 73.8648],
      ['pune_station', 'Pune Station', 18.5284, 73.8742],
      ['ruby_hall', 'Ruby Hall Clinic', 18.5324, 73.8848, 'Ruby Hall'],
      ['bund_garden', 'Bund Garden', 18.5386, 73.8912],
      ['yerawada', 'Yerawada', 18.5484, 73.8986],
      ['kalyani_nagar', 'Kalyani Nagar', 18.5486, 73.9084],
      ['ramwadi', 'Ramwadi', 18.5486, 73.9184],
    ],
  },
];

export const PUNE_METRO = buildMetroNetwork(
  { id: 'pnq', name: 'Pune Metro', city: 'Pune', operator: 'MahaMetro' },
  lines
);
