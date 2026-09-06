/**
 * MFKDF signer for the phone. The key is DERIVED from (card id + password) with
 * scrypt, used to sign, and dropped — never stored, never leaves the phone.
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
    for (let counter = 0; counter < 8; counter++) {
      const salt = getBytes(
        sha256(toUtf8Bytes(`notwallet|v1|${counter}|${this.#cardId}`)),
      );
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
