/**
 * Transaction monitor — detects unauthorized activity on the wallet.
 *
 * Polls the wallet's nonce and balance every N seconds. If the nonce increases
 * without the app initiating a transaction, it means someone used the private
 * key from another device — trigger an alert.
 *
 * This is the critical "key compromise detection" layer. Combined with the
 * emergency recovery vault, the user can be alerted and sweep funds before
 * the attacker drains everything.
 */
import { JsonRpcProvider, formatEther } from 'ethers';
import * as Notifications from 'expo-notifications';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const POLL_INTERVAL_MS = 30_000; // 30 seconds

// Track what we know — persisted in memory (reset on app restart)
let lastKnownNonce = -1;
let lastKnownBalance = -1n;
let localTxCount = 0; // How many tx we initiated from THIS app
let pollTimer: ReturnType<typeof setInterval> | null = null;
let monitoredAddress: string | null = null;

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

/**
 * Start monitoring an address for unauthorized transactions.
 */
export async function startMonitoring(address: string): Promise<void> {
  stopMonitoring(); // Clean up any existing monitor

  monitoredAddress = address;
  localTxCount = 0;

  // Initialize with current values
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  try {
    lastKnownNonce = await provider.getTransactionCount(address);
    lastKnownBalance = (await provider.getBalance(address));
  } catch {
    lastKnownNonce = -1;
    lastKnownBalance = -1n;
  }

  // Request notification permissions
  await Notifications.requestPermissionsAsync();

  // Start polling
  pollTimer = setInterval(() => pollForChanges(), POLL_INTERVAL_MS);
}

/**
 * Stop monitoring.
 */
export function stopMonitoring(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  monitoredAddress = null;
}

/**
 * Call this when the app successfully signs and broadcasts a transaction.
 * Increments the local tx counter so the monitor doesn't flag it as unauthorized.
 */
export function recordLocalTransaction(): void {
  localTxCount++;
}

/**
 * Poll for nonce/balance changes.
 */
async function pollForChanges(): Promise<void> {
  if (!monitoredAddress) return;

  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  try {
    const currentNonce = await provider.getTransactionCount(monitoredAddress);
    const currentBalance = await provider.getBalance(monitoredAddress);

    // Detect unauthorized nonce increase
    if (lastKnownNonce >= 0 && currentNonce > lastKnownNonce) {
      const nonceIncrease = currentNonce - lastKnownNonce;

      if (nonceIncrease > localTxCount) {
        // Nonce increased more than the number of transactions we sent
        // → Someone else is using this private key
        const unauthorizedTxCount = nonceIncrease - localTxCount;
        await sendUnauthorizedAlert(unauthorizedTxCount, currentBalance);
      }

      // Reset local counter
      localTxCount = Math.max(0, localTxCount - nonceIncrease);
    }

    // Detect unexpected balance decrease
    if (lastKnownBalance >= 0n && currentBalance < lastKnownBalance) {
      const decrease = lastKnownBalance - currentBalance;
      const decreasePercent =
        lastKnownBalance > 0n
          ? Number((decrease * 100n) / lastKnownBalance)
          : 0;

      // Only alert on significant drops (> 5%) that weren't our own transactions
      if (decreasePercent > 5 && localTxCount === 0) {
        await sendBalanceDropAlert(decrease, decreasePercent, currentBalance);
      }
    }

    // Update tracked values
    lastKnownNonce = currentNonce;
    lastKnownBalance = currentBalance;
  } catch {
    // Network error — skip this poll cycle, try again next time
  }
}

async function sendUnauthorizedAlert(
  txCount: number,
  currentBalance: bigint,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ UNAUTHORIZED ACTIVITY DETECTED',
      body: `${txCount} transaction(s) were sent from your wallet WITHOUT your authorization. Your balance is now ${formatEther(currentBalance)} ETH. Open NotWallet immediately to recover your funds.`,
      data: { type: 'unauthorized', address: monitoredAddress },
      sound: true,
      priority: 'max' as any,
    },
    trigger: null, // Immediate
  });
}

async function sendBalanceDropAlert(
  decrease: bigint,
  percent: number,
  currentBalance: bigint,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📉 Balance dropped ${percent}%`,
      body: `Your balance decreased by ${formatEther(decrease)} ETH. Current: ${formatEther(currentBalance)} ETH. If this wasn't you, tap to open NotWallet and recover.`,
      data: { type: 'balance_drop', address: monitoredAddress },
      sound: true,
    },
    trigger: null,
  });
}

/**
 * Send a spending awareness notification after the user's own transaction.
 */
export async function sendSpendingNotification(
  percentUsed: number,
  message: string,
): Promise<void> {
  if (percentUsed >= 80) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📊 ${percentUsed}% of daily limit used`,
        body: message,
        data: { type: 'spending_awareness' },
      },
      trigger: null,
    });
  }
}
