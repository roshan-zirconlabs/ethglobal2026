/**
 * User settings — the real, editable, persisted wallet configuration.
 *
 * This is the source of truth the Settings screen edits and the policy engine
 * reads. Nothing here is hardcoded at the UI layer anymore: limits, toggles and
 * the World ID gate all live here and survive restarts (AsyncStorage).
 *
 * `settingsToPolicy` adapts these human-friendly values (ETH floats, booleans)
 * into the wei-based SpendingPolicy that policies.ts::checkPolicy consumes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseEther } from 'ethers';

import { DEFAULT_POLICY, type SpendingPolicy } from './policies';

const SETTINGS_KEY = 'notwallet.settings.v1';

export type WalletSettings = {
  /** Max ETH per single transaction. */
  perTxLimitEth: number;
  /** Max ETH spent per calendar day (UTC). */
  dailyLimitEth: number;
  /** Block infinite/oversized ERC-20 approvals (downgrade prompt). */
  blockInfiniteApprovals: boolean;
  /** Auto-reject setApprovalForAll (whole-collection NFT grants). */
  blockSetApprovalForAll: boolean;
  /** Minutes to cool down before transfers > 50% of balance (0 = off). */
  cooldownMinutes: number;
  /** Require a World ID Selfie Check when creating the wallet (proof-of-personhood). */
  requireWorldIdOnSetup: boolean;
  /** Require a World ID Selfie Check before overriding a blocked policy. */
  requireWorldIdOnOverride: boolean;
  /** Require a World ID Selfie Check before the emergency sweep. */
  requireWorldIdOnSweep: boolean;
};

export const DEFAULT_SETTINGS: WalletSettings = {
  perTxLimitEth: 0.5,
  dailyLimitEth: 1,
  blockInfiniteApprovals: true,
  blockSetApprovalForAll: true,
  cooldownMinutes: 0,
  requireWorldIdOnSetup: true,
  requireWorldIdOnOverride: true,
  requireWorldIdOnSweep: true,
};

export async function loadSettings(): Promise<WalletSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<WalletSettings>;
    // Merge over defaults so new fields added later don't break old saves.
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: WalletSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Adapt human-friendly settings into the wei-based policy the engine uses. */
export function settingsToPolicy(settings: WalletSettings): SpendingPolicy {
  // 0 / blank / invalid means "no limit" — a ceiling the engine never trips.
  const NO_LIMIT = 1n << 200n;
  const toWei = (eth: number) => {
    if (!Number.isFinite(eth) || eth <= 0) return NO_LIMIT;
    // parseEther needs a string; clamp to 18 decimals to avoid overflow.
    return parseEther(eth.toFixed(18).replace(/0+$/, '').replace(/\.$/, ''));
  };
  return {
    ...DEFAULT_POLICY,
    perTxLimitWei: toWei(settings.perTxLimitEth),
    dailyLimitWei: toWei(settings.dailyLimitEth),
    blockSetApprovalForAll: settings.blockSetApprovalForAll,
    // When infinite-approval blocking is off, raise the ceiling out of the way.
    maxApprovalAmount: settings.blockInfiniteApprovals
      ? DEFAULT_POLICY.maxApprovalAmount
      : (1n << 255n),
    cooldownMinutes: settings.cooldownMinutes,
  };
}
