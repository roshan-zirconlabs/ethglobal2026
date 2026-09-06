/**
 * Turns a parked MetaMask keyring request into (1) a preview for the clear-sign
 * screen and (2) a finished result, signed BY THE CARD.
 *
 * Implemented with ethers (browser-safe). The transaction result is shaped to
 * match what the original snap returned (ethereumjs JsonTx object: the tx fields
 * plus `type`, `v`, `r`, `s`) so MetaMask consumes it unchanged — the only
 * difference is the signature comes from the card, not a host-held key.
 */
import {
  Signature,
  Transaction,
  TypedDataEncoder,
  getBytes,
  hashMessage,
  recoverAddress,
} from 'ethers';
import type { KeyringRequest } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';

import type { CardSignature, CardSigner } from './card';
import type { DecodedTx } from './clearsign';

export type RequestPreview =
  | { kind: 'tx'; method: string; tx: DecodedTx; from: string }
  | { kind: 'message'; method: string; text: string; from: string }
  | {
      kind: 'typedData';
      method: string;
      domain: TypedDataDomain;
      primaryType: string;
      message: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      from: string;
    }
  | { kind: 'unknown'; method: string };

export type TypedDataDomain = {
  name?: string | undefined;
  version?: string | undefined;
  chainId?: number | undefined;
  verifyingContract?: string | undefined;
};

type RpcLike = { method: string; params?: unknown };

function getRpc(request: KeyringRequest): RpcLike {
  return request.request as unknown as RpcLike;
}

/**
 * Parse the EIP-712 typed data payload.
 * v3 and v4 both use the same JSON format: `{ types, domain, primaryType, message }`.
 * MetaMask sends them as `[from, jsonString]`.
 */
function parseTypedData(args: unknown[]): {
  from: string;
  domain: TypedDataDomain;
  primaryType: string;
  types: Record<string, { name: string; type: string }[]>;
  message: Record<string, unknown>;
} {
  const [from, dataArg] = args as [string, string | Record<string, unknown>];
  const data =
    typeof dataArg === 'string'
      ? (JSON.parse(dataArg) as Record<string, unknown>)
      : dataArg;
  return {
    from: from ?? '',
    domain: (data.domain ?? {}) as TypedDataDomain,
    primaryType: (data.primaryType as string) ?? 'Unknown',
    types: (data.types ?? {}) as Record<
      string,
      { name: string; type: string }[]
    >,
    message: (data.message ?? {}) as Record<string, unknown>,
  };
}

/** Decode a request into something the clear-sign screen can render. */
export function previewRequest(request: KeyringRequest): RequestPreview {
  const { method, params } = getRpc(request);
  const args = (params ?? []) as any[];

  switch (method) {
    case 'eth_signTransaction': {
      const tx = args[0] ?? {};
      return {
        kind: 'tx',
        method,
        from: String(tx.from ?? ''),
        tx: {
          to: tx.to ?? null,
          valueWei: tx.value ? BigInt(tx.value) : 0n,
          data: tx.data ?? '0x',
          chainId: tx.chainId ? Number(BigInt(tx.chainId)) : 1,
        },
      };
    }
    case 'personal_sign': {
      const [message, from] = args as [string, string];
      return { kind: 'message', method, from, text: hexToUtf8(message) };
    }
    case 'eth_sign': {
      const [from, data] = args as [string, string];
      return { kind: 'message', method, from, text: data };
    }
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4': {
      const parsed = parseTypedData(args);
      return {
        kind: 'typedData',
        method,
        from: parsed.from,
        domain: parsed.domain,
        primaryType: parsed.primaryType,
        types: parsed.types,
        message: parsed.message,
      };
    }
    default:
      return { kind: 'unknown', method };
  }
}

