/**
 * ENSv2 integration — the account model of NotWallet.
 *
 * ENSv2 is HIERARCHICAL: every name can own its own registry, and its children
 * are entries in that registry. That is exactly the shape of this product:
 *
 *     notwallet.eth            → parent registry (we own it)
 *       alice.notwallet.eth    → user identity, owns ITS OWN registry
 *         bnb.alice.notwallet.eth   → an agent sub-account (a distinct EOA)
 *         trade.alice.notwallet.eth → another agent, another EOA, another budget
 *
 * Each leaf is an independent MFKDF-derived EOA (see agents.ts), so an agent can
 * only ever spend what you fund it with — the budget IS the balance. ENSv2 does
 * the naming, delegation and revocation; it never moves funds.
 *
 * Two networks, two jobs:
 *   • Mainnet (read-only)  — reverse-resolve a counterparty for anti-impersonation.
 *   • Sepolia ENSv2 beta   — the registry hierarchy above (the hackathon deployment).
 */
import {
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  dnsEncode,
  getAddress,
  keccak256,
  toUtf8Bytes,
} from 'ethers';

const SEPOLIA_RPC =
  process.env.EXPO_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';
const MAINNET_RPC =
  process.env.EXPO_PUBLIC_MAINNET_RPC || 'https://ethereum-rpc.publicnode.com';

/**
 * Sepolia **ENSv2 Beta** deployment (the dedicated hackathon deployment).
 * These are v2 contracts — the old flat v1 registry is NOT used anywhere here.
 */
export const ENSV2 = {
  ethRegistry: '0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e',
  ethRegistrar: '0x7d1b7f586a62ac3f54b9a396849757814283270b',
  verifiableFactory: '0x894bc9cc8ff1ad96b8a288c86a8c71d662c07780',
  /** Implementation cloned per-user to give a name its own subname registry. */
  userRegistryImpl: '0x47b442d0cf617c41cabaff5f02f44dd1e5f72546',
  permissionedResolverImpl: '0xa9d3814ab151bf6e37a427432795371a8361614e',
  publicResolver: '0xf9de4979ddb290baf5b760d0e788125017bc33f6',
  universalResolver: '0xfea8d4b7fcce0b8765c793d6695eac384aaa458f',
  rootRegistry: '0xe7f0d5724f8337e3aa9a9910540341ff4273fed9',
} as const;

/** The parent this wallet issues identities under, e.g. `alice.notwallet.eth`. */
export const ENS_PARENT_LABEL = process.env.EXPO_PUBLIC_ENS_PARENT_LABEL || 'notwallet';
export const ENS_PARENT_NAME = `${ENS_PARENT_LABEL}.eth`;
/**
 * The parent's own registry (where user identities are minted). Discovered from
 * chain via `ETHRegistry.getSubregistry(parentLabel)`, or pinned via env.
 */
export const ENS_PARENT_REGISTRY = process.env.EXPO_PUBLIC_ENS_PARENT_REGISTRY || '';

/**
 * NotWalletRegistrar — the permissionless issuer of `<you>.notwallet.eth`.
 * Deploy it (see the repo README) and set this; until then, claiming is disabled
 * with an honest message rather than a doomed on-chain call.
 */
export const ENS_REGISTRAR = process.env.EXPO_PUBLIC_ENS_REGISTRAR || '';

export const REGISTRAR_ABI = [
  'function claim(string label) returns (uint256)',
  'function available(string label) view returns (bool)',
];

/** Text-record key holding the recovery guardian pointer. */
export const RECOVERY_RECORD_KEY = 'notwallet.recovery';

// ── ENSv2 ABIs (Permissioned Registry / Verifiable Factory / Resolver) ────────

