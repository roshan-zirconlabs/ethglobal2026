/**
 * MFKDF signer — derives a private key from TWO factors:
 *
 *   1. Password (something you know — never stored)
 *   2. NFC Card UID (something you have — read-only, any NFC card)
 *
 * The key is derived, used to sign, then dropped — never stored. Same two factors
 * = same key on ANY phone → the wallet is recoverable with no seed phrase and no
 * device lock-in. (An optional device-bound 3rd factor exists behind an *encrypted
 * backup* only — see device-secret.ts — never as a silent, unrecoverable factor.)
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

  constructor(cardId: string, password: string, label = 'NFC Card') {
    if (!cardId) {
      throw new Error('Tap or enter a card first.');
    }
    if (!password) {
      throw new Error('Enter your password first.');
    }
    this.#cardId = cardId;
    this.#password = password;
    this.label = label;
  }

  async #derivePrivateKey(): Promise<string> {
    const subaccountTag =
      this.label && this.label !== 'NFC Card' && this.label !== 'main'
        ? `|${this.label}`
        : '';
    for (let counter = 0; counter < 8; counter++) {
      // Two-factor salt: cardUID + optional subaccount tag + counter.
      // The password (scrypt input) is the entropy anchor; the card UID is the
      // physical "have" factor. Recoverable from the same two on any device.
      const saltInput = `${this.#cardId}${subaccountTag}|${counter}`;
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
