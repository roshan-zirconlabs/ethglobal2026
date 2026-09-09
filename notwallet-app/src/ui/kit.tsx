/**
 * NotWallet UI kit — the shared, theme-driven component library.
 *
 * Every screen composes these; no ad-hoc styling. This is what makes the app feel
 * consistent and "high-grade". All tokens come from ../theme.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, shadow, spacing, typography } from '../theme';

// ── Layout ──────────────────────────────────────────────────────────────────
export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const inner = (
    <View style={[padded && { paddingHorizontal: spacing.xl }, { flexGrow: 1 }]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingVertical: spacing.xl, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export const Row = ({
  children,
  gap = spacing.sm,
  align = 'center',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: ViewStyle;
}) => (
  <View
    style={[
      { flexDirection: 'row', alignItems: align, justifyContent: justify, gap },
      style,
    ]}
  >
    {children}
  </View>
);

export const Spacer = ({ h = spacing.md }: { h?: number }) => <View style={{ height: h }} />;
export const Divider = () => <View style={styles.divider} />;

export function Card({
  children,
  onPress,
  tone = 'surface',
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: 'surface' | 'alt' | 'danger' | 'warn' | 'ok';
  style?: ViewStyle;
}) {
  const bg = {
    surface: colors.surface,
    alt: colors.surfaceAlt,
    danger: colors.dangerBg,
    warn: colors.warnBg,
    ok: colors.okBg,
  }[tone];
  const border = {
    surface: colors.border,
    alt: colors.border,
    danger: colors.dangerBorder,
    warn: colors.warnBorder,
    ok: colors.okBorder,
  }[tone];
  const body = (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }, style]}>
      {children}
    </View>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

// ── Type ────────────────────────────────────────────────────────────────────
export const Title = ({ children }: { children: ReactNode }) => (
  <Text style={typography.titleLarge}>{children}</Text>
);
export const Heading = ({ children }: { children: ReactNode }) => (
  <Text style={typography.titleMedium}>{children}</Text>
);
export const Body = ({ children, dim }: { children: ReactNode; dim?: boolean }) => (
  <Text style={[typography.bodyLarge, dim && { color: colors.textMuted }]}>{children}</Text>
);
export const Caption = ({ children, color }: { children: ReactNode; color?: string }) => (
  <Text style={[typography.caption, color ? { color } : null]}>{children}</Text>
);
export const Mono = ({ children }: { children: ReactNode }) => (
  <Text style={[typography.bodyMedium, typography.mono, { color: colors.text }]}>{children}</Text>
);

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && { backgroundColor: colors.brand },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'secondary' && {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.brand,
        },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.brandSoft : colors.onBrand} />
      ) : (
        <Text
          style={[
            styles.btnText,
            (variant === 'secondary' || variant === 'ghost') && { color: colors.brandSoft },
          ]}
        >
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
export function TextField({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Caption>{label}</Caption> : null}
      <TextInput
        placeholderTextColor={colors.textDim}
        style={[styles.input, error && { borderColor: colors.danger }, style]}
        {...props}
      />
      {error ? <Caption color={colors.danger}>{error}</Caption> : null}
    </View>
  );
}

// ── Badges / chips ────────────────────────────────────────────────────────────
export type Risk = 'info' | 'warn' | 'danger' | 'ok';
const RISK: Record<Risk, { fg: string; bg: string; bd: string }> = {
  info: { fg: colors.info, bg: colors.infoBg, bd: colors.infoBorder },
  warn: { fg: colors.warn, bg: colors.warnBg, bd: colors.warnBorder },
  danger: { fg: colors.danger, bg: colors.dangerBg, bd: colors.dangerBorder },
  ok: { fg: colors.ok, bg: colors.okBg, bd: colors.okBorder },
};
export function RiskBadge({ level, label }: { level: Risk; label: string }) {
  const c = RISK[level];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </View>
  );
}

/** Address, showing an ENS name + verified ✓ when available, else truncated hex. */
export function AddressChip({
  address,
  ensName,
  verified,
  impersonation,
}: {
  address: string;
  ensName?: string | null;
  verified?: boolean;
  impersonation?: boolean;
}) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <View style={styles.chip}>
      {ensName ? (
        <Text style={{ color: impersonation ? colors.danger : colors.text, fontWeight: '600' }}>
          {ensName} {impersonation ? '🚨' : verified ? '✓' : ''}
        </Text>
      ) : (
        <Text style={[typography.mono, { color: colors.textMuted }]}>{short}</Text>
      )}
    </View>
  );
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow.card,
  },
  btn: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnText: { color: colors.onBrand, fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginTop: spacing.xs,
  },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.huge,
    ...shadow.sheet,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});
