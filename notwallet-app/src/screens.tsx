/**
 * Screen components — presentational, composed from the UI kit + radiant visuals.
 * All wallet logic stays in App.tsx and is passed in as props. Real data only.
 *
 * Layout language (from the reference design):
 *   • Onboarding  — full-bleed radiant gradient, white type, white pill CTA.
 *   • Home        — gradient hero (balance + quick actions) curving into a light
 *                   content sheet of cards and list rows.
 *   • Detail      — clean light page: back chevron, big title, cards of rows.
 */
import { CameraView } from 'expo-camera';
import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ClearSignResult } from './clearsign';
import type { TokenApproval } from './approvals';
import type { Agent, WalletAccount } from './agents';
import { timeAgo, type TxRecord } from './history';
import type { WalletSettings } from './settings';
import { colors, gradients, radius, spacing, typography } from './theme';
import {
  Button,
  Card,
  Caption,
  IconButton,
  ListRow,
  NumberField,
  RiskBadge,
  Row,
  RowDivider,
  SectionHeader,
  SectionLabel,
  Sheet,
  TextField,
  Toggle,
} from './ui/kit';
import { ActionTile, GradientBackdrop, HeroPanel, IdentityCard, LogoMark } from './ui/visual';

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ACT_ICON: Record<string, string> = { send: '↑', fund: '💰', mint: '🪙', ens: '🏷️', revoke: '🛡', contract: '⛓' };

// ── Onboarding: Setup / Unlock (full-bleed radiant gradient) ──────────────────
export function AuthScreen({
  mode,
  password,
  onPassword,
  onTapCard,
  onReadonly,
  busy,
}: {
  mode: 'setup' | 'unlock';
  password: string;
  onPassword: (v: string) => void;
  onTapCard: () => void;
  onReadonly?: () => void;
  busy: boolean;
}) {
  const isSetup = mode === 'setup';
  return (
    <View style={{ flex: 1 }}>
      <GradientBackdrop stops={gradients.onboard} />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: spacing.xl }} edges={['top', 'bottom']}>
        {/* Scrollable + keyboard-aware: otherwise the on-screen keyboard just
            squeezes this fixed layout and covers the password field. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.huge }}>
          <LogoMark size={84} />
          <Text style={styles.brand}>NotWallet</Text>
          <Text style={styles.brandSub}>Hardware-grade security · Seedless</Text>
        </View>

        <View style={{ paddingBottom: spacing.xl }}>
          <Text style={styles.onboardHeadline}>
            {isSetup ? 'Your card.\nYour password.\nNo seed phrase.' : 'Welcome back'}
          </Text>
          <Text style={styles.onboardBody}>
            {isSetup
              ? 'Your signing key is derived on demand from your password and any NFC card — never stored.'
              : 'Enter your password and tap your card to unlock.'}
          </Text>
          <View style={{ height: spacing.lg }} />
          <HeroInput
            placeholder={isSetup ? 'Create a master password' : 'Master password'}
            value={password}
            onChangeText={onPassword}
          />
          <TouchableOpacity
            style={styles.pill}
            onPress={onTapCard}
            disabled={busy}
            activeOpacity={0.9}
          >
            <Text style={styles.pillText}>
              {busy ? 'Working…' : `📇  ${isSetup ? 'Tap card to create wallet' : 'Tap card to unlock'}`}
            </Text>
          </TouchableOpacity>
          {!isSetup && onReadonly ? (
            <TouchableOpacity onPress={onReadonly} style={{ paddingVertical: spacing.md }}>
              <Text style={styles.linkCenter}>View portfolio (read-only)</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** Password input styled for a gradient backdrop (translucent white on blue). */
function HeroInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      secureTextEntry
      placeholderTextColor={colors.onHeroDim}
      style={styles.heroInput}
      {...props}
    />
  );
}


/** A bottom sheet listing all wallets — used to switch accounts and to pick
 *  which wallet connects to a dapp. */
