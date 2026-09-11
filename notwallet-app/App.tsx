import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthScreen,
  ConnectScreen,
  HomeScreen,
  ReviewScreen,
  SettingsScreen,
  IdentityScreen,
  AgentsScreen,
  ApprovalsScreen,
  PolicyBlockScreen,
  RecoveryScreen,
  AgentDetailScreen,
  AccountSheet,
} from './src/screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorDialog } from './src/ui/kit';
import { copyToClipboard } from './src/clipboard';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  clearSign,
  clearSignTypedData,
  type ClearSignResult,
  type ResolvedNames,
} from './src/clearsign';
import {
  resolveAddress,
  resolveAddresses,
  resolveName,
  getParentRegistry,
  getSubregistry,
  getResolverFor,
  isLabelAvailable,
  buildRegisterTx,
  buildClaimTx,
  registrarAvailable,
  hasRegistrar,
  buildSetTextTx,
  buildRegistrySetTextTx,
  ENS_REGISTRAR,
  buildUnregisterTx,
  defaultExpiry,
  ENSV2,
  ENS_PARENT_NAME,
  USER_IDENTITY_ROLES,
  AGENT_ROLES,
  RECOVERY_RECORD_KEY,
  type ResolvedIdentity,
} from './src/ens';
import {
  deriveAgentAddress,
  agentSigner,
  buildAccounts,
  findAccount,
  loadAgents,
  upsertAgent,
  markAgentRevoked,
  patchAgent,
  patchAgentRegistered,
  childrenOf,
  agentParentName,
  normalizeLabel,
  type Agent,
  type WalletAccount,
} from './src/agents';
import { getAddress, isAddress } from 'ethers';
import { buildMintUsdcTx, buildUsdcTransferTx, usdcBalanceOf } from './src/tokens';
import { loadHistory, recordTx, type TxRecord } from './src/history';
import { registerSubwalletOnChain } from './src/subwallet-ens';
import { MfkdfSigner } from './src/mfkdf';
import { startMonitoring, stopMonitoring, recordLocalTransaction, sendSpendingNotification } from './src/monitor';
import { checkPolicy, getSpendingSummary } from './src/policies';
import {
  loadSettings,
  saveSettings,
  settingsToPolicy,
  DEFAULT_SETTINGS,
  type WalletSettings,
} from './src/settings';
import {
  loadIdentity,
  saveIdentity,
  EMPTY_IDENTITY,
  type WalletIdentity,
} from './src/identity';
import {
  setRecoveryAddress,
  trackApproval,
  executeEmergencyRecovery,
  type RecoveryResult,
} from './src/recovery';
import { scanApprovals, buildRevokeData, type TokenApproval } from './src/approvals';
import { previewRequest, signRequestWithCard, signAndBroadcast } from './src/signing';
import { getTodaySpent, recordSpend } from './src/spend-tracker';
import {
  loadWallet,
  addCard,
  hashCardUid,
  setActiveCard,
  type StoredWallet,
} from './src/storage';
import { colors, spacing, radius } from './src/theme';
import type { KeyringRequest } from './src/types';
import {
  initWalletKit,
  pairWithDapp,
  approveSession,
  rejectSession,
  respondSuccess,
  respondError,
  disconnectSession,
  getActiveSessions,
  wcRequestToKeyringRequest,
  onSessionProposal,
  onSessionRequest,
  onSessionDelete,
} from './src/walletconnect';
import type { WalletKitTypes } from '@reown/walletkit';

import { NfcScanSheet } from './src/components/NfcScanSheet';
import { ReceiveModal } from './src/components/ReceiveModal';
import { SendModal } from './src/components/SendModal';
import { LogViewerModal } from './src/components/LogViewerModal';
import { verifyHuman } from './src/worldid';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const ETH_USD_PRICE = 2400; // Reference price for portfolio display

type Screen =
  | 'loading'
  | 'setup'
  | 'unlock'
  | 'home'
  | 'connect'
  | 'review'
  | 'policy_block'
  | 'settings'
  | 'identity'
  | 'agents'
  | 'agent_detail'
  | 'approvals'
  | 'recovery_vault';

/** A signed ENS write we want to persist to local identity once it lands. */
type PendingIdentityAction =
  | { type: 'claim'; ensName: string }
  | { type: 'guardian'; guardianAddress: string; guardianEns: string | null }
  | { type: 'agent'; agent: Agent }
  | { type: 'revokeAgent'; fullName: string };

type Account = { address: string; publicKey: string };

function summarize(request: KeyringRequest, resolvedNames?: ResolvedNames): {
  result: ClearSignResult | null;
  fallback: string;
  from: string;
} {
  const preview = previewRequest(request);
  switch (preview.kind) {
    case 'tx':
      return { result: clearSign(preview.tx, new Set(), resolvedNames), fallback: '', from: preview.from };
    case 'typedData':
      return {
        result: clearSignTypedData(preview.domain, preview.primaryType, preview.message, new Set()),
        fallback: '',
        from: preview.from,
      };
    case 'message':
      return { result: null, fallback: `Sign message: "${preview.text}"`, from: preview.from };
    default:
      return { result: null, fallback: `Approve: ${preview.method}`, from: '' };
  }
}

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);


