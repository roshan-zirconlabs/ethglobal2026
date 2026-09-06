/**
 * HaloCard — a real Arx HaLo NFC chip as a CardSigner.
 *
 * This is the production replacement for `SimulatedCard`. The private key lives
 * on the chip's secure element and NEVER leaves it — only signatures over a
 * specific 32-byte digest are returned. This is the Tangem-like guarantee.
 *
 * Requirements:
 *   - An Arx HaLo chip (a few $ each, available from arx.org)
 *   - A browser with WebNFC support (Android Chrome) or HaLo Bridge for desktop
 *   - The `@arx-research/libhalo` package installed
 *
 * The chip uses secp256k1 natively, so signatures are directly compatible with
 * Ethereum. Key slot #1 is used by default (the chip's primary key).
 *
 * Usage:
 *   import { HaloCard } from './card-halo';
 *   const card = new HaloCard();
 *   const identity = await card.getIdentity();   // tap card → reads public key
 *   const sig = await card.signDigest(digest);    // tap card → signs with on-chip key
 *
 * Drop-in replacement for SimulatedCard — same `CardSigner` interface.
 */
import { computeAddress, hexlify } from 'ethers';
import type { BytesLike } from 'ethers';
import type { CardIdentity, CardSignature, CardSigner } from './card';

/**
 * Type declarations for `@arx-research/libhalo` (the package is JS-only,
 * so we declare the shapes we need here to avoid runtime import issues
 * when the package isn't installed — the rest of the site still builds).
 */
type HaloSignResult = {
  signature: {
    raw: { r: string; s: string; v: number };
    der: string;
    ether: string;
  };
  publicKey: string; // 65 bytes hex, uncompressed, no 0x prefix
  etherAddress: string;
  input: {
    keyNo: number;
    digest: string;
  };
};

type HaloGetPkeysResult = {
  publicKeys: Record<string, string>; // keyNo → uncompressed pubkey hex
  etherAddresses: Record<string, string>;
};

type ExecHaloCmdWebFn = (
  command: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<HaloSignResult | HaloGetPkeysResult | Record<string, unknown>>;

// Lazy-loaded reference to execHaloCmdWeb — resolved on first tap.
let _execHaloCmdWeb: ExecHaloCmdWebFn | null = null;

/**
 * Dynamically import libhalo. This avoids build errors when the package
 * isn't installed (the SimulatedCard path doesn't need it), and it keeps
 * webpack from trying to bundle native NFC code.
 */
async function getExecHaloCmdWeb(): Promise<ExecHaloCmdWebFn> {
  if (_execHaloCmdWeb) {
    return _execHaloCmdWeb;
  }

  try {
    // @arx-research/libhalo exports the web API from this subpath.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = await import(
      /* webpackIgnore: true */ '@arx-research/libhalo/api/web'
    );
    _execHaloCmdWeb = mod.execHaloCmdWeb as ExecHaloCmdWebFn;
    return _execHaloCmdWeb;
  } catch (error) {
    throw new Error(
      'Could not load @arx-research/libhalo. Install it with: ' +
        'yarn add @arx-research/libhalo\n' +
        `Original error: ${(error as Error).message}`,
    );
  }
}

/**
 * Strip the `0x` prefix from a hex string if present, because libhalo
 * expects raw hex without the prefix.
 */
function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

/**
 * Ensure a hex string has the `0x` prefix.
 */
function addHexPrefix(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex : `0x${hex}`;
}

export class HaloCard implements CardSigner {
  readonly label: string;

  /** Which key slot on the chip to use (1 = primary, 3 = password-protected). */
  readonly keyNo: number;

  /** Optional password for password-protected key slots. */
  readonly password?: string | undefined;

  /**
   * Cached public key (hex, 0x04-prefixed uncompressed).
   * Populated after the first `getIdentity()` or `signDigest()` call.
   */
  #cachedPublicKey: string | null = null;

  #cachedAddress: string | null = null;

  constructor(
    label = 'HaLo Card',
    keyNo = 1,
    password?: string,
  ) {
    this.label = label;
    this.keyNo = keyNo;
    this.password = password;
  }

  /**
   * Tap the card to read its public key and derive the Ethereum address.
   *
   * On first tap, we use `get_pkeys` to read all public keys from the chip.
   * Subsequent calls return the cached identity (no tap needed).
   */
  async getIdentity(): Promise<CardIdentity> {
    if (this.#cachedPublicKey && this.#cachedAddress) {
      return {
        address: this.#cachedAddress,
        publicKey: this.#cachedPublicKey,
        label: this.label,
      };
    }

    const exec = await getExecHaloCmdWeb();
    const result = (await exec({ name: 'get_pkeys' })) as HaloGetPkeysResult;

    const keyStr = String(this.keyNo);
    const rawPubKey = result.publicKeys[keyStr];
    if (!rawPubKey) {
      throw new Error(
        `HaLo chip does not have a key in slot #${this.keyNo}. ` +
          `Available slots: ${Object.keys(result.publicKeys).join(', ')}`,
      );
    }

    // libhalo returns 65-byte uncompressed pubkey without 0x prefix.
    // ethers expects 0x04-prefixed uncompressed key.
    const publicKey = addHexPrefix(rawPubKey);
    const address = computeAddress(publicKey);

    this.#cachedPublicKey = publicKey;
    this.#cachedAddress = address;

    return { address, publicKey, label: this.label };
  }

  /**
   * Tap the card to sign a 32-byte digest. The private key never leaves the chip.
   *
   * This uses the `sign` command with the `digest` parameter (raw ECDSA, no
   * EIP-191 prefix), which is what we need for signing pre-hashed Ethereum
   * transaction digests and typed-data hashes.
   */
  async signDigest(digest: BytesLike): Promise<CardSignature> {
    const exec = await getExecHaloCmdWeb();
    const digestHex = stripHexPrefix(
      typeof digest === 'string' ? digest : hexlify(digest),
    );

    if (digestHex.length !== 64) {
      throw new Error(
        `Digest must be exactly 32 bytes (64 hex chars), got ${digestHex.length / 2} bytes.`,
      );
    }

    const command: Record<string, unknown> = {
      name: 'sign',
      keyNo: this.keyNo,
      digest: digestHex,
    };

    // If the key slot is password-protected, supply the password and public key.
    if (this.password) {
      command.password = this.password;
      // The public key is required when using a password-protected slot.
      if (!this.#cachedPublicKey) {
        // We need to read the public key first.
        await this.getIdentity();
      }
      if (this.#cachedPublicKey) {
        command.publicKeyHex = stripHexPrefix(this.#cachedPublicKey);
      }
    }

    const result = (await exec(command)) as HaloSignResult;

    // Cache the public key if we got it back (sign always returns it).
    if (result.publicKey && !this.#cachedPublicKey) {
      this.#cachedPublicKey = addHexPrefix(result.publicKey);
      this.#cachedAddress = result.etherAddress;
    }

    return {
      r: addHexPrefix(result.signature.raw.r),
      s: addHexPrefix(result.signature.raw.s),
      v: result.signature.raw.v,
      yParity: result.signature.raw.v === 27 ? 0 : 1,
    };
  }
}
