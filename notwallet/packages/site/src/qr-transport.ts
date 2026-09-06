/**
 * Air-gapped QR transport between the desktop (companion dapp) and the phone
 * (signer). No server, no network — the two devices exchange only QR codes:
 *
 *   desktop shows REQUEST qr  ─►  phone scans, signs on the card  ─►  phone shows
 *   SIGNATURE qr  ─►  desktop scans it and relays to the snap.
 *
 * This is what keeps the signing key off the (possibly compromised) PC entirely:
 * the key is derived on the phone, and only a finished signature crosses back.
 *
 * v1 uses a single QR per message. A tx or personal_sign payload fits easily;
 * very large typed-data may exceed QR capacity → chunking is a future addition
 * (see `MAX_QR_BYTES` guard below).
 */
import type { KeyringRequest } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';

const PROTOCOL = 'notwallet.qr.v1';

// Conservative single-QR capacity (bytes) at a scannable error-correction level.
const MAX_QR_BYTES = 2000;

export type RequestEnvelope = {
  p: typeof PROTOCOL;
  kind: 'req';
  request: KeyringRequest;
};

export type SignatureEnvelope = {
  p: typeof PROTOCOL;
  kind: 'sig';
  id: string;
  signature: Json;
};

/** Encode a pending request for the desktop → phone QR. */
export function encodeRequest(request: KeyringRequest): string {
  const text = JSON.stringify({ p: PROTOCOL, kind: 'req', request });
  assertSize(text);
  return text;
}

/** Decode a scanned request on the phone. */
export function decodeRequest(text: string): KeyringRequest {
  const env = parse(text);
  if (env.kind !== 'req') {
    throw new Error('That QR is not a signing request.');
  }
  return (env as RequestEnvelope).request;
}

/** Encode a finished signature for the phone → desktop QR. */
export function encodeSignature(id: string, signature: Json): string {
  const text = JSON.stringify({ p: PROTOCOL, kind: 'sig', id, signature });
  assertSize(text);
  return text;
}

/** Decode a scanned signature on the desktop. */
export function decodeSignature(text: string): { id: string; signature: Json } {
  const env = parse(text);
  if (env.kind !== 'sig') {
    throw new Error('That QR is not a signature.');
  }
  const sig = env as SignatureEnvelope;
  return { id: sig.id, signature: sig.signature };
}

export type AccountEnvelope = {
  p: typeof PROTOCOL;
  kind: 'account';
  address: string;
  publicKey: string;
  label: string;
};

/** Decode a phone's pairing QR (address + publicKey) on the desktop. */
export function decodeAccount(text: string): {
  address: string;
  publicKey: string;
  label: string;
} {
  const env = parse(text);
  if (env.kind !== 'account') {
    throw new Error('That QR is not an account pairing.');
  }
  const account = env as AccountEnvelope;
  return {
    address: account.address,
    publicKey: account.publicKey,
    label: account.label,
  };
}

function parse(text: string): { kind: string } {
  let env: any;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('Unrecognized QR (not NotWallet data).');
  }
  if (env?.p !== PROTOCOL) {
    throw new Error('Unrecognized QR (wrong protocol/version).');
  }
  return env;
}

function assertSize(text: string): void {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_QR_BYTES) {
    throw new Error(
      `Payload too large for a single QR (${bytes} bytes). Chunked QR is not ` +
        `implemented yet — this can happen with large typed-data.`,
    );
  }
}
