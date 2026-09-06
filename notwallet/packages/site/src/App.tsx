import type { KeyringAccount, KeyringRequest } from '@metamask/keyring-api';
import { KeyringSnapRpcClient } from '@metamask/keyring-snap-client';
import type { Json } from '@metamask/utils';
import type {
  ChangeEvent,
  FormEvent,
  FunctionComponent,
  ReactNode,
} from 'react';
import { useCallback, useContext, useEffect, useState } from 'react';

import { defaultSnapOrigin } from './config';
import { MetaMaskContext, MetamaskActions } from './hooks';
import type { KeyringState } from './utils';
import {
  connectSnap,
  getSnap,
  isSynchronousMode,
  toggleSynchronousApprovals,
} from './utils';
import { SimulatedCard } from './card';
import { clearSign, clearSignTypedData, short } from './clearsign';
import type { RiskLevel, RiskFlag } from './clearsign';
import { previewRequest, signRequestWithCard } from './signing';
import { MfkdfCard, readNfcCardId } from './card-mfkdf';
import { DesktopPhoneBridge } from './DesktopPhoneBridge';
import { PairPhoneWallet } from './PairPhoneWallet';
import type { RequestPreview } from './signing';
import snapPackageInfo from '../../snap/package.json';
import './clearsign-ui.css';

const snapId = defaultSnapOrigin;

// ── Card signer selection ──────────────────────────────────────────────────────
// By default, use SimulatedCard (software key in localStorage — DEV ONLY).
// Add `?card=halo` to the URL to use a real Arx HaLo NFC chip instead.
// The rest of the app depends only on the `CardSigner` interface — no changes
// needed when swapping implementations.
import type { CardSigner } from './card';

// Card mode: default is MFKDF (card ID + password → derived key, nothing stored).
// `?card=sim` uses the software SimulatedCard (quick tests, no password/NFC).
// `?card=halo` uses a real Arx HaLo NFC chip.
const CARD_MODE: 'mfkdf' | 'sim' | 'halo' = (() => {
  try {
    const mode = new URLSearchParams(window.location.search).get('card');
    if (mode === 'sim' || mode === 'halo') {
      return mode;
    }
  } catch {
    // ignore
  }
  return 'mfkdf';
})();

// For the sim/halo modes, the signer is static. For MFKDF it's built per-op from
// the live password + card id (see `buildSigner` in the component).
function staticSigner(): CardSigner | null {
  if (CARD_MODE === 'sim') {
    return new SimulatedCard();
  }
  if (CARD_MODE === 'halo') {
    // The real HaLo path (src/card-halo.ts) is kept for later but NOT bundled in
    // v1 — libhalo drags in node-only deps that break the web build. Wire it back
    // in during the physical-card milestone.
    console.warn('HaLo mode is not enabled in this build; using MFKDF instead.');
  }
  return null; // default: MFKDF (built from live password + card id)
}

// ── Demo requests ──────────────────────────────────────────────────────────────
// Showcase clear-signing without a live dapp (also handy for demo video).

/** Classic drainer: UNLIMITED USDC approval to an unknown spender. */
const DEMO_TX_APPROVAL = {
  id: 'demo-tx-approval',
  scope: 'eip155:1',
  account: '00000000-0000-0000-0000-000000000000',
  origin: 'https://app.some-defi.example',
  request: {
    method: 'eth_signTransaction',
    params: [
      {
        from: '0x1111111111111111111111111111111111111111',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
        value: '0x0',
        data:
          '0x095ea7b3' +
          '000000000000000000000000ba5eba5eba5eba5eba5eba5eba5eba5eba5eba5e' +
          'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        chainId: '0x1',
      },
    ],
  },
} as unknown as KeyringRequest;

/** Simple ETH transfer — should show as safe/info. */
const DEMO_TX_TRANSFER = {
  id: 'demo-tx-transfer',
  scope: 'eip155:1',
  account: '00000000-0000-0000-0000-000000000000',
  origin: 'https://app.uniswap.org',
  request: {
    method: 'eth_signTransaction',
    params: [
      {
        from: '0x1111111111111111111111111111111111111111',
        to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        value: '0x2386f26fc10000', // 0.01 ETH
        data: '0x',
        chainId: '0x1',
      },
    ],
  },
} as unknown as KeyringRequest;

