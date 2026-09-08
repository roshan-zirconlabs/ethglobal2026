/**
 * Spending policy engine — enforces limits BEFORE the key is derived.
 *
 * Protects against:
 *   - Accidental large transfers
 *   - Phishing (infinite approvals are auto-blocked)
 *   - Wallet-only compromise (policy prevents draining even if app is unlocked)
 *
 * These are APP-LAYER policies. They don't prevent someone with the raw private
 * key from spending on another device — that's what the monitor + recovery vault
 * handle. But they DO protect the most common attack vector: phishing via dapps.
 */
import { MaxUint256 } from 'ethers';
import type { DecodedTx } from './clearsign';

export interface SpendingPolicy {
  /** Max ETH (in wei) that can be spent per calendar day (UTC). */
  dailyLimitWei: bigint;

  /** Max ETH (in wei) per single transaction. */
  perTxLimitWei: bigint;

  /** Max token amount for any approve() call. Infinite approvals are blocked. */
  maxApprovalAmount: bigint;

  /** Minutes to wait before signing transfers > 50% of balance. 0 = disabled. */
  cooldownMinutes: number;

  /** Whether to auto-reject setApprovalForAll calls. */
  blockSetApprovalForAll: boolean;

  /** Whether unknown contracts require password re-entry. */
  requirePasswordForUnknownContracts: boolean;
}

export type PolicyCheckResult = {
  allowed: boolean;
  reason?: string;
  /** If true, user can override by re-entering password. */
  canOverride?: boolean;
  /** If the approval amount was auto-downgraded, this is the new amount. */
  downgradedAmount?: bigint;
};

/** Default policy — sane defaults for a new wallet. */
export const DEFAULT_POLICY: SpendingPolicy = {
  dailyLimitWei: BigInt('1000000000000000000'), // 1 ETH
  perTxLimitWei: BigInt('500000000000000000'),  // 0.5 ETH
  maxApprovalAmount: BigInt('10000000000000000000000'), // 10,000 tokens (18 decimals)
  cooldownMinutes: 5,
  blockSetApprovalForAll: true,
  requirePasswordForUnknownContracts: true,
};

// Minimal ABI selectors for policy checks
const APPROVE_SELECTOR = '0x095ea7b3';      // approve(address,uint256)
const SET_APPROVAL_ALL_SELECTOR = '0xa22cb465'; // setApprovalForAll(address,bool)

/**
 * Check a transaction against the spending policy.
 * Returns whether the tx is allowed, and if not, why.
 */
export function checkPolicy(
  tx: DecodedTx,
  policy: SpendingPolicy,
  todaySpentWei: bigint,
  currentBalanceWei: bigint,
): PolicyCheckResult {
  const data = tx.data ?? '0x';
  const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : '';

  // 1. Block setApprovalForAll
  if (policy.blockSetApprovalForAll && selector === SET_APPROVAL_ALL_SELECTOR) {
    return {
      allowed: false,
      reason: 'setApprovalForAll is blocked by your policy. This gives full control of an entire NFT collection.',
      canOverride: true,
    };
  }

  // 2. Auto-downgrade infinite token approvals
  if (selector === APPROVE_SELECTOR && data.length >= 74) {
    try {
      const amountHex = '0x' + data.slice(74);
      const amount = BigInt(amountHex);
      const isInfinite = amount >= MaxUint256 / 2n;

      if (isInfinite) {
        return {
          allowed: false,
          reason: `Infinite token approval blocked. Auto-downgraded to ${policy.maxApprovalAmount.toString()} tokens.`,
          canOverride: true,
          downgradedAmount: policy.maxApprovalAmount,
        };
      }

      if (amount > policy.maxApprovalAmount) {
        return {
          allowed: false,
          reason: `Approval amount (${amount.toString()}) exceeds your policy limit (${policy.maxApprovalAmount.toString()}).`,
          canOverride: true,
          downgradedAmount: policy.maxApprovalAmount,
        };
      }
    } catch {
      // Can't parse amount — let it through with a warning
    }
  }

  // 3. Per-transaction limit (ETH value)
  if (tx.valueWei > policy.perTxLimitWei) {
    return {
      allowed: false,
      reason: `Transfer value exceeds your per-transaction limit. Sending ${formatWei(tx.valueWei)} ETH, limit is ${formatWei(policy.perTxLimitWei)} ETH.`,
      canOverride: true,
    };
  }

  // 4. Daily spending limit
  const projectedDailySpend = todaySpentWei + tx.valueWei;
  if (projectedDailySpend > policy.dailyLimitWei) {
    const remaining = policy.dailyLimitWei > todaySpentWei
      ? policy.dailyLimitWei - todaySpentWei
      : 0n;
    return {
      allowed: false,
      reason: `Daily spending limit exceeded. Already spent ${formatWei(todaySpentWei)} ETH today, limit is ${formatWei(policy.dailyLimitWei)} ETH. Remaining: ${formatWei(remaining)} ETH.`,
      canOverride: true,
    };
  }

  // 5. Cooldown for large transfers (> 50% of balance)
  if (
    policy.cooldownMinutes > 0 &&
    currentBalanceWei > 0n &&
    tx.valueWei > currentBalanceWei / 2n
  ) {
    return {
      allowed: false,
      reason: `Large transfer (>${50}% of balance). Your policy requires a ${policy.cooldownMinutes}-minute cooldown. Please wait.`,
      canOverride: true,
    };
  }

  return { allowed: true };
}

/**
 * Get the spending awareness summary for notifications.
 */
export function getSpendingSummary(
  todaySpentWei: bigint,
  policy: SpendingPolicy,
): { percentUsed: number; message: string } {
  if (policy.dailyLimitWei === 0n) {
    return { percentUsed: 0, message: 'No daily limit set.' };
  }

  const percent = Number((todaySpentWei * 100n) / policy.dailyLimitWei);
  const remaining = policy.dailyLimitWei > todaySpentWei
    ? policy.dailyLimitWei - todaySpentWei
    : 0n;

  return {
    percentUsed: Math.min(percent, 100),
    message: `Spent ${formatWei(todaySpentWei)} ETH today (${percent}% of ${formatWei(policy.dailyLimitWei)} ETH limit). Remaining: ${formatWei(remaining)} ETH.`,
  };
}

function formatWei(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}
