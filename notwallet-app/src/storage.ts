/**
 * Wallet persistence. We store ONLY the account's public identity (address,
 * public key, label) so the wallet survives app restarts and Home can show the
 * balance — like a normal phone wallet. We NEVER store the password or a private
 * key: signing always re-derives from (password + card), so nothing sensitive is
 * ever at rest on the device.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'notwallet.account.v1';

export type StoredAccount = {
  address: string;
  publicKey: string;
  label: string;
};

export async function saveAccount(account: StoredAccount): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(account));
}

export async function loadAccount(): Promise<StoredAccount | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as StoredAccount) : null;
  } catch {
    return null;
  }
}

export async function clearAccount(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
