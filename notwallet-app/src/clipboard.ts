/**
 * Clipboard access, in one place.
 *
 * Uses the Clipboard still shipped in React Native core. It's marked deprecated
 * (RN logs one warning when this module is imported) but the native module is
 * part of core, so it works in the current dev build with NO native rebuild.
 *
 * Migration note: when the app next needs a native rebuild anyway (e.g. adding
 * World ID / quick-crypto), install `expo-clipboard` and swap the two lines
 * below — every caller goes through `copyToClipboard`, so nothing else changes.
 */
import { Clipboard } from 'react-native';

/** Copy text to the system clipboard. Returns false if the platform refused. */
export function copyToClipboard(text: string): boolean {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