export const REGISTRY_ABI = [
  // IRegistry (minimal, implemented by every registry)
  'function getSubregistry(string label) view returns (address)',
  'function getResolver(string label) view returns (address)',
  // PermissionedRegistry
  'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
  'function unregister(uint256 anyId)',
  'function renew(uint256 anyId, uint64 newExpiry)',
  'function setSubregistry(uint256 anyId, address registry)',
  'function setResolver(uint256 anyId, address resolver)',
  'function grantRoles(uint256 anyId, uint256 roleBitmap, address account)',
  'function revokeRoles(uint256 anyId, uint256 roleBitmap, address account)',
  'function getExpiry(uint256 anyId) view returns (uint64)',
  'function getTokenId(uint256 anyId) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

export const FACTORY_ABI = [
  'function deployProxy(address implementation, uint256 salt, bytes data) returns (address)',
];

export const RESOLVER_ABI = [
  'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
  'function setText(bytes name, string key, string value)',
  'function resolve(bytes name, bytes data) view returns (bytes)',
];

/**
 * Enhanced Access Control role bits (replaces v1 fuses). Each role has an admin
 * variant at `role << 128` which allows re-delegating that role.
 */
export const ROLE = {
  REGISTRAR: 1n << 0n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
} as const;

const admin = (role: bigint) => role << 128n;

/**
 * Roles for a USER identity (`alice.notwallet.eth`): full control of their own
 * branch — they may mint agent subnames, repoint the resolver, and delegate.
 */
export const USER_IDENTITY_ROLES =
  ROLE.REGISTRAR |
  ROLE.UNREGISTER |
  ROLE.RENEW |
  ROLE.SET_SUBREGISTRY |
  ROLE.SET_RESOLVER |
  admin(ROLE.REGISTRAR) |
  admin(ROLE.SET_RESOLVER) |
  admin(ROLE.SET_SUBREGISTRY);

/**
 * Roles for an AGENT subname (`bnb.alice.notwallet.eth`): deliberately minimal.
 * An agent may point its own records but CANNOT mint children or re-delegate —
 * containment is part of the security model, not an afterthought.
 */
export const AGENT_ROLES = ROLE.SET_RESOLVER;

/**
 * ENSv2 write functions take `anyId` (a uint256) rather than a label string —
 * the labelhash is the canonical form, so convert before encoding any call.
 */
export function labelId(label: string): bigint {
  return BigInt(keccak256(toUtf8Bytes(label)));
}

function sepolia() {
  return new JsonRpcProvider(SEPOLIA_RPC);
}
function mainnet() {
  return new JsonRpcProvider(MAINNET_RPC);
}

// ── A. Identity resolution (mainnet) — anti-impersonation ────────────────────

export type ResolvedIdentity = {
  name: string | null;
  verified: boolean;
  impersonation: boolean;
  display: string;
};

const nameCache = new Map<string, ResolvedIdentity>();

/** Reverse-resolve then FORWARD-verify. A mismatch is flagged as impersonation. */
export async function resolveAddress(address: string): Promise<ResolvedIdentity> {
  const normalized = getAddress(address);
  const key = normalized.toLowerCase();
  const cached = nameCache.get(key);
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
      nameCache.set(key, unresolved);
      return unresolved;
    }
    const forward = await provider.resolveName(name);
    const matches = forward != null && forward.toLowerCase() === key;
    const result: ResolvedIdentity = {
      name,
      verified: matches,
      impersonation: !matches,
      display: matches
        ? `${name} ✅ (${short(normalized)})`
        : `🚨 ${name} — UNVERIFIED (${short(normalized)})`,
    };
    nameCache.set(key, result);
    return result;
  } catch {
    nameCache.set(key, unresolved);
    return unresolved;
  }
}

export async function resolveAddresses(
  addresses: string[],
): Promise<Map<string, ResolvedIdentity>> {
  const results = new Map<string, ResolvedIdentity>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const settled = await Promise.allSettled(
    unique.map(async (addr) => ({ addr, identity: await resolveAddress(addr) })),
  );
  for (const r of settled) {
    if (r.status === 'fulfilled') results.set(r.value.addr, r.value.identity);
  }
  return results;
}

/** Forward-resolve a name the user typed (guardian entry). Mainnet, then Sepolia. */
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

// ── B. ENSv2 hierarchy (Sepolia) ─────────────────────────────────────────────

/** Walk one level down: the registry a label owns, or null if it has none. */
export async function getSubregistry(
  registryAddress: string,
  label: string,
): Promise<string | null> {
  try {
    const registry = new Contract(registryAddress, REGISTRY_ABI, sepolia());
    const sub: string = await registry.getSubregistry(label);
    return sub && sub !== ZeroAddress ? getAddress(sub) : null;
  } catch {
    return null;
  }
}

/**
 * The registry that holds user identities (children of `notwallet.eth`).
 * Pinned by env when set, otherwise discovered from the ETHRegistry on chain.
 * Returns null when the parent name isn't registered / has no subregistry yet.
 */
export async function getParentRegistry(): Promise<string | null> {
  if (ENS_PARENT_REGISTRY) return getAddress(ENS_PARENT_REGISTRY);
  return getSubregistry(ENSV2.ethRegistry, ENS_PARENT_LABEL);
}

/** Is `label` still free in this registry? */
export async function isLabelAvailable(
  registryAddress: string,
  label: string,
): Promise<boolean> {
  try {
    const registry = new Contract(registryAddress, REGISTRY_ABI, sepolia());
    // A registered label resolves to a token with a non-zero expiry.
    const expiry: bigint = await registry.getExpiry(labelId(label));
    return expiry === 0n || expiry < BigInt(Math.floor(Date.now() / 1000));
  } catch {
    // Unknown/erroring registry: fall back to the subregistry+resolver probe.
    const [sub, res] = await Promise.all([
      getSubregistry(registryAddress, label),
      getResolverFor(registryAddress, label),
    ]);
    return !sub && !res;
  }
}

