/**
 * MfkdfCard — the DEFAULT signer for NotWallet.
 *
 * The private key is NOT stored anywhere. It is DERIVED, on demand, from two
 * independent factors:
 *   1. an NFC card you already own  ("something you have" — its readable ID)
 *   2. a memorized password         ("something you know" — the real anchor)
 *
 *   privateKey = Argon2id(password, salt = sha256("notwallet|v1|" + cardId))
 *
 * Neither factor alone is enough. The key exists only for the microseconds of a
 * single signature, then the local reference is dropped. Nothing to steal off the
 * host 24/7 — which defeats the "malware read my key off disk" attack.
 *
 * HONEST LIMITS (documented on purpose — see plan.md §6):
 *  - The derived key is briefly in JS memory at sign time (true on-card signers
 *    never let the key touch the host). Mitigation: run this on the PHONE, not
 *    the compromised PC.
 *  - A card's readable ID is clonable/scannable, so the PASSWORD carries the real
 *    cryptographic strength — hence a slow KDF (Argon2id) and a strong password.
 *  - v1 = one card + password. Multiple cards (all-required) is a v2 change: just
 *    fold every cardId into the salt.
 *
 * Browser-safe: hash-wasm (Argon2id in WASM) + ethers. No Buffer/node polyfills.
 */
import { argon2id } from 'hash-wasm';
import {
  SigningKey,
  computeAddress,
  getBytes,
  sha256,
  toUtf8Bytes,
} from 'ethers';
import type { BytesLike } from 'ethers';

import type { CardIdentity, CardSignature, CardSigner } from './card';

export type MfkdfFactors = {
  /** Readable ID of the tapped NFC card (WebNFC serial number, or manual). */
  cardId: string;
  /** Memorized password — never stored. */
  password: string;
  /** Optional UI label. */
  label?: string;
};

// Argon2id cost. Tuned for a responsive browser demo; raise for production.
// (OWASP alt profile: ~19 MiB, 2 iterations.)
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456, // KiB
  hashLength: 32, // bytes → a candidate secp256k1 private key
} as const;

export class MfkdfCard implements CardSigner {
  readonly label: string;

  readonly #cardId: string;

  readonly #password: string;

  constructor({ cardId, password, label }: MfkdfFactors) {
    if (!cardId) {
      throw new Error('Tap (or enter) an NFC card first.');
    }
    if (!password) {
      throw new Error('Enter your password first.');
    }
    this.#cardId = cardId;
    this.#password = password;
    this.label = label ?? 'NFC Card + password';
  }

  /**
   * Derive a valid secp256k1 private key from the two factors. On the vanishing
   * chance the raw hash is out of curve range, domain-separate and retry.
   */
  async #derivePrivateKey(): Promise<string> {
    for (let counter = 0; counter < 8; counter++) {
      const domain = `notwallet|v1|${counter}|${this.#cardId}`;
      const salt = getBytes(sha256(toUtf8Bytes(domain)));
      const hex = await argon2id({
        password: this.#password,
        salt,
        ...ARGON2,
        outputType: 'hex',
      });
      const candidate = `0x${hex}`;
      try {
        // Throws if the key is 0 or ≥ curve order.
        // eslint-disable-next-line no-new
        new SigningKey(candidate);
        return candidate;
      } catch {
        // astronomically rare — try the next domain-separated hash
      }
    }
    throw new Error('Key derivation failed (could not find a valid key).');
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

/**
 * Read an NFC card's ID via WebNFC (Android Chrome). Returns the tag serial
 * number to use as the `cardId` factor. Falls back with a clear error where
 * WebNFC is unavailable (desktop, iOS) so the UI can offer manual entry.
 */
export async function readNfcCardId(): Promise<string> {
  const AnyNdef = (globalThis as any).NDEFReader;
  if (!AnyNdef) {
    throw new Error(
      'WebNFC not available here (use Android Chrome, or enter a card ID manually).',
    );
  }
  const reader = new AnyNdef();
  await reader.scan();
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('No card detected — try tapping again.')),
      20000,
    );
    reader.onreadingerror = () => {
      clearTimeout(timeout);
      reject(new Error('Could not read the card. Try again.'));
    };
    reader.onreading = (event: any) => {
      clearTimeout(timeout);
      const serial = String(event?.serialNumber ?? '').trim();
      if (serial) {
        resolve(serial);
      } else {
        reject(new Error('Card has no readable ID.'));
      }
    };
  });
}
