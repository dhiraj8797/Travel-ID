import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getMetroNetwork,
  MetroNetworkId,
  MetroStation,
  sortedStationList,
} from '../../metro';
import { colors, radii, spacing } from '../../theme';

type Props = {
  visible: boolean;
  title: string;
  networkId: MetroNetworkId;
  excludeId?: string;
  onClose: () => void;
  onSelect: (station: MetroStation) => void;
};

export function MetroStationPicker({
  visible,
  title,
  networkId,
  excludeId,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const network = getMetroNetwork(networkId);
  const lineColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of network.lines) map[line.id] = line.color;
    return map;
  }, [network]);

  const stations = useMemo(() => {
    const list = sortedStationList(network);
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.shortName?.toLowerCase().includes(q) ||
        s.id.includes(q)
      );
    });
  }, [network, query, excludeId]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {network.name} · {network.city} · {stations.length} stations
        </Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search station"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        <FlatList
          data={stations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                onSelect(item);
                onClose();
                setQuery('');
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <View style={styles.dots}>
                  {item.lines.map((lineId) => (
                    <View
                      key={lineId}
                      style={[
                        styles.dot,
                        { backgroundColor: lineColor[lineId] || colors.metro },
                      ]}
                    />
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '800',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 12,
    fontFamily: 'DMSans_400Regular',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 8,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Outfit_600SemiBold',
  },
  dots: { flexDirection: 'row', gap: 4, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
