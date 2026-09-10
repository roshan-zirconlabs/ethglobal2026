/**
 * Wallet identity + guardian — the local mirror of the ENS-backed identity.
 *
 * The authoritative copies live on ENS (the claimed subname, and the recovery
 * guardian stored as a text record the name owns). This module caches them
 * locally for fast display and records what the user has claimed/set, so the UI
 * doesn't hit the chain on every render. Recovery still READS the guardian back
 * from ENS at the moment it matters — this is only a cache.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const IDENTITY_KEY = 'notwallet.identity.v1';

export type WalletIdentity = {
  /** The claimed ENS subname, e.g. "alice.notwallet.eth". */
  ensName: string | null;
  /** Recovery guardian address (also written to ENS as a text record). */
  guardianAddress: string | null;
  /** Guardian's own ENS name, if it has one (for display/confirmation). */
  guardianEns: string | null;
};

export const EMPTY_IDENTITY: WalletIdentity = {
  ensName: null,
  guardianAddress: null,
  guardianEns: null,
};

export async function loadIdentity(): Promise<WalletIdentity> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    if (!raw) return { ...EMPTY_IDENTITY };
    return { ...EMPTY_IDENTITY, ...(JSON.parse(raw) as Partial<WalletIdentity>) };
  } catch {
    return { ...EMPTY_IDENTITY };
  }
}

export async function saveIdentity(identity: WalletIdentity): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}
