import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AuthScreen,
  ConnectScreen,
  HomeScreen,
  ReviewScreen,
  SettingsScreen,
  IdentityScreen,
  ApprovalsScreen,
  PolicyBlockScreen,
  RecoveryScreen,
} from './src/screens';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
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
  readNodeOwner,
  labelHash,
  subnameNode,
  buildSubnodeRecordTx,
  buildSetTextRecordTx,
  ENS_PARENT_NAME,
  ENS_PARENT_NODE,
  RECOVERY_RECORD_KEY,
  type ResolvedIdentity,
} from './src/ens';
import { namehash, getAddress, isAddress } from 'ethers';
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
  | 'approvals'
  | 'recovery_vault';

/** A signed ENS write we want to persist to local identity once it lands. */
type PendingIdentityAction =
  | { type: 'claim'; ensName: string }
  | { type: 'guardian'; guardianAddress: string; guardianEns: string | null };

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
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<string | null>(null);
  const identityRef = useRef(identity);
  useEffect(() => { identityRef.current = identity; }, [identity]);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  // Tangem-style NFC Modal & Sheet State
  const [nfcVisible, setNfcVisible] = useState(false);
  const [nfcPurpose, setNfcPurpose] = useState<'setup' | 'unlock' | 'sign' | 'sweep'>('setup');

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
      const [saved, savedSettings, savedIdentity] = await Promise.all([
        loadWallet(),
        loadSettings(),
        loadIdentity(),
      ]);
      if (!alive) return;
      setSettings(savedSettings);
      setIdentity(savedIdentity);

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

  const setupWcHandlers = useCallback(() => {
    onSessionProposal((p) => {
      Alert.alert(
        'Connect to dapp?',
        `${p.params.proposer.metadata.name} (${p.params.proposer.metadata.url}) requests connection.`,
        [
          { text: 'Reject', style: 'cancel', onPress: () => rejectSession(p) },
          { text: 'Connect', onPress: () => handleApproveProposal(p) },
        ],
      );
    });

    onSessionRequest(async (event) => {
      if (!account) return;
      const kr = wcRequestToKeyringRequest(event, account.address);
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
        const todaySpent = await getTodaySpent(account.address);
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        let bal = 0n;
        try { bal = await provider.getBalance(account.address); } catch { /* ok */ }
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
  }, [account]);

  const handleApproveProposal = useCallback(async (p: WalletKitTypes.SessionProposal) => {
    if (!account) return;
    try {
      await approveSession(p, account.address);
      refreshSessions();
    } catch (err) {
      fail(err);
    }
  }, [account]);

  const refreshSessions = useCallback(async () => {
    try {
      const active = await getActiveSessions();
      setSessions(active);
    } catch { /* ok */ }
  }, []);

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

  const openNfcScan = (purpose: 'setup' | 'unlock' | 'sign' | 'sweep') => {
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

        const signer = new MfkdfSigner(cardId, password);
        const preview = previewRequest(request);

        if (preview.kind === 'tx' && request.request.method === 'eth_sendTransaction') {
          const txParams = (request.request.params as any[])?.[0] ?? {};
          const hash = await signAndBroadcast(txParams, signer, SEPOLIA_RPC);

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
        // Return to identity screen after an ENS write, else home.
        setScreen(pendingIdentityAction ? 'identity' : 'home');
        void fetchBalance(account.address);
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
  }, [nfcPurpose, password, request, account, settings, pendingIdentityAction, wcEvent, fetchBalance]);

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
    } else {
      const next = { ...current, guardianAddress: action.guardianAddress, guardianEns: action.guardianEns };
      setIdentity(next);
      await saveIdentity(next);
      // Keep the recovery layer's target in sync with the ENS guardian pointer.
      await setRecoveryAddress(action.guardianAddress);
      setIdentityStatus('Guardian saved to your ENS record ✓');
    }
  }, []);

  // ---- ENS: check availability, then route a real claim tx through Review ----
  const onCheckAndClaim = useCallback(async (label: string) => {
    if (!account) return;
    setIdentityStatus(null);
    if (!label || label.length < 3) {
      setIdentityStatus('Pick a name with at least 3 characters.');
      return;
    }
    setIdentityBusy(true);
    try {
      const node = subnameNode(label);
      const owner = await readNodeOwner(node);
      if (owner) {
        setIdentityStatus(`${label}.${ENS_PARENT_NAME} is already taken.`);
        return;
      }
      const fullName = `${label}.${ENS_PARENT_NAME}`;
      const tx = buildSubnodeRecordTx(ENS_PARENT_NODE, labelHash(label), account.address);
      const req: KeyringRequest = {
        id: `ens-claim-${Date.now()}`,
        account: account.address,
        request: {
          method: 'eth_sendTransaction',
          params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }],
        },
      };
      setPendingIdentityAction({ type: 'claim', ensName: fullName });
      setRequest(req);
      setCounterparty(null);
      setIdentityStatus(`${fullName} is available — sign to claim it.`);
      setScreen('review');
    } catch (err) {
      fail(err);
    } finally {
      setIdentityBusy(false);
    }
  }, [account]);

  // ---- ENS: set the recovery guardian as a text record the name owns ----
  const onSetGuardian = useCallback(async (input: string) => {
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

      const node = namehash(identity.ensName);
      const tx = buildSetTextRecordTx(node, RECOVERY_RECORD_KEY, guardianAddress);
      const req: KeyringRequest = {
        id: `ens-guardian-${Date.now()}`,
        account: account.address,
        request: {
          method: 'eth_sendTransaction',
          params: [{ from: account.address, to: tx.to, data: tx.data, value: '0x0' }],
        },
      };
      setPendingIdentityAction({ type: 'guardian', guardianAddress, guardianEns });
      setRequest(req);
      setCounterparty(null);
      setIdentityStatus('Sign to write your guardian to ENS.');
      setScreen('review');
    } catch (err) {
      fail(err);
    } finally {
      setIdentityBusy(false);
    }
  }, [account, identity.ensName]);

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
    if (!account) return;
    const valueWei = parseEther(amountEth);
    const sendReq: KeyringRequest = {
      id: `send-${Date.now()}`,
      account: account.address,
      request: {
        method: 'eth_sendTransaction',
        params: [
          {
            from: account.address,
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
            : 'Emergency Sweep'
        }
        subtitle={
          nfcPurpose === 'sign'
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
          address={account.address}
          ensName={ensName ?? undefined}
          onClose={() => setReceiveVisible(false)}
        />
      )}

      {/* Send Modal */}
      {account && (
        <SendModal
          visible={sendVisible}
          userAddress={account.address}
          balanceEth={balance}
          onSendTx={handleInitiateSend}
          onClose={() => setSendVisible(false)}
        />
      )}

      {/* Live Device Logs Modal */}
      <LogViewerModal
        visible={logModalVisible}
        onClose={() => setLogModalVisible(false)}
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
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          {error ? <Text style={styles.errorAlert}>{error}</Text> : null}

          {screen === 'loading' && (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.loadingText}>Initializing…</Text>
            </View>
          )}

          {screen === 'home' && account && (
          <HomeScreen
            handle={identity.ensName || ensName || short(account.address)}
            address={account.address}
            onSettings={() => setScreen('settings')}
            onIdentity={() => { setIdentityStatus(null); setScreen('identity'); }}
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
            onCheckAndClaim={onCheckAndClaim}
            onSetGuardian={onSetGuardian}
            onBack={() => setScreen('home')}
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
      </View>
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
  container: { flexGrow: 1 },
  errorAlert: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    color: colors.danger,
    padding: spacing.md,
    borderRadius: radius.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.huge,
    fontSize: 13,
  },
  centerContainer: { alignItems: 'center', paddingVertical: 120 },
  loadingText: { color: colors.textDim, fontSize: 13, marginTop: spacing.md },
});