/** ERC-2612 Permit — off-chain token approval phishing. */
const DEMO_TYPED_PERMIT = {
  id: 'demo-typed-permit',
  scope: 'eip155:1',
  account: '00000000-0000-0000-0000-000000000000',
  origin: 'https://phishing-site.example',
  request: {
    method: 'eth_signTypedData_v4',
    params: [
      '0x1111111111111111111111111111111111111111',
      JSON.stringify({
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        domain: {
          name: 'USD Coin',
          version: '2',
          chainId: 1,
          verifyingContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        },
        message: {
          owner: '0x1111111111111111111111111111111111111111',
          spender: '0xba5eba5eba5eba5eba5eba5eba5eba5eba5eba5e',
          value:
            '115792089237316195423570985008687907853269984665640564039457584007913129639935',
          nonce: '0',
          deadline:
            '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        },
      }),
    ],
  },
} as unknown as KeyringRequest;

/** Personal sign — simple message. */
const DEMO_PERSONAL_SIGN = {
  id: 'demo-personal-sign',
  scope: 'eip155:1',
  account: '00000000-0000-0000-0000-000000000000',
  origin: 'https://app.ens.domains',
  request: {
    method: 'personal_sign',
    params: [
      '0x' +
        Array.from(new TextEncoder().encode('Welcome to ENS! Please sign this message to verify your wallet ownership.'))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(''),
      '0x1111111111111111111111111111111111111111',
    ],
  },
} as unknown as KeyringRequest;

type DemoScenario = {
  label: string;
  request: KeyringRequest;
};

const DEMO_SCENARIOS: DemoScenario[] = [
  { label: '🚨 Infinite Approval', request: DEMO_TX_APPROVAL },
  { label: '💸 ETH Transfer', request: DEMO_TX_TRANSFER },
  { label: '🔏 Permit (ERC-2612)', request: DEMO_TYPED_PERMIT },
  { label: '✉️ Personal Sign', request: DEMO_PERSONAL_SIGN },
];

const isDemoMode = (): boolean => {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('demo') === '1' || p.get('demo') === 'permit' || p.has('demo');
  } catch {
    return false;
  }
};

const initialKeyringState: KeyringState = {
  pendingRequests: [],
  accounts: [],
  useSynchronousApprovals: true,
};

type MethodInput = {
  id: string;
  title: string;
  type: 'text' | 'textarea';
  placeholder: string;
  value: string;
  options?: string[];
  onChange: (value: string) => void;
};

type MethodConfig = {
  name: string;
  description: string;
  inputs?: MethodInput[];
  action: {
    label: string;
    disabled?: boolean;
    callback: () => Promise<unknown>;
  };
};

type SectionProps = {
  name: string;
  testId: string;
  children: ReactNode;
};

const valueBlockClassName =
  'overflow-auto text-break border rounded bg-light font-monospace small p-2 mb-0';

const getClient = () => {
  if (!window.ethereum) {
    throw new Error('MetaMask is not available.');
  }

  return new KeyringSnapRpcClient(snapId, window.ethereum);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return JSON.stringify(error, null, 2);
};

const formatResponse = (response: unknown) => {
  if (typeof response === 'string') {
    return response;
  }

  return JSON.stringify(response, null, 2);
};

const Section: FunctionComponent<SectionProps> = ({
  name,
  testId,
  children,
}) => (
  <section className="col" data-testid={testId}>
    <div className="card">
      <header className="card-header">
        <h2 className="h4 mb-0">{name}</h2>
      </header>
      <div className="card-body">{children}</div>
    </div>
  </section>
);

const ValueBlock: FunctionComponent<{ value: string }> = ({ value }) => (
  <pre className={valueBlockClassName}>{value}</pre>
);

const ResultTitle: FunctionComponent<{ variant: 'success' | 'danger' }> = ({
  variant,
}) => <p>{`${variant === 'success' ? 'Successful' : 'Error'} request:`}</p>;

const Result: FunctionComponent<{
  value: string;
  variant: 'success' | 'danger';
}> = ({ value, variant }) => (
  <div className={`alert alert-${variant} mb-0`} role="alert">
    <ResultTitle variant={variant} />
    <ValueBlock value={value} />
  </div>
);

const Method: FunctionComponent<MethodConfig> = ({
  description,
  inputs = [],
  action,
}) => {
  const [response, setResponse] = useState<unknown>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResponse(undefined);
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result = await action.callback();
      setResponse(result === undefined ? null : result);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      className="d-grid gap-3"
      onSubmit={(event) => {
        handleSubmit(event).catch(console.error);
      }}
    >
      <p className="text-muted mb-0">{description}</p>
      {inputs.map((input) => (
        <label className="d-block" key={input.id} htmlFor={input.id}>
          <span className="form-label">{input.title}</span>
          {input.type === 'textarea' ? (
            <textarea
              id={input.id}
              className="form-control"
              placeholder={input.placeholder}
              value={input.value}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                input.onChange(event.currentTarget.value)
              }
            />
          ) : (
            <>
              <input
                id={input.id}
                className="form-control"
                list={`${input.id}-options`}
                placeholder={input.placeholder}
                type="text"
                value={input.value}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  input.onChange(event.currentTarget.value)
                }
              />
              {input.options && (
                <datalist id={`${input.id}-options`}>
                  {input.options.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              )}
            </>
          )}
        </label>
      ))}
      <button
        className="btn btn-primary"
        disabled={(action.disabled ?? false) || isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Running' : action.label}
      </button>
      {response !== undefined && (
        <Result value={formatResponse(response)} variant="success" />
      )}
      {error !== undefined && <Result value={error} variant="danger" />}
    </form>
  );
};

