/**
 * Screen components — presentational, composed from the UI kit + cinematic visuals
 * (gradients, gradient account card, action tiles). All wallet logic stays in
 * App.tsx and is passed in as props. Real data only — no mock tokens.
 */
import { CameraView } from 'expo-camera';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ClearSignResult } from './clearsign';
import { colors, gradients, radius, spacing, typography } from './theme';
import { Button, Caption, Card, Row, TextField } from './ui/kit';
import { AccountCard, ActionTile, GradientBackdrop, LogoMark } from './ui/visual';

// ── Onboarding: Setup / Unlock (full-screen, cinematic) ───────────────────────
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
      <GradientBackdrop from={gradients.onboard[0]} to={gradients.onboard[1]} />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: spacing.xl }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
          <TextField
            placeholder={isSetup ? 'Create a master password' : 'Master password'}
            secureTextEntry
            value={password}
            onChangeText={onPassword}
          />
          <TouchableOpacity style={styles.pill} onPress={onTapCard} disabled={busy} activeOpacity={0.9}>
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
      </SafeAreaView>
    </View>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
type Subaccount = { purpose: string; label: string; icon: string };
export function HomeScreen({
  handle,
  balance,
  fiat,
  locked,
  subaccounts,
  activeSubaccount,
  onSwitch,
  onSend,
  onReceive,
  onConnect,
  onShield,
  onSettings,
  sessions,
  onDisconnect,
}: {
  handle: string;
  balance: string;
  fiat: string;
  locked: boolean;
  subaccounts: Subaccount[];
  activeSubaccount: string;
  onSwitch: (p: string) => void;
  onSend: () => void;
  onReceive: () => void;
  onConnect: () => void;
  onShield: () => void;
  onSettings: () => void;
  sessions: [string, any][];
  onDisconnect: (topic: string) => void;
}) {
  return (
    <View>
      {/* Top bar */}
      <Row justify="space-between" style={{ marginBottom: spacing.lg }}>
        <View>
          <Caption>WALLET</Caption>
          <Text style={styles.handle}>{handle}</Text>
        </View>
        <TouchableOpacity onPress={onSettings} style={styles.iconBtn}>
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </TouchableOpacity>
      </Row>

      {/* Sub-account chips */}
      <Row gap={spacing.sm} style={{ marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        {subaccounts.map((s) => {
          const active = activeSubaccount === s.purpose;
          return (
            <TouchableOpacity
              key={s.purpose}
              onPress={() => onSwitch(s.purpose)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={{ fontSize: 14 }}>{s.icon}</Text>
              <Text style={[styles.chipLabel, active && { color: colors.text }]}>{s.label.split(' ')[0]}</Text>
            </TouchableOpacity>
          );
        })}
      </Row>

      {/* Gradient account card (hero) */}
      <AccountCard label="TOTAL BALANCE" handle={handle} balance={balance} fiat={fiat} />

      {/* Action tiles */}
      <Row justify="space-between" style={{ marginTop: spacing.xl, marginBottom: spacing.md }}>
        <ActionTile icon="↑" label="Send" onPress={onSend} />
        <ActionTile icon="↓" label="Receive" onPress={onReceive} />
        <ActionTile icon="🔗" label="Connect" onPress={onConnect} accent />
        <ActionTile icon="🛡" label="Shield" onPress={onShield} />
      </Row>

      {locked ? (
        <Card tone="warn" style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.warn, fontWeight: '600' }}>🔒 Locked — unlock to sign</Text>
        </Card>
      ) : null}

      {/* Connected dapps */}
      {sessions.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Caption>CONNECTED · {sessions.length}</Caption>
          {sessions.map(([topic, session]) => (
            <Row key={topic} justify="space-between" style={{ marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {session?.peer?.metadata?.name ?? 'Web3 Dapp'}
                </Text>
                <Text style={typography.caption}>{session?.peer?.metadata?.url ?? ''}</Text>
              </View>
              <TouchableOpacity onPress={() => onDisconnect(topic)}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Disconnect</Text>
              </TouchableOpacity>
            </Row>
          ))}
        </Card>
      ) : null}

      {/* Assets — real ETH only */}
      <Card style={{ marginTop: spacing.lg }}>
        <Caption>ASSETS</Caption>
        <Row justify="space-between" style={{ marginTop: spacing.md }}>
          <Row gap={spacing.md}>
            <View style={styles.tokenIcon}>
              <Text style={{ fontSize: 18 }}>⟠</Text>
            </View>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Ethereum</Text>
              <Text style={typography.caption}>Sepolia Testnet</Text>
            </View>
          </Row>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{balance} ETH</Text>
        </Row>
      </Card>
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
    <View>
      <Text style={typography.titleMedium}>Connect a dapp</Text>
      <Text style={[typography.bodyMedium, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        Open any dapp's "Connect Wallet → WalletConnect" and scan its QR.
      </Text>
      {granted ? (
        <View style={styles.cameraBox}>
          <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(e) => onScan(e.data)} />
        </View>
      ) : (
        <Button title="Enable camera" onPress={onRequestPermission} />
      )}
      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </View>
  );
}

// ── Review & Sign (HERO) ──────────────────────────────────────────────────────
const RISK: Record<string, { level: 'ok' | 'warn' | 'danger'; label: string }> = {
  info: { level: 'ok', label: 'LOOKS OK' },
  warn: { level: 'warn', label: 'CAUTION' },
  danger: { level: 'danger', label: 'DANGER' },
};
export function ReviewScreen({
  result,
  fallback,
  dappName,
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
  needsPassword: boolean;
  password: string;
  onPassword: (v: string) => void;
  onSign: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const risk = result ? RISK[result.worstLevel] : { level: 'ok' as const, label: 'REVIEW' };
  const tone = risk.level;
  return (
    <View>
      <Row justify="space-between" style={{ marginBottom: spacing.md }}>
        <View style={[styles.riskPill, styles[`risk_${tone}` as const]]}>
          <Text style={{ color: colors[tone === 'ok' ? 'ok' : tone], fontWeight: '700', fontSize: 12 }}>{risk.label}</Text>
        </View>
        {dappName ? <Caption>via {dappName}</Caption> : null}
      </Row>
      <Card tone={tone === 'ok' ? 'surface' : tone}>
        <Text style={styles.summary}>{result ? result.summary : fallback}</Text>
        {result?.flags.map((flag, i) => (
          <View key={i} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors[flag.level === 'info' ? 'ok' : flag.level], fontSize: 13, fontWeight: '600' }}>
              {flag.level === 'danger' ? '🚨' : '⚠️'} {flag.message}
            </Text>
          </View>
        ))}
      </Card>
      {needsPassword ? (
        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Enter password to authorize" placeholder="Master password" secureTextEntry value={password} onChangeText={onPassword} />
        </View>
      ) : null}
      <View style={{ height: spacing.lg }} />
      <Button title={busy ? 'Signing…' : 'Tap NFC card to sign'} icon="📇" variant={tone === 'danger' ? 'danger' : 'primary'} onPress={onSign} loading={busy} />
      <Button title="Reject" variant="ghost" onPress={onReject} />
      <Text style={[typography.caption, { textAlign: 'center', marginTop: spacing.sm }]}>
        Your key is derived from your card + password, used to sign, then wiped.
      </Text>
    </View>
  );
}

export function CenterInfo({ children }: { children: ReactNode }) {
  return <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>{children}</View>;
}

const styles = StyleSheet.create({
  brand: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: spacing.lg, letterSpacing: -0.5 },
  brandSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },
  onboardHeadline: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.5 },
  onboardBody: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  pill: { backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginTop: spacing.sm },
  pillText: { color: '#0A0F1E', fontSize: 16, fontWeight: '700' },
  linkCenter: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', fontSize: 14 },
  handle: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.brand, backgroundColor: colors.brandBg },
  chipLabel: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  tokenIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  cameraBox: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', marginBottom: spacing.md },
  riskPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  risk_ok: { backgroundColor: colors.okBg, borderColor: colors.okBorder },
  risk_warn: { backgroundColor: colors.warnBg, borderColor: colors.warnBorder },
  risk_danger: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  summary: { fontSize: 19, fontWeight: '700', color: colors.text, lineHeight: 26 },
});
