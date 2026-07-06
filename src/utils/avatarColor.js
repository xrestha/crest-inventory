// Deterministic colorful-initials avatars (Slack/Gmail-style) — no React, no Supabase.
// Colors come from the dataviz skill's validated categorical palette (8 slots, light/dark
// hexes chosen for contrast on their respective surface — see references/palette.md).
const PALETTE = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#008300', dark: '#008300' }, // green
  { light: '#4a3aa7', dark: '#9085e9' }, // violet
  { light: '#e34948', dark: '#e66767' }, // red
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#eb6834', dark: '#d95926' }, // orange
]

const INK_LIGHT = '#ffffff'
const INK_DARK = '#0b0b0b'

export function getInitials(fullName) {
  const words = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function srgbToLinear(c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const [R, G, B] = [r, g, b].map(srgbToLinear)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

export function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// djb2 — simple, deterministic, stable across runs/reloads for the same id.
function hashString(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash
}

// Color follows the entity (id), never its position in a list, so colors don't reshuffle
// when staff are added/removed. `isDark` picks the palette column validated for that surface.
export function avatarColorFor(id, isDark) {
  const slot = PALETTE[hashString(String(id)) % PALETTE.length]
  const bg = isDark ? slot.dark : slot.light
  const fg = contrastRatio(bg, INK_LIGHT) >= contrastRatio(bg, INK_DARK) ? INK_LIGHT : INK_DARK
  return { bg, fg }
}
