/**
 * NotWallet UI kit — the shared, theme-driven component library.
 *
 * Every screen composes these; no ad-hoc styling. Components here render on the
 * LIGHT content surface (`colors.text`, `colors.surface`). Anything that sits on
 * a gradient hero instead lives in `visual.tsx` and uses the `onHero*` colours.
 */
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
    <View style={[padded && { paddingHorizontal: spacing.xl }, { flexGrow: 1 }]}>{children}</View>
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
    style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap }, style]}
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
  padded = true,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: 'surface' | 'alt' | 'danger' | 'warn' | 'ok' | 'brand';
  padded?: boolean;
  style?: ViewStyle;
}) {
  const bg = {
    surface: colors.surface,
    alt: colors.surfaceAlt,
    danger: colors.dangerBg,
    warn: colors.warnBg,
    ok: colors.okBg,
    brand: colors.brandBg,
  }[tone];
  const border = {
    surface: colors.border,
    alt: colors.border,
    danger: colors.dangerBorder,
    warn: colors.warnBorder,
    ok: colors.okBorder,
    brand: colors.infoBorder,
  }[tone];
  const body = (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: border },
        padded && { padding: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
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
/** Small uppercase eyebrow — the label above a group of rows. */
export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <Text style={typography.eyebrow}>{children}</Text>
);

/** Section title with an optional right-hand action ("View all"). */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'hero';
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === 'primary' || variant === 'danger'
      ? colors.onBrand
      : variant === 'hero'
        ? colors.text
        : variant === 'secondary'
          ? colors.text
          : colors.brand;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && [{ backgroundColor: colors.brand }, shadow.brand],
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'hero' && { backgroundColor: '#FFFFFF' },
        variant === 'secondary' && {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.88, transform: [{ scale: 0.995 }] },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.btnText, { color: textColor }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** Small circular icon button (settings gear, back chevron, overflow). */
export function IconButton({
  icon,
  onPress,
  onHero,
}: {
  icon: string;
  onPress: () => void;
  onHero?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.iconBtn,
        onHero
          ? { backgroundColor: colors.onHeroFill, borderColor: colors.onHeroBorder }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={{ fontSize: 16, color: onHero ? '#FFFFFF' : colors.text }}>{icon}</Text>
    </TouchableOpacity>
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

/**
 * Numeric field with a live text draft (so "0." while typing doesn't snap to 0).
 * Reports the parsed number on every edit; empty/invalid reports 0.
 */
export function NumberField({
  label,
  value,
  onChangeNumber,
  suffix,
  placeholder,
}: {
  label?: string;
  value: number;
  onChangeNumber: (n: number) => void;
  suffix?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Caption>{label}</Caption> : null}
      <View style={styles.numberWrap}>
        <TextInput
          value={draft}
          keyboardType="decimal-pad"
          placeholder={placeholder ?? '0'}
          placeholderTextColor={colors.textDim}
          style={styles.numberInput}
          onChangeText={(t) => {
            const cleaned = t.replace(/[^0-9.]/g, '');
            setDraft(cleaned);
            const n = parseFloat(cleaned);
            onChangeNumber(Number.isFinite(n) ? n : 0);
          }}
        />
        {suffix ? <Text style={styles.numberSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

/** Labeled on/off row with a native switch. */
export function Toggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {hint ? <Text style={[typography.caption, { marginTop: 2 }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D3DAE6', true: colors.brand }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

// ── List row (the reference design's core content unit) ─────────────────────
export function ListRow({
  icon,
  iconTone = 'neutral',
  title,
  subtitle,
  value,
  valueSub,
  valueTone,
  onPress,
  chevron,
}: {
  icon?: string;
  iconTone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'danger';
  title: string;
  subtitle?: string;
  value?: string;
  valueSub?: string;
  valueTone?: 'default' | 'ok' | 'danger';
  onPress?: () => void;
  chevron?: boolean;
}) {
  const wellBg = {
    neutral: colors.surfaceAlt,
    brand: colors.brandBg,
    ok: colors.okBg,
    warn: colors.warnBg,
    danger: colors.dangerBg,
  }[iconTone];
  const valueColor =
    valueTone === 'ok' ? colors.ok : valueTone === 'danger' ? colors.danger : colors.text;

  const content = (
    <View style={styles.listRow}>
      {icon ? (
        <View style={[styles.iconWell, { backgroundColor: wellBg }]}>
          <Text style={{ fontSize: 17 }}>{icon}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value || valueSub ? (
        <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
          {value ? <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text> : null}
          {valueSub ? <Text style={styles.rowSub}>{valueSub}</Text> : null}
        </View>
      ) : null}
      {chevron ? <Text style={styles.chevron}>›</Text> : null}
    </View>
  );

  return onPress ? (
    <TouchableOpacity activeOpacity={0.6} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

/** Thin separator for use between ListRows inside a Card. */
export const RowDivider = () => <View style={styles.rowDivider} />;

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
      <Text style={{ color: c.fg, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },

  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    ...shadow.card,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  sectionAction: { fontSize: 14, fontWeight: '600', color: colors.brand },

  btn: {
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  btnText: { fontSize: 16, fontWeight: '700' },

  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    marginTop: spacing.xs,
  },
  numberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  numberInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 15 },
  numberSuffix: { color: colors.textDim, fontSize: 14, fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  iconWell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 54 },
  chevron: { fontSize: 22, color: colors.textDim, marginLeft: spacing.xs },

  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
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

  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.45)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.xl,
    paddingBottom: spacing.huge,
    ...shadow.sheet,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderFocus,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
});

/**
 * Error dialog — errors are surfaced as a modal over the app, not as a banner
 * pinned inside the page. Chain errors (revert traces) are long, so the body
 * scrolls and the raw text stays selectable/copyable.
 */
export function ErrorDialog({
  visible,
  message,
  onClose,
  onCopy,
}: {
  visible: boolean;
  message: string;
  onClose: () => void;
  onCopy?: (text: string) => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={errStyles.backdrop}>
        <View style={errStyles.card}>
          <Text style={errStyles.icon}>⚠️</Text>
          <Text style={errStyles.title}>Something went wrong</Text>
          <ScrollView style={errStyles.body} contentContainerStyle={{ padding: spacing.md }}>
            <Text style={errStyles.message} selectable>
              {message}
            </Text>
          </ScrollView>
          {onCopy ? (
            <TouchableOpacity onPress={() => onCopy(message)} style={{ paddingVertical: spacing.sm }}>
              <Text style={errStyles.copy}>Copy details</Text>
            </TouchableOpacity>
          ) : null}
          <View style={{ height: spacing.sm }} />
          <Button title="Dismiss" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const errStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,18,32,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.xl,
    ...shadow.raised,
  },
  icon: { fontSize: 34, textAlign: 'center' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  body: { maxHeight: 260, backgroundColor: colors.dangerBg, borderRadius: radius.md },
  message: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  copy: { color: colors.brand, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
