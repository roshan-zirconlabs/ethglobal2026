/**
 * Clear-signing engine — the differentiator.
 *
 * Turns a raw transaction into (a) a plain-English sentence and (b) a list of
 * risk flags, shown to the user BEFORE the biometric approval. This is the thing
 * AirGap/Keystone don't do — they sign blind.
 *
 * v0 here is a deterministic rules pass (no network, fully offline, auditable).
 * An optional LLM pass (src/ai.ts, TODO) can enrich the summary; the rules pass
 * must always run and must be able to VETO on its own, so a compromised/misleading
 * LLM can never talk the user into approving. Rules > model for a security screen.
 */
import { Interface, formatEther, getAddress, MaxUint256 } from "ethers";

export interface DecodedTx {
  to: string | null;
  valueWei: bigint;
  data: string;
  chainId: number;
}

export type RiskLevel = "info" | "warn" | "danger";

export interface RiskFlag {
  level: RiskLevel;
  message: string;
}

export interface ClearSignResult {
  summary: string; // one plain-English sentence
  flags: RiskFlag[];
  worstLevel: RiskLevel;
}

// Minimal ABI for the calls that matter most for drain/scam patterns.
const erc20 = new Interface([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
]);

/** Addresses the user has paid before — supplied by the caller (persisted locally). */
export function clearSign(tx: DecodedTx, knownAddresses: Set<string>): ClearSignResult {
  const flags: RiskFlag[] = [];
  let summary = "Unrecognized transaction — review carefully on a block explorer.";

  const to = tx.to ? safeAddress(tx.to) : null;

  if (to === null) {
    flags.push({ level: "warn", message: "This deploys a contract (no recipient)." });
  } else if (isEmptyData(tx.data)) {
    summary = `Send ${formatEther(tx.valueWei)} ETH to ${short(to)}.`;
  } else {
    const parsed = tryParse(tx.data);
    if (parsed?.name === "approve") {
      const [spender, amount] = parsed.args as [string, bigint];
      const infinite = amount >= MaxUint256 / 2n;
      summary = infinite
        ? `Give ${short(spender)} UNLIMITED permission to spend your ${short(to)} tokens.`
        : `Allow ${short(spender)} to spend up to ${amount} of your ${short(to)} tokens.`;
      if (infinite)
        flags.push({ level: "danger", message: "Infinite token approval — a common drainer pattern." });
    } else if (parsed?.name === "setApprovalForAll") {
      const [op, approved] = parsed.args as [string, boolean];
      summary = approved
        ? `Give ${short(op)} control of ALL your NFTs in this collection.`
        : `Revoke ${short(op)}'s access to your NFTs.`;
      if (approved)
        flags.push({ level: "danger", message: "Grants control over an entire NFT collection." });
    } else if (parsed?.name === "transfer") {
      const [dest, amount] = parsed.args as [string, bigint];
      summary = `Transfer ${amount} tokens to ${short(dest)}.`;
    }
  }

  // Cross-cutting checks (apply regardless of call type).
  const counterparty = extractCounterparty(to, tx.data);
  if (counterparty && !knownAddresses.has(counterparty.toLowerCase())) {
    flags.push({ level: "warn", message: `New address you've never interacted with: ${short(counterparty)}.` });
  }
  // TODO: lookalike/poisoned-address check (compare prefix+suffix against known addrs).
  // TODO: chainId sanity (does it match the network the user thinks they're on?).

  return { summary, flags, worstLevel: worst(flags) };
}

function tryParse(data: string) {
  try {
    return erc20.parseTransaction({ data });
  } catch {
    return null;
  }
}
function isEmptyData(data: string) {
  return !data || data === "0x";
}
function safeAddress(a: string) {
  try {
    return getAddress(a);
  } catch {
    return a;
  }
}
function extractCounterparty(to: string | null, data: string): string | null {
  const parsed = tryParse(data);
  if (parsed && (parsed.name === "approve" || parsed.name === "setApprovalForAll")) {
    return parsed.args[0] as string;
  }
  if (parsed && parsed.name === "transfer") {
    return parsed.args[0] as string;
  }
  return to;
}
function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
function worst(flags: RiskFlag[]): RiskLevel {
  if (flags.some((f) => f.level === "danger")) return "danger";
  if (flags.some((f) => f.level === "warn")) return "warn";
  return "info";
}
