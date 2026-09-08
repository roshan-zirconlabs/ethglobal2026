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