export async function getResolverFor(
  registryAddress: string,
  label: string,
): Promise<string | null> {
  try {
    const registry = new Contract(registryAddress, REGISTRY_ABI, sepolia());
    const r: string = await registry.getResolver(label);
    return r && r !== ZeroAddress ? getAddress(r) : null;
  } catch {
    return null;
  }
}

const registrarIface = new Interface(REGISTRAR_ABI);
const registryIface = new Interface(REGISTRY_ABI);
const factoryIface = new Interface(FACTORY_ABI);
const resolverIface = new Interface(RESOLVER_ABI);

/** Default expiry for issued names: 1 year (clamped by the parent on chain). */
export function defaultExpiry(years = 1): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + years * 365 * 24 * 3600);
}

/**
 * Deploy a fresh registry proxy so a name can own subnames. `salt` makes the
 * address deterministic per user/label.
 */
export function buildDeployRegistryTx(salt: bigint) {
  const data = factoryIface.encodeFunctionData('deployProxy', [
    ENSV2.userRegistryImpl,
    salt,
    '0x',
  ]);
  return { to: ENSV2.verifiableFactory, data, value: 0n };
}

/**
 * Mint `label` inside `registryAddress`.
 * `subregistry` = the child's own registry (pass ZeroAddress for a leaf/agent).
 */
export function buildRegisterTx(params: {
  registryAddress: string;
  label: string;
  owner: string;
  subregistry?: string;
  resolver?: string;
  roleBitmap: bigint;
  expiry: bigint;
}) {
  const data = registryIface.encodeFunctionData('register', [
    params.label,
    params.owner,
    params.subregistry ?? ZeroAddress,
    params.resolver ?? ENSV2.publicResolver,
    params.roleBitmap,
    params.expiry,
  ]);
  return { to: params.registryAddress, data, value: 0n };
}

/** Attach a child registry to an existing name. */
export function buildSetSubregistryTx(
  registryAddress: string,
  label: string,
  childRegistry: string,
) {
  const data = registryIface.encodeFunctionData('setSubregistry', [
    labelId(label),
    childRegistry,
  ]);
  return { to: registryAddress, data, value: 0n };
}

/** Revoke an agent: remove the name entirely. */
export function buildUnregisterTx(registryAddress: string, label: string) {
  const data = registryIface.encodeFunctionData('unregister', [labelId(label)]);
  return { to: registryAddress, data, value: 0n };
}

/** Revoke specific EAC roles from an account without removing the name. */
export function buildRevokeRolesTx(
  registryAddress: string,
  label: string,
  roleBitmap: bigint,
  account: string,
) {
  const data = registryIface.encodeFunctionData('revokeRoles', [
    labelId(label),
    roleBitmap,
    account,
  ]);
  return { to: registryAddress, data, value: 0n };
}

/** Write a text record (e.g. the recovery pointer) on the Permissioned Resolver. */
export function buildSetTextTx(
  resolverAddress: string,
  fullName: string,
  key: string,
  value: string,
) {
  const data = resolverIface.encodeFunctionData('setText', [
    dnsEncode(fullName),
    key,
    value,
  ]);
  return { to: resolverAddress, data, value: 0n };
}

// ── NotWalletRegistrar (claim <you>.notwallet.eth) ───────────────────────────

/** Is the branded-name registrar configured? */
export function hasRegistrar(): boolean {
  return !!ENS_REGISTRAR;
}

/** Build the permissionless claim tx: registrar.claim(label). */
export function buildClaimTx(label: string) {
  const data = registrarIface.encodeFunctionData('claim', [label]);
  return { to: ENS_REGISTRAR, data, value: 0n };
}

/** Ask the registrar whether a label is free. null when not configured/erroring. */
export async function registrarAvailable(label: string): Promise<boolean | null> {
  if (!ENS_REGISTRAR) return null;
  try {
    const registrar = new Contract(ENS_REGISTRAR, REGISTRAR_ABI, sepolia());
    return await registrar.available(label);
  } catch {
    return null;
  }
}

/** Build setText on OUR NotWalletRegistry: setText(string label, string key, string value). */
export function buildRegistrySetTextTx(registry: string, label: string, key: string, value: string) {
  const iface = new Interface(['function setText(string label, string key, string value)']);
  return { to: registry, data: iface.encodeFunctionData('setText', [label, key, value]), value: 0n };
}
