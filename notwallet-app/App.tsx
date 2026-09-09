import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

import {
  AuthScreen,
  ConnectScreen,
  HomeScreen,
  ReviewScreen,
} from './src/screens';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  clearSign,
  clearSignTypedData,
  type ClearSignResult,
  type ResolvedNames,
  type RiskLevel,
} from './src/clearsign';
import { resolveAddress, resolveAddresses, type ResolvedIdentity } from './src/ens';
import { MfkdfSigner } from './src/mfkdf';
import { startMonitoring, stopMonitoring, recordLocalTransaction, sendSpendingNotification } from './src/monitor';
import { checkPolicy, getSpendingSummary, DEFAULT_POLICY } from './src/policies';
import {
  setRecoveryAddress,
  getRecoveryAddress,
  trackApproval,
  executeEmergencyRecovery,
  type RecoveryResult,
} from './src/recovery';
import { scanApprovals, buildRevokeData, type TokenApproval } from './src/approvals';
import {
  STANDARD_SUBACCOUNTS,
  deriveStandardSubaccounts,
  setActiveSubaccountId,
  getActiveSubaccountId,
  type SubAccount,
  type SubAccountPurpose,
} from './src/subaccounts';
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

const RISK_COLOR: Record<RiskLevel, string> = {
  info: colors.info,
  warn: colors.warn,
  danger: colors.danger,
};

