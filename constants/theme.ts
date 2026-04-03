// Design tokens — matches "Financial Stoic" editorial monochrome system

export const Colors = {
  // Core
  primary: '#111111',
  primaryContainer: '#3c3b3b',
  background: '#ffffff',

  // Surfaces
  surface: '#f9f9f9',
  surfaceLow: '#f3f3f4',
  surfaceHigh: '#e8e8e8',

  // Text
  onSurface: '#1a1c1c',
  onSurfaceVariant: '#474747',
  secondary: '#5e5e5e',
  muted: '#a8a29e',

  // Borders
  outline: '#777777',
  outlineVariant: '#c6c6c6',

  // Semantic
  error: '#ba1a1a',
  success: '#22c55e',

  // Dark surface (hero card, bottom nav)
  dark: '#1a1c1c',
  darkElevated: '#333535',
} as const;

export const Typography = {
  // Manrope — hero metrics and headings
  heroMetric: {
    fontFamily: 'Manrope-ExtraLight',
    fontSize: 56,
    letterSpacing: -1.5,
    lineHeight: 60,
  },
  pageTitle: {
    fontFamily: 'Manrope-Light',
    fontSize: 32,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  // Work Sans — editorial uppercase labels
  label: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  // Inter — body
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#5e5e5e',
  },
  bodyBold: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 9999,
} as const;

export const Border = {
  signature: { borderWidth: 1.5, borderColor: '#111111' },
} as const;
