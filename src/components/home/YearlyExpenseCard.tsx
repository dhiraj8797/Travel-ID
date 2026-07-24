import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Ticket } from '../../types/ticket';
import { colors, radii } from '../../theme';
import {
  YearExpense,
  aggregateExpensesByYear,
  formatInr,
} from '../../utils/travelExpense';

type Props = {
  tickets: Ticket[];
};

const KIND_META: {
  key: keyof YearExpense['byKind'];
  label: string;
  color: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { key: 'rail', label: 'Train', color: colors.blue, icon: 'train' },
  { key: 'flight', label: 'Flight', color: colors.purple, icon: 'airplane' },
  { key: 'bus', label: 'Bus', color: colors.orange, icon: 'bus' },
  { key: 'hotel', label: 'Hotel', color: colors.hotel, icon: 'office-building' },
];

/**
 * Homepage card: sum of final paid amounts (ticket.fare) grouped by trip year.
 */
export function YearlyExpenseCard({ tickets }: Props) {
  const years = useMemo(() => aggregateExpensesByYear(tickets), [tickets]);
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const activeYear =
    selectedYear ??
    years.find((y) => y.year === currentYear)?.year ??
    years[0]?.year ??
    currentYear;

  const row =
    years.find((y) => y.year === activeYear) ||
    ({
      year: activeYear,
      total: 0,
      withFare: 0,
      missingFare: 0,
      byKind: {},
    } satisfies YearExpense);

  const hasAnyFare = years.some((y) => y.withFare > 0);
  const yearChips = years.length
    ? years
    : [{ year: currentYear, total: 0, withFare: 0, missingFare: 0, byKind: {} }];

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Ionicons name="wallet-outline" size={20} color={colors.orange} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Total expense</Text>
          <Text style={styles.subtitle}>Final paid amount · by year</Text>
        </View>
      </View>

      {yearChips.length > 1 ? (
        <View style={styles.yearRow}>
          {yearChips.map((y) => {
            const on = y.year === activeYear;
            return (
              <Pressable
                key={y.year}
                onPress={() => setSelectedYear(y.year)}
                style={[styles.yearChip, on && styles.yearChipOn]}
              >
                <Text style={[styles.yearChipText, on && styles.yearChipTextOn]}>
                  {y.year}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.yearSolo}>{activeYear}</Text>
      )}

      <Text style={styles.amount}>{formatInr(row.total)}</Text>
      <Text style={styles.meta}>
        {row.withFare === 0
          ? hasAnyFare
            ? 'No paid amounts recorded for this year'
            : 'Add fare on Review to track spending'
          : `${row.withFare} pass${row.withFare === 1 ? '' : 'es'} counted${
              row.missingFare
                ? ` · ${row.missingFare} without fare`
                : ''
            }`}
      </Text>

      {row.withFare > 0 ? (
        <View style={styles.kindRow}>
          {KIND_META.map((k) => {
            const value = row.byKind[k.key] || 0;
            if (value <= 0) return null;
            return (
              <View key={k.key} style={styles.kindPill}>
                <MaterialCommunityIcons name={k.icon} size={14} color={k.color} />
                <Text style={[styles.kindAmount, { color: k.color }]}>
                  {formatInr(value)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,104,0,0.28)',
    padding: 16,
    marginBottom: 22,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
    color: '#fff',
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  yearRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  yearChipOn: {
    backgroundColor: colors.orangeSoft,
    borderColor: colors.orange,
  },
  yearChipText: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    color: colors.muted,
  },
  yearChipTextOn: { color: colors.orange },
  yearSolo: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
    color: colors.orange,
    marginBottom: 6,
  },
  amount: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 32,
    color: '#fff',
    letterSpacing: 0.3,
  },
  meta: {
    marginTop: 4,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  kindAmount: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 11,
  },
});
