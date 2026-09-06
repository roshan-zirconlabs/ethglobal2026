/**
 * The card signer — the offline key that lives OUTSIDE the snap/host.
 *
 * `CardSigner` is the interface MetaMask's flow depends on. Two implementations:
 *   - SimulatedCard: a software "virtual card" (key in localStorage) so the whole
 *     flow runs on a laptop today, with no hardware. FOR DEV/DEMO ONLY.
 *   - (later) HaloCard: a real Arx HaLo chip over WebNFC — a drop-in replacement.
 *
 * The security story is identical in both: the private key is never handed to the
 * snap or the host wallet. Only signatures over a specific digest leave the card.
 *
 * Implemented with ethers (browser-safe: no Buffer/node-crypto polyfills needed).
 */
import { SigningKey, computeAddress, hexlify, randomBytes } from 'ethers';
import type { BytesLike } from 'ethers';

export type CardIdentity = {
  address: string; // EIP-55 checksummed
  publicKey: string; // uncompressed, 0x04-prefixed hex
  label: string;
};

export type CardSignature = {
  r: string; // 0x-prefixed 32-byte hex
  s: string; // 0x-prefixed 32-byte hex
  v: number; // 27/28
  yParity: number; // 0/1
};

export type CardSigner = {
  /** Human label for UI. */
  readonly label: string;
  /** Tap/read the card to obtain its public identity. */
  getIdentity(): Promise<CardIdentity>;
  /** Tap the card to sign a 32-byte digest. Never exposes the private key. */
  signDigest(digest: BytesLike): Promise<CardSignature>;
};

const SIM_STORAGE_KEY = 'notwallet.simcard.privkey';

/**
 * A software-simulated card. The "secure element" is localStorage — obviously
 * NOT secure; it exists only so the end-to-end flow is demoable without hardware.
 * A real HaLo chip implements the same interface with a non-extractable key.
 */
export class SimulatedCard implements CardSigner {
  readonly label: string;

  constructor(label = 'Simulated Card') {
    this.label = label;
  }

  #getOrCreatePrivateKey(): string {
    try {
      const existing = window.localStorage.getItem(SIM_STORAGE_KEY);
      if (existing) {
        return existing;
      }
    } catch {
      // localStorage unavailable — fall through to an ephemeral key.
    }
    const pk = hexlify(randomBytes(32));
    try {
      window.localStorage.setItem(SIM_STORAGE_KEY, pk);
    } catch {
      // ignore; key will be ephemeral for this session
    }
    return pk;
  }

  async getIdentity(): Promise<CardIdentity> {
    const key = new SigningKey(this.#getOrCreatePrivateKey());
    return {
      address: computeAddress(key.publicKey),
      publicKey: key.publicKey, // 0x04-prefixed uncompressed
      label: this.label,
    };
  }

  async signDigest(digest: BytesLike): Promise<CardSignature> {
    const key = new SigningKey(this.#getOrCreatePrivateKey());
    const sig = key.sign(digest);
    return { r: sig.r, s: sig.s, v: sig.v, yParity: sig.yParity };
  }
}
