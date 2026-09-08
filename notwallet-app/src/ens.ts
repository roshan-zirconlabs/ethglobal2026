/**
 * ENSv2 integration — three layers of identity for NotWallet:
 *
 * 1. Address resolution: Resolve addresses to ENS names in clear-signing
 * 2. Identity verification: Forward-resolve to detect impersonation
 * 3. Subname registration: Users get `username.notwallet.eth` on Sepolia
 *
 * Uses ENSv2 on Sepolia via the Universal Resolver.
 * ethers v6.17+ handles ENSv2 routing automatically via lookupAddress/resolveName.
 */
import { Interface, JsonRpcProvider, getAddress } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

export type ResolvedIdentity = {
  /** The ENS name, or null if no name is set */
  name: string | null;
  /** Whether forward resolution matches (name → address → confirmed) */
  verified: boolean;
  /** If name exists but forward resolution doesn't match */
  impersonation: boolean;
  /** The display string for the clear-signing screen */
  display: string;
};

// In-memory cache for resolved names (per session)
const nameCache = new Map<string, ResolvedIdentity>();

/**
 * Resolve an address to an ENS name via ENSv2 Universal Resolver.
 * Includes forward-verification to detect impersonation attacks.
 *
 * Returns a ResolvedIdentity with the name, verification status, and
 * a display string suitable for the clear-signing screen.
 */
export async function resolveAddress(address: string): Promise<ResolvedIdentity> {
  const normalizedAddress = getAddress(address);

  // Check cache first
  const cached = nameCache.get(normalizedAddress.toLowerCase());
  if (cached) return cached;

  const provider = new JsonRpcProvider(SEPOLIA_RPC);

  try {
    // Reverse resolution: address → name
    const name = await provider.lookupAddress(normalizedAddress);

    if (!name) {
      // No ENS name found
      const result: ResolvedIdentity = {
        name: null,
        verified: false,
        impersonation: false,
        display: short(normalizedAddress),
      };
      nameCache.set(normalizedAddress.toLowerCase(), result);
      return result;
    }

    // Forward verification: name → address (must match)
    // This prevents someone from setting a reverse record to "uniswap.eth"
    // without actually owning that name.
    const forwardAddress = await provider.resolveName(name);
    const matches =
      forwardAddress !== null &&
      forwardAddress.toLowerCase() === normalizedAddress.toLowerCase();

    const result: ResolvedIdentity = {
      name,
      verified: matches,
      impersonation: !matches,
      display: matches
        ? `${name} ✅ (${short(normalizedAddress)})`
        : `🚨 ${name} — IMPERSONATION (${short(normalizedAddress)})`,
    };

    nameCache.set(normalizedAddress.toLowerCase(), result);
    return result;
  } catch {
    // Resolution failed (network error, etc.) — return unresolved
    const result: ResolvedIdentity = {
      name: null,
      verified: false,
      impersonation: false,
      display: short(normalizedAddress),
    };
    nameCache.set(normalizedAddress.toLowerCase(), result);
    return result;
  }
}

/**
 * Resolve multiple addresses in parallel.
 * Used when a transaction has multiple counterparties.
 */
export async function resolveAddresses(
  addresses: string[],
): Promise<Map<string, ResolvedIdentity>> {
  const results = new Map<string, ResolvedIdentity>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];

  const resolved = await Promise.allSettled(
    unique.map(async (addr) => {
      const identity = await resolveAddress(addr);
      return { addr, identity };
    }),
  );

  for (const result of resolved) {
    if (result.status === 'fulfilled') {
      results.set(result.value.addr, result.value.identity);
    }
  }

  return results;
}

/**
 * Clear the ENS name cache (e.g. when switching accounts).
 */
export function clearNameCache(): void {
  nameCache.clear();
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

// ---- ENSv2 Subname & Record Management ----

export const SEPOLIA_ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
export const SEPOLIA_PUBLIC_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD';

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

/**
 * Build transaction data to create an ENS subname under a parent domain.
 * e.g., creates `username.notwallet.eth`
 */
export function buildSubnodeRecordTx(
  parentNode: string,
  labelHash: string,
  ownerAddress: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_REGISTRY_ABI);
  const data = iface.encodeFunctionData('setSubnodeRecord', [
    parentNode,
    labelHash,
    ownerAddress,
    resolverAddress,
    0n,
  ]);
  return {
    to: SEPOLIA_ENS_REGISTRY,
    data,
    value: 0n,
  };
}

/**
 * Build transaction data to set a text record on a domain/subname.
 * Used for storing public config: recovery vault target, policy notes, guardian role.
 */
export function buildSetTextRecordTx(
  node: string,
  key: string,
  value: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_RESOLVER_ABI);
  const data = iface.encodeFunctionData('setText', [node, key, value]);
  return {
    to: resolverAddress,
    data,
    value: 0n,
  };
}

/**
 * Build transaction data to point an ENS subname to an address.
 */
export function buildSetAddrTx(
  node: string,
  targetAddress: string,
  resolverAddress: string = SEPOLIA_PUBLIC_RESOLVER,
) {
  const iface = new Interface(ENS_RESOLVER_ABI);
  const data = iface.encodeFunctionData('setAddr', [node, targetAddress]);
  return {
    to: resolverAddress,
    data,
    value: 0n,
  };
}
