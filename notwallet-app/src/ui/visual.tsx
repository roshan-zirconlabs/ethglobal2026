/**
 * Cinematic visual components (SVG-based gradients — no extra native module).
 * Inspired by modern fintech UI: gradient backdrops, a big gradient account card,
 * a logo mark, and rounded-square action tiles.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, radius, spacing, typography } from '../theme';

/** Full-bleed gradient backdrop; place first inside a flex:1 container. */
export function GradientBackdrop({ from, to }: { from: string; to: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
    </Svg>
  );
}

/** The NotWallet mark — a bold 6-point asterisk (echoes the reference's glyph). */
export function LogoMark({ size = 72, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const c = size / 2;
  const r = size * 0.42;
  const w = Math.max(3, size * 0.06);
  const rays = [0, 60, 120].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return {
      x1: c - r * Math.cos(a),
      y1: c - r * Math.sin(a),
      x2: c + r * Math.cos(a),
      y2: c + r * Math.sin(a),
    };
  });
  return (
    <Svg width={size} height={size}>
      {rays.map((l, i) => (
        <Line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={color}
          strokeWidth={w}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

/** A gradient "account card" — the hero of the Home screen. */
export function AccountCard({
  label,
  handle,
  balance,
  fiat,
  height = 200,
}: {
  label: string;
  handle: string;
  balance: string;
  fiat?: string;
  height?: number;
}) {
  return (
    <View style={[styles.card, { height }]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="card" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#3B82F6" />
            <Stop offset="0.55" stopColor="#1E3A8A" />
            <Stop offset="1" stopColor="#0A0F1E" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#card)" rx={radius.xl} />
      </Svg>
      <View style={styles.cardInner}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.cardLabel}>{label}</Text>
            <Text style={styles.cardHandle}>{handle}</Text>
          </View>
          <LogoMark size={30} color="rgba(255,255,255,0.9)" />
        </View>
        <View>
          <Text style={styles.cardBalance}>{balance} ETH</Text>
          {fiat ? <Text style={styles.cardFiat}>{fiat}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/** Rounded-square action tile (Send / Receive / Connect / Shield). */
export function ActionTile({
  icon,
  label,
  onPress,
  accent,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ alignItems: 'center', flex: 1, gap: 8 }}>
      <View style={[styles.tile, accent && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
        <Text style={{ fontSize: 22 }}>{icon}</Text>
      </View>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  cardInner: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  cardLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  cardHandle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginTop: 2 },
  cardBalance: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  cardFiat: { color: 'rgba(255,255,255,0.75)', fontSize: 15, marginTop: 2 },
  tile: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
