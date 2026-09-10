/**
 * ENS integration — the identity layer of NotWallet. Two concerns, two networks:
 *
 *  A. IDENTITY RESOLUTION (mainnet, read-only) — used in clear-signing to answer
 *     "who is this address, really?". Reverse-resolves the counterparty, then
 *     FORWARD-verifies (name → address must match) to catch impersonation. ENS
 *     reverse records overwhelmingly live on L1 mainnet, so we resolve there even
 *     though funds move on Sepolia. This is load-bearing: the Review screen's
 *     anti-impersonation flag is driven entirely by this.
 *
 *  B. WALLET IDENTITY + RECOVERY POINTER (Sepolia, write) — the user claims a
 *     NotWallet subname and stores their recovery guardian as an ENS *text record*
 *     the name owns. Recovery then READS that pointer back from ENS. ENS is the
 *     source of truth for the recovery target — not a cosmetic label.
 *
 * HONEST BOUNDARY: ENS names, organizes, and points; it never moves funds or
 * enforces a cap. The wallet/recovery layer does that.
 */
import {
  Interface,
  JsonRpcProvider,
  getAddress,
  id as keccakId,
  namehash,
} from 'ethers';

// Funds + subname writes happen on Sepolia; identity resolution on mainnet.
const SEPOLIA_RPC = process.env.EXPO_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const MAINNET_RPC = process.env.EXPO_PUBLIC_MAINNET_RPC || 'https://ethereum-rpc.publicnode.com';

// The parent name NotWallet issues identities under. Owned by the app's registrar
// on Sepolia. Configure both together (name is used for display, node for calls).
export const ENS_PARENT_NAME = process.env.EXPO_PUBLIC_ENS_PARENT_NAME || 'notwallet.eth';
export const ENS_PARENT_NODE =
  process.env.EXPO_PUBLIC_ENS_PARENT_NODE || namehash(ENS_PARENT_NAME);

/** Text-record key under which we store the recovery guardian pointer. */
export const RECOVERY_RECORD_KEY = 'notwallet.recovery';

export type ResolvedIdentity = {
  /** The ENS name, or null if none is set. */
  name: string | null;
  /** Whether forward resolution matches (name → address → confirmed). */
  verified: boolean;
  /** Name exists but forward resolution doesn't match — likely impersonation. */
  impersonation: boolean;
  /** Display string for the clear-signing screen. */
  display: string;
};

const nameCache = new Map<string, ResolvedIdentity>();

function mainnet(): JsonRpcProvider {
  return new JsonRpcProvider(MAINNET_RPC);
}
function sepolia(): JsonRpcProvider {
  return new JsonRpcProvider(SEPOLIA_RPC);
}

/**
 * Reverse-resolve an address to an ENS name (mainnet), then forward-verify.
 * A mismatch is flagged as impersonation — the anti-impersonation primitive.
 */
export async function resolveAddress(address: string): Promise<ResolvedIdentity> {
  const normalized = getAddress(address);
  const cacheKey = normalized.toLowerCase();
  const cached = nameCache.get(cacheKey);
  if (cached) return cached;

  const unresolved: ResolvedIdentity = {
    name: null,
    verified: false,
    impersonation: false,
    display: short(normalized),
  };

  try {
    const provider = mainnet();
    const name = await provider.lookupAddress(normalized);
    if (!name) {
      nameCache.set(cacheKey, unresolved);
      return unresolved;
    }

    // Forward check: the reverse record is only trustworthy if name → address
    // resolves back to the same address. Otherwise anyone could claim a name.
    const forward = await provider.resolveName(name);
    const matches = forward != null && forward.toLowerCase() === normalized.toLowerCase();

    const result: ResolvedIdentity = {
      name,
      verified: matches,
      impersonation: !matches,
      display: matches
        ? `${name} ✅ (${short(normalized)})`
        : `🚨 ${name} — UNVERIFIED (${short(normalized)})`,
    };
    nameCache.set(cacheKey, result);
    return result;
  } catch {
    nameCache.set(cacheKey, unresolved);
    return unresolved;
  }
}

