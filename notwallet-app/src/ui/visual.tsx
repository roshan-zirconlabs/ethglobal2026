/**
 * Radiant visuals — the brand moments of the app.
 *
 * These are the only places a gradient appears: the onboarding backdrop, the
 * Home balance hero, and the identity card. Everything drawn inside them must
 * use the `onHero*` colour world (white / translucent white), never the light
 * `text` colours.
 *
 * Gradients are SVG (react-native-svg) so we get true multi-stop radiance with
 * no extra native module.
 */
import { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors, gradients, radius, shadow, spacing } from '../theme';

/**
 * SVG `<Defs>` ids are document-global, so two gradients sharing an id silently
 * paint the same fill. Hand every instance its own id.
 */
let gradientSeq = 0;
function useGradientId(prefix: string): string {
  const ref = useRef<string | null>(null);
  if (ref.current === null) {
    gradientSeq += 1;
    ref.current = `${prefix}${gradientSeq}`;
  }
  return ref.current;
}

/** Multi-stop gradient fill that covers its parent. */
export function GradientFill({
  stops,
  diagonal = false,
}: {
  stops: readonly string[];
  diagonal?: boolean;
}) {
  const id = useGradientId('grad');
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        {/* x2 = 0.4 matches the angle the onboarding backdrop already used. */}
        <LinearGradient id={id} x1="0" y1="0" x2={diagonal ? '1' : '0.4'} y2="1">
          {stops.map((color, i) => (
            <Stop key={i} offset={`${i / Math.max(1, stops.length - 1)}`} stopColor={color} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Full-bleed gradient backdrop; place first inside a `flex: 1` container. */
export function GradientBackdrop({ stops }: { stops: readonly string[] }) {
  return <GradientFill stops={stops} />;
}

/**
 * The gradient panel at the top of a content screen: bleeds under the status
 * bar, curves into the light sheet below it.
 */
export function HeroPanel({
  stops,
  children,
  style,
}: {
  stops: readonly string[];
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.hero,
        { paddingTop: insets.top + spacing.md },
        style,
      ]}
    >
      <GradientFill stops={stops} />
      <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}>{children}</View>
    </View>
  );
}

/** The NotWallet mark — a bold 6-point asterisk. */
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

/**
 * A gradient card face — used for the wallet identity (ENS name + address),
 * mirroring the debit-card treatment in the reference design.
 */
export function IdentityCard({
  label,
  name,
  sub,
  height = 190,
}: {
  label: string;
  name: string;
  sub?: string;
  height?: number;
}) {
  return (
    <View style={[styles.card, { height }]}>
      <GradientFill stops={gradients.card} diagonal />
      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <Text style={styles.cardLabel}>{label}</Text>
          <LogoMark size={30} color="rgba(255,255,255,0.92)" />
        </View>
        <View style={styles.cardCenter}>
          <LogoMark size={64} color="rgba(255,255,255,0.95)" />
        </View>
        <View>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          {sub ? (
            <Text style={styles.cardSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
/**
 * Quick-action tile. Lives on the gradient hero: translucent white fill, glyph
 * top-left, tiny uppercase label bottom-left — matching the reference.
 */
export function ActionTile({
  icon,
  label,
  onPress,
  emphasis,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  emphasis?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.tile, emphasis && styles.tileEmphasis]}
    >
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
  },

  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.raised,
  },
  cardInner: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardCenter: { alignItems: 'center' },
  cardLabel: {
    color: colors.onHeroMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  cardName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  cardSub: { color: colors.onHeroMuted, fontSize: 13, marginTop: 3 },

  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.onHeroFill,
    borderWidth: 1,
    borderColor: colors.onHeroBorder,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  tileEmphasis: {
    backgroundColor: colors.onHeroFillStrong,
  },
  tileIcon: { fontSize: 19, color: '#FFFFFF' },
  tileLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
