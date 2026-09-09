/**
 * NotWallet Design Tokens & Theme
 * Calm, confident, security-forward dark theme.
 */

export const colors = {
  // Base backgrounds
  bg: '#0B0D12',
  surface: '#141821',
  surfaceAlt: '#1B2029',
  surfaceHighlight: '#222834',
  border: '#262C38',
  borderFocus: '#4A5568',

  // Typography
  text: '#EAF0F7',
  textMuted: '#B0BAC9',
  textDim: '#8A97AD',
  textInverse: '#0B0D12',

  // Brand / Accents
  brand: '#6C63FF',
  brandHover: '#5A50EE',
  brandSoft: '#A7A2FF',
  brandBg: 'rgba(108, 99, 255, 0.12)',
  onBrand: '#FFFFFF',

  // Status & Risk
  ok: '#35C08E',
  okBg: '#122A22',
  okBorder: '#1B4D3B',

  warn: '#E7B008',
  warnBg: '#2A2611',
  warnBorder: '#4D421B',

  danger: '#FF5A65',
  dangerBg: '#2A1518',
  dangerBorder: '#522026',

  info: '#4B9EFF',
  infoBg: '#122030',
  infoBorder: '#1A395C',
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

// Cinematic gradients (blue → dark), used for the hero card + onboarding bg.
export const gradients = {
  hero: ['#2F6BFF', '#0A0F1E'] as const,
  card: ['#3B82F6', '#0B1020'] as const,
  onboard: ['#1E48C8', '#08090F'] as const,
  danger: ['#FF5A65', '#2A1518'] as const,
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
};

export const motion = {
  fast: 140,
  base: 200,
  slow: 320,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const typography = {
  titleLarge: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -0.5,
  },
  titleMedium: {
    fontSize: 20,
    fontWeight: '600' as const,
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
  },
  mono: {
    fontFamily: 'monospace',
  },
};
