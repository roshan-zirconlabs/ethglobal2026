/**
 * Daily spending tracker — tracks cumulative spending per account per day.
 * Used by the policy engine to enforce daily limits and by the notification
 * system to show spending awareness messages.
 *
 * Data is stored in AsyncStorage (not SecureStore — spending data is not secret,
 * and AsyncStorage has no size limits).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'notwallet.spending.';

function todayKey(address: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `${PREFIX}${address.toLowerCase()}.${date}`;
}

/**
 * Record a spend for a given account.
 * Adds the amount to today's cumulative total.
 */
export async function recordSpend(
  address: string,
  amountWei: bigint,
): Promise<void> {
  const key = todayKey(address);
  const current = await getTodaySpent(address);
  const newTotal = current + amountWei;
  await AsyncStorage.setItem(key, newTotal.toString());
}

/**
 * Get the cumulative spending for today (UTC) for a given account.
 */
export async function getTodaySpent(address: string): Promise<bigint> {
  try {
    const key = todayKey(address);
    const raw = await AsyncStorage.getItem(key);
    return raw ? BigInt(raw) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Reset today's spending counter for an account.
 * Called when the user manually overrides a policy.
 */
export async function resetTodaySpend(address: string): Promise<void> {
  const key = todayKey(address);
  await AsyncStorage.removeItem(key);
}

/**
 * Clean up old spending records (older than 7 days).
 * Call periodically to prevent AsyncStorage from growing unbounded.
 */
export async function cleanupOldRecords(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const spendingKeys = allKeys.filter((k) => k.startsWith(PREFIX));

    // Calculate the cutoff date (7 days ago)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const keysToRemove = spendingKeys.filter((key) => {
      // Extract the date from the key: PREFIX + address + .YYYY-MM-DD
      const datePart = key.slice(key.lastIndexOf('.') + 1);
      return datePart < cutoffStr;
    });

    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // Cleanup is best-effort — don't crash the app
  }
}
