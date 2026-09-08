/**
 * Wallet persistence — multi-card support + recovery address.
 *
 * We store ONLY public identities (address, public key, label) plus a hash
 * of the card UID (for identification, NOT the raw UID). We NEVER store the
 * password, private key, or raw card UID.
 *
 * Signing always re-derives from (password + card + device secret), so nothing
 * sensitive is ever at rest on the device.
 */
import * as SecureStore from 'expo-secure-store';
import { sha256, toUtf8Bytes } from 'ethers';

const WALLET_KEY = 'notwallet.wallet.v2';

export type StoredCard = {
  /** User-assigned label: "Blue transit card", "Gym card", etc. */
  cardLabel: string;
  /** SHA256 of the card UID — for identification, NOT the raw UID */
  cardUidHash: string;
  /** The derived Ethereum address for this card + password + device secret */
  address: string;
  /** The uncompressed public key */
  publicKey: string;
};

export type StoredWallet = {
  /** All registered cards and their derived accounts */
  cards: StoredCard[];
  /** Index of the currently active card */
  activeIndex: number;
};

// Legacy key for migration
const LEGACY_KEY = 'notwallet.account.v1';

/**
 * Hash a card UID for storage. We never store the raw UID.
 */
export function hashCardUid(cardId: string): string {
  return sha256(toUtf8Bytes(`notwallet-card-uid:${cardId}`));
}

/**
 * Save a wallet with its cards.
 */
export async function saveWallet(wallet: StoredWallet): Promise<void> {
  await SecureStore.setItemAsync(WALLET_KEY, JSON.stringify(wallet));
}

/**
 * Load the stored wallet, migrating from v1 format if needed.
 */
export async function loadWallet(): Promise<StoredWallet | null> {
  try {
    // Try v2 format first
    const raw = await SecureStore.getItemAsync(WALLET_KEY);
    if (raw) return JSON.parse(raw) as StoredWallet;

    // Try migrating from v1 (legacy single-account format)
    const legacyRaw = await SecureStore.getItemAsync(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as {
        address: string;
        publicKey: string;
        label: string;
      };
      const migrated: StoredWallet = {
        cards: [
          {
            cardLabel: legacy.label || 'NFC Card',
            cardUidHash: '', // Unknown for legacy accounts
            address: legacy.address,
            publicKey: legacy.publicKey,
          },
        ],
        activeIndex: 0,
      };
      await saveWallet(migrated);
      await SecureStore.deleteItemAsync(LEGACY_KEY);
      return migrated;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the active card/account.
 */
export async function getActiveAccount(): Promise<StoredCard | null> {
  const wallet = await loadWallet();
  if (!wallet || wallet.cards.length === 0) return null;
  return wallet.cards[wallet.activeIndex] ?? wallet.cards[0];
}

/**
 * Add a new card to the wallet.
 */
export async function addCard(card: StoredCard): Promise<void> {
  let wallet = await loadWallet();
  if (!wallet) {
    wallet = { cards: [], activeIndex: 0 };
  }

  // Check for duplicate card UID hash
  const existing = wallet.cards.findIndex(
    (c) => c.cardUidHash === card.cardUidHash && card.cardUidHash !== '',
  );
  if (existing >= 0) {
    // Update existing card's derived address (password may have changed)
    wallet.cards[existing] = card;
  } else {
    wallet.cards.push(card);
    // Auto-switch to the newly added card
    wallet.activeIndex = wallet.cards.length - 1;
  }

  await saveWallet(wallet);
}

/**
 * Remove a card from the wallet by index.
 */
export async function removeCard(index: number): Promise<void> {
  const wallet = await loadWallet();
  if (!wallet) return;

  wallet.cards.splice(index, 1);
  if (wallet.activeIndex >= wallet.cards.length) {
    wallet.activeIndex = Math.max(0, wallet.cards.length - 1);
  }

  await saveWallet(wallet);
}

/**
 * Set the active card index.
 */
export async function setActiveCard(index: number): Promise<void> {
  const wallet = await loadWallet();
  if (!wallet || index < 0 || index >= wallet.cards.length) return;
  wallet.activeIndex = index;
  await saveWallet(wallet);
}

/**
 * Find which card matches a derived address (for unlock-by-tap).
 * Returns the card index, or -1 if no match.
 */
export function findCardByAddress(
  wallet: StoredWallet,
  address: string,
): number {
  return wallet.cards.findIndex(
    (c) => c.address.toLowerCase() === address.toLowerCase(),
  );
}

/**
 * Clear all wallet data.
 */
export async function clearWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(WALLET_KEY);
  await SecureStore.deleteItemAsync(LEGACY_KEY);
}

// ---- Backward-compatible exports for existing code ----

export type StoredAccount = {
  address: string;
  publicKey: string;
  label: string;
};

export async function saveAccount(account: StoredAccount): Promise<void> {
  await addCard({
    cardLabel: account.label,
    cardUidHash: '',
    address: account.address,
    publicKey: account.publicKey,
  });
}

export async function loadAccount(): Promise<StoredAccount | null> {
  const card = await getActiveAccount();
  if (!card) return null;
  return {
    address: card.address,
    publicKey: card.publicKey,
    label: card.cardLabel,
  };
}

export async function clearAccount(): Promise<void> {
  await clearWallet();
}