/** Derive a history entry from a signed request (id prefix + tx shape). */
function historyMetaFor(
  request: KeyringRequest,
  preview: ReturnType<typeof previewRequest>,
  dappName?: string,
): { kind: TxRecord['kind']; title: string; to?: string } {
  const id = request.id;
  const to = preview.kind === 'tx' ? preview.tx.to ?? undefined : undefined;
  const eth = preview.kind === 'tx' ? Number(preview.tx.valueWei) / 1e18 : 0;
  if (id.startsWith('mint-usdc')) return { kind: 'mint', title: 'Minted 100 test USDC' };
  if (id.startsWith('fund-gas')) return { kind: 'fund', title: `Funded gas ${eth} ETH`, to };
  if (id.startsWith('fund')) return { kind: 'fund', title: 'Funded sub-wallet (USDC)', to };
  if (id.startsWith('ens-claim')) return { kind: 'ens', title: 'Claimed ENS name' };
  if (id.startsWith('ens-guardian')) return { kind: 'ens', title: 'Set recovery guardian' };
  if (id.startsWith('ens-subreg')) return { kind: 'ens', title: 'Enabled sub-wallet registry' };
  if (id.startsWith('ens-agent')) return { kind: 'ens', title: 'Registered sub-wallet on ENS' };
  if (id.startsWith('ens')) return { kind: 'ens', title: 'ENS transaction' };
  if (id.startsWith('revoke')) return { kind: 'revoke', title: 'Revoked token approval', to };
  if (id.startsWith('send')) return { kind: 'send', title: `Sent ${eth} ETH`, to };
  return { kind: 'contract', title: dappName ? `Signed for ${dappName}` : 'Contract interaction', to };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [balance, setBalance] = useState('0.0000');
  const [fiatBalance, setFiatBalance] = useState('$0.00');
  const [request, setRequest] = useState<KeyringRequest | null>(null);
  const [wcEvent, setWcEvent] = useState<WalletKitTypes.SessionRequest | null>(null);
  const [resolvedNames, setResolvedNames] = useState<ResolvedNames | undefined>(undefined);
  const [counterparty, setCounterparty] = useState<ResolvedIdentity | null>(null);
  const [policyResult, setPolicyResult] = useState<{ reason: string; canOverride: boolean } | null>(null);
  const [settings, setSettings] = useState<WalletSettings>(DEFAULT_SETTINGS);
  const [identity, setIdentity] = useState<WalletIdentity>(EMPTY_IDENTITY);
  const [pendingIdentityAction, setPendingIdentityAction] = useState<PendingIdentityAction | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentDraft, setAgentDraft] = useState<
    { label: string; chain: string; budgetUsd: number; note: string; parentName: string } | null
  >(null);
  // When set, the next created sub-wallet nests under this name (agent-under-agent).
  const [createParentName, setCreateParentName] = useState<string | null>(null);
  // The account the Home view / send / receive currently operate as.
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  // A dapp connection waiting for the user to choose which wallet to connect.
  const [pendingProposal, setPendingProposal] = useState<WalletKitTypes.SessionProposal | null>(null);
  // Transaction history (local — every tx the app broadcasts).
  const [history, setHistory] = useState<TxRecord[]>([]);
  // The sub-wallet whose detail screen is open, and its live balances.
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [agentEth, setAgentEth] = useState('0.0000');
  const [agentUsdc, setAgentUsdc] = useState('0.00');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);

  // The unified, selectable account list (main + active sub-wallets).
  const accounts = useMemo<WalletAccount[]>(
    () => buildAccounts(account, identity.ensName, agents),
    [account, identity.ensName, agents],
  );
  const activeAccount =
    (activeAddress && findAccount(accounts, activeAddress)) || accounts[0] || null;
  const accountsRef = useRef(accounts);
  useEffect(() => { accountsRef.current = accounts; }, [accounts]);
  // Re-fetch balance whenever the operating account changes (main ↔ sub-wallet).
  useEffect(() => {
    if (activeAccount) void fetchBalance(activeAccount.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.address]);

  const selectedAgent = agents.find(
    (a) => a.fullName.toLowerCase() === (selectedAgentName ?? '').toLowerCase(),
  ) ?? null;
  // Load a sub-wallet's live balances when its detail screen opens.
  useEffect(() => {
    let alive = true;
    if (!selectedAgent) return;
    (async () => {
      try {
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        const [wei, usdc] = await Promise.all([
          provider.getBalance(selectedAgent.address),
          usdcBalanceOf(selectedAgent.address),
        ]);
        if (!alive) return;
        setAgentEth(Number(formatEther(wei)).toFixed(4));
        setAgentUsdc(usdc);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentName]);

  const openAgent = useCallback((agent: Agent) => {
    setSelectedAgentName(agent.fullName);
    setAgentEth('0.0000');
    setAgentUsdc('0.00');
    setIdentityStatus(null);
    setScreen('agent_detail');
  }, []);

  /** Fund a sub-wallet with USDC from your main wallet (the budget → balance). */
  const onFundAgentUsdc = useCallback((agent: Agent, amount: number) => {
    if (!account || amount <= 0) return;
    const tx = buildUsdcTransferTx(agent.address, amount);
    setRequest({
      id: `fund-${Date.now()}`,
      account: account.address,
      request: { method: 'eth_sendTransaction', params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }] },
    });
    setCounterparty(null);
    setScreen('review');
  }, [account]);

  /** Top up a sub-wallet with a little ETH so it can pay gas. */
  const onFundAgentGas = useCallback((agent: Agent) => {
    if (!account) return;
    const wei = parseEther('0.01');
    setRequest({
      id: `fund-gas-${Date.now()}`,
      account: account.address,
      request: { method: 'eth_sendTransaction', params: [{ from: account.address, to: agent.address, value: `0x${wei.toString(16)}`, data: '0x' }] },
    });
    setCounterparty(null);
    setScreen('review');
  }, [account]);

  const onSaveAgentMeta = useCallback(async (agent: Agent, patch: { budgetUsd: number; note: string }) => {
    setAgents(await patchAgent(agent.fullName, patch));
    setIdentityStatus('Saved ✓');
  }, []);

  const onRegisterAgentEnsOnChain = useCallback((agent: Agent) => {
    if (!identity.ensName) { setIdentityStatus('Claim your ENS name first.'); return; }
    if (!ENS_REGISTRAR) { setIdentityStatus('ENS registrar not configured.'); return; }
    setRegisterAgentTarget(agent);
    openNfcScan('register_agent');
  }, [identity.ensName]);
  const onRegisterAgentEns = onRegisterAgentEnsOnChain;

  /** The right MFKDF signer for an address — main key, or a sub-wallet's key. */
  const signerFor = useCallback((cardId: string, password: string, address: string) => {
    const acc = findAccount(accountsRef.current, address);
    return acc?.agentFullName
      ? agentSigner(cardId, password, acc.agentFullName)
      : new MfkdfSigner(cardId, password);
  }, []);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  // Tangem-style NFC Modal & Sheet State
  const [nfcVisible, setNfcVisible] = useState(false);
  const [nfcPurpose, setNfcPurpose] = useState<
    'setup' | 'unlock' | 'sign' | 'sweep' | 'agent' | 'register_agent'
  >('setup');
  const [registerAgentTarget, setRegisterAgentTarget] = useState<Agent | null>(null);

  // Interactive Modals
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [sendVisible, setSendVisible] = useState(false);
  const [logModalVisible, setLogModalVisible] = useState(false);

  // Approvals & recovery state
  const [approvalsList, setApprovalsList] = useState<TokenApproval[]>([]);
  const [scanningApprovals, setScanningApprovals] = useState(false);
  const [recoveryStatusResult, setRecoveryStatusResult] = useState<RecoveryResult | null>(null);

  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : String(err));

  // ---- Initialize ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const [saved, savedSettings, savedIdentity, savedAgents, savedHistory] = await Promise.all([
        loadWallet(),
        loadSettings(),
        loadIdentity(),
        loadAgents(),
        loadHistory(),
      ]);
      if (!alive) return;
      setSettings(savedSettings);
      setIdentity(savedIdentity);
      setAgents(savedAgents);
      setHistory(savedHistory);

      if (saved && saved.cards.length > 0) {
        const active = saved.cards[saved.activeIndex] ?? saved.cards[0];
        setWallet(saved);
        setAccount({ address: active.address, publicKey: active.publicKey });
        setLocked(true);
        setScreen('home');
        void fetchBalance(active.address);
        void lookupEnsIdentity(active.address);

        // Initialize WalletConnect
        try {
          await initWalletKit();
          setupWcHandlers();
          refreshSessions();
        } catch (e) {
          console.warn('WalletConnect init error:', e);
        }

        // Start transaction monitoring
        startMonitoring(active.address);
      } else {
        setScreen('setup');
      }
    })();
    return () => {
      alive = false;
      stopMonitoring();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupEnsIdentity = async (address: string) => {
    try {
      const identity = await resolveAddress(address);
      if (identity.name) setEnsName(identity.name);
    } catch {
      // ignore
    }
  };

  const refreshSessions = useCallback(async () => {
    try {
      const active = await getActiveSessions();
      setSessions(active);
    } catch { /* ok */ }
  }, []);

  const setupWcHandlers = useCallback(() => {
    // A dapp wants to connect → let the user choose WHICH wallet to connect with.
    onSessionProposal((p) => setPendingProposal(p));

    onSessionRequest(async (event) => {
      const target = addressForEvent(event) ?? accountsRef.current[0]?.address;
      if (!target) return;
      const kr = wcRequestToKeyringRequest(event, target);
      setRequest(kr);
      setWcEvent(event);

      // Resolve ENS names for counterparty addresses (anti-impersonation)
      const preview = previewRequest(kr);
      setCounterparty(null);
      if (preview.kind === 'tx' && preview.tx.to) {
        try {
          const names = await resolveAddresses([preview.tx.to]);
          setResolvedNames(names);
          const id = await resolveAddress(preview.tx.to);
          setCounterparty(id);
        } catch { /* no ENS */ }
      }

      // Check spending policy against the user's live, persisted settings
      if (preview.kind === 'tx') {
        const todaySpent = await getTodaySpent(kr.account);
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        let bal = 0n;
        try { bal = await provider.getBalance(kr.account); } catch { /* ok */ }
        const policy = settingsToPolicy(await loadSettings());
        const check = checkPolicy(preview.tx, policy, todaySpent, bal);
        if (!check.allowed) {
          setPolicyResult({ reason: check.reason ?? 'Policy blocked', canOverride: check.canOverride ?? false });
          setScreen('policy_block');
          return;
        }
      }

      setScreen('review');
    });

    onSessionDelete(() => refreshSessions());
  }, []);

  /** Extract the wallet address a WC request is addressed to. */
  function addressForEvent(event: WalletKitTypes.SessionRequest): string | null {
    try {
      const { method, params } = event.params.request as { method: string; params: any[] };
      if (method === 'eth_sendTransaction' || method === 'eth_signTransaction') return params[0]?.from ?? null;
      if (method === 'personal_sign') return params[1] ?? null;
      if (method === 'eth_sign') return params[0] ?? null;
      if (method.startsWith('eth_signTypedData')) return params[0] ?? null;
    } catch { /* fall through */ }
    return null;
  }

  /** Connect the pending dapp with a chosen wallet. */
  const approveProposalWith = useCallback(async (address: string) => {
    const p = pendingProposal;
    setPendingProposal(null);
    if (!p) return;
    try {
      await approveSession(p, address);
      refreshSessions();
    } catch (err) {
      fail(err);
    }
  }, [pendingProposal, refreshSessions]);


  const fetchBalance = useCallback(async (address: string) => {
    try {
      const provider = new JsonRpcProvider(SEPOLIA_RPC);
      const wei = await provider.getBalance(address);
      const ethVal = Number(formatEther(wei));
      setBalance(ethVal.toFixed(4));
      setFiatBalance(`$${(ethVal * ETH_USD_PRICE).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } catch {
      setBalance('0.0000');
      setFiatBalance('$0.00');
    }
  }, []);

  // ---- Tangem-Style NFC Scan Handlers ----

  /** Stage a transaction for the Review screen and remember what it will mean. */
  const stageEnsTx = useCallback(
    (
      id: string,
      tx: { to: string; data: string },
      pending: PendingIdentityAction,
      status: string,
    ) => {
      if (!account) return;
      setPendingIdentityAction(pending);
      setRequest({
        id: `${id}-${Date.now()}`,
        account: account.address,
        request: {
          method: 'eth_sendTransaction',
          params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }],
        },
      });
      setCounterparty(null);
      setIdentityStatus(status);
      setScreen('review');
    },
    [account],
  );

  const openNfcScan = (purpose: 'setup' | 'unlock' | 'sign' | 'sweep' | 'agent' | 'register_agent') => {
    setError('');
    setNfcPurpose(purpose);
    setNfcVisible(true);
  };

  const handleNfcCardScanned = useCallback(async (cardId: string) => {
    setNfcVisible(false);
    setBusy(true);

    try {
      if (nfcPurpose === 'setup') {
        if (!password || password.length < 6) {
          throw new Error('Please choose a password with at least 6 characters.');
        }

        // Proof-of-personhood: verify a real human is creating this wallet
        // (World ID's canonical use — one human, one account).
        if (settings.requireWorldIdOnSetup) {
          const human = await verifyHuman(
            'create-account',
            'Verify you are human',
            'World ID Selfie Check: prove a live person is creating this wallet before your keys are generated.',
          );
          if (!human.success) {
            throw new Error('Human verification is required to create your wallet.');
          }
        }

        const signer = new MfkdfSigner(cardId, password);
        const identity = await signer.getIdentity();

        await addCard({
          cardLabel: 'NFC Card',
          cardUidHash: hashCardUid(cardId),
          address: identity.address,
          publicKey: identity.publicKey,
        });

        setAccount({ address: identity.address, publicKey: identity.publicKey });
        setLocked(false);
        setScreen('home');
        void fetchBalance(identity.address);
        void lookupEnsIdentity(identity.address);

        // Auto-initialize WalletConnect
        try {
          await initWalletKit();
          setupWcHandlers();
        } catch { /* ok */ }

        startMonitoring(identity.address);
      } else if (nfcPurpose === 'unlock') {
        const signer = new MfkdfSigner(cardId, password);
        const identity = await signer.getIdentity();

        const savedWallet = await loadWallet();
        if (savedWallet) {
          const cardIdx = savedWallet.cards.findIndex(
            (c) => c.address.toLowerCase() === identity.address.toLowerCase(),
          );
          if (cardIdx < 0) {
            throw new Error('Wrong password or card for this wallet.');
          }
          await setActiveCard(cardIdx);
        }

        setLocked(false);
        setScreen('home');
        if (account) void fetchBalance(account.address);
      } else if (nfcPurpose === 'sign') {
        if (!request || !account) return;

        // Biometric check
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (enrolled) {
          const res = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm biometric identity to sign',
          });
          if (!res.success) throw new Error('Biometric check cancelled.');
        }

        // Derive the key for the account this request is FOR (main or sub-wallet).
        const signer = signerFor(cardId, password, request.account);
        const preview = previewRequest(request);

        if (preview.kind === 'tx' && request.request.method === 'eth_sendTransaction') {
          const txParams = (request.request.params as any[])?.[0] ?? {};
          const hash = await signAndBroadcast(txParams, signer, SEPOLIA_RPC);
          try {
            const meta = historyMetaFor(request, preview, (wcEvent as any)?.params?.request?.method);
            setHistory(await recordTx({ hash, kind: meta.kind, title: meta.title, fromAddress: request.account, toAddress: meta.to }));
          } catch { /* history is best-effort */ }

          if (preview.tx.valueWei > 0n) {
            await recordSpend(account.address, preview.tx.valueWei);
            recordLocalTransaction();

            const todaySpent = await getTodaySpent(account.address);
            const awareness = getSpendingSummary(todaySpent, settingsToPolicy(settings));
            if (awareness.percentUsed >= 80) {
              await sendSpendingNotification(awareness.percentUsed, awareness.message);
            }
          }

          if (preview.tx.data && preview.tx.data.slice(0, 10) === '0x095ea7b3' && preview.tx.to) {
            const spenderHex = '0x' + preview.tx.data.slice(34, 74);
            await trackApproval({
              tokenAddress: preview.tx.to,
              spenderAddress: spenderHex,
            });
          }

          if (wcEvent) {
            await respondSuccess(wcEvent.topic, wcEvent.id, hash);
          }

          // If this signed tx was an ENS identity write, persist it locally now.
          if (pendingIdentityAction) {
            await applyPendingIdentityAction(pendingIdentityAction);
            setPendingIdentityAction(null);
          }
        } else {
          const signature = await signRequestWithCard(request, signer);
          if (wcEvent) {
            await respondSuccess(wcEvent.topic, wcEvent.id, signature);
          }
        }

        setRequest(null);
        setWcEvent(null);
        setResolvedNames(undefined);
        setCounterparty(null);
        // Return to the screen the ENS write came from, else home.
        setScreen(
          !pendingIdentityAction
            ? 'home'
            : pendingIdentityAction.type === 'agent' || pendingIdentityAction.type === 'revokeAgent'
              ? 'agents'
              : 'identity',
        );
        void fetchBalance(account.address);
      } else if (nfcPurpose === 'agent') {
        // Derive the sub-wallet's own EOA (impossible without the card) and save
        // it. It's immediately usable — fund it, connect dapps as it, spend only
        // what it holds. Registering its ENS subname on-chain is a separate step.
        if (!agentDraft) return;
        const fullName = `${agentDraft.label}.${agentDraft.parentName}`;
        const derived = await deriveAgentAddress(cardId, password, fullName);
        const agent: Agent = {
          label: agentDraft.label,
          fullName,
          address: derived.address,
          chain: agentDraft.chain,
          budgetUsd: agentDraft.budgetUsd,
          note: agentDraft.note,
          createdAt: Date.now(),
        };
        setAgents(await upsertAgent(agent));
        setAgentDraft(null);
        setCreateParentName(null);
        setIdentityStatus(`${fullName} created ✓`);
        setScreen(createParentName ? 'agent_detail' : 'agents');
      } else if (nfcPurpose === 'register_agent') {
        // One card tap: derive main key, then deploy/attach child registries down
        // the path and register the sub-wallet's name — all on-chain.
        if (!registerAgentTarget || !identity.ensName) return;
        const target = registerAgentTarget;
        const mainSigner = new MfkdfSigner(cardId, password);
        const res = await registerSubwalletOnChain(mainSigner, {
          topRegistry: ENS_REGISTRAR,
          identityName: identity.ensName,
          agentFullName: target.fullName,
          agentLabel: target.label,
          agentAddress: target.address,
          addrOf: (fullName) =>
            agents.find((a) => a.fullName.toLowerCase() === fullName.toLowerCase())?.address,
        });
        setAgents(await patchAgentRegistered(target.fullName));
        setRegisterAgentTarget(null);
        try {
          setHistory(await recordTx({ hash: res.txHash, kind: 'ens', title: `Registered ${res.name}`, fromAddress: account?.address ?? '', toAddress: target.address }));
        } catch { /* best-effort */ }
        setIdentityStatus(`${res.name} is live on ENS ✓`);
        setScreen('agent_detail');
      } else if (nfcPurpose === 'sweep') {
        const signer = new MfkdfSigner(cardId, password);
        const result = await executeEmergencyRecovery(signer);
        setRecoveryStatusResult(result);
        if (account) void fetchBalance(account.address);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [
    nfcPurpose,
    password,
    request,
    account,
    settings,
    pendingIdentityAction,
    wcEvent,
    fetchBalance,
    agentDraft,
    identity.ensName,
    stageEnsTx,
    registerAgentTarget,
    agents,
  ]);

  // ---- Settings persistence ----
  const updateSettings = useCallback(async (next: WalletSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  // ---- ENS identity: apply a signed write to local state ----
  // Reads the latest identity via a ref so it's safe to call from the (rarely
  // re-created) NFC sign handler without capturing a stale snapshot.
  const applyPendingIdentityAction = useCallback(async (action: PendingIdentityAction) => {
    const current = identityRef.current;
    if (action.type === 'claim') {
      const next = { ...current, ensName: action.ensName };
      setIdentity(next);
      await saveIdentity(next);
      setEnsName(action.ensName);
      setIdentityStatus(`Claimed ${action.ensName} ✓`);
    } else if (action.type === 'guardian') {
      const next = {
        ...current,
        guardianAddress: action.guardianAddress,
        guardianEns: action.guardianEns,
      };
      setIdentity(next);
      await saveIdentity(next);
      // Keep the recovery layer's target in sync with the ENS guardian pointer.
      await setRecoveryAddress(action.guardianAddress);
      setIdentityStatus('Guardian saved to your ENS record ✓');
    } else if (action.type === 'agent') {
      setAgents(await upsertAgent(action.agent));
      setIdentityStatus(`${action.agent.fullName} is live ✓`);
    } else {
      setAgents(await markAgentRevoked(action.fullName));
      setIdentityStatus(`${action.fullName} revoked ✓`);
    }
  }, []);

  /** The ENSv2 registry that holds `<you>.notwallet.eth`. */
  const requireParentRegistry = useCallback(async (): Promise<string | null> => {
    const registry = await getParentRegistry();
    if (!registry) {
      setIdentityStatus(
        `${ENS_PARENT_NAME} isn't set up on the ENSv2 Sepolia deployment yet, so names can't be issued. It needs to be registered and given its own subname registry first.`,
      );
      return null;
    }
    return registry;
  }, []);

  // ---- ENSv2: claim <label>.notwallet.eth via the registrar ----
  const onCheckAndClaim = useCallback(
    async (rawLabel: string) => {
      if (!account) return;
      setIdentityStatus(null);
      const label = normalizeLabel(rawLabel);
      if (label.length < 3) {
        setIdentityStatus('Pick a name with at least 3 characters.');
        return;
      }
      if (!hasRegistrar()) {
        setIdentityStatus(
          `Name issuance isn't switched on yet: ${ENS_PARENT_NAME}'s registrar hasn't been deployed on the ENSv2 Sepolia beta. See contracts/RUNBOOK.md — once it's live and EXPO_PUBLIC_ENS_REGISTRAR is set, claiming works here.`,
        );
        return;
      }
      setIdentityBusy(true);
      try {
        const free = await registrarAvailable(label);
        if (free === false) {
          setIdentityStatus(`${label}.${ENS_PARENT_NAME} is already taken.`);
          return;
        }
        const fullName = `${label}.${ENS_PARENT_NAME}`;
        // The user signs their OWN claim; the registrar carries the mint privilege.
        const tx = buildClaimTx(label);
        stageEnsTx('ens-claim', tx, { type: 'claim', ensName: fullName }, `${fullName} is available — sign to claim it.`);
      } catch (err) {
        fail(err);
      } finally {
        setIdentityBusy(false);
      }
    },
    [account, stageEnsTx],
  );

  // ---- ENSv2: guardian pointer as a resolver text record ----
  const onSetGuardian = useCallback(
    async (input: string) => {
      if (!account) return;
      setIdentityStatus(null);
      if (!identity.ensName) {
        setIdentityStatus('Claim your ENS name first.');
        return;
      }
      setIdentityBusy(true);
      try {
        let guardianAddress: string | null = null;
        let guardianEns: string | null = null;
        if (input.toLowerCase().endsWith('.eth')) {
          guardianAddress = await resolveName(input);
          guardianEns = input.toLowerCase();
          if (!guardianAddress) {
            setIdentityStatus(`${input} does not resolve to an address.`);
            return;
          }
        } else if (isAddress(input)) {
          guardianAddress = getAddress(input);
        } else {
          setIdentityStatus('Enter a valid ENS name or 0x address.');
          return;
        }

        const userLabel = identity.ensName.split('.')[0];
        // Guardian pointer is written to OUR registry (which is also the resolver).
        const tx = buildRegistrySetTextTx(
          ENS_REGISTRAR,
          userLabel,
          RECOVERY_RECORD_KEY,
          guardianAddress,
        );
        stageEnsTx(
          'ens-guardian',
          tx,
          { type: 'guardian', guardianAddress, guardianEns },
          'Sign to write your guardian to ENS.',
        );
      } catch (err) {
        fail(err);
      } finally {
        setIdentityBusy(false);
      }
    },
    [account, identity.ensName, requireParentRegistry, stageEnsTx],
  );

  // ---- Testnet faucet: mint MockUSDC to self (routes through Review + sign) ----
  const onMintUsdc = useCallback(() => {
    if (!account) return;
    if (locked) { setScreen('unlock'); return; }
    const tx = buildMintUsdcTx(account.address, 100);
    setRequest({
      id: `mint-usdc-${Date.now()}`,
      account: account.address,
      request: {
        method: 'eth_sendTransaction',
        params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }],
      },
    });
    setCounterparty(null);
    setScreen('review');
  }, [account, locked]);

  // ---- Agents: create a budgeted sub-account under your name ----
  // Needs the card twice: once to derive the agent's own key, once to sign the
  // registration. Derivation is impossible without the physical factor.
  const onCreateAgent = useCallback(
    (draft: { label: string; chain: string; budgetUsd: number; note: string }) => {
      setIdentityStatus(null);
      if (!identity.ensName) {
        setIdentityStatus('Claim your ENS name first.');
        return;
      }
      const parentName = createParentName || identity.ensName;
      const label = normalizeLabel(draft.label);
      if (label.length < 2) {
        setIdentityStatus('Give it a name of at least 2 characters.');
        return;
      }
      const fullName = `${label}.${parentName}`;
      if (agents.some((a) => !a.revokedAt && a.fullName.toLowerCase() === fullName.toLowerCase())) {
        setIdentityStatus(`"${fullName}" already exists.`);
        return;
      }
      setAgentDraft({ ...draft, label, parentName });
      openNfcScan('agent');
    },
    [identity.ensName, agents, createParentName],
  );

  const onRevokeAgent = useCallback(
    async (agent: Agent) => {
      // Sub-wallets live locally (their key is re-derivable); revoking removes it
      // from your list. Sweep any remaining balance back with Send first.
      setAgents(await markAgentRevoked(agent.fullName));
      if (activeAddress && activeAddress.toLowerCase() === agent.address.toLowerCase()) {
        setActiveAddress(null); // fall back to Main
      }
      setIdentityStatus(`${agent.fullName} removed.`);
    },
    [activeAddress],
  );

  // ---- Approvals Scanner ----
  const onScanApprovals = useCallback(async () => {
    if (!account) return;
    setScanningApprovals(true);
    setScreen('approvals');
    try {
      const found = await scanApprovals(account.address);
      setApprovalsList(found);
    } catch (err) {
      fail(err);
    } finally {
      setScanningApprovals(false);
    }
  }, [account]);

  const onRevokeApproval = useCallback(
    async (tokenAddr: string, spenderAddr: string) => {
      if (!account) return;
      const revokeTx = buildRevokeData(tokenAddr, spenderAddr);
      const revokeReq: KeyringRequest = {
        id: `revoke-${Date.now()}`,
        account: account.address,
        request: {
          method: 'eth_sendTransaction',
          params: [
            {
              from: account.address,
              to: revokeTx.to,
              data: revokeTx.data,
              value: '0x0',
            },
          ],
        },
      };
      setRequest(revokeReq);
      setCounterparty(null);
      setScreen('review');
    },
    [account],
  );

  // ---- Direct Send Flow ----
  const handleInitiateSend = (toAddress: string, amountEth: string) => {
    const from = activeAccount?.address;
    if (!from) return;
    const valueWei = parseEther(amountEth);
    const sendReq: KeyringRequest = {
      id: `send-${Date.now()}`,
      account: from,
      request: {
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: toAddress,
            value: `0x${valueWei.toString(16)}`,
            data: '0x',
          },
        ],
      },
    };
    setRequest(sendReq);
    setScreen('review');
  };

  // ---- WalletConnect Scanner ----
  const onScannedWcUri = useCallback(
    (data: string) => {
      if (screen !== 'connect') return;
      if (data.startsWith('wc:')) {
        setScreen('home');
        pairWithDapp(data).catch(fail);
      }
    },
    [screen],
  );

  const onReject = useCallback(async () => {
    if (wcEvent) {
      await respondError(wcEvent.topic, wcEvent.id);
    }
    setRequest(null);
    setWcEvent(null);
    setPolicyResult(null);
    setResolvedNames(undefined);
    setScreen('home');
  }, [wcEvent]);

  // Screens that paint a full-bleed gradient behind the status bar.
  const onGradient = screen === 'setup' || screen === 'unlock' || screen === 'home';

  const summary = request ? summarize(request, resolvedNames) : null;
  const sessionList = Object.entries(sessions);

  return (
    <SafeAreaProvider>
    <View style={styles.root}>
      {/* Gradient screens need light status-bar icons; light pages need dark. */}
      <StatusBar barStyle={onGradient ? 'light-content' : 'dark-content'} />

      {/* Tangem-Style NFC Scanning Bottom Sheet */}
      <NfcScanSheet
        visible={nfcVisible}
        title={
          nfcPurpose === 'setup'
            ? 'Pair Hardware Card'
            : nfcPurpose === 'unlock'
            ? 'Unlock Wallet'
            : nfcPurpose === 'sign'
            ? 'Tap Card to Sign'
            : nfcPurpose === 'agent'
            ? 'Create Sub-Wallet'
            : nfcPurpose === 'register_agent'
            ? 'Register on ENS'
            : 'Emergency Sweep'
        }
        subtitle={
          nfcPurpose === 'agent'
            ? 'Tap your card to derive the sub-wallet’s key'
            : nfcPurpose === 'register_agent'
            ? 'Tap your card once — this signs all the on-chain steps'
            : nfcPurpose === 'sign'
            ? 'Hold your NFC card to the back of your phone to sign'
            : 'Hold your card to the back of your phone'
        }
        onScanned={handleNfcCardScanned}
        onCancel={() => setNfcVisible(false)}
      />

      {/* Receive Modal (QR Code) */}
      {account && (
        <ReceiveModal
          visible={receiveVisible}
          address={activeAccount?.address ?? account.address}
          ensName={activeAccount?.ensName ?? ensName ?? undefined}
          onClose={() => setReceiveVisible(false)}
        />
      )}

      {/* Send Modal */}
      {account && (
        <SendModal
          visible={sendVisible}
          userAddress={activeAccount?.address ?? account.address}
          balanceEth={balance}
          onSendTx={handleInitiateSend}
          onClose={() => setSendVisible(false)}
        />
      )}

      {/* WalletConnect: choose which wallet to connect with */}
      <AccountSheet
        visible={!!pendingProposal}
        title="Connect wallet"
        subtitle={
          pendingProposal
            ? `${pendingProposal.params.proposer.metadata.name} wants to connect. Choose which wallet to share — your main wallet or a sub-wallet.`
            : undefined
        }
        accounts={accounts}
        activeAddress={activeAccount?.address}
        onPick={approveProposalWith}
        onClose={() => {
          if (pendingProposal) rejectSession(pendingProposal);
          setPendingProposal(null);
        }}
      />

      {/* Live Device Logs Modal */}
      <LogViewerModal
        visible={logModalVisible}
        onClose={() => setLogModalVisible(false)}
      />

      {/* Errors surface as a dismissible dialog over the app, never as a banner */}
      <ErrorDialog
        visible={!!error}
        message={error}
        onClose={() => setError('')}
        onCopy={copyToClipboard}
      />

      {screen === 'setup' || screen === 'unlock' ? (
        <AuthScreen
          mode={screen === 'setup' ? 'setup' : 'unlock'}
          password={password}
          onPassword={setPassword}
          onTapCard={() => openNfcScan(screen === 'setup' ? 'setup' : 'unlock')}
          onReadonly={screen === 'unlock' ? () => setScreen('home') : undefined}
          busy={busy}
        />
      ) : (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {screen === 'loading' && (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.loadingText}>Initializing…</Text>
            </View>
          )}

          {screen === 'home' && account && (
          <HomeScreen
            handle={activeAccount?.ensName || (activeAccount?.kind === 'agent' ? activeAccount.label : ensName) || short(activeAccount?.address ?? account.address)}
            address={activeAccount?.address ?? account.address}
            accounts={accounts}
            activeAddress={activeAccount?.address ?? account.address}
            onSwitchAccount={(addr) => setActiveAddress(addr)}
            isSubWallet={activeAccount?.kind === 'agent'}
            onSettings={() => setScreen('settings')}
            onIdentity={() => { setIdentityStatus(null); setScreen('identity'); }}
            onAgents={() => { setIdentityStatus(null); setScreen('agents'); }}
            agentCount={agents.filter((a) => !a.revokedAt).length}
            onUnlock={() => setScreen('unlock')}
            ensName={identity.ensName}
            guardianSet={!!identity.guardianAddress}
            balance={balance}
            fiat={fiatBalance}
            locked={locked}
            onSend={() => (locked ? setScreen('unlock') : setSendVisible(true))}
            onReceive={() => setReceiveVisible(true)}
            onConnect={() => (locked ? setScreen('unlock') : setScreen('connect'))}
            onShield={onScanApprovals}
            history={history}
            sessions={sessionList}
            onDisconnect={async (topic) => {
              await disconnectSession(topic);
              refreshSessions();
            }}
          />
        )}

        {/* ---- WalletConnect Scanner Screen ---- */}
        {screen === 'connect' && (
          <ConnectScreen
            granted={permission?.granted ?? false}
            onRequestPermission={requestPermission}
            onScan={onScannedWcUri}
            onCancel={() => setScreen('home')}
          />
        )}

        {/* ---- Clear-Signing Review Screen (HERO Experience) ---- */}
        {screen === 'review' && summary && (
          <ReviewScreen
            result={summary.result}
            fallback={summary.fallback}
            dappName={(wcEvent as any)?.params?.proposer?.metadata?.name}
            counterparty={counterparty}
            needsPassword={!password}
            password={password}
            onPassword={setPassword}
            onSign={() => openNfcScan('sign')}
            onReject={onReject}
            busy={busy}
          />
        )}

        {/* ---- Token Approvals Dashboard Screen ---- */}
        {screen === 'approvals' && (
          <ApprovalsScreen
            scanning={scanningApprovals}
            approvals={approvalsList}
            onRevoke={onRevokeApproval}
            onRescan={onScanApprovals}
            onBack={() => setScreen('home')}
          />
        )}

        {/* ---- Policy Block Screen ---- */}
        {screen === 'policy_block' && policyResult && (
          <PolicyBlockScreen
            reason={policyResult.reason}
            canOverride={policyResult.canOverride}
            worldGated={settings.requireWorldIdOnOverride}
            onOverride={async () => {
              if (settings.requireWorldIdOnOverride) {
                const verified = await verifyHuman(
                  'policy-override',
                  'Policy Override — World ID Check',
                  'World ID Selfie Check: prove a live human is present before overriding your spending policy.',
                );
                if (!verified.success) return;
              }
              setPolicyResult(null);
              setScreen('review');
            }}
            onReject={onReject}
          />
        )}

        {/* ---- Settings Screen ---- */}
        {screen === 'settings' && account && (
          <SettingsScreen
            settings={settings}
            onChange={updateSettings}
            ensName={identity.ensName}
            address={account.address}
            onIdentity={() => { setIdentityStatus(null); setScreen('identity'); }}
            onRecovery={() => setScreen('recovery_vault')}
            onLogs={() => setLogModalVisible(true)}
            onMintUsdc={onMintUsdc}
            onTestWorldId={async () => {
              const r = await verifyHuman(
                'test-selfie-check',
                'World ID — Selfie Check test',
                'Prove a live human is present. This is a direct test of the World ID integration.',
              );
              Alert.alert(
                r.success ? 'World ID passed ✓' : 'World ID not completed',
                r.success
                  ? (r.verified
                      ? 'Verified a real human via World ID Selfie Check (cloud-verified).'
                      : 'Sandbox gate passed. Real Selfie Check activates in a native build with the World Sandbox app installed.')
                  : (r.error ?? 'Cancelled.'),
              );
            }}
            onLock={() => { setLocked(true); setPassword(''); setScreen('home'); }}
            onBack={() => setScreen('home')}
          />
        )}

        {/* ---- Identity (ENS) Screen ---- */}
        {screen === 'identity' && account && (
          <IdentityScreen
            address={account.address}
            ensName={identity.ensName}
            parentName={ENS_PARENT_NAME}
            guardianAddress={identity.guardianAddress}
            guardianEns={identity.guardianEns}
            busy={identityBusy}
            status={identityStatus}
            needsGas={parseFloat(balance) === 0}
            onCheckAndClaim={onCheckAndClaim}
            onSetGuardian={onSetGuardian}
            onBack={() => setScreen('home')}
          />
        )}

        {/* ---- Agent detail (fund, customize, nest, register) ---- */}
        {screen === 'agent_detail' && selectedAgent && (
          <AgentDetailScreen
            agent={selectedAgent}
            ensRegistered={!!selectedAgent.ensRegistered}
            isActive={activeAccount?.address?.toLowerCase() === selectedAgent.address.toLowerCase()}
            ethBalance={agentEth}
            usdcBalance={agentUsdc}
            children={childrenOf(agents, selectedAgent.fullName)}
            identityName={identity.ensName}
            busy={busy || identityBusy}
            status={identityStatus}
            onFundUsdc={(amt) => onFundAgentUsdc(selectedAgent, amt)}
            onFundGas={() => onFundAgentGas(selectedAgent)}
            onSaveMeta={(patch) => onSaveAgentMeta(selectedAgent, patch)}
            onSwitchTo={() => { setActiveAddress(selectedAgent.address); setScreen('home'); }}
            onAddSubAgent={() => { setCreateParentName(selectedAgent.fullName); setIdentityStatus(null); setScreen('agents'); }}
            onRegisterEns={() => onRegisterAgentEns(selectedAgent)}
            onOpenChild={(a) => openAgent(a)}
            onRevoke={async () => { await onRevokeAgent(selectedAgent); setScreen('agents'); }}
            onBack={() => {
              const parent = agentParentName(selectedAgent.fullName);
              if (parent.toLowerCase() === (identity.ensName ?? '').toLowerCase()) { setScreen('agents'); return; }
              const parentAgent = agents.find((a) => a.fullName.toLowerCase() === parent.toLowerCase());
              if (parentAgent) openAgent(parentAgent); else setScreen('agents');
            }}
          />
        )}

        {/* ---- Agents (ENSv2 sub-accounts) ---- */}
        {screen === 'agents' && (
          <AgentsScreen
            agents={agents}
            ensName={identity.ensName}
            identityName={identity.ensName}
            createParentName={createParentName}
            busy={identityBusy || busy}
            status={identityStatus}
            onCreate={onCreateAgent}
            onOpen={openAgent}
            onIdentity={() => { setIdentityStatus(null); setScreen('identity'); }}
            onBack={() => { setCreateParentName(null); setScreen('home'); }}
          />
        )}

        {/* ---- Emergency Recovery Screen ---- */}
        {screen === 'recovery_vault' && (
          <RecoveryScreen
            ensName={identity.ensName}
            guardianAddress={identity.guardianAddress}
            guardianEns={identity.guardianEns}
            worldGated={settings.requireWorldIdOnSweep}
            sweepResult={recoveryStatusResult}
            busy={busy}
            onIdentity={() => { setIdentityStatus(null); setScreen('identity'); }}
            onSweep={async () => {
              if (settings.requireWorldIdOnSweep) {
                const verified = await verifyHuman(
                  'emergency-sweep',
                  'Emergency Evacuation — World ID Check',
                  'World ID Selfie Check: prove a live human is present before sweeping all funds.',
                );
                if (!verified.success) return;
              }
              openNfcScan('sweep');
            }}
            onBack={() => setScreen('home')}
          />
        )}
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  /**
   * No padding here on purpose: each screen owns its own insets so the Home
   * gradient hero can bleed edge-to-edge and under the status bar.
   */
  container: { flexGrow: 1, paddingBottom: 120 },
  centerContainer: { alignItems: 'center', paddingVertical: 120 },
  loadingText: { color: colors.textDim, fontSize: 13, marginTop: spacing.md },
});
