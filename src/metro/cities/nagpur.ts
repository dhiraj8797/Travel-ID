import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'orange',
    name: 'Orange Line',
    color: '#F57C00',
    stops: [
      ['automotive_sq', 'Automotive Square', 21.1864, 79.0986, 'Automotive Sq'],
      ['naga_dungari', 'Nagaro', 21.1786, 79.0942],
      ['indora', 'Indora', 21.1684, 79.0886],
      ['kadbi_chowk', 'Kadbi Chowk', 21.1586, 79.0842],
      ['gaddi_godam', 'Gaddi Godam Square', 21.1524, 79.0812, 'Gaddi Godam'],
      ['kasturchand', 'Kasturchand Park', 21.1486, 79.0784],
      ['zero_mile', 'Zero Mile Freedom Park', 21.1462, 79.0886, 'Zero Mile'],
      ['sitabuldi', 'Sitabuldi', 21.1484, 79.0848],
      ['congress_nagar', 'Congress Nagar', 21.1386, 79.0812],
      ['rahate_colony', 'Rahate Colony', 21.1284, 79.0786],
      ['ajni_square', 'Ajni Square', 21.1186, 79.0742],
      ['chhatrapati_sq', 'Chhatrapati Square', 21.1084, 79.0686, 'Chhatrapati Sq'],
      ['jaiprakash_nagar', 'Jaiprakash Nagar', 21.0986, 79.0642, 'JP Nagar'],
      ['ujjwal_nagar', 'Ujjwal Nagar', 21.0884, 79.0586],
      ['airport', 'Airport', 21.0786, 79.0512],
      ['khapri', 'Khapri', 21.0684, 79.0448],
    ],
  },
  {
    id: 'aqua',
    name: 'Aqua Line',
    color: '#00BCD4',
    stops: [
      ['prajapati_nagar', 'Prajapati Nagar', 21.1586, 79.1284],
      ['vaishnodevi_sq', 'Vaishnodevi Square', 21.1542, 79.1186, 'Vaishnodevi'],
      ['ambedkar_sq', 'Ambedkar Square', 21.1512, 79.1084, 'Ambedkar Sq'],
      ['telephone_ex', 'Telephone Exchange', 21.1486, 79.0986],
      ['chitanavis_pura', 'Chitanavispura', 21.1468, 79.0912],
      ['sitabuldi', 'Sitabuldi', 21.1484, 79.0848],
      ['nagpur_railway', 'Nagpur Railway Station', 21.1524, 79.0786, 'Railway Stn'],
      ['dosar_vaishya', 'Dosar Vaishya Square', 21.1548, 79.0684, 'Dosar Vaishya'],
      ['agrasen_sq', 'Agrasen Square', 21.1564, 79.0586],
      ['institute_eng', 'Institute of Engineers', 21.1586, 79.0484, 'Inst. Engineers'],
      ['subhash_nagar', 'Subhash Nagar', 21.1612, 79.0386],
      ['lokmanya_nagar', 'Lokmanya Nagar', 21.1648, 79.0284],
    ],
  },
];

export const NAGPUR_METRO = buildMetroNetwork(
  { id: 'nag', name: 'Nagpur Metro', city: 'Nagpur', operator: 'MahaMetro' },
  lines
);