/** Sign a request with the card and return the result MetaMask expects. */
export async function signRequestWithCard(
  request: KeyringRequest,
  card: CardSigner,
): Promise<Json> {
  const { method, params } = getRpc(request);
  const args = (params ?? []) as any[];

  switch (method) {
    case 'eth_signTransaction':
      return signTransaction(args[0], card);
    case 'personal_sign': {
      const [message] = args as [string, string];
      const digest = hashMessage(getBytes(message));
      return serializedSig(await card.signDigest(digest));
    }
    case 'eth_sign': {
      const [, data] = args as [string, string];
      return serializedSig(await card.signDigest(getBytes(data)));
    }
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4': {
      return signTypedData(args, card);
    }
    default:
      throw new Error(
        `'${method}' is not supported yet by the card signer (transactions, messages, and typed data are).`,
      );
  }
}

const ETHERS_TX_FIELDS = [
  'to',
  'nonce',
  'gasLimit',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'value',
  'data',
  'chainId',
  'type',
  'accessList',
] as const;

async function signTransaction(txIn: any, card: CardSigner): Promise<Json> {
  // Build a clean ethers tx (drop `from` and any non-tx fields it rejects).
  const txLike: Record<string, unknown> = {};
  for (const field of ETHERS_TX_FIELDS) {
    const value = txIn?.[field];
    if (value !== undefined && value !== null) {
      // MetaMask sends `type` as a hex string ("0x2"); ethers wants a number.
      txLike[field] = field === 'type' ? Number(value) : value;
    }
  }
  const unsigned = Transaction.from(txLike);
  const digest = unsigned.unsignedHash;

  const sig = await card.signDigest(digest);

  // Safety: the recovered signer MUST equal the account asked to sign.
  if (txIn?.from) {
    const recovered = recoverAddress(digest, toEthersSig(sig));
    if (recovered.toLowerCase() !== String(txIn.from).toLowerCase()) {
      throw new Error(
        `Card signature does not match account (expected ${txIn.from}, got ${recovered}).`,
      );
    }
  }

  // Shape the result like the original snap (ethereumjs JsonTx: fields + v/r/s).
  const typed = unsigned.type !== 0;
  const result: Record<string, Json> = {};
  for (const field of ETHERS_TX_FIELDS) {
    if (txIn?.[field] !== undefined && txIn[field] !== null) {
      result[field] = txIn[field] as Json;
    }
  }
  result.type = unsigned.type ?? 0;
  result.v = `0x${(typed ? sig.yParity : sig.v).toString(16)}`;
  result.r = sig.r;
  result.s = sig.s;
  return result;
}

/**
 * Sign EIP-712 typed data with the card.
 *
 * The digest is `keccak256("\x19\x01" || domainSeparator || structHash)`,
 * computed by ethers' TypedDataEncoder. The result is a standard 65-byte
 * signature string MetaMask expects for signTypedData.
 */
async function signTypedData(
  args: unknown[],
  card: CardSigner,
): Promise<Json> {
  const parsed = parseTypedData(args);

  // ethers' TypedDataEncoder needs types WITHOUT the EIP712Domain entry
  // (it computes the domain separator separately from the `domain` object).
  const signingTypes = { ...parsed.types };
  delete signingTypes.EIP712Domain;

  const digest = TypedDataEncoder.hash(
    parsed.domain as Record<string, unknown>,
    signingTypes,
    parsed.message,
  );

  const sig = await card.signDigest(digest);

  // Safety: verify recovered address matches `from`.
  if (parsed.from) {
    const recovered = recoverAddress(digest, toEthersSig(sig));
    if (recovered.toLowerCase() !== parsed.from.toLowerCase()) {
      throw new Error(
        `Card signature does not match account (expected ${parsed.from}, got ${recovered}).`,
      );
    }
  }

  return serializedSig(sig);
}

function serializedSig(sig: CardSignature): string {
  return toEthersSig(sig).serialized;
}

function toEthersSig(sig: CardSignature): Signature {
  return Signature.from({ r: sig.r, s: sig.s, v: sig.v });
}

function hexToUtf8(hex: string): string {
  try {
    return new TextDecoder().decode(getBytes(hex));
  } catch {
    return hex;
  }
}
