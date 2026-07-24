import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'red',
    name: 'Red Line',
    color: '#E53935',
    stops: [
      ['ccs_airport', 'CCS Airport', 26.7606, 80.8894, 'Airport'],
      ['amausi', 'Amausi', 26.7724, 80.9012],
      ['transport_nagar', 'Transport Nagar', 26.7842, 80.9128],
      ['krishna_nagar', 'Krishna Nagar', 26.7968, 80.9246],
      ['singar_nagar', 'Singar Nagar', 26.8084, 80.9362],
      ['alambagh', 'Alambagh', 26.8186, 80.9428],
      ['alambagh_bus', 'Alambagh Bus Station', 26.8242, 80.9486, 'Alambagh Bus'],
      ['mawaiya', 'Mawaiya', 26.8318, 80.9542],
      ['charbagh', 'Charbagh Railway Station', 26.8336, 80.9224, 'Charbagh'],
      ['hussain_ganj', 'Hussain Ganj', 26.8428, 80.9348],
      ['sachivalaya', 'Sachivalaya', 26.8486, 80.9462],
      ['hazratganj', 'Hazratganj', 26.8542, 80.9578],
      ['kd_singh', 'KD Singh Babu Stadium', 26.8618, 80.9684, 'KD Singh'],
      ['vishwavidyalaya', 'Vishwavidyalaya', 26.8684, 80.9786],
      ['it_college', 'IT College', 26.8742, 80.9884],
      ['badshah_nagar', 'Badshah Nagar', 26.8818, 80.9968],
      ['lekhnagar', 'Lekhraj Market', 26.8894, 81.0042, 'Lekhraj'],
      ['bhootnath', 'Bhootnath Market', 26.8968, 81.0124, 'Bhootnath'],
      ['indira_nagar', 'Indira Nagar', 26.9042, 81.0186],
      ['munshi_pulia', 'Munshi Pulia', 26.9118, 81.0268],
    ],
  },
];

export const LUCKNOW_METRO = buildMetroNetwork(
  { id: 'lko', name: 'Lucknow Metro', city: 'Lucknow', operator: 'LMRC' },
  lines
);
