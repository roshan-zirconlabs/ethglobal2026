// Minimal local shims so the ported signing/qr modules don't need the MetaMask
// packages (we only ever deal with the request shape carried over QR).

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type KeyringRequest = {
  id: string;
  scope?: string;
  account: string;
  origin?: string;
  request: { method: string; params?: unknown };
};
