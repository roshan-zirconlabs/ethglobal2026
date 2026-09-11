/**
 * Agent sub-accounts — the point of the product.
 *
 * An agent is a named, budgeted, revocable account you hand to something you
 * don't fully trust (an AI agent, a bot, a dapp, a person):
 *
 *     bnb.alice.notwallet.eth  →  its own EOA  →  funded with exactly 50 USDC
 *
 * Three properties make this safe, and each is enforced by a different layer:
 *
 *  1. ISOLATION (cryptographic). Every agent is a *separate* EOA, derived by
 *     MFKDF from the same password + card but salted with the agent's full ENS
 *     name. Compromising an agent's key exposes only that agent's balance —
 *     never the main account, never its siblings.
 *
 *  2. BUDGET (economic, and the only real on-chain guarantee). An EOA can only
 *     ever spend what it holds, so **the budget IS the balance**. Funding an
 *     agent with 50 USDC caps it at 50 USDC no matter what it's told to do.
 *     `budgetUsd` below records what you INTENDED to allocate; the balance is
 *     the truth. We never claim an on-chain allowance we don't have.
 *
 *  3. REVOCATION (naming). Revoking unregisters the ENSv2 subname and sweeps
 *     the remaining balance home. The name stops resolving; anything that
 *     addressed the agent by name can no longer reach it.
 *
 * Nothing secret is stored here — only public addresses and your own budget
 * bookkeeping. Every agent key is re-derivable on any device from password +
 * card + the agent's name, so agents survive losing the phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { MfkdfSigner } from './mfkdf';

const AGENTS_KEY = 'notwallet.agents.v1';

export type Agent = {
  /** The leaf label, e.g. "bnb". */
  label: string;
  /** Full ENS name, e.g. "bnb.alice.notwallet.eth" — also the derivation salt. */
  fullName: string;
  /** The agent's own EOA address. */
  address: string;
  /** Free-text chain/venue this agent is meant for (display only). */
  chain: string;
  /** Budget the user intended to allocate, in USD. The balance is the truth. */
  budgetUsd: number;
  /** What this agent is for. */
  note?: string;
  createdAt: number;
  /** True once the subname is registered on-chain (resolves via ENS). */
  ensRegistered?: boolean;
  /** Set once the subname has been unregistered and funds swept. */
  revokedAt?: number;
};

/**
 * The MFKDF derivation label for an agent. Using the FULL ENS name means the
 * key is bound to the name: same name ⇒ same key on any device, and two agents
 * can never collide.
 */
export function agentDerivationLabel(fullName: string): string {
  return `agent:${fullName.toLowerCase()}`;
}

/** Derive an agent's EOA. Requires the user's two factors — nothing is stored. */
export async function deriveAgentAddress(
  cardId: string,
  password: string,
  fullName: string,
): Promise<{ address: string; publicKey: string }> {
  const signer = new MfkdfSigner(cardId, password, agentDerivationLabel(fullName));
  const identity = await signer.getIdentity();
  return { address: identity.address, publicKey: identity.publicKey };
}

/** A signer for the agent itself (used to spend FROM the agent, or sweep it). */
export function agentSigner(cardId: string, password: string, fullName: string): MfkdfSigner {
  return new MfkdfSigner(cardId, password, agentDerivationLabel(fullName));
}