const MethodsSection: FunctionComponent<{
  testId: string;
  methods: MethodConfig[];
}> = ({ testId, methods }) => (
  <>
    {methods.map((method) => {
      const methodTestId = `${testId}-${method.name.replace(/\s/gu, '')}`;

      return (
        <Section key={method.name} name={method.name} testId={methodTestId}>
          <Method key={method.name} {...method} />
        </Section>
      );
    })}
  </>
);

const AccountList: FunctionComponent<{
  accounts: KeyringAccount[];
  onDelete: (accountId: string) => Promise<void>;
}> = ({ accounts, onDelete }) => {
  const [deletingAccountId, setDeletingAccountId] = useState<string>();

  const handleDelete = async (accountId: string) => {
    setDeletingAccountId(accountId);

    try {
      await onDelete(accountId);
    } finally {
      setDeletingAccountId(undefined);
    }
  };

  if (accounts.length === 0) {
    return <p className="text-muted mb-0">No accounts.</p>;
  }

  return (
    <div className="d-grid gap-3">
      {accounts.map((account) => (
        <article className="border rounded p-3" key={account.id}>
          <h3 className="h6 text-break mb-3">{account.address}</h3>
          <dl className="d-grid gap-3 mb-3">
            <div className="d-grid gap-1">
              <dt className="text-muted fw-bold">ID</dt>
              <dd className="mb-0">
                <ValueBlock value={account.id} />
              </dd>
            </div>
            <div className="d-grid gap-1">
              <dt className="text-muted fw-bold">Address</dt>
              <dd className="mb-0">
                <ValueBlock value={account.address} />
              </dd>
            </div>
            <div className="d-grid gap-1">
              <dt className="text-muted fw-bold">Type</dt>
              <dd className="mb-0">{account.type}</dd>
            </div>
            <div className="d-grid gap-1">
              <dt className="text-muted fw-bold">Methods</dt>
              <dd className="mb-0">
                <ul className="mb-0 ps-3 text-break">
                  {account.methods.map((method) => (
                    <li key={`${account.id}-${method}`}>{method}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <button
            className="btn btn-danger"
            disabled={deletingAccountId === account.id}
            type="button"
            onClick={() => {
              handleDelete(account.id).catch(console.error);
            }}
          >
            {deletingAccountId === account.id ? 'Deleting' : 'Delete'}
          </button>
        </article>
      ))}
    </div>
  );
};

const SnapConnection: FunctionComponent<{
  hasMetaMask: boolean;
  isInstalled: boolean;
  isConnecting: boolean;
  onConnect: () => Promise<void>;
}> = ({ hasMetaMask, isInstalled, isConnecting, onConnect }) => (
  <Section name="Simple Snap Keyring" testId="SimpleSnapKeyring">
    <form
      className="connection-form"
      onSubmit={(event) => {
        event.preventDefault();
        onConnect().catch(console.error);
      }}
    >
      <label className="mb-3" htmlFor="snap-id">
        <span className="form-label">Snap ID</span>
        <input
          id="snap-id"
          className="form-control"
          data-testid="connect-snap-id"
          disabled={true}
          type="text"
          value={snapId}
          readOnly
        />
      </label>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <button
          id="connectButton"
          className="btn btn-primary"
          data-testid="connect-button"
          disabled={!hasMetaMask || isConnecting}
          type="submit"
        >
          {isConnecting
            ? 'Connecting'
            : `${isInstalled ? 'Reconnect' : 'Connect'} Simple Snap Keyring`}
        </button>
        {isInstalled && (
          <span className="badge text-bg-success" id="snapConnected">
            Connected
          </span>
        )}
      </div>
      <p className="text-muted">Version {snapPackageInfo.version}</p>
    </form>
  </Section>
);

const Options: FunctionComponent<{
  enabled: boolean;
  checked: boolean;
  isToggling: boolean;
  onToggle: () => Promise<void>;
}> = ({ enabled, checked, isToggling, onToggle }) => (
  <Section name="Options" testId="Options">
    <label
      className="d-flex gap-2 align-items-center"
      htmlFor="use-sync-flow-toggle"
    >
      <input
        id="use-sync-flow-toggle"
        className="form-check-input m-0"
        data-testid="use-sync-flow-toggle"
        disabled={!enabled || isToggling}
        type="checkbox"
        checked={checked}
        onChange={() => {
          onToggle().catch(console.error);
        }}
      />
      <span>Use Synchronous Approval</span>
    </label>
  </Section>
);

// ── Risk flag icons ────────────────────────────────────────────────────────────
const FLAG_ICON: Record<RiskLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  danger: '🚨',
};

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum Mainnet',
  5: 'Goerli',
  11155111: 'Sepolia',
  137: 'Polygon',
  10: 'Optimism',
  42161: 'Arbitrum One',
};

const METHOD_LABELS: Record<string, string> = {
  eth_signTransaction: 'Transaction',
  personal_sign: 'Personal Sign',
  eth_sign: 'Eth Sign',
  eth_signTypedData_v3: 'Typed Data (v3)',
  eth_signTypedData_v4: 'Typed Data (v4)',
};

/**
 * Resolve a preview + clear-sign result from a request.
 */
function resolvePreview(request: KeyringRequest): {
  preview: RequestPreview;
  summary: string;
  flags: RiskFlag[];
  worst: RiskLevel;
} {
  const preview = previewRequest(request);
  let summary: string;
  let flags: RiskFlag[] = [];
  let worst: RiskLevel = 'info';

  if (preview.kind === 'tx') {
    const result = clearSign(preview.tx, new Set());
    summary = result.summary;
    flags = result.flags;
    worst = result.worstLevel;
  } else if (preview.kind === 'typedData') {
    const result = clearSignTypedData(
      preview.domain,
      preview.primaryType,
      preview.message,
      new Set(),
    );
    summary = result.summary;
    flags = result.flags;
    worst = result.worstLevel;
  } else if (preview.kind === 'message') {
    summary = `Sign this message: "${preview.text.length > 120 ? preview.text.slice(0, 120) + '…' : preview.text}"`;
  } else {
    summary = `Approve request: ${preview.method}`;
  }

  return { preview, summary, flags, worst };
}

/**
 * The premium clear-signing screen — the demo centerpiece.
 *
 * Dark glassmorphism panel with risk-level color coding, monospaced addresses,
 * transaction/typed-data details, and pulsing "tap card" button.
 */
const ClearSignPanel: FunctionComponent<{
  request?: KeyringRequest | undefined;
  busy: boolean;
  onApprove: (request: KeyringRequest) => void;
  onReject: (request: KeyringRequest) => void;
  origin?: string | undefined;
}> = ({ request, busy, onApprove, onReject, origin }) => {
  if (!request) {
    return (
      <div className="cs-panel">
        <div className="cs-empty">
          <div className="cs-empty__icon">🔐</div>
          <p className="cs-empty__text">
            No pending signing requests.
            <br />
            Trigger one from a dapp or use demo mode.
          </p>
        </div>
      </div>
    );
  }

  const { preview, summary, flags, worst } = resolvePreview(request);
  const methodLabel =
    METHOD_LABELS[preview.method] ?? preview.method;

  return (
    <div className="cs-panel" data-testid="ClearSignPanel">
      {/* ── Header ── */}
      <div className={`cs-header cs-header--${worst}`}>
        <h3 className="cs-header__title">Review &amp; Sign</h3>
        <span className={`cs-badge cs-badge--${worst}`}>
          <span className="cs-badge__dot" />
          {worst === 'info' ? 'SAFE' : worst.toUpperCase()}
        </span>
      </div>

      {/* ── Origin ── */}
      {origin && (
        <div className="cs-origin">
          <span className="cs-origin__label">From</span>
          <span className="cs-origin__value">{origin}</span>
        </div>
      )}

      <div className="cs-body">
        {/* ── Method badge ── */}
        <div className="cs-method">{methodLabel}</div>

        {/* ── Summary ── */}
        <p className="cs-summary">{summary}</p>

        {/* ── Risk flags ── */}
        {flags.length > 0 && (
          <div className="cs-flags">
            {flags.map((flag, index) => (
              <div key={index} className={`cs-flag cs-flag--${flag.level}`}>
                <span className="cs-flag__icon">
                  {FLAG_ICON[flag.level]}
                </span>
                <span>{flag.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Transaction details ── */}
        {preview.kind === 'tx' && (
          <div className="cs-details">
            {preview.tx.to && (
              <div className="cs-detail-row">
                <span className="cs-detail-row__label">To</span>
                <span className="cs-detail-row__value">
                  {short(preview.tx.to)}
                </span>
              </div>
            )}
            <div className="cs-detail-row">
              <span className="cs-detail-row__label">Value</span>
              <span className="cs-detail-row__value">
                {preview.tx.valueWei === 0n
                  ? '0 ETH'
                  : `${(Number(preview.tx.valueWei) / 1e18).toFixed(6)} ETH`}
              </span>
            </div>
            <div className="cs-detail-row">
              <span className="cs-detail-row__label">Chain</span>
              <span className="cs-detail-row__value">
                {CHAIN_NAMES[preview.tx.chainId] ??
                  `Chain ${preview.tx.chainId}`}
              </span>
            </div>
            {preview.tx.data !== '0x' && (
              <div className="cs-detail-row">
                <span className="cs-detail-row__label">Data</span>
                <span className="cs-detail-row__value">
                  {preview.tx.data.length > 20
                    ? `${preview.tx.data.slice(0, 10)}…${preview.tx.data.slice(-8)} (${Math.floor((preview.tx.data.length - 2) / 2)} bytes)`
                    : preview.tx.data}
                </span>
              </div>
            )}
            <div className="cs-detail-row">
              <span className="cs-detail-row__label">From</span>
              <span className="cs-detail-row__value">
                {short(preview.from)}
              </span>
            </div>
          </div>
        )}

        {/* ── Typed data details ── */}
        {preview.kind === 'typedData' && (
          <div className="cs-typed-data">
            <h4 className="cs-typed-data__header">
              {preview.primaryType} — {preview.domain.name ?? 'Unknown dApp'}
            </h4>
            {preview.domain.verifyingContract && (
              <div className="cs-typed-data__field">
                <span className="cs-typed-data__key">Contract</span>
                <span className="cs-typed-data__val">
                  {short(preview.domain.verifyingContract)}
                </span>
              </div>
            )}
            {preview.domain.chainId !== undefined && (
              <div className="cs-typed-data__field">
                <span className="cs-typed-data__key">Chain</span>
                <span className="cs-typed-data__val">
                  {CHAIN_NAMES[preview.domain.chainId] ??
                    `Chain ${preview.domain.chainId}`}
                </span>
              </div>
            )}
            {Object.entries(preview.message).map(([key, val]) => (
              <div key={key} className="cs-typed-data__field">
                <span className="cs-typed-data__key">{key}</span>
                <span className="cs-typed-data__val">
                  {typeof val === 'string' && val.length > 30
                    ? short(val)
                    : String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Message details ── */}
        {preview.kind === 'message' && (
          <div className="cs-details">
            <div className="cs-detail-row">
              <span className="cs-detail-row__label">From</span>
              <span className="cs-detail-row__value">
                {short(preview.from)}
              </span>
            </div>
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="cs-actions">
          <button
            type="button"
            className={`cs-btn ${
              worst === 'danger'
                ? 'cs-btn--approve-danger'
                : 'cs-btn--approve'
            } ${busy ? 'cs-btn--busy' : ''}`}
            disabled={busy}
            onClick={() => onApprove(request)}
          >
            <span className="cs-card-icon">📇</span>
            {busy ? 'Signing on card…' : 'Tap card to approve'}
          </button>
          <button
            type="button"
            className="cs-btn cs-btn--reject"
            disabled={busy}
            onClick={() => onReject(request)}
          >
            Reject
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="cs-footer">
        <p className="cs-footer__text">
          <span className="cs-footer__lock">🔒</span>
          The signing key lives on the card — never on this computer.
        </p>
      </div>
    </div>
  );
};

/**
 * Demo mode: shows a scenario picker and renders the clear-sign panel
 * in a phone-style dark container — the demo video hero shot.
 */
const DemoView: FunctionComponent = () => {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const scenario = DEMO_SCENARIOS[scenarioIndex];

  return (
    <div className="cs-page">
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <div className="cs-demo-bar">
          {DEMO_SCENARIOS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`cs-demo-btn ${
                i === scenarioIndex ? 'cs-demo-btn--active' : ''
              }`}
              onClick={() => setScenarioIndex(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <ClearSignPanel
          request={scenario?.request}
          busy={false}
          onApprove={() =>
            alert('In a real flow, this would tap the card and sign.')
          }
          onReject={() =>
            alert('Request rejected.')
          }
          origin={
            (scenario?.request as any)?.origin ?? 'https://example.com'
          }
        />
      </div>
    </div>
  );
};

/**
 * MFKDF factor entry: the password ("something you know") + the NFC card id
 * ("something you have"). The key is derived from both, used, and wiped — never
 * stored. Hidden in sim/halo modes (those don't use derived factors).
 */
const CredentialsPanel: FunctionComponent<{
  password: string;
  onPassword: (value: string) => void;
  cardId: string;
  onCardId: (value: string) => void;
  onReadCard: () => void;
  isReadingCard: boolean;
}> = ({
  password,
  onPassword,
  cardId,
  onCardId,
  onReadCard,
  isReadingCard,
}) => {
  if (CARD_MODE !== 'mfkdf') {
    return null;
  }
  return (
    <div className="card mb-3" data-testid="CredentialsPanel">
      <div className="card-header">🔑 Your card + password</div>
      <div className="card-body">
        <div className="row g-2">
          <div className="col-12 col-md-5">
            <input
              type="password"
              className="form-control"
              placeholder="Password (never stored)"
              value={password}
              onChange={(event) => onPassword(event.target.value)}
            />
          </div>
          <div className="col-8 col-md-5">
            <input
              type="text"
              className="form-control"
              placeholder="Card ID (tap to fill)"
              value={cardId}
              onChange={(event) => onCardId(event.target.value)}
            />
          </div>
          <div className="col-4 col-md-2 d-grid">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={onReadCard}
              disabled={isReadingCard}
            >
              {isReadingCard ? 'Tap now…' : '📇 Tap card'}
            </button>
          </div>
        </div>
        <p className="small text-muted mb-0 mt-2">
          Your key is derived from these two, used to sign, then wiped — never
          stored on this machine or in MetaMask. On desktop (no NFC) type any card
          id; on Android, tap a real NFC card.
        </p>
      </div>
    </div>
  );
};

export const App: FunctionComponent = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [snapState, setSnapState] = useState<KeyringState>(initialKeyringState);
  const [privateKey, setPrivateKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountObject, setAccountObject] = useState('');
  const [requestId, setRequestId] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isTogglingSync, setIsTogglingSync] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [mfkdfPassword, setMfkdfPassword] = useState('');
  const [cardId, setCardId] = useState('');
  const [isReadingCard, setIsReadingCard] = useState(false);
  const [signOnPhone, setSignOnPhone] = useState(false);

  // ── Demo mode ──────────────────────────────────────────────────────────────
  if (isDemoMode()) {
    return <DemoView />;
  }

  const handleError = useCallback(
    (error: unknown) => {
      console.error(error);
      dispatch({
        type: MetamaskActions.SetError,
        payload:
          error instanceof Error ? error : new Error(getErrorMessage(error)),
      });
    },
    [dispatch],
  );

  const syncAccounts = useCallback(async () => {
    const accounts = await getClient().listAccounts();
    setSnapState((currentState) => ({
      ...currentState,
      accounts,
    }));
    return accounts;
  }, []);

  const syncRequests = useCallback(async () => {
    const pendingRequests = await getClient().listRequests();
    setSnapState((currentState) => ({
      ...currentState,
      pendingRequests,
    }));
    return pendingRequests;
  }, []);

  const refreshSnapState = useCallback(async () => {
    const client = getClient();
    const [accounts, pendingRequests, useSynchronousApprovals] =
      await Promise.all([
        client.listAccounts(),
        client.listRequests(),
        isSynchronousMode(),
      ]);

    setSnapState({
      accounts,
      pendingRequests,
      useSynchronousApprovals,
    });
  }, []);

  useEffect(() => {
    if (!state.installedSnap) {
      setSnapState(initialKeyringState);
      return;
    }

    refreshSnapState().catch(handleError);
  }, [handleError, refreshSnapState, state.installedSnap]);

  const handleConnectClick = async () => {
    setIsConnecting(true);

    try {
      await connectSnap();
      const installedSnap = await getSnap();

      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });

      if (installedSnap) {
        await refreshSnapState();
      }
    } catch (error) {
      handleError(error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUseSyncToggle = async () => {
    setIsTogglingSync(true);

    try {
      await toggleSynchronousApprovals();
      setSnapState((currentState) => ({
        ...currentState,
        useSynchronousApprovals: !currentState.useSynchronousApprovals,
      }));
    } catch (error) {
      handleError(error);
    } finally {
      setIsTogglingSync(false);
    }
  };

  // Build the active signer. For MFKDF (default) it derives from the live
  // password + card id; those factors are validated inside MfkdfCard.
  const buildSigner = useCallback((): CardSigner => {
    return (
      staticSigner() ??
      new MfkdfCard({ cardId, password: mfkdfPassword, label: 'NFC Card' })
    );
  }, [cardId, mfkdfPassword]);

  const handleReadCard = useCallback(async () => {
    setIsReadingCard(true);
    try {
      setCardId(await readNfcCardId());
    } catch (error) {
      handleError(error);
    } finally {
      setIsReadingCard(false);
    }
  }, [handleError]);

  // Register an account paired from the phone app (public info only, no key).
  const handlePairAccount = useCallback(
    async (address: string, publicKey: string, label: string) => {
      await getClient().createAccount({ address, publicKey, cardLabel: label });
      await syncAccounts();
    },
    [syncAccounts],
  );

  const createAccount = async () => {
    // Derive the card's public identity; the snap stores NO private key.
    const identity = await buildSigner().getIdentity();
    const newAccount = await getClient().createAccount({
      address: identity.address,
      publicKey: identity.publicKey,
      cardLabel: identity.label,
    });
    await syncAccounts();
    return newAccount;
  };

  const approveWithCard = useCallback(
    async (request: KeyringRequest) => {
      setIsSigning(true);
      try {
        const signer = buildSigner();
        // GUARD: verify the derived key matches THIS account *before* signing.
        // A wrong password or card derives a different key — we must fail loudly
        // and leave the request pending, never relay a wrong-key signature.
        const identity = await signer.getIdentity();
        const account = snapState.accounts.find(
          (item) => item.id === request.account,
        );
        if (
          account &&
          identity.address.toLowerCase() !== account.address.toLowerCase()
        ) {
          throw new Error(
            `Wrong password or card. The key it derived (${identity.address}) ` +
              `does not match this account (${account.address}). ` +
              `Nothing was signed — fix the password/card and try again.`,
          );
        }
        // Sign on the card in the companion dapp, then hand the finished
        // signature to the snap — which only relays it (it cannot sign itself).
        const signature = await signRequestWithCard(request, signer);
        await getClient().approveRequest(request.id, { signature });
        await syncRequests();
      } catch (error) {
        handleError(error);
      } finally {
        setIsSigning(false);
      }
    },
    [buildSigner, handleError, snapState.accounts, syncRequests],
  );

  // Signature produced on the PHONE (scanned via QR) — just relay it to the snap.
  // The key was derived and used on the phone; it never touched this machine.
  const handlePhoneSignature = useCallback(
    async (id: string, signature: Json) => {
      try {
        await getClient().approveRequest(id, { signature });
        await syncRequests();
        setSignOnPhone(false);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, syncRequests],
  );

  const rejectRequestByObject = useCallback(
    async (request: KeyringRequest) => {
      try {
        await getClient().rejectRequest(request.id);
        await syncRequests();
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, syncRequests],
  );

  const importAccount = async () => {
    if (!privateKey) {
      throw new Error('Private key is required.');
    }

    const newAccount = await getClient().createAccount({ privateKey });
    await syncAccounts();
    return newAccount;
  };

  const deleteAccount = async (accountIdToDelete = accountId) => {
    if (!accountIdToDelete) {
      throw new Error('Account ID is required.');
    }

    await getClient().deleteAccount(accountIdToDelete);
    await syncAccounts();
  };

  const updateAccount = async () => {
    if (!accountObject) {
      throw new Error('Account object is required.');
    }

    const account = JSON.parse(accountObject) as KeyringAccount;
    await getClient().updateAccount(account);
    await syncAccounts();
  };

  const accountIds = snapState.accounts.map((account) => account.id);

  const accountManagementMethods: MethodConfig[] = [
    {
      name: 'Create account',
      description: 'Create a new account.',
      action: {
        callback: createAccount,
        disabled: !state.installedSnap,
        label: 'Create Account',
      },
    },
    {
      name: 'Import account',
      description: 'Import an account using a private key.',
      inputs: [
        {
          id: 'import-account-private-key',
          title: 'Private key',
          value: privateKey,
          type: 'text',
          placeholder:
            'E.g. 0000000000000000000000000000000000000000000000000000000000000000',
          onChange: setPrivateKey,
        },
      ],
      action: {
        callback: importAccount,
        disabled: !state.installedSnap || !privateKey,
        label: 'Import Account',
      },
    },
    {
      name: 'Get account',
      description: 'Get data for an account.',
      inputs: [
        {
          id: 'get-account-account-id',
          title: 'Account ID',
          value: accountId,
          type: 'text',
          placeholder: 'E.g. f59a9562-96de-4e75-9229-079e82c7822a',
          options: accountIds,
          onChange: setAccountId,
        },
      ],
      action: {
        disabled: !state.installedSnap || !accountId,
        callback: async () => getClient().getAccount(accountId),
        label: 'Get Account',
      },
    },
    {
      name: 'List accounts',
      description: 'List all accounts managed by the snap.',
      action: {
        disabled: !state.installedSnap,
        callback: syncAccounts,
        label: 'List Accounts',
      },
    },
    {
      name: 'Remove account',
      description: 'Remove an account.',
      inputs: [
        {
          id: 'delete-account-account-id',
          title: 'Account ID',
          value: accountId,
          type: 'text',
          placeholder: 'E.g. 394bd587-7be4-4ffb-a113-198c6a7764c2',
          options: accountIds,
          onChange: setAccountId,
        },
      ],
      action: {
        disabled: !state.installedSnap || !accountId,
        callback: async () => deleteAccount(),
        label: 'Remove Account',
      },
    },
    {
      name: 'Update account',
      description: 'Update an account.',
      inputs: [
        {
          id: 'update-account-account-object',
          title: 'Account Object',
          value: accountObject,
          type: 'textarea',
          placeholder: 'E.g. { "id": "..." }',
          onChange: setAccountObject,
        },
      ],
      action: {
        disabled: !state.installedSnap || !accountObject,
        callback: updateAccount,
        label: 'Update Account',
      },
    },
  ];

  const requestMethods: MethodConfig[] = [
    {
      name: 'Get request',
      description: 'Get a pending request by ID.',
      inputs: [
        {
          id: 'get-request-request-id',
          title: 'Request ID',
          value: requestId,
          type: 'text',
          placeholder: 'E.g. e5156958-16ad-4d5d-9dcd-6a8ba1d34906',
          options: snapState.pendingRequests.map(
            (request: KeyringRequest) => request.id,
          ),
          onChange: setRequestId,
        },
      ],
      action: {
        disabled: !state.installedSnap || !requestId,
        callback: async () => getClient().getRequest(requestId),
        label: 'Get Request',
      },
    },
    {
      name: 'List requests',
      description: 'List pending requests.',
      action: {
        disabled: !state.installedSnap,
        callback: syncRequests,
        label: 'List Requests',
      },
    },
    {
      name: 'Approve request',
      description: 'Approve a pending request by ID.',
      inputs: [
        {
          id: 'approve-request-request-id',
          title: 'Request ID',
          value: requestId,
          type: 'text',
          placeholder: 'E.g. 6fcbe1b5-f250-452c-8114-683dfa5ea74d',
          options: snapState.pendingRequests.map(
            (request: KeyringRequest) => request.id,
          ),
          onChange: setRequestId,
        },
      ],
      action: {
        disabled: !state.installedSnap || !requestId,
        callback: async () => {
          // Route through the card: fetch the request, clear-sign + sign on the
          // card, then relay the signature. (The snap never signs by itself.)
          const request = await getClient().getRequest(requestId);
          await approveWithCard(request);
        },
        label: 'Approve Request (via card)',
      },
    },
    {
      name: 'Reject request',
      description: 'Reject a pending request by ID.',
      inputs: [
        {
          id: 'reject-request-request-id',
          title: 'Request ID',
          value: requestId,
          type: 'text',
          placeholder: 'E.g. 424ad2ee-56cf-493e-af82-cee79c591117',
          options: snapState.pendingRequests.map(
            (request: KeyringRequest) => request.id,
          ),
          onChange: setRequestId,
        },
      ],
      action: {
        disabled: !state.installedSnap || !requestId,
        callback: async () => {
          const response = await getClient().rejectRequest(requestId);
          await syncRequests();
          return response;
        },
        label: 'Reject Request',
      },
    },
  ];

  // Pick the first pending request for the clear-sign hero panel.
  const activeRequest = snapState.pendingRequests[0];

  return (
    <main className="container-fluid py-3">
      <div className="alert alert-danger" role="alert">
        This is a developer tool for testing purposes. Don't use it to store
        real assets. Use with caution.
      </div>
      {!state.hasMetaMask && (
        <div className="alert alert-warning" role="alert">
          MetaMask was not detected.
        </div>
      )}
      {state.error && (
        <div className="alert alert-danger" role="alert">
          {state.error.message}
        </div>
      )}

      <CredentialsPanel
        password={mfkdfPassword}
        onPassword={setMfkdfPassword}
        cardId={cardId}
        onCardId={setCardId}
        onReadCard={handleReadCard}
        isReadingCard={isReadingCard}
      />

      {/* ── Premium clear-sign panel ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '16px 0 24px',
        background: snapState.pendingRequests.length > 0
          ? 'linear-gradient(180deg, #0c0e14 0%, transparent 100%)'
          : undefined,
        borderRadius: '16px',
        marginBottom: '16px',
      }}>
        <ClearSignPanel
          request={activeRequest}
          busy={isSigning}
          onApprove={approveWithCard}
          onReject={rejectRequestByObject}
          origin={(activeRequest as any)?.origin}
        />
      </div>

      {activeRequest &&
        (signOnPhone ? (
          <DesktopPhoneBridge
            request={activeRequest}
            onSignature={handlePhoneSignature}
            onCancel={() => setSignOnPhone(false)}
          />
        ) : (
          <div className="text-center mb-3">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => setSignOnPhone(true)}
            >
              📱 Sign on phone instead (air-gapped)
            </button>
          </div>
        ))}

      <div className="row gx-3 gy-3 row-cols-1 row-cols-sm-2 row-cols-lg-3">
        <SnapConnection
          hasMetaMask={state.hasMetaMask}
          isConnecting={isConnecting}
          isInstalled={Boolean(state.installedSnap)}
          onConnect={handleConnectClick}
        />
        <Section name="Accounts" testId="Accounts">
          <AccountList
            accounts={snapState.accounts}
            onDelete={async (accountIdToDelete) =>
              deleteAccount(accountIdToDelete)
            }
          />
        </Section>
        <PairPhoneWallet
          onAccount={handlePairAccount}
          disabled={!state.installedSnap}
        />
        <Options
          checked={snapState.useSynchronousApprovals}
          enabled={Boolean(state.installedSnap)}
          isToggling={isTogglingSync}
          onToggle={handleUseSyncToggle}
        />
        <MethodsSection
          testId="AccountMethods"
          methods={accountManagementMethods}
        />
        <MethodsSection testId="RequestMethods" methods={requestMethods} />
      </div>
    </main>
  );
};
