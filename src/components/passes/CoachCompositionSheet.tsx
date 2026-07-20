import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  berthTypeLabel,
  buildSeatLayout,
  coachColor,
  CoachSeatLayout,
  CoachUnit,
  parseCoachPosition,
} from '../../utils/coachComposition';

const BG = '#07111F';
const CARD = '#0C1729';
const CYAN = '#00D4FF';
const MUTED = '#94A3B8';

type Props = {
  visible: boolean;
  onClose: () => void;
  coachPosition?: string | null;
  trainNumber?: string;
  trainName?: string;
  highlightCoach?: string;
  highlightSeat?: string;
};

export function CoachCompositionSheet({
  visible,
  onClose,
  coachPosition,
  trainNumber,
  trainName,
  highlightCoach,
  highlightSeat,
}: Props) {
  const insets = useSafeAreaInsets();
  const coaches = useMemo(
    () => parseCoachPosition(coachPosition),
    [coachPosition]
  );
  const [selected, setSelected] = useState<CoachUnit | null>(null);

  const layout = useMemo(() => {
    if (!selected) return null;
    try {
      return buildSeatLayout(selected.code);
    } catch {
      return {
        code: selected.code,
        kind: selected.kind,
        title: selected.code,
        subtitle: 'Layout unavailable',
        total: 0,
        cells: [],
        style: 'none' as const,
      } satisfies CoachSeatLayout;
    }
  }, [selected]);

  const hi = (highlightCoach || '').toUpperCase();
  const hiSeat = Number(String(highlightSeat || '').replace(/\D/g, '')) || 0;

  const openCoach = (c: CoachUnit) => {
    if (c.hasLayout || c.kind === 'gen') {
      setSelected(c);
    }
  };

  const closeAll = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closeAll}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        {layout && selected ? (
          <SeatLayoutView
            layout={layout}
            highlightSeat={hiSeat}
            bottomPad={insets.bottom}
            onBack={() => setSelected(null)}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Pressable onPress={closeAll} hitSlop={10} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Coach position</Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {[trainNumber, trainName].filter(Boolean).join(' · ') || 'Train'}
                </Text>
              </View>
            </View>

            {!coaches.length ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Composition unavailable</Text>
                <Text style={styles.emptyText}>
                  RailRadar did not return coach order for this train yet.
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.hint}>
                  Engine → last coach · tap a coach for seat layout
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strip}
                >
                  {coaches.map((c, i) => {
                    const mine = hi && c.code === hi;
                    const color = coachColor(c.kind);
                    const tappable = c.hasLayout || c.kind === 'gen';
                    return (
                      <View key={`${c.code}-${c.position}`} style={styles.unitWrap}>
                        {i > 0 ? <View style={styles.coupler} /> : null}
                        <Pressable
                          style={[
                            styles.coachCard,
                            { borderColor: mine ? CYAN : color },
                            mine && styles.coachMine,
                            c.kind === 'engine' && styles.engineCard,
                          ]}
                          onPress={() => openCoach(c)}
                          disabled={!tappable}
                        >
                          {c.kind === 'engine' ? (
                            <MaterialCommunityIcons
                              name="train"
                              size={22}
                              color={color}
                            />
                          ) : (
                            <Text style={[styles.coachCode, { color }]}>
                              {c.code}
                            </Text>
                          )}
                          <Text style={styles.pos}>#{c.position}</Text>
                          <Text style={styles.kind} numberOfLines={1}>
                            {c.label}
                          </Text>
                          {mine ? (
                            <Text style={styles.yours}>YOUR COACH</Text>
                          ) : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.legend}>
                  <LegendDot color={coachColor('sleeper')} label="SL" />
                  <LegendDot color={coachColor('3a')} label="3A" />
                  <LegendDot color={coachColor('2a')} label="2A" />
                  <LegendDot color={coachColor('1a')} label="1A" />
                  <LegendDot color={coachColor('cc')} label="CC/EC" />
                  <LegendDot color={coachColor('gen')} label="GEN" />
                </View>

                <Text style={styles.listTitle}>
                  All coaches ({coaches.length})
                </Text>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                >
                  {coaches.map((c) => {
                    const mine = hi && c.code === hi;
                    const tappable = c.hasLayout || c.kind === 'gen';
                    return (
                      <Pressable
                        key={`row-${c.position}`}
                        style={[styles.row, mine && styles.rowMine]}
                        onPress={() => openCoach(c)}
                        disabled={!tappable}
                      >
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: coachColor(c.kind) },
                          ]}
                        />
                        <Text style={styles.rowPos}>{c.position}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowCode}>
                            {c.code}
                            {mine ? '  ·  your coach' : ''}
                          </Text>
                          <Text style={styles.rowKind}>{c.label}</Text>
                        </View>
                        {tappable ? (
                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={MUTED}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function SeatLayoutView({
  layout,
  highlightSeat,
  bottomPad,
  onBack,
}: {
  layout: CoachSeatLayout;
  highlightSeat: number;
  bottomPad: number;
  onBack: () => void;
}) {
  const bays = useMemo(() => {
    const map = new Map<number, CoachSeatLayout['cells']>();
    for (const cell of layout.cells || []) {
      const list = map.get(cell.bay) || [];
      list.push(cell);
      map.set(cell.bay, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [layout]);

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Coach {layout.code}</Text>
          <Text style={styles.sub}>{layout.subtitle}</Text>
        </View>
      </View>

      {layout.style === 'none' || !layout.cells.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No reserved seat map for this coach type.
          </Text>
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back to coaches</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 14,
            paddingBottom: bottomPad + 28,
          }}
        >
          <View style={styles.doorRow}>
            <Text style={styles.door}>DOOR</Text>
            <Text style={styles.aisleHint}>← aisle →</Text>
            <Text style={styles.door}>DOOR</Text>
          </View>
          {bays.map(([bay, cells]) => {
            const left = cells.filter((c) => c.side === 'left');
            const right = cells.filter((c) => c.side === 'right');
            const side = cells.filter((c) => c.side === 'side');
            return (
              <View key={bay} style={styles.bay}>
                <Text style={styles.bayLabel}>Bay {bay}</Text>
                <View style={styles.bayRow}>
                  <View style={styles.stack}>
                    {left.map((c) => (
                      <SeatChip
                        key={c.number}
                        cell={c}
                        highlight={c.number === highlightSeat}
                      />
                    ))}
                  </View>
                  <View style={styles.aisle} />
                  <View style={styles.stack}>
                    {right.map((c) => (
                      <SeatChip
                        key={c.number}
                        cell={c}
                        highlight={c.number === highlightSeat}
                      />
                    ))}
                  </View>
                  {side.length ? (
                    <View style={styles.sideStack}>
                      {side.map((c) => (
                        <SeatChip
                          key={c.number}
                          cell={c}
                          highlight={c.number === highlightSeat}
                          compact
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function SeatChip({
  cell,
  highlight,
  compact,
}: {
  cell: { number: number; type: string };
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.seat,
        compact && styles.seatCompact,
        highlight && styles.seatHi,
      ]}
    >
      <Text style={[styles.seatNo, highlight && styles.seatHiText]}>
        {cell.number}
      </Text>
      <Text style={[styles.seatType, highlight && styles.seatHiText]}>
        {berthTypeLabel(cell.type)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
  sub: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  hint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: MUTED,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  strip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  unitWrap: { flexDirection: 'row', alignItems: 'center' },
  coupler: {
    width: 8,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 2,
  },
  coachCard: {
    width: 64,
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
  engineCard: { width: 56, backgroundColor: 'rgba(255,138,80,0.12)' },
  coachMine: {
    backgroundColor: 'rgba(0,212,255,0.12)',
    borderWidth: 2,
  },
  coachCode: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 16,
  },
  pos: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 10,
    color: MUTED,
  },
  kind: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 9,
    color: MUTED,
    textAlign: 'center',
  },
  yours: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 7,
    color: CYAN,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: MUTED,
  },
  listTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  rowMine: {
    borderColor: CYAN,
    backgroundColor: 'rgba(0,212,255,0.08)',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowPos: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 14,
    color: MUTED,
    width: 28,
  },
  rowCode: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 15,
    color: '#fff',
  },
  rowKind: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 18,
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 16,
    backgroundColor: CYAN,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backBtnText: {
    fontFamily: 'Outfit_700Bold',
    color: '#041018',
  },
  doorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  door: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 10,
    color: MUTED,
    letterSpacing: 1,
  },
  aisleHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  bay: {
    marginBottom: 10,
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  bayLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 11,
    color: MUTED,
    marginBottom: 6,
  },
  bayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stack: { gap: 4, flex: 1 },
  aisle: {
    width: 10,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 4,
  },
  sideStack: { gap: 4, width: 72 },
  seat: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seatCompact: { paddingVertical: 5 },
  seatHi: {
    backgroundColor: 'rgba(0,212,255,0.25)',
    borderColor: CYAN,
  },
  seatNo: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    color: '#fff',
  },
  seatType: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 10,
    color: MUTED,
  },
  seatHiText: { color: CYAN },
});
