import {
  toChecksumAddress,
  addHexPrefix,
  isValidAddress,
} from '@ethereumjs/util';
import type {
  Keyring,
  KeyringAccount,
  KeyringEventPayload,
  KeyringRequest,
  ResolvedAccountAddress,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import {
  EthAccountType,
  EthMethod,
  EthScope,
  KeyringEvent,
} from '@metamask/keyring-api';
import { emitSnapKeyringEvent } from '@metamask/keyring-snap-sdk';
import {
  type CaipChainId,
  type Json,
  type JsonRpcRequest,
} from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import { saveState } from './stateManagement';
import { isEvmChain, isUniqueAddress, throwError } from './util';
import packageInfo from '../package.json';

export type KeyringState = {
  wallets: Record<string, Wallet>;
  pendingRequests: Record<string, KeyringRequest>;
  useSyncApprovals: boolean;
  selectedAccounts: string[];
};

/**
 * A wallet in this keyring is NOT backed by a private key held in the snap.
 *
 * SECURITY MODEL (this is the whole point — see idea.md):
 *   The signing key lives on an external offline device (an NFC card's secure
 *   element / the user's phone). The snap only ever stores the account's PUBLIC
 *   identity (address + public key) and a human label for the card. When a
 *   signature is needed, the snap parks the request and hands it to the trusted
 *   companion dapp, which shows a clear-signing screen and gets the card to sign.
 *   The finished signature is returned via `approveRequest`. No private key is
 *   ever present in the snap, the extension, or on the host machine — so malware
 *   on the host has nothing to steal, and nothing can be signed without the card.
 */
export type Wallet = {
  account: KeyringAccount;
  /** Uncompressed secp256k1 public key of the card, hex (for reference/verify). */
  publicKey: string;
  /** Human-readable label for the physical card that backs this account. */
  cardLabel: string;
};

export class CardKeyring implements Keyring {
  #state: KeyringState;

  constructor(state: KeyringState) {
    this.#state = state;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.wallets).map((wallet) => wallet.account);
  }

  async getAccount(id: string): Promise<KeyringAccount> {
    return (
      this.#state.wallets[id]?.account ??
      throwError(`Account '${id}' not found`)
    );
  }

  /**
   * Create a card-backed account.
   *
   * The companion dapp taps the card, reads its public key, derives the address,
   * and passes `{ address, publicKey, cardLabel }` here. The snap stores ONLY
   * that public identity — never a private key.
   *
   * @param options - `{ address, publicKey?, cardLabel? }` from the tapped card.
   */
  async createAccount(
    options: Record<string, Json> = {},
  ): Promise<KeyringAccount> {
    const rawAddress = options?.address as string | undefined;
    if (!rawAddress || !isValidAddress(addHexPrefix(rawAddress))) {
      throw new Error(
        'Card account requires a valid `address` derived from the tapped card.',
      );
    }
    // TODO(security): re-derive the address from `options.publicKey` inside the
    // snap instead of trusting the companion dapp's value, once we settle the
    // card's public-key encoding. The dapp is trusted, so this is acceptable v1.
    const address = toChecksumAddress(addHexPrefix(rawAddress));

    if (!isUniqueAddress(address, Object.values(this.#state.wallets))) {
      throw new Error(`Account address already in use: ${address}`);
    }

    try {
      const account: KeyringAccount = {
        id: uuid(),
        options, // public info only (address/publicKey/cardLabel) — safe to expose
        address,
        scopes: [EthScope.Eoa],
        methods: [
          EthMethod.PersonalSign,
          EthMethod.Sign,
          EthMethod.SignTransaction,
          EthMethod.SignTypedDataV1,
          EthMethod.SignTypedDataV3,
          EthMethod.SignTypedDataV4,
        ],
        type: EthAccountType.Eoa,
      };
      await this.#emitEvent(KeyringEvent.AccountCreated, {
        account,
        accountNameSuggestion: (options?.cardLabel as string) ?? 'Card Account',
      });
      this.#state.wallets[account.id] = {
        account,
        publicKey: (options?.publicKey as string) ?? '',
        cardLabel: (options?.cardLabel as string) ?? 'Card Account',
      };
      await this.#saveState();
      return account;
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // All card accounts are plain EOAs, compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    const wallet =
      this.#state.wallets[account.id] ??
      throwError(`Account '${account.id}' not found`);

    const newAccount: KeyringAccount = {
      ...wallet.account,
      ...account,
      // Restore read-only properties.
      address: wallet.account.address,
    };

    try {
      await this.#emitEvent(KeyringEvent.AccountUpdated, {
        account: newAccount,
      });
      wallet.account = newAccount;
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      await this.#emitEvent(KeyringEvent.AccountDeleted, { id });
      delete this.#state.wallets[id];
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async setSelectedAccounts(accounts: string[]): Promise<void> {
    this.#state.selectedAccounts = accounts;
    await this.#saveState();
  }

  async resolveAccountAddress(
    scope: CaipChainId,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress | null> {
    const from = this.#extractFromAddress(request);
    if (from === undefined) {
      return null;
    }

    const wallet = Object.values(this.#state.wallets).find(
      (entry) => entry.account.address.toLowerCase() === from.toLowerCase(),
    );
    if (!wallet) {
      return null;
    }

    return { address: `${scope}:${wallet.account.address}` };
  }

  #extractFromAddress(request: JsonRpcRequest): string | undefined {
    const params = (request.params ?? []) as Json[];
    switch (request.method) {
      case EthMethod.PersonalSign: {
        const [, from] = params as [string, string];
        return from;
      }
      case EthMethod.SignTransaction: {
        const [tx] = params as [{ from?: string }];
        return tx?.from;
      }
      case EthMethod.SignTypedDataV1:
      case EthMethod.SignTypedDataV3:
      case EthMethod.SignTypedDataV4:
      case EthMethod.Sign: {
        const [from] = params as [string];
        return from;
      }
      default:
        return undefined;
    }
  }

  async listRequests(): Promise<KeyringRequest[]> {
    return Object.values(this.#state.pendingRequests);
  }

  async getRequest(id: string): Promise<KeyringRequest> {
    return (
      this.#state.pendingRequests[id] ?? throwError(`Request '${id}' not found`)
    );
  }

  /**
   * Card accounts are ALWAYS asynchronous: signing needs a physical card tap in
   * the companion dapp, so we cannot resolve a request synchronously inside the
   * snap. We park the request and redirect the user to the companion dapp.
   */
  async submitRequest(request: KeyringRequest): Promise<SubmitRequestResponse> {
    this.#state.pendingRequests[request.id] = request;
    await this.#saveState();
    return {
      pending: true,
      redirect: {
        url: this.#getCompanionUrl(),
        message: 'Open NotWallet to review and approve with your card.',
      },
    };
  }

  /**
   * Approve a parked request with a signature produced BY THE CARD.
   *
   * The snap does NOT sign here. The companion dapp has already: decoded the
   * request, shown the clear-signing screen, tapped the card, and assembled the
   * final result (a serialized signed tx, or a signature string). We only relay
   * that result back to MetaMask. This is what keeps the key off the host.
   *
   * @param id - The pending request id.
   * @param data - Must contain `signature`: the finished result from the card.
   */
  async approveRequest(
    id: string,
    data?: Record<string, Json>,
  ): Promise<void> {
    const { request: _request } =
      this.#state.pendingRequests[id] ??
      throwError(`Request '${id}' not found`);

    const result = data?.signature;
    if (result === undefined || result === null) {
      throw new Error(
        'No signature provided. Card accounts are signed on the device, not in the snap.',
      );
    }

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestApproved, { id, result });
  }

  async rejectRequest(id: string): Promise<void> {
    if (this.#state.pendingRequests[id] === undefined) {
      throw new Error(`Request '${id}' not found`);
    }

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestRejected, { id });
  }

  async #removePendingRequest(id: string): Promise<void> {
    delete this.#state.pendingRequests[id];
    await this.#saveState();
  }

  #getCompanionUrl(): string {
    if (process.env.NODE_ENV === 'production') {
      const prodOrigin = process.env.DAPP_ORIGIN_PRODUCTION;
      const dappVersion: string = packageInfo.version;
      if (prodOrigin && dappVersion) {
        return `${prodOrigin}${dappVersion}/`;
      }
      // Fallback: bare production origin or the dev URL.
      return prodOrigin ?? 'http://localhost:8000';
    }
    // Development: always the local companion dapp.
    return process.env.DAPP_ORIGIN_DEVELOPMENT ?? 'http://localhost:8000';
  }

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }

  async #emitEvent<Event extends KeyringEvent>(
    event: Event,
    data: KeyringEventPayload<Event>,
  ): Promise<void> {
    await emitSnapKeyringEvent(snap, event, data);
  }

  // Card accounts are inherently asynchronous (they need a physical tap), so
  // "synchronous approvals" can never be enabled. These are kept as no-ops for
  // compatibility with the companion dapp's existing controls.
  async toggleSyncApprovals(): Promise<void> {
    this.#state.useSyncApprovals = false;
    await this.#saveState();
  }

  isSynchronousMode(): boolean {
    return false;
  }
}