/** Labels must be a valid single ENS label. */
export function normalizeLabel(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export async function loadAgents(): Promise<Agent[]> {
  try {
    const raw = await AsyncStorage.getItem(AGENTS_KEY);
    return raw ? (JSON.parse(raw) as Agent[]) : [];
  } catch {
    return [];
  }
}

export async function saveAgents(agents: Agent[]): Promise<void> {
  await AsyncStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
}

export async function upsertAgent(agent: Agent): Promise<Agent[]> {
  const agents = await loadAgents();
  const i = agents.findIndex((a) => a.fullName.toLowerCase() === agent.fullName.toLowerCase());
  if (i >= 0) agents[i] = agent;
  else agents.push(agent);
  await saveAgents(agents);
  return agents;
}

export async function markAgentRevoked(fullName: string): Promise<Agent[]> {
  const agents = await loadAgents();
  const i = agents.findIndex((a) => a.fullName.toLowerCase() === fullName.toLowerCase());
  if (i >= 0) agents[i] = { ...agents[i], revokedAt: Date.now() };
  await saveAgents(agents);
  return agents;
}

/** Active (non-revoked) agents. */
export function activeAgents(agents: Agent[]): Agent[] {
  return agents.filter((a) => !a.revokedAt);
}

/**
 * A selectable wallet — the main account or any active sub-wallet. This is the
 * unit the account switcher and the WalletConnect picker operate on. Signing
 * derives the right key from `agentFullName` (undefined ⇒ the main account).
 */
export type WalletAccount = {
  kind: 'main' | 'agent';
  address: string;
  /** Short label: "Main" or the sub-wallet's leaf label ("bnb"). */
  label: string;
  /** ENS name if known (the identity name, or the agent's full subname). */
  ensName: string | null;
  /** For sub-wallets: the MFKDF derivation salt = the full name. */
  agentFullName?: string;
  /** Extra context for sub-wallets. */
  chain?: string;
  budgetUsd?: number;
};

/** The full selectable account list: main first, then active sub-wallets. */
export function buildAccounts(
  main: { address: string } | null,
  mainEns: string | null,
  agents: Agent[],
): WalletAccount[] {
  const list: WalletAccount[] = [];
  if (main) list.push({ kind: 'main', address: main.address, label: 'Main', ensName: mainEns });
  for (const a of activeAgents(agents)) {
    list.push({
      kind: 'agent',
      address: a.address,
      label: a.label,
      ensName: a.fullName,
      agentFullName: a.fullName,
      chain: a.chain,
      budgetUsd: a.budgetUsd,
    });
  }
  return list;
}

export function findAccount(accounts: WalletAccount[], address: string): WalletAccount | undefined {
  return accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
}

// ── Nesting (agents under agents: bot1.uni.roshan.notwallet.eth) ─────────────

/** The parent ENS name an agent lives under (its full name minus the leaf). */
export function agentParentName(fullName: string): string {
  return fullName.split('.').slice(1).join('.');
}

/** Direct children of a given parent name (identity name, or another agent). */
export function childrenOf(agents: Agent[], parentName: string): Agent[] {
  const key = parentName.toLowerCase();
  return activeAgents(agents).filter((a) => agentParentName(a.fullName).toLowerCase() === key);
}

/** Depth below the identity root (1 = direct sub-wallet, 2 = agent-under-agent…). */
export function agentDepth(fullName: string, identityName: string | null): number {
  if (!identityName) return 1;
  const suffix = `.${identityName.toLowerCase()}`;
  const lower = fullName.toLowerCase();
  if (!lower.endsWith(suffix)) return 1;
  const head = lower.slice(0, -suffix.length); // e.g. "bot1.uni"
  return head.split('.').length;
}

/** Patch a stored agent's editable metadata (budget / chain / note). */
export async function patchAgent(
  fullName: string,
  patch: Partial<Pick<Agent, 'budgetUsd' | 'chain' | 'note'>>,
): Promise<Agent[]> {
  const agents = await loadAgents();
  const i = agents.findIndex((a) => a.fullName.toLowerCase() === fullName.toLowerCase());
  if (i >= 0) agents[i] = { ...agents[i], ...patch };
  await saveAgents(agents);
  return agents;
}

/** Mark an agent's ENS name as registered on-chain. */
export async function patchAgentRegistered(fullName: string): Promise<Agent[]> {
  const agents = await loadAgents();
  const i = agents.findIndex((a) => a.fullName.toLowerCase() === fullName.toLowerCase());
  if (i >= 0) agents[i] = { ...agents[i], ensRegistered: true };
  await saveAgents(agents);
  return agents;
}
