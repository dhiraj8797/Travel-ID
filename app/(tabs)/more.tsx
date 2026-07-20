import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsPanel } from '../../src/components/SettingsPanel';
import { StaticSceneBackground } from '../../src/components/StaticSceneBackground';
import { colors } from '../../src/theme';

/** 3-dot tab → Settings */
export default function MoreScreen() {
  return (
    <View style={styles.root}>
      <StaticSceneBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <SettingsPanel />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
