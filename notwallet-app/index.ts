// World ID's Selfie Check needs Node crypto in RN. quick-crypto is a NATIVE
// module, so install() only works in a native build; the guard keeps the current
// dev client alive (World ID then falls back to the sandbox gate until you rebuild).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-quick-crypto').install();
} catch {
  // native module not present in this build yet — fine, World ID will fall back.
}

// WalletConnect React Native compatibility — MUST be first import.
import '@walletconnect/react-native-compat';

// Polyfills required for WalletConnect in React Native
import 'fast-text-encoding';

// MUST be before ethers: provides crypto.getRandomValues for key ops in RN.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
