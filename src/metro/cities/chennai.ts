import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'blue',
    name: 'Blue Line',
    color: '#0078C8',
    stops: [
      ['wimco_nagar_depot', 'Wimco Nagar Depot', 13.1848, 80.3092, 'Wimco Depot'],
      ['wimco_nagar', 'Wimco Nagar', 13.1786, 80.3048],
      ['tiruvottriyur', 'Tiruvottriyur', 13.1684, 80.3012],
      ['tiruvottriyur_theradi', 'Tiruvottriyur Theradi', 13.1612, 80.2986, 'Theradi'],
      ['kaladipet', 'Kaladipet', 13.1548, 80.2962],
      ['tollgate', 'Tollgate', 13.1484, 80.2938],
      ['new_washermanpet', 'New Washermanpet', 13.1412, 80.2912],
      ['washermanpet', 'Washermanpet', 13.1186, 80.2884],
      ['mannadi', 'Mannadi', 13.0948, 80.2862],
      ['high_court', 'High Court', 13.0842, 80.2848],
      ['central', 'Central', 13.0824, 80.2756],
      ['egmore', 'Egmore', 13.0786, 80.2612],
      ['nehru_park', 'Nehru Park', 13.0712, 80.2548],
      ['kilpauk', 'Kilpauk', 13.0648, 80.2484],
      ['pachaiyappas_college', "Pachaiyappa's College", 13.0584, 80.2412, 'Pachaiyappa'],
      ['shenoy_nagar', 'Shenoy Nagar', 13.0512, 80.2348],
      ['anna_nagar_east', 'Anna Nagar East', 13.0848, 80.2184, 'Anna Nagar E'],
      ['anna_nagar_tower', 'Anna Nagar Tower', 13.0886, 80.2086, 'Anna Nagar Twr'],
      ['thirumangalam', 'Thirumangalam', 13.0842, 80.1984],
      ['koyambedu', 'Koyambedu', 13.0748, 80.1886],
      ['cmbt', 'CMBT', 13.0684, 80.1842],
      ['arumbakkam', 'Arumbakkam', 13.0612, 80.1912],
      ['vadapalani', 'Vadapalani', 13.0512, 80.2084],
      ['ashok_nagar', 'Ashok Nagar', 13.0386, 80.2112],
      ['ekkattuthangal', 'Ekkattuthangal', 13.0212, 80.2048],
      ['alandur', 'Alandur', 13.0048, 80.2012],
      ['nanganallur_road', 'Nanganallur Road', 12.9984, 80.1948, 'Nanganallur'],
      ['meenambakkam', 'Meenambakkam', 12.9886, 80.1884],
      ['chennai_airport', 'Chennai Airport', 12.9812, 80.1648, 'Airport'],
    ],
  },
  {
    id: 'green',
    name: 'Green Line',
    color: '#43A047',
    stops: [
      ['central', 'Central', 13.0824, 80.2756],
      ['government_estate', 'Government Estate', 13.0712, 80.2684, 'Govt Estate'],
      ['lic', 'LIC', 13.0648, 80.2612],
      ['thousand_lights', 'Thousand Lights', 13.0584, 80.2548],
      ['ag_dms', 'AG – DMS', 13.0512, 80.2484, 'AG-DMS'],
      ['teynampet', 'Teynampet', 13.0412, 80.2412],
      ['nandanam', 'Nandanam', 13.0312, 80.2348],
      ['saidapet', 'Saidapet', 13.0212, 80.2284],
      ['little_mount', 'Little Mount', 13.0148, 80.2212],
      ['guindy', 'Guindy', 13.0084, 80.2124],
      ['alandur', 'Alandur', 13.0048, 80.2012],
      ['st_thomas_mount', 'St. Thomas Mount', 12.9948, 80.1984, 'St Thomas Mt'],
    ],
  },
];

export const CHENNAI_METRO = buildMetroNetwork(
  { id: 'maa', name: 'Chennai Metro', city: 'Chennai', operator: 'CMRL' },
  lines
);
