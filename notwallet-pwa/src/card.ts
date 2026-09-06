// Signer interface shared by the ported signing module. The phone's concrete
// implementation is MfkdfSigner (src/mfkdf.ts): derives from card id + password.
import type { BytesLike } from 'ethers';

export type CardIdentity = {
  address: string; // EIP-55 checksummed
  publicKey: string; // uncompressed, 0x04-prefixed hex
  label: string;
};

export type CardSignature = {
  r: string;
  s: string;
  v: number;
  yParity: number;
};

export type CardSigner = {
  readonly label: string;
  getIdentity(): Promise<CardIdentity>;
  signDigest(digest: BytesLike): Promise<CardSignature>;
};
