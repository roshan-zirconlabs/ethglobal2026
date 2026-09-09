/**
 * Screen components — presentational, composed from the UI kit. All wallet logic
 * stays in App.tsx and is passed in as props, so behaviour is unchanged while the
 * visual layer becomes consistent and high-grade. Real data only — no mock tokens.
 */
import { CameraView } from 'expo-camera';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { ClearSignResult } from './clearsign';
import { colors, radius, spacing, typography } from './theme';
import { Button, Caption, Card, Row, TextField } from './ui/kit';

const short = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

// ── Onboarding: Setup / Unlock ────────────────────────────────────────────────
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
    <View>
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
        <Text style={{ fontSize: 44, marginBottom: spacing.md }}>{isSetup ? '💳' : '🔒'}</Text>
        <Text style={typography.titleMedium}>{isSetup ? 'Hardware-grade wallet' : 'Wallet locked'}</Text>
        <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: spacing.sm }]}>
          {isSetup
            ? 'Your key is derived on demand from your password + any NFC card. Nothing is ever stored — no seed phrase.'
            : 'Enter your password and tap your card to regenerate your signing key.'}
        </Text>
      </Card>
      <View style={{ height: spacing.xl }} />
      <TextField
        label={isSetup ? 'Set a master password (min 6 chars)' : 'Master password'}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={onPassword}
      />
      <Button
        title={isSetup ? 'Tap NFC card to create wallet' : 'Tap NFC card to unlock'}
        icon="📇"
        onPress={onTapCard}
        loading={busy}
      />
      {!isSetup && onReadonly ? (
        <Button title="View portfolio (read-only)" variant="ghost" onPress={onReadonly} />
      ) : null}
    </View>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
type Subaccount = { purpose: string; label: string; icon: string };
export function HomeScreen({
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
  sessions,
  onDisconnect,
}: {
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
  sessions: [string, any][];
  onDisconnect: (topic: string) => void;
}) {
  return (
    <View>
      {/* Sub-account envelopes */}
      <Row gap={spacing.sm} style={{ marginBottom: spacing.lg, flexWrap: 'wrap' }}>
        {subaccounts.map((s) => {
          const active = activeSubaccount === s.purpose;
          return (
            <TouchableOpacity
              key={s.purpose}
              onPress={() => onSwitch(s.purpose)}
              style={[styles.envelope, active && styles.envelopeActive]}
            >
              <Text style={{ fontSize: 15 }}>{s.icon}</Text>
              <Text style={[styles.envelopeLabel, active && { color: colors.text }]}>
                {s.label.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Row>

      {/* Balance hero */}
      <Card>
        <Caption>TOTAL BALANCE</Caption>
        <Text style={styles.balance}>{balance} ETH</Text>
        {fiat ? <Text style={typography.bodyMedium}>{fiat}</Text> : null}
        <Row justify="space-between" style={{ marginTop: spacing.xl }}>
          <QuickAction icon="↑" label="Send" onPress={onSend} />
          <QuickAction icon="↓" label="Receive" onPress={onReceive} />
          <QuickAction icon="🔗" label="Connect" onPress={onConnect} primary />
          <QuickAction icon="🛡" label="Shield" onPress={onShield} />
        </Row>
      </Card>

      {locked ? (
        <Card tone="warn" style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.warn, fontWeight: '600' }}>🔒 Locked — unlock to sign</Text>
        </Card>
      ) : null}

      {/* Connected dapps */}
      {sessions.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Caption>CONNECTED DAPPS · {sessions.length}</Caption>
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

      {/* Assets — real ETH only (no mock tokens) */}
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

function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      <View style={[styles.actionCircle, primary && { backgroundColor: colors.brand }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={typography.caption}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Connect (WalletConnect QR scanner) ────────────────────────────────────────
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
      <Text style={typography.titleMedium}>Scan WalletConnect QR</Text>
      <Text style={[typography.bodyMedium, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        Open any dapp's "Connect Wallet" → WalletConnect and scan its QR.
      </Text>
      {granted ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(e) => onScan(e.data)}
          />
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
          <Text style={{ color: colors[tone === 'ok' ? 'ok' : tone], fontWeight: '700', fontSize: 12 }}>
            {risk.label}
          </Text>
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
          <TextField
            label="Enter password to authorize"
            placeholder="Master password"
            secureTextEntry
            value={password}
            onChangeText={onPassword}
          />
        </View>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button
        title={busy ? 'Signing…' : 'Tap NFC card to sign'}
        icon="📇"
        variant={tone === 'danger' ? 'danger' : 'primary'}
        onPress={onSign}
        loading={busy}
      />
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
  envelope: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  envelopeActive: { borderColor: colors.brand, backgroundColor: colors.brandBg },
  envelopeLabel: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  balance: { fontSize: 40, fontWeight: '800', color: colors.text, marginTop: spacing.xs, letterSpacing: -1 },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    height: 300,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: spacing.md,
  },
  riskPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  risk_ok: { backgroundColor: colors.okBg, borderColor: colors.okBorder },
  risk_warn: { backgroundColor: colors.warnBg, borderColor: colors.warnBorder },
  risk_danger: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  summary: { fontSize: 19, fontWeight: '700', color: colors.text, lineHeight: 26 },
});
