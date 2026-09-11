/**
 * Local transaction history. We record every transaction the app broadcasts —
 * there's no indexer (The Graph was dropped), so this is the honest source for
 * "what have I done". Keyed globally; each entry notes which of your wallets
 * (main or sub-wallet) sent it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'notwallet.history.v1';
const MAX = 50;

export type TxKind = 'send' | 'fund' | 'mint' | 'contract' | 'ens' | 'revoke';

export type TxRecord = {
  hash: string;
  kind: TxKind;
  /** One-line human summary, e.g. "Sent 0.1 ETH" or "Funded bnb 50 USDC". */
  title: string;
  /** The wallet that sent it. */
  fromAddress: string;
  toAddress?: string;
  timestamp: number;
};

export async function loadHistory(): Promise<TxRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TxRecord[]) : [];
  } catch {
    return [];
  }
}

export async function recordTx(entry: Omit<TxRecord, 'timestamp'>): Promise<TxRecord[]> {
  const list = await loadHistory();
  const next = [{ ...entry, timestamp: Date.now() }, ...list].slice(0, MAX);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** "3m ago", "2h ago", "5d ago". */
export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function explorerUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}
