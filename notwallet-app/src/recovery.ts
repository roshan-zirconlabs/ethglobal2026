/**
 * Emergency Recovery Vault — the "panic button" for compromised wallets.
 *
 * When the user suspects their key is compromised:
 * 1. Tap "Emergency Recover" in the app
 * 2. The app sweeps ALL ETH and tracked tokens to a pre-set recovery address
 * 3. Revokes all known token approvals
 * 4. The compromised wallet is now empty and useless to the attacker
 *
 * The recovery address is set ONCE at wallet creation and CANNOT be changed
 * (to prevent an attacker from changing it to their own address).
 */
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  parseEther,
  formatEther,
} from 'ethers';
import * as SecureStore from 'expo-secure-store';
import type { MfkdfSigner } from './mfkdf';

const RECOVERY_KEY = 'notwallet.recovery-address.v1';
const TRACKED_APPROVALS_KEY = 'notwallet.tracked-approvals.v1';
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

// Minimal ERC-20 ABI for sweep + revoke
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export type TrackedApproval = {
  tokenAddress: string;
  spenderAddress: string;
  tokenSymbol?: string;
};

// ---- Recovery Address Management ----

/**
 * Set the recovery address during wallet creation.
 * This is a one-time operation — once set, it cannot be changed.
 */
export async function setRecoveryAddress(address: string): Promise<void> {
  const existing = await getRecoveryAddress();
  if (existing) {
    throw new Error(
      'Recovery address is already set and cannot be changed. This is by design — it prevents an attacker from redirecting your funds.',
    );
  }
  await SecureStore.setItemAsync(RECOVERY_KEY, address);
}

/**
 * Get the stored recovery address.
 */
export async function getRecoveryAddress(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(RECOVERY_KEY);
  } catch {
    return null;
  }
}

/**
 * Check if a recovery address has been set.
 */
export async function hasRecoveryAddress(): Promise<boolean> {
  const addr = await getRecoveryAddress();
  return addr !== null && addr.length > 0;
}

// ---- Approval Tracking ----

/**
 * Track an approval so we can revoke it during emergency recovery.
 * Called after the user signs an approve() transaction.
 */
export async function trackApproval(approval: TrackedApproval): Promise<void> {
  const approvals = await getTrackedApprovals();
  // Deduplicate by token+spender
  const exists = approvals.some(
    (a) =>
      a.tokenAddress.toLowerCase() === approval.tokenAddress.toLowerCase() &&
      a.spenderAddress.toLowerCase() === approval.spenderAddress.toLowerCase(),
  );
  if (!exists) {
    approvals.push(approval);
    await SecureStore.setItemAsync(
      TRACKED_APPROVALS_KEY,
      JSON.stringify(approvals),
    );
  }
}

/**
 * Get all tracked approvals.
 */
export async function getTrackedApprovals(): Promise<TrackedApproval[]> {
  try {
    const raw = await SecureStore.getItemAsync(TRACKED_APPROVALS_KEY);
    return raw ? (JSON.parse(raw) as TrackedApproval[]) : [];
  } catch {
    return [];
  }
}

// ---- Emergency Recovery ----

export type RecoveryResult = {
  success: boolean;
  ethSwept: string;
  tokensSwept: number;
  approvalsRevoked: number;
  errors: string[];
};

/**
 * Execute emergency recovery:
 * 1. Sweep all ETH to recovery address
 * 2. Sweep all tracked token balances
 * 3. Revoke all known approvals
 *
 * @param signerOrKey - Either an MfkdfSigner instance or a private key hex string
 */
export async function executeEmergencyRecovery(
  signerOrKey: MfkdfSigner | string,
): Promise<RecoveryResult> {
  if (typeof signerOrKey !== 'string') {
    return signerOrKey.executeWithKey((key) => _executeRecoveryWithKey(key));
  }
  return _executeRecoveryWithKey(signerOrKey);
}

async function _executeRecoveryWithKey(privateKey: string): Promise<RecoveryResult> {
  const recoveryAddress = await getRecoveryAddress();
  if (!recoveryAddress) {
    return {
      success: false,
      ethSwept: '0',
      tokensSwept: 0,
      approvalsRevoked: 0,
      errors: ['No recovery address set. Set one in Settings first.'],
    };
  }

  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const wallet = new Wallet(privateKey, provider);
  const errors: string[] = [];
  let tokensSwept = 0;
  let approvalsRevoked = 0;

  // 1. Revoke all tracked approvals first (before sweeping funds for gas)
  const approvals = await getTrackedApprovals();
  for (const approval of approvals) {
    try {
      const token = new Contract(approval.tokenAddress, ERC20_ABI, wallet);
      const currentAllowance = await token.allowance(
        wallet.address,
        approval.spenderAddress,
      );
      if (currentAllowance > 0n) {
        const tx = await token.approve(approval.spenderAddress, 0);
        await tx.wait();
        approvalsRevoked++;
      }
    } catch (err) {
      errors.push(
        `Failed to revoke approval for ${approval.tokenSymbol ?? approval.tokenAddress}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 2. Sweep token balances (for tracked tokens)
  const seenTokens = new Set<string>();
  for (const approval of approvals) {
    const tokenAddr = approval.tokenAddress.toLowerCase();
    if (seenTokens.has(tokenAddr)) continue;
    seenTokens.add(tokenAddr);

    try {
      const token = new Contract(approval.tokenAddress, ERC20_ABI, wallet);
      const balance = await token.balanceOf(wallet.address);
      if (balance > 0n) {
        const tx = await token.transfer(recoveryAddress, balance);
        await tx.wait();
        tokensSwept++;
      }
    } catch (err) {
      errors.push(
        `Failed to sweep ${approval.tokenSymbol ?? approval.tokenAddress}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Sweep remaining ETH (leave enough for gas — estimate 21000 gas * current gas price)
  let ethSwept = '0';
  try {
    const balance = await provider.getBalance(wallet.address);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 20_000_000_000n; // fallback 20 gwei
    const gasReserve = gasPrice * 21_000n;

    if (balance > gasReserve) {
      const sendAmount = balance - gasReserve;
      const tx = await wallet.sendTransaction({
        to: recoveryAddress,
        value: sendAmount,
      });
      await tx.wait();
      ethSwept = formatEther(sendAmount);
    }
  } catch (err) {
    errors.push(
      `Failed to sweep ETH: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    success: errors.length === 0,
    ethSwept,
    tokensSwept,
    approvalsRevoked,
    errors,
  };
}

/**
 * Clear recovery data. Only used in "forget wallet" flow.
 */
export async function clearRecoveryData(): Promise<void> {
  await SecureStore.deleteItemAsync(RECOVERY_KEY);
  await SecureStore.deleteItemAsync(TRACKED_APPROVALS_KEY);
}
