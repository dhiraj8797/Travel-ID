import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TicketPass } from '../../src/components/TicketDetail';
import { useTickets } from '../../src/context/TicketContext';
import { colors, spacing } from '../../src/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTicket, deleteTicket, updateTicket } = useTickets();
  const ticket = getTicket(String(id));

  if (!ticket) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Ticket not found</Text>
      </View>
    );
  }

  const nextKind =
    ticket.kind === 'bus' ? 'rail' : ticket.kind === 'rail' ? 'flight' : 'bus';
  const nextLabel =
    ticket.kind === 'bus' ? 'Train' : ticket.kind === 'rail' ? 'Flight' : 'Bus';

  const openMenu = () => {
    Alert.alert('Pass options', undefined, [
      {
        text: `Switch to ${nextLabel} pass`,
        onPress: async () => {
          await updateTicket({
            ...ticket,
            kind: nextKind,
            title:
              nextKind === 'bus'
                ? ticket.operator && ticket.operator !== 'IRCTC'
                  ? ticket.operator
                  : 'Bus Pass'
                : nextKind === 'flight'
                  ? ticket.flightNumber || ticket.operator || 'Flight Pass'
                  : ticket.trainName || 'Train Pass',
          });
        },
      },
      {
        text: 'Remove from wallet',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Remove pass?', 'This deletes the ticket from your wallet.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                await deleteTicket(ticket.id);
                router.replace('/');
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TicketPass
          ticket={ticket}
          onBack={() => router.back()}
          onMenu={openMenu}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1A2E' },
  safe: { flex: 1 },
  missing: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  missingText: {
    fontFamily: 'Outfit_700Bold',
    fontSize: 20,
    color: '#fff',
  },
});
