/**
 * MFKDF signer — derives a private key from THREE factors:
 *
 *   1. Password (something you know — never stored)
 *   2. NFC Card UID (something you have — read-only, any NFC card)
 *   3. Device Secret (something you have — phone enclave, non-exportable)
 *
 * The key is derived, used to sign, then dropped — never stored.
 * Same three factors = same key, every time (deterministic).
 *
 * KDF: scrypt (memory-hard, ships in ethers, the same family Ethereum keystores
 * use) — no native module needed, unlike Argon2/WASM.
 */
import {
  SigningKey,
  computeAddress,
  getBytes,
  scrypt,
  sha256,
  toUtf8Bytes,
  hexlify,
} from 'ethers';
import type { BytesLike } from 'ethers';

import type { CardIdentity, CardSignature, CardSigner } from './card';

// scrypt cost — tuned for a responsive phone; raise N for production.
const N = 1 << 15; // 32768
const R = 8;
const P = 1;
const DKLEN = 32;

export class MfkdfSigner implements CardSigner {
  readonly label: string;

  readonly #cardId: string;

  readonly #password: string;

  readonly #deviceSecret: string;

  constructor(
    cardId: string,
    password: string,
    deviceSecret: string,
    label = 'NFC Card',
  ) {
    if (!cardId) {
      throw new Error('Tap or enter a card first.');
    }
    if (!password) {
      throw new Error('Enter your password first.');
    }
    if (!deviceSecret) {
      throw new Error('Device secret not available — wallet setup may be incomplete.');
    }
    this.#cardId = cardId;
    this.#password = password;
    this.#deviceSecret = deviceSecret;
    this.label = label;
  }

  async #derivePrivateKey(): Promise<string> {
    const subaccountTag =
      this.label && this.label !== 'NFC Card' && this.label !== 'main'
        ? `|${this.label}`
        : '';
    for (let counter = 0; counter < 8; counter++) {
      // Three-factor salt: cardUID + deviceSecret + optional subaccount tag + counter
      // The device secret binds the key to THIS phone's hardware enclave.
      // The card UID binds it to a physical card presence.
      const saltInput = `${this.#cardId}|${this.#deviceSecret}${subaccountTag}|${counter}`;
      const salt = getBytes(sha256(toUtf8Bytes(saltInput)));
      const hex = await scrypt(
        toUtf8Bytes(this.#password),
        salt,
        N,
        R,
        P,
        DKLEN,
      );
      const candidate = hex.startsWith('0x') ? hex : `0x${hex}`;
      try {
        // eslint-disable-next-line no-new
        new SigningKey(candidate);
        return candidate;
      } catch {
        // out of curve range — astronomically rare; try next domain
      }
    }
    throw new Error('Key derivation failed.');
  }

  /**
   * Execute an operation with the derived key in a scoped callback.
   * Key is never exposed outside the callback or persisted.
   */
  async executeWithKey<T>(fn: (privateKey: string) => Promise<T>): Promise<T> {
    const key = await this.#derivePrivateKey();
    try {
      return await fn(key);
    } finally {
      // key variable goes out of scope and will be GC'd
    }
  }

  async getIdentity(): Promise<CardIdentity> {
    const key = new SigningKey(await this.#derivePrivateKey());
    return {
      address: computeAddress(key.publicKey),
      publicKey: key.publicKey,
      label: this.label,
    };
  }

  async signDigest(digest: BytesLike): Promise<CardSignature> {
    const key = new SigningKey(await this.#derivePrivateKey());
    const sig = key.sign(digest);
    return { r: sig.r, s: sig.s, v: sig.v, yParity: sig.yParity };
  }
}