/** Resolve many addresses at once (a tx can have several counterparties). */
export async function resolveAddresses(
  addresses: string[],
): Promise<Map<string, ResolvedIdentity>> {
  const results = new Map<string, ResolvedIdentity>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const resolved = await Promise.allSettled(
    unique.map(async (addr) => ({ addr, identity: await resolveAddress(addr) })),
  );
  for (const r of resolved) {
    if (r.status === 'fulfilled') results.set(r.value.addr, r.value.identity);
  }
  return results;
}

/**
 * Forward-resolve a name the user typed (e.g. a guardian's ENS) to an address.
 * Returns null if it doesn't resolve. Tries mainnet first, then Sepolia.
 */
export async function resolveName(name: string): Promise<string | null> {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed.endsWith('.eth')) return null;
  for (const provider of [mainnet(), sepolia()]) {
    try {
      const addr = await provider.resolveName(trimmed);
      if (addr) return getAddress(addr);
    } catch {
      /* try next */
    }
  }
  return null;
}

export function clearNameCache(): void {
  nameCache.clear();
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// ── ENS write layer (Sepolia): subname issuance + resolver records ────────────

// ENSv2 / registry addresses (Sepolia). Override via env for a custom registrar.
export const SEPOLIA_ENS_REGISTRY =
  process.env.EXPO_PUBLIC_ENS_REGISTRY || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
export const SEPOLIA_PUBLIC_RESOLVER =
  process.env.EXPO_PUBLIC_ENS_RESOLVER || '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD';

export const ENS_REGISTRY_ABI = [
  'function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external',
  'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32)',
  'function owner(bytes32 node) external view returns (address)',
];

export const ENS_RESOLVER_ABI = [
  'function setText(bytes32 node, string key, string value) external',
  'function text(bytes32 node, string key) external view returns (string)',
  'function setAddr(bytes32 node, address a) external',
  'function addr(bytes32 node) external view returns (address)',
];

/** keccak256 of a single label ("alice") — the labelhash used by the registry. */
export function labelHash(label: string): string {
  return keccakId(label);
}

/** Full namehash of `label.parent` (the node of the subname we're minting). */
export function subnameNode(label: string, parentName: string = ENS_PARENT_NAME): string {
  return namehash(`${label}.${parentName}`);
}

/** Build the tx that creates `label.parent` owned by `owner`. */
export function buildSubnodeRecordTx(
  parentNode: string,
  labelHashHex: string,
  ownerAddress: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_REGISTRY_ABI);
  const data = iface.encodeFunctionData('setSubnodeRecord', [
    parentNode,
    labelHashHex,
    ownerAddress,
    resolverAddress,
    0n,
  ]);
  return { to: SEPOLIA_ENS_REGISTRY, data, value: 0n };
}

/** Build the tx that sets a text record (e.g. the recovery pointer) on a node. */
export function buildSetTextRecordTx(
  node: string,
  key: string,
  value: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_RESOLVER_ABI);
  const data = iface.encodeFunctionData('setText', [node, key, value]);
  return { to: resolverAddress, data, value: 0n };
}

/** Build the tx that points a subname at an address record. */
export function buildSetAddrTx(
  node: string,
  targetAddress: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_RESOLVER_ABI);
  const data = iface.encodeFunctionData('setAddr', [node, targetAddress]);
  return { to: resolverAddress, data, value: 0n };
}

/**
 * Read a text record straight off the resolver (Sepolia). Used by recovery to
 * pull the guardian pointer back out of ENS.
 */
export async function readTextRecord(
  node: string,
  key: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
): Promise<string | null> {
  try {
    const iface = new Interface(ENS_RESOLVER_ABI);
    const data = iface.encodeFunctionData('text', [node, key]);
    const raw = await sepolia().call({ to: resolverAddress, data });
    const [value] = iface.decodeFunctionResult('text', raw);
    return value && value.length > 0 ? (value as string) : null;
  } catch {
    return null;
  }
}

/** Read the on-chain owner of a node (Sepolia) — used to check if a name is free. */
export async function readNodeOwner(node: string): Promise<string | null> {
  try {
    const iface = new Interface(ENS_REGISTRY_ABI);
    const data = iface.encodeFunctionData('owner', [node]);
    const raw = await sepolia().call({ to: SEPOLIA_ENS_REGISTRY, data });
    const [owner] = iface.decodeFunctionResult('owner', raw);
    const addr = owner as string;
    return addr && addr !== '0x0000000000000000000000000000000000000000' ? getAddress(addr) : null;
  } catch {
    return null;
  }
}
