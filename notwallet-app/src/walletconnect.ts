/**
 * WalletConnect v2 integration via Reown WalletKit.
 *
 * This replaces the old custom QR transport. Instead of showing/scanning our own
 * QR codes, we use the standard WalletConnect relay:
 *
 *   dapp shows WC QR → phone scans → encrypted session established
 *   dapp sends signing request → phone shows clear-signing review → card tap → result sent back
 *
 * Works with EVERY dapp that supports WalletConnect (Uniswap, OpenSea, Aave, etc.)
 */
import { Core } from '@walletconnect/core';
import { WalletKit } from '@reown/walletkit';
import type { WalletKitTypes } from '@reown/walletkit';

// ---- Configuration ----
// Get your project ID from https://cloud.reown.com
const PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID ?? '';

const METADATA = {
  name: 'NotWallet',
  description: 'Hardware wallet security for $0 — tap any NFC card to sign.',
  url: 'https://notwallet.xyz',
  icons: ['https://notwallet.xyz/icon.png'],
  redirect: {
    native: 'notwallet://',
    universal: undefined,
  },
};

// ---- Singleton ----
let walletKit: InstanceType<typeof WalletKit> | null = null;

export async function initWalletKit(): Promise<InstanceType<typeof WalletKit>> {
  if (walletKit) return walletKit;

  const core = new Core({ projectId: PROJECT_ID });

  walletKit = await WalletKit.init({
    core,
    metadata: METADATA,
  });

  return walletKit;
}

export function getWalletKit(): InstanceType<typeof WalletKit> | null {
  return walletKit;
}

// ---- Pairing ----

/**
 * Pair with a dapp by scanning its WalletConnect URI.
 * The URI looks like: wc:abc123...@2?relay-protocol=irn&symKey=xyz
 */
export async function pairWithDapp(uri: string): Promise<void> {
  const kit = await initWalletKit();
  await kit.pair({ uri });
}

// ---- Session Management ----

/**
 * Approve a session proposal. Called after the user sees "Dapp X wants to connect"
 * and taps "Connect".
 */
export async function approveSession(
  proposal: WalletKitTypes.SessionProposal,
  address: string,
  chainIds: number[] = [11155111], // Default: Sepolia
): Promise<void> {
  const kit = await initWalletKit();

  // Build the namespaces the wallet supports
  const namespaces: Record<string, { chains: string[]; accounts: string[]; methods: string[]; events: string[] }> = {};

  // EIP155 (Ethereum-compatible chains)
  const chains = chainIds.map((id) => `eip155:${id}`);
  const accounts = chainIds.map((id) => `eip155:${id}:${address}`);

  namespaces.eip155 = {
    chains,
    accounts,
    methods: [
      'eth_sendTransaction',
      'eth_signTransaction',
      'personal_sign',
      'eth_sign',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      'eth_signTypedData_v4',
    ],
    events: ['chainChanged', 'accountsChanged'],
  };

  await kit.approveSession({
    id: proposal.id,
    namespaces,
  });
}

/**
 * Reject a session proposal.
 */
export async function rejectSession(
  proposal: WalletKitTypes.SessionProposal,
): Promise<void> {
  const kit = await initWalletKit();
  await kit.rejectSession({
    id: proposal.id,
    reason: {
      code: 4001,
      message: 'User rejected the session',
    },
  });
}

/**
 * Respond to a session request with a successful result.
 */
export async function respondSuccess(
  topic: string,
  id: number,
  result: unknown,
): Promise<void> {
  const kit = await initWalletKit();
  await kit.respondSessionRequest({
    topic,
    response: {
      id,
      result,
      jsonrpc: '2.0',
    },
  });
}

/**
 * Respond to a session request with an error (user rejected, etc).
 */
export async function respondError(
  topic: string,
  id: number,
  message = 'User rejected the request',
): Promise<void> {
  const kit = await initWalletKit();
  await kit.respondSessionRequest({
    topic,
    response: {
      id,
      error: { code: 4001, message },
      jsonrpc: '2.0',
    },
  });
}

/**
 * Disconnect a connected dapp session.
 */
export async function disconnectSession(topic: string): Promise<void> {
  const kit = await initWalletKit();
  await kit.disconnectSession({
    topic,
    reason: {
      code: 6000,
      message: 'User disconnected',
    },
  });
}

/**
 * Get all active sessions.
 */
export async function getActiveSessions(): Promise<
  Record<string, WalletKitTypes.SessionRequest['topic'] & { peer: { metadata: { name: string; url: string; icons: string[] } } }>
> {
  const kit = await initWalletKit();
  return kit.getActiveSessions() as any;
}

/**
 * Register event handlers. Called once after init.
 */
export function onSessionProposal(
  handler: (proposal: WalletKitTypes.SessionProposal) => void,
): void {
  walletKit?.on('session_proposal', handler);
}

export function onSessionRequest(
  handler: (event: WalletKitTypes.SessionRequest) => void,
): void {
  walletKit?.on('session_request', handler);
}

export function onSessionDelete(
  handler: (event: { id: number; topic: string }) => void,
): void {
  walletKit?.on('session_delete', handler);
}

// ---- Helpers ----

/**
 * Convert a WalletConnect session_request into our KeyringRequest format
 * so it can be processed by the existing clear-signing + signing pipeline.
 */
export function wcRequestToKeyringRequest(
  event: WalletKitTypes.SessionRequest,
  accountAddress: string,
): { id: string; scope?: string; account: string; origin?: string; request: { method: string; params?: unknown } } {
  const { id, topic, params } = event;
  const { request, chainId } = params;

  return {
    id: `wc-${id}`,
    scope: chainId,
    account: accountAddress,
    origin: topic,
    request: {
      method: request.method,
      params: request.params,
    },
  };
}
