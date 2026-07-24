import { buildMetroNetwork, LineDef } from '../buildNetwork';

const lines: LineDef[] = [
  {
    id: 'blue',
    name: 'Blue Line',
    color: '#0077C8',
    stops: [
      ['aluva', 'Aluva', 10.1084, 76.3512],
      ['pulinchodu', 'Pulinchodu', 10.0986, 76.3486],
      ['companypady', 'Companypady', 10.0884, 76.3462],
      ['ambattukavu', 'Ambattukavu', 10.0782, 76.3438],
      ['muttom', 'Muttom', 10.0686, 76.3412],
      ['kalamassery', 'Kalamassery', 10.0584, 76.3286],
      ['cusat', 'Cochin University', 10.0482, 76.3284, 'CUSAT'],
      ['pathadipalam', 'Pathadipalam', 10.0386, 76.3186],
      ['edapally', 'Edapally', 10.0268, 76.3084],
      ['changampuzha', 'Changampuzha Park', 10.0184, 76.3012, 'Changampuzha'],
      ['palarivattom', 'Palarivattom', 10.0068, 76.3048],
      ['jln_stadium', 'JLN Stadium', 9.9964, 76.2986],
      ['kaloor', 'Kaloor', 9.9886, 76.2912],
      ['town_hall', 'Town Hall', 9.9784, 76.2848],
      ['mg_road', 'MG Road', 9.9686, 76.2812],
      ['maharajas', 'Maharaja College', 9.9612, 76.2786, 'Maharajas'],
      ['ernakulam_south', 'Ernakulam South', 9.9548, 76.2824],
      ['kadavanthra', 'Kadavanthra', 9.9664, 76.3012],
      ['elamkulam', 'Elamkulam', 9.9586, 76.3084],
      ['vyttila', 'Vyttila', 9.9684, 76.3186],
      ['thykkoodam', 'Thykkoodam', 9.9586, 76.3284],
      ['petta', 'Petta', 9.9484, 76.3348],
      ['vadakkekotta', 'Vadakkekotta', 9.9386, 76.3412],
      ['sn_junction', 'SN Junction', 9.9484, 76.3486],
      ['thrippunithura', 'Thrippunithura Terminal', 9.9486, 76.3384, 'Thrippunithura'],
    ],
  },
];

export const KOCHI_METRO = buildMetroNetwork(
  { id: 'cok', name: 'Kochi Metro', city: 'Kochi', operator: 'KMRL' },
  lines
);
