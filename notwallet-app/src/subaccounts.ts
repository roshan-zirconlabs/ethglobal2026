/**
 * Sub-accounts (Money Envelopes) — human-readable compartmentalized accounts.
 *
 * Each sub-account is deterministically derived from the same (card + password + device secret)
 * using a unique label salt ('main', 'daily', 'savings', 'degen').
 *
 * This enables:
 * 1. Safe separation of funds (e.g. keeping 0.05 ETH in 'daily' for dapps, 5 ETH in 'savings')
 * 2. Binding to ENS child subnames (e.g. daily.you.notwallet.eth)
 * 3. Seedless recovery: the same card + password regenerates ALL envelopes deterministically!
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MfkdfSigner } from './mfkdf';

export type SubAccountPurpose = 'main' | 'daily' | 'savings' | 'degen';

export type SubAccount = {
  id: string;
  purpose: SubAccountPurpose;
  label: string;
  icon: string;
  description: string;
  address: string;
  publicKey: string;
  ensSubname?: string;
};

export const STANDARD_SUBACCOUNTS: {
  purpose: SubAccountPurpose;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    purpose: 'main',
    label: 'Primary Account',
    icon: '💎',
    description: 'Main wallet identity and primary funds',
  },
  {
    purpose: 'daily',
    label: 'Daily Spending',
    icon: '☕',
    description: 'Capped allowance envelope for coffee, mints & small txs',
  },
  {
    purpose: 'savings',
    label: 'Savings Vault',
    icon: '🏦',
    description: 'Long-term storage — separate from connected dapps',
  },
  {
    purpose: 'degen',
    label: 'Dapp Sandbox',
    icon: '⚡',
    description: 'Burner envelope for testing experimental contracts',
  },
];

const ACTIVE_SUBACCOUNT_KEY = 'notwallet.active_subaccount.v1';

/**
 * Derive all standard sub-accounts for the current user's factors.
 */
export async function deriveStandardSubaccounts(
  cardId: string,
  password: string,
  deviceSecret: string,
  parentEnsName?: string,
): Promise<SubAccount[]> {
  const accounts: SubAccount[] = [];

  for (const item of STANDARD_SUBACCOUNTS) {
    const signer = new MfkdfSigner(cardId, password, deviceSecret, item.purpose);
    const identity = await signer.getIdentity();

    const ensSubname = parentEnsName
      ? item.purpose === 'main'
        ? parentEnsName
        : `${item.purpose}.${parentEnsName}`
      : undefined;

    accounts.push({
      id: item.purpose,
      purpose: item.purpose,
      label: item.label,
      icon: item.icon,
      description: item.description,
      address: identity.address,
      publicKey: identity.publicKey,
      ensSubname,
    });
  }

  return accounts;
}

/**
 * Save currently selected subaccount ID.
 */
export async function setActiveSubaccountId(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_SUBACCOUNT_KEY, id);
}

/**
 * Get currently selected subaccount ID (defaults to 'main').
 */
export async function getActiveSubaccountId(): Promise<string> {
  return (await AsyncStorage.getItem(ACTIVE_SUBACCOUNT_KEY)) ?? 'main';
}