export function AccountSheet({
  visible,
  title,
  subtitle,
  accounts,
  activeAddress,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  accounts: WalletAccount[];
  activeAddress?: string;
  onPick: (address: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>{title}</Text>
      {subtitle ? <Text style={[styles.cardBody, { marginBottom: spacing.sm }]}>{subtitle}</Text> : null}
      {accounts.map((a, i) => {
        const active = activeAddress && a.address.toLowerCase() === activeAddress.toLowerCase();
        return (
          <View key={a.address}>
            {i > 0 ? <RowDivider /> : null}
            <ListRow
              icon={a.kind === 'main' ? '🔑' : '🤖'}
              iconTone={a.kind === 'main' ? 'brand' : 'neutral'}
              title={a.ensName ?? (a.kind === 'main' ? 'Main wallet' : a.label)}
              subtitle={
                a.kind === 'agent' && a.budgetUsd != null
                  ? `${a.chain || 'sub-wallet'} · $${a.budgetUsd} · ${short(a.address)}`
                  : short(a.address)
              }
              value={active ? '✓' : undefined}
              valueTone="ok"
              onPress={() => onPick(a.address)}
            />
          </View>
        );
      })}
    </Sheet>
  );
}

// ── Home: gradient hero + light content sheet ────────────────────────────────
export function HomeScreen({
  handle,
  address,
  accounts,
  activeAddress,
  onSwitchAccount,
  isSubWallet,
  balance,
  fiat,
  locked,
  ensName,
  guardianSet,
  onSend,
  onReceive,
  onConnect,
  onShield,
  onSettings,
  onIdentity,
  onAgents,
  agentCount,
  onUnlock,
  sessions,
  onDisconnect,
  history,
}: {
  handle: string;
  address: string;
  accounts: WalletAccount[];
  activeAddress: string;
  onSwitchAccount: (address: string) => void;
  isSubWallet: boolean;
  history: TxRecord[];
  balance: string;
  fiat: string;
  locked: boolean;
  ensName: string | null;
  guardianSet: boolean;
  onSend: () => void;
  onReceive: () => void;
  onConnect: () => void;
  onShield: () => void;
  onSettings: () => void;
  onIdentity: () => void;
  onAgents: () => void;
  agentCount: number;
  onUnlock: () => void;
  sessions: [string, any][];
  onDisconnect: (topic: string) => void;
}) {
  const [switcher, setSwitcher] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <AccountSheet
        visible={switcher}
        title="Switch wallet"
        subtitle="Operate as your main wallet or any sub-wallet."
        accounts={accounts}
        activeAddress={activeAddress}
        onPick={(addr) => { setSwitcher(false); onSwitchAccount(addr); }}
        onClose={() => setSwitcher(false)}
      />
      <HeroPanel stops={gradients.hero}>
        <Row justify="space-between" align="flex-start">
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.7}
            onPress={() => accounts.length > 1 && setSwitcher(true)}
          >
            <Text style={styles.heroEyebrow}>{isSubWallet ? 'SUB-WALLET' : 'WALLET'}</Text>
            <Row gap={6}>
              <Text style={styles.heroHandle} numberOfLines={1}>{handle}</Text>
              {accounts.length > 1 ? <Text style={styles.heroCaret}>⌄</Text> : null}
            </Row>
          </TouchableOpacity>
          <IconButton icon="⚙" onPress={onSettings} onHero />
        </Row>

        <View style={{ marginTop: spacing.xl }}>
          <Text style={styles.heroBalanceLabel}>Total balance</Text>
          <Text style={styles.heroBalance} numberOfLines={1} adjustsFontSizeToFit>
            {balance} <Text style={styles.heroBalanceUnit}>ETH</Text>
          </Text>
          {/* Fiat is a static reference rate, so it's shown as approximate. */}
          <Text style={styles.heroBalanceSub}>≈ {fiat} · Sepolia testnet</Text>
        </View>

        {locked ? (
          <TouchableOpacity style={styles.lockedPill} onPress={onUnlock} activeOpacity={0.8}>
            <Text style={styles.lockedPillText}>🔒 Locked — tap to unlock and sign</Text>
          </TouchableOpacity>
        ) : null}

        <Row gap={spacing.md} style={{ marginTop: spacing.xl }}>
          <ActionTile icon="↑" label="Send" onPress={onSend} />
          <ActionTile icon="↓" label="Receive" onPress={onReceive} />
          <ActionTile icon="⛓" label="Connect" onPress={onConnect} emphasis />
          <ActionTile icon="🛡" label="Shield" onPress={onShield} />
        </Row>
      </HeroPanel>

      <View style={styles.sheet}>
        {/* Identity — the ENS-backed feature entry point */}
        <SectionHeader title="Identity" actionLabel="Manage" onAction={onIdentity} />
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            icon="🏷️"
            iconTone={ensName ? 'brand' : 'neutral'}
            title={ensName ?? 'No ENS name yet'}
            subtitle={ensName ? 'Your wallet identity' : 'Claim one to unlock recovery'}
            onPress={onIdentity}
            chevron
          />
          <RowDivider />
          <ListRow
            icon={guardianSet ? '🛟' : '⚠️'}
            iconTone={guardianSet ? 'ok' : 'warn'}
            title={guardianSet ? 'Guardian recovery on' : 'No recovery guardian'}
            subtitle={guardianSet ? 'Stored on your ENS record' : 'Set a trusted guardian'}
            onPress={onIdentity}
            chevron
          />
          <RowDivider />
          <ListRow
            icon="🤖"
            iconTone={agentCount > 0 ? 'brand' : 'neutral'}
            title="Agents"
            subtitle={
              agentCount > 0
                ? `${agentCount} budgeted sub-account${agentCount === 1 ? '' : 's'}`
                : 'Give a bot its own budgeted account'
            }
            onPress={onAgents}
            chevron
          />
        </Card>

        {/* Connected dapps */}
        {sessions.length > 0 ? (
          <>
            <View style={{ height: spacing.xl }} />
            <SectionHeader title={`Connected · ${sessions.length}`} />
            <Card padded={false} style={styles.rowCard}>
              {sessions.map(([topic, session], i) => (
                <View key={topic}>
                  {i > 0 ? <RowDivider /> : null}
                  <ListRow
                    icon="🔗"
                    iconTone="brand"
                    title={session?.peer?.metadata?.name ?? 'Web3 Dapp'}
                    subtitle={session?.peer?.metadata?.url ?? ''}
                    value="Disconnect"
                    valueTone="danger"
                    onPress={() => onDisconnect(topic)}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {/* Assets */}
        <View style={{ height: spacing.xl }} />
        <SectionHeader title="Assets" />
        <Card padded={false} style={styles.rowCard}>
          <ListRow
            icon="⟠"
            iconTone="brand"
            title="Ethereum"
            subtitle="Sepolia Testnet"
            value={`${balance} ETH`}
            valueSub={fiat}
          />
        </Card>

        {history.length > 0 ? (
          <>
            <View style={{ height: spacing.xl }} />
            <SectionHeader title="Activity" />
            <Card padded={false} style={styles.rowCard}>
              {history.slice(0, 6).map((h, i) => (
                <View key={`${h.hash}-${i}`}>
                  {i > 0 ? <RowDivider /> : null}
                  <ListRow
                    icon={ACT_ICON[h.kind] ?? '•'}
                    iconTone={h.kind === 'revoke' ? 'danger' : h.kind === 'fund' ? 'ok' : 'neutral'}
                    title={h.title}
                    subtitle={timeAgo(h.timestamp)}
                    value={h.toAddress ? short(h.toAddress) : undefined}
                  />
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Text style={styles.footNote} numberOfLines={1}>
          {short(address)}
        </Text>
      </View>
    </View>
  );
}

// ── Shared detail-page shell ─────────────────────────────────────────────────
function Page({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl }}>
      <Row justify="flex-start" style={{ marginBottom: spacing.lg }}>
        <IconButton icon="←" onPress={onBack} />
      </Row>
      <Text style={typography.titleLarge}>{title}</Text>
      {subtitle ? <Text style={styles.pageSub}>{subtitle}</Text> : null}
      <View style={{ height: spacing.xl }} />
      {children}
      <View style={{ height: spacing.huge }} />
    </View>
  );
}

// ── Connect (WalletConnect QR) ────────────────────────────────────────────────
export function ConnectScreen({
  granted,
  onRequestPermission,
  onScan,
  onCancel,
}: {
  granted: boolean;
  onRequestPermission: () => void;
  onScan: (data: string) => void;
  onCancel: () => void;
}) {
  return (
    <Page
      title="Connect a dapp"
      subtitle="Open any dapp's “Connect Wallet → WalletConnect” and scan its QR code."
      onBack={onCancel}
    >
      {granted ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(e) => onScan(e.data)}
          />
        </View>
      ) : (
        <Card>
          <Text style={styles.cardBody}>
            Camera access is needed to scan the WalletConnect QR code.
          </Text>
          <View style={{ height: spacing.md }} />
          <Button title="Enable camera" onPress={onRequestPermission} />
        </Card>
      )}
    </Page>
  );
}

// ── Review & Sign (the trust moment) ─────────────────────────────────────────
const RISK: Record<string, { level: 'ok' | 'warn' | 'danger'; label: string }> = {
  info: { level: 'ok', label: 'LOOKS OK' },
  warn: { level: 'warn', label: 'CAUTION' },
  danger: { level: 'danger', label: 'DANGER' },
};
export function ReviewScreen({
  result,
  fallback,
  dappName,
  counterparty,
  needsPassword,
  password,
  onPassword,
  onSign,
  onReject,
  busy,
}: {
  result: ClearSignResult | null;
  fallback: string;
  dappName?: string;
  counterparty?: {
    name: string | null;
    verified: boolean;
    impersonation: boolean;
    display: string;
  } | null;
  needsPassword: boolean;
  password: string;
  onPassword: (v: string) => void;
  onSign: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const risk = result ? RISK[result.worstLevel] : { level: 'ok' as const, label: 'REVIEW' };
  const tone = risk.level;
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.xl }}>
      <Row justify="space-between" style={{ marginBottom: spacing.lg }}>
        <RiskBadge level={tone} label={risk.label} />
        {dappName ? <Caption>via {dappName}</Caption> : null}
      </Row>

      {/* Plain-English summary — the headline of the decision */}
      <Card tone={tone === 'ok' ? 'surface' : tone}>
        <Text style={styles.summary}>{result ? result.summary : fallback}</Text>
        {result?.flags.map((flag, i) => (
          <View key={i} style={{ marginTop: spacing.md }}>
            <Text
              style={{
                color: colors[flag.level === 'info' ? 'info' : flag.level],
                fontSize: 13.5,
                fontWeight: '600',
                lineHeight: 19,
              }}
            >
              {flag.level === 'danger' ? '🚨' : flag.level === 'warn' ? '⚠️' : 'ℹ️'} {flag.message}
            </Text>
          </View>
        ))}
      </Card>

      {/* ENS identity of the counterparty — the anti-impersonation primitive */}
      {counterparty ? (
        <>
          <View style={{ height: spacing.md }} />
          <Card
            tone={counterparty.impersonation ? 'danger' : counterparty.verified ? 'ok' : 'surface'}
          >
            <SectionLabel>RECIPIENT IDENTITY</SectionLabel>
            <View style={{ height: spacing.xs }} />
            {counterparty.name ? (
              <Text
                style={{
                  color: counterparty.impersonation ? colors.danger : colors.text,
                  fontSize: 16,
                  fontWeight: '700',
                }}
              >
                {counterparty.impersonation
                  ? `🚨 ${counterparty.name} — could not be verified`
                  : `${counterparty.name} ✓ verified on ENS`}
              </Text>
            ) : (
              <Text style={styles.cardBody}>
                No ENS name — unlabeled address. Double-check it's who you expect.
              </Text>
            )}
          </Card>
        </>
      ) : null}

      {needsPassword ? (
        <View style={{ marginTop: spacing.lg }}>
          <TextField
            label="Enter password to authorize"
            placeholder="Master password"
            secureTextEntry
            value={password}
            onChangeText={onPassword}
          />
        </View>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button
        title={busy ? 'Signing…' : 'Tap NFC card to sign'}
        icon="📇"
        variant={tone === 'danger' ? 'danger' : 'primary'}
        onPress={onSign}
        loading={busy}
      />
      <View style={{ height: spacing.sm }} />
      <Button title="Reject" variant="ghost" onPress={onReject} />
      <Text style={styles.centerNote}>
        Your key is derived from your card + password, used to sign, then wiped.
      </Text>
      <View style={{ height: spacing.huge }} />
    </View>
  );
}

// ── Settings (real, editable, persisted) ──────────────────────────────────────
export function SettingsScreen({
  settings,
  onChange,
  ensName,
  address,
  onIdentity,
  onRecovery,
  onLogs,
  onMintUsdc,
  onLock,
  onBack,
}: {
  settings: WalletSettings;
  onChange: (next: WalletSettings) => void;
  ensName: string | null;
  address: string;
  onIdentity: () => void;
  onRecovery: () => void;
  onLogs: () => void;
  onMintUsdc: () => void;
  onLock: () => void;
  onBack: () => void;
}) {
  const set = <K extends keyof WalletSettings>(key: K, value: WalletSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <Page title="Settings" subtitle="Saved to this device and applied before signing." onBack={onBack}>
      <Card padded={false} style={styles.rowCard}>
        <ListRow
          icon="🏷️"
          iconTone="brand"
          title={ensName ?? 'Wallet identity'}
          subtitle={short(address)}
          onPress={onIdentity}
          chevron
        />
        <RowDivider />
        <ListRow
          icon="🛟"
          iconTone="ok"
          title="Guardian & recovery"
          subtitle="Emergency sweep to your guardian"
          onPress={onRecovery}
          chevron
        />
      </Card>

      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Spending limits" />
      <Card>
        <Text style={styles.cardBody}>
          Advisory caps checked before your key is ever derived. Set 0 for no limit.
        </Text>
        <View style={{ height: spacing.md }} />
        <NumberField
          label="Per-transaction limit"
          value={settings.perTxLimitEth}
          onChangeNumber={(n) => set('perTxLimitEth', n)}
          suffix="ETH"
        />
        <NumberField
          label="Daily limit"
          value={settings.dailyLimitEth}
          onChangeNumber={(n) => set('dailyLimitEth', n)}
          suffix="ETH"
        />
        <NumberField
          label="Cooldown for transfers over 50% of balance"
          value={settings.cooldownMinutes}
          onChangeNumber={(n) => set('cooldownMinutes', Math.round(n))}
          suffix="min"
        />
      </Card>

      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Approval protection" />
      <Card>
        <Toggle
          label="Block infinite approvals"
          hint="Reject unlimited ERC-20 allowances — the top drain vector."
          value={settings.blockInfiniteApprovals}
          onValueChange={(v) => set('blockInfiniteApprovals', v)}
        />
        <RowDivider />
        <Toggle
          label="Block setApprovalForAll"
          hint="Reject whole-collection NFT operator grants."
          value={settings.blockSetApprovalForAll}
          onValueChange={(v) => set('blockSetApprovalForAll', v)}
        />
      </Card>

      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Human verification" />
      <Card>
        <Toggle
          label="Selfie Check to override a limit"
          hint="Require a live-human World ID check before overriding a blocked tx."
          value={settings.requireWorldIdOnOverride}
          onValueChange={(v) => set('requireWorldIdOnOverride', v)}
        />
        <RowDivider />
        <Toggle
          label="Selfie Check to sweep funds"
          hint="Require a World ID check before the emergency recovery sweep."
          value={settings.requireWorldIdOnSweep}
          onValueChange={(v) => set('requireWorldIdOnSweep', v)}
        />
      </Card>

      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Testnet" />
      <Card>
        <Text style={styles.cardBody}>
          Claiming your name is free — it only needs Sepolia gas. This faucet mints test
          USDC for other flows (e.g. registering your own .eth name).
        </Text>
        <View style={{ height: spacing.md }} />
        <Button title="Mint 100 test USDC" variant="secondary" onPress={onMintUsdc} />
      </Card>

      <View style={{ height: spacing.xl }} />
      <Button title="View live device logs" variant="secondary" onPress={onLogs} />
      <View style={{ height: spacing.sm }} />
      <Button title="🔒 Lock wallet session" variant="ghost" onPress={onLock} />
    </Page>
  );
}

// ── Identity (ENS): claim a name → unlock guardian recovery ───────────────────
export function IdentityScreen({
  address,
  ensName,
  parentName,
  guardianAddress,
  guardianEns,
  busy,
  status,
  needsGas,
  onCheckAndClaim,
  onSetGuardian,
  onBack,
}: {
  address: string;
  ensName: string | null;
  parentName: string;
  needsGas?: boolean;
  guardianAddress: string | null;
  guardianEns: string | null;
  busy: boolean;
  status: string | null;
  onCheckAndClaim: (label: string) => void;
  onSetGuardian: (nameOrAddress: string) => void;
  onBack: () => void;
}) {
  const [label, setLabel] = useState('');
  const [guardian, setGuardian] = useState('');
  const clean = label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

  return (
    <Page
      title="Identity"
      subtitle="Your wallet identity is an ENS name — it's how others see you, it powers anti-impersonation, and it unlocks guardian recovery."
      onBack={onBack}
    >
      <IdentityCard
        label={ensName ? 'NOTWALLET IDENTITY' : 'UNCLAIMED'}
        name={ensName ?? `·····.${parentName}`}
        sub={short(address)}
      />

      <View style={{ height: spacing.xl }} />

      {needsGas ? (
        <>
          <Card tone="warn">
            <SectionLabel>NEEDS SEPOLIA GAS</SectionLabel>
            <Text style={[styles.cardBody, { marginTop: spacing.xs }]}>
              Claiming writes to ENS on Sepolia, so this wallet needs a little test ETH first.
              Fund this address:
            </Text>
            <Text style={[styles.spender, { marginTop: spacing.sm }]} selectable>{address}</Text>
          </Card>
          <View style={{ height: spacing.xl }} />
        </>
      ) : null}

      {!ensName ? (
        <Card>
          <SectionLabel>CLAIM YOUR NAME</SectionLabel>
          <View style={{ height: spacing.sm }} />
          <Text style={styles.cardBody}>
            Pick a handle. It's issued as a subname under {parentName} on ENS (Sepolia).
          </Text>
          <View style={{ height: spacing.md }} />
          <TextField
            value={label}
            onChangeText={setLabel}
            placeholder="yourname"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {clean ? (
            <Text style={styles.namePreview}>
              → <Text style={{ color: colors.brand, fontWeight: '800' }}>{clean}.{parentName}</Text>
            </Text>
          ) : null}
          <Button
            title={busy ? 'Working…' : 'Check & claim name'}
            onPress={() => onCheckAndClaim(clean)}
            loading={busy}
            disabled={!clean}
          />
        </Card>
      ) : null}

      {status ? <Text style={styles.centerNote}>{status}</Text> : null}

      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Recovery guardian" />
      <Card tone={!ensName ? 'alt' : 'surface'}>
        {!ensName ? (
          <Text style={styles.cardBody}>
            🔒 Claim your ENS name first. Your guardian is stored as a record your name owns —
            recovery reads it back from ENS.
          </Text>
        ) : guardianAddress ? (
          <>
            <ListRow
              icon="🛟"
              iconTone="ok"
              title={guardianEns ?? short(guardianAddress)}
              subtitle="Stored on ENS · can update the recovery pointer only"
            />
            <View style={{ height: spacing.md }} />
            <TextField
              value={guardian}
              onChangeText={setGuardian}
              placeholder="Change guardian (ENS or 0x…)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Update guardian"
              variant="secondary"
              onPress={() => onSetGuardian(guardian.trim())}
              loading={busy}
              disabled={!guardian.trim()}
            />
          </>
        ) : (
          <>
            <Text style={styles.cardBody}>
              Set a trusted address (ENS or 0x…) as your recovery guardian.
            </Text>
            <View style={{ height: spacing.md }} />
            <TextField
              value={guardian}
              onChangeText={setGuardian}
              placeholder="vitalik.eth or 0x…"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Set guardian on ENS"
              onPress={() => onSetGuardian(guardian.trim())}
              loading={busy}
              disabled={!guardian.trim()}
            />
          </>
        )}
      </Card>
    </Page>
  );
}

// ── Approvals dashboard ───────────────────────────────────────────────────────
export function ApprovalsScreen({
  scanning,
  approvals,
  onRevoke,
  onRescan,
  onBack,
}: {
  scanning: boolean;
  approvals: TokenApproval[];
  onRevoke: (token: string, spender: string) => void;
  onRescan: () => void;
  onBack: () => void;
}) {
  return (
    <Page
      title="Token Approvals"
      subtitle="Contracts allowed to spend your tokens. Revoke anything you don't recognize."
      onBack={onBack}
    >
      {scanning ? (
        <Card>
          <Text style={[styles.cardBody, { textAlign: 'center' }]}>
            Scanning Sepolia allowances…
          </Text>
        </Card>
      ) : approvals.length === 0 ? (
        <Card tone="ok">
          <Text style={{ fontSize: 40, textAlign: 'center' }}>🛡️</Text>
          <Text style={styles.emptyTitle}>No active approvals</Text>
          <Text style={[styles.cardBody, { textAlign: 'center' }]}>
            No contract can currently move your tokens.
          </Text>
        </Card>
      ) : (
        approvals.map((appr, i) => (
          <View key={`${appr.tokenAddress}-${appr.spenderAddress}-${i}`}>
            {i > 0 ? <View style={{ height: spacing.md }} /> : null}
            <Card tone={appr.isUnlimited ? 'danger' : 'surface'}>
              <Row justify="space-between">
                <Text style={styles.tokenSymbol}>{appr.tokenSymbol}</Text>
                {appr.isUnlimited ? <RiskBadge level="danger" label="UNLIMITED" /> : null}
              </Row>
              <Text style={styles.spender}>
                Spender {appr.spenderAddress.slice(0, 10)}…{appr.spenderAddress.slice(-6)}
              </Text>
              <View style={{ height: spacing.md }} />
              <Button
                title="Revoke allowance"
                variant="danger"
                onPress={() => onRevoke(appr.tokenAddress, appr.spenderAddress)}
              />
            </Card>
          </View>
        ))
      )}
      <View style={{ height: spacing.lg }} />
      <Button title="Rescan" variant="secondary" onPress={onRescan} loading={scanning} />
    </Page>
  );
}

// ── Policy block ──────────────────────────────────────────────────────────────
export function PolicyBlockScreen({
  reason,
  canOverride,
  worldGated,
  onOverride,
  onReject,
}: {
  reason: string;
  canOverride: boolean;
  worldGated: boolean;
  onOverride: () => void;
  onReject: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + spacing.huge, paddingHorizontal: spacing.xl }}>
      <Card tone="warn">
        <Text style={{ fontSize: 44, textAlign: 'center' }}>🚫</Text>
        <Text style={styles.blockTitle}>Transaction blocked</Text>
        <Text style={[styles.cardBody, { textAlign: 'center', marginTop: spacing.sm }]}>
          {reason}
        </Text>
      </Card>
      <View style={{ height: spacing.xl }} />
      {canOverride ? (
        <Button
          title={worldGated ? '🌐 Verify with World ID & override' : 'Override & proceed'}
          onPress={onOverride}
        />
      ) : null}
      <View style={{ height: spacing.sm }} />
      <Button title="Reject transaction" variant="ghost" onPress={onReject} />
    </View>
  );
}

// ── Recovery / panic sweep ────────────────────────────────────────────────────
export function RecoveryScreen({
  ensName,
  guardianAddress,
  guardianEns,
  worldGated,
  sweepResult,
  busy,
  onIdentity,
  onSweep,
  onBack,
}: {
  ensName: string | null;
  guardianAddress: string | null;
  guardianEns: string | null;
  worldGated: boolean;
  sweepResult: { ethSwept: string; tokensSwept: number; approvalsRevoked: number } | null;
  busy: boolean;
  onIdentity: () => void;
  onSweep: () => void;
  onBack: () => void;
}) {
  const ready = !!ensName && !!guardianAddress;
  return (
    <Page
      title="Emergency Recovery"
      subtitle="If your phone or keys are compromised, sweep everything to your guardian and revoke all approvals in one tap."
      onBack={onBack}
    >
      <SectionHeader title="Guardian" />
      <Card tone={ready ? 'surface' : 'warn'}>
        {!ensName ? (
          <>
            <Text style={styles.cardBody}>Claim your ENS name to enable recovery.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Set up identity" variant="secondary" onPress={onIdentity} />
          </>
        ) : !guardianAddress ? (
          <>
            <Text style={styles.cardBody}>No guardian set on your ENS name yet.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Add a guardian" variant="secondary" onPress={onIdentity} />
          </>
        ) : (
          <ListRow
            icon="🛟"
            iconTone="ok"
            title={guardianEns ?? short(guardianAddress)}
            subtitle="Read live from your ENS recovery record"
          />
        )}
      </Card>

      {sweepResult ? (
        <>
          <View style={{ height: spacing.xl }} />
          <SectionHeader title="Sweep report" />
          <Card padded={false} style={styles.rowCard}>
            <ListRow icon="⟠" iconTone="ok" title="ETH swept" value={sweepResult.ethSwept} />
            <RowDivider />
            <ListRow icon="🪙" title="Tokens swept" value={String(sweepResult.tokensSwept)} />
            <RowDivider />
            <ListRow
              icon="🛡"
              title="Approvals revoked"
              value={String(sweepResult.approvalsRevoked)}
            />
          </Card>
        </>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button
        title={worldGated ? '🚨 Verify & sweep all funds' : '🚨 Tap NFC card to sweep all funds'}
        variant="danger"
        onPress={onSweep}
        loading={busy}
        disabled={!ready}
      />
      {!ready ? (
        <Text style={styles.centerNote}>Recovery unlocks once you have an ENS name + guardian.</Text>
      ) : null}
    </Page>
  );
}

export function CenterInfo({ children }: { children: ReactNode }) {
  return <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>{children}</View>;
}

const styles = StyleSheet.create({
  // Onboarding (on gradient)
  brand: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: spacing.lg, letterSpacing: -0.5 },
  brandSub: { color: colors.onHeroMuted, fontSize: 13, marginTop: 4 },
  onboardHeadline: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.5 },
  onboardBody: { color: colors.onHeroMuted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  heroInput: {
    backgroundColor: colors.onHeroFill,
    borderWidth: 1,
    borderColor: colors.onHeroBorder,
    borderRadius: radius.pill,
    color: '#FFFFFF',
    fontSize: 16,
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    marginBottom: spacing.md,
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  pillText: { color: '#0A0F1E', fontSize: 16, fontWeight: '700' },
  linkCenter: { color: colors.onHeroMuted, textAlign: 'center', fontSize: 14 },

  // Home hero (on gradient)
  heroEyebrow: { color: colors.onHeroDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  heroCaret: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '800', marginTop: -2 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.sm },
  agentBalance: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, marginTop: spacing.md, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.brand },
  heroHandle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 3 },
  heroBalanceLabel: { color: colors.onHeroMuted, fontSize: 13, fontWeight: '600' },
  heroBalance: { color: '#FFFFFF', fontSize: 42, fontWeight: '800', letterSpacing: -1.4, marginTop: 4 },
  heroBalanceUnit: { fontSize: 22, fontWeight: '700', color: colors.onHeroMuted, letterSpacing: 0 },
  heroBalanceSub: { color: colors.onHeroMuted, fontSize: 13.5, marginTop: 5 },
  lockedPill: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    backgroundColor: colors.onHeroFill,
    borderWidth: 1,
    borderColor: colors.onHeroBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  lockedPillText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },

  // Light content sheet
  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  rowCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  footNote: {
    textAlign: 'center',
    color: colors.textDim,
    fontSize: 12,
    marginTop: spacing.xl,
    marginBottom: spacing.huge,
  },

  // Detail pages
  pageSub: { color: colors.textMuted, fontSize: 14.5, lineHeight: 21, marginTop: spacing.sm },
  cardBody: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  centerNote: {
    color: colors.textDim,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  namePreview: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.md },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  tokenSymbol: { color: colors.text, fontSize: 17, fontWeight: '800' },
  spender: { color: colors.textMuted, fontSize: 13, marginTop: 6, fontFamily: 'monospace' },
  blockTitle: {
    color: colors.warn,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  summary: { fontSize: 19, fontWeight: '700', color: colors.text, lineHeight: 26 },
  cameraBox: {
    height: 320,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});

// ── Agents: named, budgeted sub-accounts under your ENS name ─────────────────
export function AgentsScreen({
  agents,
  ensName,
  identityName,
  createParentName,
  busy,
  status,
  onCreate,
  onOpen,
  onIdentity,
  onBack,
}: {
  agents: Agent[];
  ensName: string | null;
  identityName: string | null;
  createParentName: string | null;
  busy: boolean;
  status: string | null;
  onCreate: (draft: { label: string; chain: string; budgetUsd: number; note: string }) => void;
  onOpen: (agent: Agent) => void;
  onIdentity: () => void;
  onBack: () => void;
}) {
  const [label, setLabel] = useState('');
  const [chain, setChain] = useState('');
  const [budget, setBudget] = useState(50);
  const [note, setNote] = useState('');
  const clean = label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  // Only TOP-LEVEL sub-wallets here (children live inside their parent's detail).
  const parentForNew = createParentName || identityName || ensName || '';
  const topLevel = agents.filter(
    (a) => !a.revokedAt && a.fullName.toLowerCase().endsWith(`.${(identityName ?? ensName ?? '').toLowerCase()}`)
      && a.fullName.split('.').length === ((identityName ?? ensName ?? '').split('.').length + 1),
  );

  if (!ensName) {
    return (
      <Page
        title="Agents"
        subtitle="Named sub-accounts you can hand to an AI agent or bot, each with its own budget."
        onBack={onBack}
      >
        <Card tone="alt">
          <Text style={styles.cardBody}>
            🔒 Claim your ENS name first. Agents are issued as subnames underneath it,
            e.g. <Text style={{ fontWeight: '700' }}>bnb.alice.notwallet.eth</Text>.
          </Text>
          <View style={{ height: spacing.md }} />
          <Button title="Set up identity" variant="secondary" onPress={onIdentity} />
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Agents"
      subtitle={`Each is its own wallet under ${ensName}. Connect it to dapps, fund it, and it can only ever spend what you give it.`}
      onBack={onBack}
    >
      {topLevel.length > 0 ? (
        <>
          <SectionHeader title={`Sub-wallets · ${topLevel.length}`} />
          <Card padded={false} style={styles.rowCard}>
            {topLevel.map((a, i) => (
              <View key={a.fullName}>
                {i > 0 ? <RowDivider /> : null}
                <ListRow
                  icon="🤖"
                  iconTone="brand"
                  title={a.label}
                  subtitle={`${a.chain || 'any chain'} · ${short(a.address)}`}
                  value={`$${a.budgetUsd}`}
                  valueSub={a.ensRegistered ? 'on ENS' : 'budget'}
                  onPress={() => onOpen(a)}
                  chevron
                />
              </View>
            ))}
          </Card>
          <View style={{ height: spacing.xl }} />
        </>
      ) : null}

      <SectionHeader title={createParentName ? 'New sub-agent' : 'New sub-wallet'} />
      {createParentName ? (
        <Text style={[styles.namePreview, { marginTop: -spacing.xs }]}>
          nesting under <Text style={{ color: colors.brand, fontWeight: '800' }}>{createParentName}</Text>
        </Text>
      ) : null}
      <Card>
        <Text style={styles.cardBody}>
          Give it a name, a purpose and a budget. It gets its own key and address —
          created instantly, ready to connect to dapps. It can never touch your main
          balance, only what you send it.
        </Text>
        <View style={{ height: spacing.md }} />
        <TextField
          label="Agent name"
          value={label}
          onChangeText={setLabel}
          placeholder="bnb"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {clean ? (
          <Text style={styles.namePreview}>
            → <Text style={{ color: colors.brand, fontWeight: '800' }}>{clean}.{parentForNew}</Text>
          </Text>
        ) : null}
        <TextField
          label="Chain / venue"
          value={chain}
          onChangeText={setChain}
          placeholder="BNB Chain"
          autoCapitalize="none"
        />
        <NumberField label="Budget" value={budget} onChangeNumber={setBudget} suffix="USD" />
        <TextField
          label="What is it for? (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Trading bot"
        />
        <Button
          title={busy ? 'Working…' : 'Create agent'}
          onPress={() => onCreate({ label: clean, chain: chain.trim(), budgetUsd: budget, note: note.trim() })}
          loading={busy}
          disabled={!clean}
        />
        <Text style={styles.centerNote}>
          You'll tap your card once to derive the sub-wallet's key. Its name lives under
          your identity; you can switch to it from Home or pick it when connecting a dapp.
        </Text>
      </Card>

      {status ? <Text style={styles.centerNote}>{status}</Text> : null}

      {agents.some((a) => a.revokedAt) ? (
        <>
          <View style={{ height: spacing.xl }} />
          <SectionHeader title="Revoked" />
          <Card padded={false} style={styles.rowCard}>
            {agents
              .filter((a) => a.revokedAt)
              .map((a, i) => (
                <View key={a.fullName}>
                  {i > 0 ? <RowDivider /> : null}
                  <ListRow icon="🚫" title={a.fullName} subtitle="Revoked" />
                </View>
              ))}
          </Card>
        </>
      ) : null}
    </Page>
  );
}

// ── Agent detail: fund, customize, nest, register on ENS ─────────────────────
export function AgentDetailScreen({
  agent,
  ensRegistered,
  isActive,
  ethBalance,
  usdcBalance,
  children,
  identityName,
  busy,
  status,
  onFundUsdc,
  onFundGas,
  onSaveMeta,
  onSwitchTo,
  onAddSubAgent,
  onRegisterEns,
  onOpenChild,
  onRevoke,
  onBack,
}: {
  agent: Agent;
  ensRegistered: boolean;
  isActive: boolean;
  ethBalance: string;
  usdcBalance: string;
  children: Agent[];
  identityName: string | null;
  busy: boolean;
  status: string | null;
  onFundUsdc: (amount: number) => void;
  onFundGas: () => void;
  onSaveMeta: (patch: { budgetUsd: number; note: string }) => void;
  onSwitchTo: () => void;
  onAddSubAgent: () => void;
  onRegisterEns: () => void;
  onOpenChild: (a: Agent) => void;
  onRevoke: () => void;
  onBack: () => void;
}) {
  const [budget, setBudget] = useState(agent.budgetUsd);
  const [note, setNote] = useState(agent.note ?? '');
  const funded = parseFloat(usdcBalance);
  const pct = agent.budgetUsd > 0 ? Math.min(100, Math.round((funded / agent.budgetUsd) * 100)) : 0;

  return (
    <Page title={agent.label} subtitle={agent.fullName} onBack={onBack}>
      {/* Funding status — the budget IS the balance */}
      <Card tone="brand">
        <SectionLabel>FUNDED BALANCE</SectionLabel>
        <Row justify="space-between" align="flex-end" style={{ marginTop: spacing.xs }}>
          <Text style={styles.agentBalance}>${usdcBalance}</Text>
          <Text style={styles.cardBody}>of ${agent.budgetUsd} budget</Text>
        </Row>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${pct}%` }]} />
        </View>
        <Text style={[styles.cardBody, { marginTop: spacing.sm }]}>
          This sub-wallet can only ever spend what it holds — its budget is its balance.
          Gas: {ethBalance} ETH.
        </Text>
      </Card>

      <View style={{ height: spacing.md }} />
      <Row gap={spacing.md}>
        <View style={{ flex: 1 }}>
          <Button
            title={busy ? '…' : `Fund $${agent.budgetUsd}`}
            onPress={() => onFundUsdc(agent.budgetUsd)}
            loading={busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Top up gas" variant="secondary" onPress={onFundGas} />
        </View>
      </Row>
      {!isActive ? (
        <>
          <View style={{ height: spacing.sm }} />
          <Button title="Use this wallet" variant="secondary" onPress={onSwitchTo} />
        </>
      ) : null}

      {/* ENS status */}
      <View style={{ height: spacing.xl }} />
      <SectionHeader title="ENS name" />
      <Card tone={ensRegistered ? 'ok' : 'surface'}>
        {ensRegistered ? (
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            {agent.fullName} ✓ registered on ENS
          </Text>
        ) : (
          <>
            <Text style={styles.cardBody}>
              Register {agent.fullName} on-chain so it resolves as a real ENS name others can send to.
            </Text>
            <View style={{ height: spacing.md }} />
            <Button title={busy ? 'Working…' : 'Register on ENS'} onPress={onRegisterEns} loading={busy} />
          </>
        )}
      </Card>

      {/* Customize */}
      <View style={{ height: spacing.xl }} />
      <SectionHeader title="Customize" />
      <Card>
        <NumberField label="Budget" value={budget} onChangeNumber={setBudget} suffix="USD" />
        <TextField label="What it's for" value={note} onChangeText={setNote} placeholder="Trading bot" />
        <Button title="Save changes" variant="secondary" onPress={() => onSaveMeta({ budgetUsd: budget, note })} />
      </Card>

      {/* Nested sub-agents */}
      <View style={{ height: spacing.xl }} />
      <SectionHeader title={`Sub-agents · ${children.length}`} />
      {children.length > 0 ? (
        <Card padded={false} style={styles.rowCard}>
          {children.map((c, i) => (
            <View key={c.fullName}>
              {i > 0 ? <RowDivider /> : null}
              <ListRow
                icon="🤖"
                title={c.label}
                subtitle={`${c.chain || 'sub-agent'} · $${c.budgetUsd} · ${short(c.address)}`}
                onPress={() => onOpenChild(c)}
                chevron
              />
            </View>
          ))}
        </Card>
      ) : null}
      <View style={{ height: spacing.md }} />
      <Button title="+ Add sub-agent" variant="secondary" onPress={onAddSubAgent} />
      <Text style={styles.centerNote}>
        e.g. two bots under {agent.label}: they become {`bot1.${agent.fullName}`}. Nesting is the
        ENSv2 hierarchy — each name can own its own sub-names.
      </Text>

      {status ? <Text style={styles.centerNote}>{status}</Text> : null}

      <View style={{ height: spacing.xl }} />
      <Button title="Remove this sub-wallet" variant="danger" onPress={onRevoke} />
    </Page>
  );
}
