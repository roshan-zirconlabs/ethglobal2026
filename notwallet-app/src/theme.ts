/**
 * NotWallet Design Tokens
 *
 * The system, in one sentence: **radiant blue gradients carry the brand moments
 * (onboarding, the balance hero, identity cards); everything else sits on a calm
 * light surface** — exactly the structure of the reference design.
 *
 * Two colour worlds, never mixed:
 *   • ON LIGHT  — `text` / `textMuted` / `surface` / `border`. Used by all
 *     content: cards, lists, settings, detail screens.
 *   • ON HERO   — `onHero*`. Used ONLY for content drawn on top of a gradient
 *     (onboarding, the Home balance panel, identity cards).
 *
 * Picking a colour from the wrong world is the #1 way this UI breaks, so the
 * names are deliberately unambiguous.
 */

export const colors = {
  // ── Light content surfaces ────────────────────────────────────────────────
  bg: '#F4F7FC', // app background behind the sheet
  surface: '#FFFFFF', // cards, sheets, list containers
  surfaceAlt: '#EFF3FA', // inputs, subtle fills, icon wells
  surfaceHighlight: '#E4EDF9',
  border: '#E5EAF3',
  borderFocus: '#B9C9E4',

  // ── Type on light ─────────────────────────────────────────────────────────
  text: '#0B1220', // near-black navy — headings, values
  textMuted: '#5B6880', // secondary text, row subtitles
  textDim: '#8C99AE', // captions, eyebrows, placeholders
  textInverse: '#FFFFFF',

  // ── Type + fills on a gradient hero ───────────────────────────────────────
  onHero: '#FFFFFF',
  onHeroMuted: 'rgba(255,255,255,0.74)',
  onHeroDim: 'rgba(255,255,255,0.55)',
  onHeroFill: 'rgba(255,255,255,0.13)', // translucent tile / chip background
  onHeroFillStrong: 'rgba(255,255,255,0.22)',
  onHeroBorder: 'rgba(255,255,255,0.20)',

  // ── Brand ─────────────────────────────────────────────────────────────────
  brand: '#1F6FEB',
  brandHover: '#1A5CCB',
  /**
   * Used as FOREGROUND text on light/tinted surfaces (log tags, small accents),
   * so it must stay dark enough to read — not the pale accent a dark theme uses.
   */
  brandSoft: '#1B5FD0',
  brandBg: '#E9F1FE',
  onBrand: '#FFFFFF',

  // ── Status & risk (tuned for light surfaces) ──────────────────────────────
  ok: '#0F9D6B',
  okBg: '#E9F8F1',
  okBorder: '#BEE7D6',

  warn: '#B26A00',
  warnBg: '#FFF4E3',
  warnBorder: '#F5D8A9',

  danger: '#DC2B2B',
  dangerBg: '#FDECEC',
  dangerBorder: '#F7C8C8',

  info: '#1F6FEB',
  infoBg: '#E9F1FE',
  infoBorder: '#C2D9FC',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
};

/**
 * Radiant gradients — the brand's signature. Rendered as multi-stop SVG fills.
 * `onboard` is deliberately untouched: it's the palette the onboarding screen
 * already uses, and everything else is tuned to sit in the same blue family.
 */
export const gradients = {
  /**
   * Full-bleed onboarding backdrop. Deliberately left EXACTLY as-is (two stops,
   * same angle) — this is the palette the onboarding already ships with and it
   * must not regress. Everything else is tuned to sit in the same blue family.
   */
  onboard: ['#1E48C8', '#08090F'] as const,
  /** Home balance panel — same family, slightly deeper so white type pops. */
  hero: ['#2A5CE0', '#16357F', '#0B1730'] as const,
  /** Identity / account card face. */
  card: ['#3B82F6', '#1E3A8A', '#0A0F1E'] as const,
  /** Destructive hero (recovery sweep). */
  danger: ['#E5484D', '#7A1620', '#2A0E12'] as const,
};

/**
 * Shadows for a LIGHT app — soft, cool-tinted and shallow. Heavy black shadows
 * (the dark-theme kind) turn muddy on white, so they're deliberately subtle.
 */
export const shadow = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  /** Coloured glow under a primary CTA. */
  brand: {
    shadowColor: '#1F6FEB',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

export const motion = {
  fast: 140,
  base: 200,
  slow: 320,
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
  pill: 999,
};

export const typography = {
  /** The big balance number. */
  display: {
    fontSize: 40,
    fontWeight: '800' as const,
    letterSpacing: -1.2,
  },
  titleLarge: {
    fontSize: 27,
    fontWeight: '800' as const,
    color: colors.text,
    letterSpacing: -0.6,
  },
  titleMedium: {
    fontSize: 19,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -0.3,
  },
  bodyLarge: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    color: colors.textDim,
    lineHeight: 16,
  },
  /** Small uppercase eyebrow above a section. */
  eyebrow: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.1,
    color: colors.textDim,
  },
  mono: {
    fontFamily: 'monospace',
  },
};
