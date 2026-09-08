/**
 * Device-bound secret — the third factor in MFKDF key derivation.
 *
 * Generated once at wallet creation time and stored in the phone's secure
 * keystore (Android Keystore / iOS Secure Enclave) via expo-secure-store with
 * biometric authentication required for retrieval.
 *
 * Even if an attacker clones the NFC card UID, they cannot derive the private
 * key without this device-bound secret (and the password).
 *
 * This secret NEVER leaves the device. It is non-exportable by design.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'notwallet.device-secret.v1';

/**
 * Retrieve the existing device secret, or generate one if this is first setup.
 * Requires biometric authentication to access.
 */
export async function getOrCreateDeviceSecret(): Promise<string> {
  const existing = await getDeviceSecret();
  if (existing) return existing;

  // Generate 32 cryptographically secure random bytes (256-bit secret)
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await SecureStore.setItemAsync(KEY, hex, {
    requireAuthentication: true,
    authenticationPrompt: 'Authenticate to set up your wallet',
  });

  return hex;
}

/**
 * Retrieve the existing device secret. Returns null if not yet created.
 * Requires biometric authentication.
 */
export async function getDeviceSecret(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY, {
      requireAuthentication: true,
      authenticationPrompt: 'Authenticate to unlock your wallet',
    });
  } catch {
    return null;
  }
}

/**
 * Check if a device secret has been created (without requiring biometrics).
 * Used to determine if this is a first-time setup or returning user.
 */
export async function hasDeviceSecret(): Promise<boolean> {
  try {
    // Try without auth first — if requireAuthentication was set, this will
    // throw on some platforms, which is fine — it means the secret exists.
    const val = await SecureStore.getItemAsync(KEY);
    return val !== null;
  } catch {
    // On iOS, trying to read a biometric-protected key without auth throws.
    // The fact that it threw means the key exists.
    return true;
  }
}

/**
 * Delete the device secret. Used for "forget wallet" flow.
 * This makes the derived key permanently unrecoverable on this device.
 */
export async function clearDeviceSecret(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
