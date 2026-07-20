import { Alert } from 'react-native';

type Nav = { push: (href: string) => void };

/** Prompt sign-in when a guest tries to use the account-only wallet. */
export function promptWalletSignIn(router: Nav): void {
  Alert.alert(
    'Sign in required',
    'Passes are saved to your Google account. Sign in to add or view your wallet.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign in', onPress: () => router.push('/login') },
    ]
  );
}