type Screen =
  | 'loading'
  | 'setup'
  | 'unlock'
  | 'home'
  | 'connect'
  | 'review'
  | 'policy_block'
  | 'settings'
  | 'approvals'
  | 'recovery_vault';

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
  const [policyResult, setPolicyResult] = useState<{ reason: string; canOverride: boolean } | null>(null);
  const [sessions, setSessions] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  // Tangem-style NFC Modal & Sheet State
  const [nfcVisible, setNfcVisible] = useState(false);
  const [nfcPurpose, setNfcPurpose] = useState<'setup' | 'unlock' | 'sign' | 'sweep'>('setup');

  // Interactive Modals & Tabs
  const [receiveVisible, setReceiveVisible] = useState(false);
  const [sendVisible, setSendVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'assets' | 'activity'>('assets');
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [logModalVisible, setLogModalVisible] = useState(false);

  // Subaccounts & Approvals state
  const [subaccounts, setSubaccounts] = useState<SubAccount[]>([]);
  const [activeSubaccount, setActiveSubaccount] = useState<SubAccountPurpose>('main');
  const [approvalsList, setApprovalsList] = useState<TokenApproval[]>([]);
  const [scanningApprovals, setScanningApprovals] = useState(false);
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const [recoveryStatusResult, setRecoveryStatusResult] = useState<RecoveryResult | null>(null);

  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : String(err));

  // ---- Initialize ----
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadWallet();
      if (!alive) return;

      if (saved && saved.cards.length > 0) {
        const active = saved.cards[saved.activeIndex] ?? saved.cards[0];
        setWallet(saved);
        setAccount({ address: active.address, publicKey: active.publicKey });
        setLocked(true);
        setScreen('home');
        void fetchBalance(active.address);
        void lookupEnsIdentity(active.address);

        const savedSubId = await getActiveSubaccountId();
        setActiveSubaccount(savedSubId as SubAccountPurpose);

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

      // Resolve ENS names for counterparty addresses
      const preview = previewRequest(kr);
      if (preview.kind === 'tx' && preview.tx.to) {
        try {
          const names = await resolveAddresses([preview.tx.to]);
          setResolvedNames(names);
        } catch { /* no ENS */ }
      }

      // Check spending policy
      if (preview.kind === 'tx') {
        const todaySpent = await getTodaySpent(account.address);
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        let bal = 0n;
        try { bal = await provider.getBalance(account.address); } catch { /* ok */ }
        const check = checkPolicy(preview.tx, DEFAULT_POLICY, todaySpent, bal);
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

        const envelopes = await deriveStandardSubaccounts(cardId, password);
        setSubaccounts(envelopes);

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

        const envelopes = await deriveStandardSubaccounts(cardId, password);
        setSubaccounts(envelopes);

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

        const signer = new MfkdfSigner(cardId, password, activeSubaccount);
        const preview = previewRequest(request);

        if (preview.kind === 'tx' && request.request.method === 'eth_sendTransaction') {
          const txParams = (request.request.params as any[])?.[0] ?? {};
          const hash = await signAndBroadcast(txParams, signer, SEPOLIA_RPC);

          if (preview.tx.valueWei > 0n) {
            await recordSpend(account.address, preview.tx.valueWei);
            recordLocalTransaction();

            const todaySpent = await getTodaySpent(account.address);
            const awareness = getSpendingSummary(todaySpent, DEFAULT_POLICY);
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
        } else {
          const signature = await signRequestWithCard(request, signer);
          if (wcEvent) {
            await respondSuccess(wcEvent.topic, wcEvent.id, signature);
          }
        }

        setRequest(null);
        setWcEvent(null);
        setResolvedNames(undefined);
        setScreen('home');
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
  }, [nfcPurpose, password, request, account, activeSubaccount, wcEvent, fetchBalance]);

  // ---- Subaccount Switching ----
  const onSwitchSubaccount = useCallback(async (purpose: SubAccountPurpose) => {
    setActiveSubaccount(purpose);
    await setActiveSubaccountId(purpose);
    const chosen = subaccounts.find((s) => s.purpose === purpose);
    if (chosen) {
      setAccount({ address: chosen.address, publicKey: chosen.publicKey });
      void fetchBalance(chosen.address);
      void lookupEnsIdentity(chosen.address);
      startMonitoring(chosen.address);
    }
  }, [subaccounts, fetchBalance]);

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
      const fakeReq: KeyringRequest = {
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
      setRequest(fakeReq);
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

  const copyAddressToClipboard = () => {
    if (!account) return;
    Clipboard.setString(account.address);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const summary = request ? summarize(request, resolvedNames) : null;
  const sessionList = Object.entries(sessions);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

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

      <ScrollView contentContainerStyle={styles.container}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          {account ? (
            <TouchableOpacity style={styles.identityPill} onPress={copyAddressToClipboard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarLetter}>
                  {(ensName ? ensName[0] : account.address.slice(2, 3)).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.identityText}>
                {ensName || short(account.address)}
              </Text>
              <Text style={styles.copyIcon}>{copiedAddr ? '✓' : '⎘'}</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={styles.brandTitle}>NotWallet</Text>
              <Text style={styles.brandSubtitle}>Hardware Security • Seedless</Text>
            </View>
          )}

          <View style={styles.headerRight}>
            <View style={styles.networkBadge}>
              <View style={styles.greenPulse} />
              <Text style={styles.networkBadgeText}>Sepolia</Text>
            </View>
            {account && screen === 'home' && (
              <TouchableOpacity
                style={styles.settingsIconButton}
                onPress={() => setScreen('settings')}
              >
                <Text style={styles.settingsIconText}>⚙️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error ? <Text style={styles.errorAlert}>{error}</Text> : null}

        {/* ---- Loading Screen ---- */}
        {screen === 'loading' && (
          <View style={styles.centerContainer}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.loadingText}>Initializing secure enclave…</Text>
          </View>
        )}

        {/* ---- Setup Screen (Tangem-Style Clean Flow) ---- */}
        {screen === 'setup' && (
          <AuthScreen
            mode="setup"
            password={password}
            onPassword={setPassword}
            onTapCard={() => openNfcScan('setup')}
            busy={busy}
          />
        )}

        {/* ---- Unlock Screen ---- */}
        {screen === 'unlock' && (
          <AuthScreen
            mode="unlock"
            password={password}
            onPassword={setPassword}
            onTapCard={() => openNfcScan('unlock')}
            onReadonly={() => setScreen('home')}
            busy={busy}
          />
        )}

        {/* ---- Home Portfolio Dashboard (World-Class Wallet Feel) ---- */}
                {screen === 'home' && account && (
          <HomeScreen
            balance={balance}
            fiat={fiatBalance}
            locked={locked}
            subaccounts={STANDARD_SUBACCOUNTS}
            activeSubaccount={activeSubaccount}
            onSwitch={(p) => onSwitchSubaccount(p as SubAccountPurpose)}
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
          <View style={styles.approvalsContainer}>
            <Text style={styles.screenHeading}>Token Approvals</Text>
            <Text style={styles.screenDesc}>
              View active smart contracts authorized to spend tokens from your wallet. One-tap revoke to eliminate drain vectors.
            </Text>

            {scanningApprovals ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingText}>Scanning Sepolia allowances…</Text>
              </View>
            ) : approvalsList.length === 0 ? (
              <View style={styles.cleanStateCard}>
                <Text style={styles.cleanStateEmoji}>🛡️</Text>
                <Text style={styles.cleanStateTitle}>No Active Approvals</Text>
                <Text style={styles.cleanStateText}>
                  Your wallet has no outstanding token spending approvals.
                </Text>
              </View>
            ) : (
              approvalsList.map((appr, i) => (
                <View key={i} style={styles.approvalItemCard}>
                  <View style={styles.approvalItemHeader}>
                    <Text style={styles.approvalItemSymbol}>{appr.tokenSymbol}</Text>
                    {appr.isUnlimited && (
                      <View style={styles.unlimitedTag}>
                        <Text style={styles.unlimitedTagText}>UNLIMITED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.approvalSpenderText}>
                    Spender: {short(appr.spenderAddress)}
                  </Text>
                  <TouchableOpacity
                    style={styles.revokeButton}
                    onPress={() => onRevokeApproval(appr.tokenAddress, appr.spenderAddress)}
                  >
                    <Text style={styles.revokeButtonText}>Revoke Allowance (0)</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
              <Text style={styles.backButtonText}>← Back to Portfolio</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Policy Block Screen ---- */}
        {screen === 'policy_block' && policyResult && (
          <View style={styles.policyBlockContainer}>
            <View style={styles.policyAlertCard}>
              <Text style={styles.policyAlertEmoji}>🚫</Text>
              <Text style={styles.policyAlertTitle}>Transaction Blocked</Text>
              <Text style={styles.policyAlertReason}>{policyResult.reason}</Text>
            </View>

            {policyResult.canOverride && (
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={async () => {
                  const verified = await verifyHuman(
                    'policy-override',
                    'Policy Override — World ID Check',
                    'World ID Selfie Check: Prove a live human is present before overriding your spending policy limits.',
                  );
                  if (!verified.success) return;
                  setPolicyResult(null);
                  setScreen('review');
                }}
              >
                <Text style={styles.primaryActionText}>🌐 World ID Override & Proceed</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.rejectButton} onPress={onReject}>
              <Text style={styles.rejectButtonText}>Reject Transaction</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Settings Screen ---- */}
        {screen === 'settings' && (
          <View style={styles.settingsContainer}>
            <Text style={styles.screenHeading}>Settings & Security</Text>

            {/* Policy settings card */}
            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardHeader}>SPENDING POLICY</Text>
              <View style={styles.settingItemRow}>
                <Text style={styles.settingItemLabel}>Daily Allowance Cap</Text>
                <Text style={styles.settingItemValue}>
                  {(Number(DEFAULT_POLICY.dailyLimitWei) / 1e18).toFixed(2)} ETH
                </Text>
              </View>
              <View style={styles.settingItemRow}>
                <Text style={styles.settingItemLabel}>Per-Tx Limit</Text>
                <Text style={styles.settingItemValue}>
                  {(Number(DEFAULT_POLICY.perTxLimitWei) / 1e18).toFixed(2)} ETH
                </Text>
              </View>
              <View style={styles.settingItemRow}>
                <Text style={styles.settingItemLabel}>Infinite Approvals</Text>
                <Text style={[styles.settingItemValue, { color: colors.ok }]}>Blocked ✓</Text>
              </View>
              <View style={styles.settingItemRow}>
                <Text style={styles.settingItemLabel}>Emergency Panic Vault</Text>
                <TouchableOpacity onPress={() => setScreen('recovery_vault')}>
                  <Text style={[styles.settingItemValue, { color: colors.brandSoft }]}>
                    Configure →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* View Live Logs Button */}
            <TouchableOpacity
              style={[styles.lockWalletButton, { marginBottom: 10, borderColor: colors.brand }]}
              onPress={() => setLogModalVisible(true)}
            >
              <Text style={{ color: colors.brandSoft, fontSize: 15, fontWeight: '600' }}>
                📜 View Live Device Logs
              </Text>
            </TouchableOpacity>

            {/* Lock button */}
            <TouchableOpacity
              style={styles.lockWalletButton}
              onPress={() => {
                setLocked(true);
                setPassword('');
                setScreen('home');
              }}
            >
              <Text style={styles.lockWalletText}>🔒 Lock Wallet Session</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
              <Text style={styles.backButtonText}>← Back to Portfolio</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Emergency Recovery Vault Screen ---- */}
        {screen === 'recovery_vault' && (
          <View style={styles.settingsContainer}>
            <Text style={styles.screenHeading}>Emergency Panic Vault</Text>
            <Text style={styles.screenDesc}>
              If your phone or keys are compromised, tap below to instantly sweep all ETH and tokens to your recovery vault, and revoke all approvals.
            </Text>

            <View style={styles.settingsCard}>
              <Text style={styles.settingsCardHeader}>VAULT CONFIGURATION</Text>
              <RecoveryVaultDisplay />
            </View>

            {recoveryStatusResult && (
              <View style={[styles.settingsCard, { borderColor: colors.ok }]}>
                <Text style={[styles.settingsCardHeader, { color: colors.ok }]}>SWEEP REPORT</Text>
                <Text style={styles.settingItemLabel}>ETH Swept: {recoveryStatusResult.ethSwept}</Text>
                <Text style={styles.settingItemLabel}>Tokens Swept: {recoveryStatusResult.tokensSwept}</Text>
                <Text style={styles.settingItemLabel}>Approvals Revoked: {recoveryStatusResult.approvalsRevoked}</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.panicSweepButton}
              onPress={async () => {
                const verified = await verifyHuman(
                  'emergency-sweep',
                  'Emergency Evacuation — World ID Check',
                  'World ID Selfie Check: Prove a live human is present before executing emergency funds evacuation.',
                );
                if (!verified.success) return;
                openNfcScan('sweep');
              }}
              disabled={recoveryRunning}
            >
              <Text style={styles.panicSweepText}>🚨 Tap NFC Card to Sweep All Funds</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backButton} onPress={() => setScreen('home')}>
              <Text style={styles.backButtonText}>← Back to Portfolio</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function RecoveryVaultDisplay() {
  const [addr, setAddr] = useState<string | null>(null);
  useEffect(() => {
    getRecoveryAddress().then(setAddr);
  }, []);
  if (addr) {
    return <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>Vault Target: {short(addr)} ✓</Text>;
  }
  return <Text style={{ color: colors.warn, fontSize: 13, marginTop: 4 }}>⚠️ Vault address not configured</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: spacing.lg, paddingTop: 52, paddingBottom: 60 },

  // Header Bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  identityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  identityText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  copyIcon: {
    color: colors.textDim,
    fontSize: 12,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    color: colors.textDim,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  greenPulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.ok,
    marginRight: 6,
  },
  networkBadgeText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIconText: {
    fontSize: 14,
  },
  errorAlert: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    color: colors.danger,
    padding: 12,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    fontSize: 13,
  },

  // Setup / Unlock
  setupContainer: {
    paddingVertical: spacing.xl,
  },
  setupHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  setupHeroIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  setupHeroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  setupHeroSubtitle: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupForm: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 8,
  },
  passwordInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    padding: 16,
    fontSize: 16,
    marginBottom: spacing.lg,
  },
  primaryActionButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  actionButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  primaryActionText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelLink: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  cancelLinkText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '500',
  },

  // Money Envelopes Carousel
  envelopeCarousel: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: spacing.md,
  },
  envelopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  envelopeTabActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandBg,
  },
  envelopeTabIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  envelopeTabText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  envelopeTabTextActive: {
    color: colors.brandSoft,
  },

  // Portfolio Hero Card
  portfolioHeroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  portfolioLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  portfolioFiat: {
    color: colors.text,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 6,
  },
  portfolioEthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  portfolioEth: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  trendBadge: {
    backgroundColor: colors.okBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  trendBadgeText: {
    color: colors.ok,
    fontSize: 11,
    fontWeight: '700',
  },

  // 4 Quick Actions (Phantom / Rainbow style)
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  actionCircleButton: {
    alignItems: 'center',
    width: 64,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionIconCircleBrand: {
    backgroundColor: colors.brand,
    borderColor: colors.brandHover,
  },
  actionCircleIconText: {
    fontSize: 20,
  },
  actionCircleLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  // Connected Dapps Card
  connectedDappsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  dappHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dappSectionTitle: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dappCountPill: {
    backgroundColor: colors.brandBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  dappCountText: {
    color: colors.brandSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  sessionDappName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sessionDappUrl: {
    color: colors.textDim,
    fontSize: 12,
  },
  disconnectButton: {
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  disconnectButtonText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },

  // Segmented Tabs
  segmentedTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.md,
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderColor: colors.brand,
  },
  tabButtonText: {
    color: colors.textDim,
    fontSize: 15,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.text,
  },

  // Assets / Activity List
  assetsListContainer: {
    gap: 10,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tokenIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tokenEmoji: {
    fontSize: 20,
  },
  tokenMeta: {
    flex: 1,
  },
  tokenSymbol: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  tokenNetwork: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  tokenBalanceCol: {
    alignItems: 'flex-end',
  },
  tokenBalanceAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  tokenBalanceFiat: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityEmoji: {
    fontSize: 16,
  },
  activityStatusTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandSoft,
  },

  // Scanner
  scannerWrapper: {
    paddingVertical: spacing.md,
  },
  scannerHeader: {
    marginBottom: spacing.md,
  },
  scannerTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  scannerSub: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
  },
  cameraBox: {
    height: 360,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.md,
  },

  // Review Screen (HERO)
  reviewContainer: {
    paddingVertical: spacing.sm,
  },
  reviewHeroHeader: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  riskPill: {
    backgroundColor: colors.infoBg,
    borderColor: colors.infoBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: 6,
  },
  riskPillDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  riskPillWarn: {
    backgroundColor: colors.warnBg,
    borderColor: colors.warnBorder,
  },
  riskPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dappOriginText: {
    color: colors.textDim,
    fontSize: 13,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  plainEnglishSummary: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    marginBottom: spacing.md,
  },
  riskFlagCard: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    marginTop: 6,
  },
  riskFlagCardDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
  },
  riskFlagCardWarn: {
    backgroundColor: colors.warnBg,
    borderColor: colors.warnBorder,
    borderWidth: 1,
  },
  rejectButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 12,
  },
  rejectButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },

  // Approvals & Clean State
  approvalsContainer: {
    paddingVertical: spacing.sm,
  },
  screenHeading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  screenDesc: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  cleanStateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.lg,
  },
  cleanStateEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  cleanStateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  cleanStateText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  approvalItemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  approvalItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  approvalItemSymbol: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  unlimitedTag: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unlimitedTagText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: '700',
  },
  approvalSpenderText: {
    color: colors.textDim,
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: spacing.md,
  },
  revokeButton: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.danger,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  revokeButtonText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  backButton: {
    marginTop: spacing.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  // Settings & Recovery
  settingsContainer: {
    paddingVertical: spacing.sm,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  settingsCardHeader: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  settingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  settingItemLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  settingItemValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  lockWalletButton: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  lockWalletText: {
    color: colors.warn,
    fontSize: 15,
    fontWeight: '600',
  },
  panicSweepButton: {
    backgroundColor: colors.danger,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  panicSweepText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Policy Alert
  policyBlockContainer: {
    paddingVertical: spacing.xl,
  },
  policyAlertCard: {
    backgroundColor: colors.surface,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  policyAlertEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  policyAlertTitle: {
    color: colors.warn,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  policyAlertReason: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },

  // Layout Helpers
  centerContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 10,
  },
});
