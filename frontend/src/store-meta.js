// src/store-meta.js
import criteriaMetrics from './data/criteriaMetrics.json'

/**
 * Centralized store metadata, color definitions, animal mascots,
 * and academic alphabet grading scale for Birmas Audit.
 */

export const STORE_META = {
  1: {
    id: 1,
    name: 'Birmas Lebak Bulus',
    shortName: 'Lebak Bulus',
    color: '#FF00FF', // Magenta / Fuchsia
    borderClass: 'border-fuchsia-500/40',
    bgClass: 'bg-fuchsia-950/40',
    badgeBg: 'bg-fuchsia-500/20',
    badgeText: 'text-fuchsia-300',
    textClass: 'text-fuchsia-400',
    mascotName: 'Magenta Cupang',
    animal: 'Cupang',
    emoji: '🐟',
    iconColor: '#FF00FF',
    mascotImg: '/mascots/lebak_bulus_cupang.png'
  },
  2: {
    id: 2,
    name: 'Birmas Kelapa Gading',
    shortName: 'Kelapa Gading',
    color: '#00FFFF', // Cyan / Aqua
    borderClass: 'border-cyan-400/40',
    bgClass: 'bg-cyan-950/40',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-300',
    textClass: 'text-cyan-400',
    mascotName: 'Cyan Mammoth',
    animal: 'Mammoth',
    emoji: '🦣',
    iconColor: '#00FFFF',
    mascotImg: '/mascots/kelapa_gading_mammoth.png'
  },
  3: {
    id: 3,
    name: 'Birmas Kuningan',
    shortName: 'Kuningan',
    color: '#FFFF00', // Yellow
    borderClass: 'border-yellow-400/40',
    bgClass: 'bg-yellow-950/40',
    badgeBg: 'bg-yellow-500/20',
    badgeText: 'text-yellow-300',
    textClass: 'text-yellow-400',
    mascotName: 'Yellow Horse',
    animal: 'Horse',
    emoji: '🐎',
    iconColor: '#FFFF00',
    mascotImg: '/mascots/kuningan_horse.png'
  },
  4: {
    id: 4,
    name: 'Birmas Kwitang',
    shortName: 'Kwitang',
    color: '#00FF00', // Lime Green
    borderClass: 'border-lime-500/40',
    bgClass: 'bg-lime-950/40',
    badgeBg: 'bg-lime-500/20',
    badgeText: 'text-lime-300',
    textClass: 'text-lime-400',
    mascotName: 'Green Honey Badger',
    animal: 'Honey Badger',
    emoji: '🦡',
    iconColor: '#00FF00',
    mascotImg: '/mascots/kwitang_badger.png'
  },
  5: {
    id: 5,
    name: 'Birmas Sudirman',
    shortName: 'Sudirman',
    color: '#0000FF', // Blue
    borderClass: 'border-blue-500/50',
    bgClass: 'bg-blue-950/40',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
    textClass: 'text-blue-400',
    mascotName: 'Blue Bulldog',
    animal: 'Bulldog',
    emoji: '🐶',
    iconColor: '#0000FF',
    mascotImg: '/mascots/sudirman_bulldog.png'
  },
  6: {
    id: 6,
    name: 'Birmas Tebet',
    shortName: 'Tebet',
    color: '#FF6E00', // Orange
    borderClass: 'border-orange-500/40',
    bgClass: 'bg-orange-950/40',
    badgeBg: 'bg-orange-500/20',
    badgeText: 'text-orange-300',
    textClass: 'text-orange-400',
    mascotName: 'Orange T-Rex',
    animal: 'T-Rex',
    emoji: '🦖',
    iconColor: '#FF6E00',
    mascotImg: '/mascots/tebet_trex.png'
  }
}

/**
 * Clean redundant "Birmas" brand prefix from store name
 */
export function stripStoreBrand(name) {
  return String(name || '').replace(/^birmas\s+/i, '').trim()
}

/**
 * Retrieve metadata for a store by ID or partial name
 */
export function getStoreMeta(storeIdOrName) {
  if (!storeIdOrName && storeIdOrName !== 0) return null
  if (STORE_META[storeIdOrName]) return STORE_META[storeIdOrName]

  const str = String(storeIdOrName).toLowerCase().trim()
  for (const id of Object.keys(STORE_META)) {
    const meta = STORE_META[id]
    if (
      str.includes(meta.shortName.toLowerCase()) ||
      meta.name.toLowerCase().includes(str) ||
      str === meta.animal.toLowerCase()
    ) {
      return meta
    }
  }
  return null
}

/**
 * Deterministic color resolution for store ID or name
 */
export function getStoreColor(storeIdOrName, fallback = '#94a3b8') {
  const meta = getStoreMeta(storeIdOrName)
  if (meta) return meta.color

  const num = Number(storeIdOrName)
  if (!isNaN(num) && STORE_META[num]) {
    return STORE_META[num].color
  }
  return fallback
}

/**
 * Retrieve store mascot description, animal name and emoji
 */
export function getStoreMascot(storeIdOrName) {
  const meta = getStoreMeta(storeIdOrName)
  if (meta) {
    return {
      name: meta.mascotName,
      animal: meta.animal,
      emoji: meta.emoji,
      color: meta.color,
      mascotImg: meta.mascotImg
    }
  }
  return {
    name: 'Birmas Outlet',
    animal: 'Outlet',
    emoji: '🏬',
    color: '#94a3b8',
    mascotImg: ''
  }
}

/**
 * Standard audit categories palette.
 * Colors match store colors, plus white/super light grey for the 7th category:
 * - Aplikasi: #FFFF00 (Kuningan Yellow)
 * - Customer Service: #00FF00 (Kwitang Green)
 * - Higiene Staf: #00FFFF (Kelapa Gading Cyan)
 * - Inventaris: #FF6E00 (Tebet Orange)
 * - Kebersihan Outlet: #FF00FF (Lebak Bulus Magenta)
 * - Showcase: #0000FF (Sudirman Blue)
 * - Stock Opname: #FFFFFF (White / Super Light Grey)
 */
export const CATEGORY_COLORS = {
  'Aplikasi': '#FFFF00', // Yellow
  'Customer Service': '#00FF00', // Lime Green
  'Higiene Staf': '#00FFFF', // Cyan
  'Inventaris': '#FF6E00', // Orange
  'Kebersihan Outlet': '#FF00FF', // Magenta
  'Showcase': '#0000FF', // Blue
  'Stock Opname': '#FFFFFF' // White / Super Light Grey
}

/**
 * Get category color, strictly ensuring Aplikasi is yellow
 */
export function getCategoryColor(categoryName, fallback = null) {
  if (!categoryName) return fallback
  const str = String(categoryName).trim()
  const lower = str.toLowerCase()
  if (lower === 'aplikasi') return '#FFFF00' // Yellow

  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (key.toLowerCase() === lower) {
      return color
    }
  }
  return fallback
}

/**
 * Calculate Alphabet Grade based on user rubric:
 * 0% - E
 * >= 12.25% = D-
 * >= 25% = D
 * >= 38.33% = D+
 * >= 46.67% = C-
 * >= 50% = C
 * >= 56.67% = C+
 * >= 66.67% = B-
 * >= 75% = B
 * >= 83.33% = B+
 * >= 91.67% = A-
 * 100% = A
 */
export function calculateAlphabetGrade(rawScore) {
  if (rawScore === null || rawScore === undefined || isNaN(rawScore)) {
    return {
      grade: '—',
      percentage: null,
      formattedPct: 'No Data',
      badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
      label: 'No Data'
    }
  }

  // Handle both 0.0-1.0 and 0-100 formats
  const pct = (rawScore <= 1.0 && rawScore > 0) ? rawScore * 100 : Number(rawScore)
  const rounded = Math.round(pct * 10) / 10

  let grade = 'E'
  let badgeClass = 'bg-rose-950/80 text-rose-400 border-rose-600/50'

  if (rounded >= 100.0) {
    grade = 'A'
    badgeClass = 'bg-emerald-900/90 text-emerald-300 border-emerald-400/60 shadow-emerald-500/20'
  } else if (rounded >= 91.67) {
    grade = 'A-'
    badgeClass = 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
  } else if (rounded >= 83.33) {
    grade = 'B+'
    badgeClass = 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
  } else if (rounded >= 75.00) {
    grade = 'B'
    badgeClass = 'bg-blue-950/80 text-blue-300 border-blue-500/50'
  } else if (rounded >= 66.67) {
    grade = 'B-'
    badgeClass = 'bg-blue-950/60 text-blue-400 border-blue-600/40'
  } else if (rounded >= 56.67) {
    grade = 'C+'
    badgeClass = 'bg-amber-950/80 text-amber-300 border-amber-500/50'
  } else if (rounded >= 50.00) {
    grade = 'C'
    badgeClass = 'bg-yellow-950/80 text-yellow-300 border-yellow-500/50'
  } else if (rounded >= 46.67) {
    grade = 'C-'
    badgeClass = 'bg-amber-950/60 text-amber-400 border-amber-600/40'
  } else if (rounded >= 38.33) {
    grade = 'D+'
    badgeClass = 'bg-orange-950/80 text-orange-300 border-orange-500/50'
  } else if (rounded >= 25.00) {
    grade = 'D'
    badgeClass = 'bg-orange-950/60 text-orange-400 border-orange-600/40'
  } else if (rounded >= 12.25) {
    grade = 'D-'
    badgeClass = 'bg-rose-950/60 text-rose-400 border-rose-700/40'
  } else {
    grade = 'E'
    badgeClass = 'bg-rose-950/90 text-rose-500 border-rose-500/60'
  }

  return {
    grade,
    percentage: rounded,
    formattedPct: `${rounded}%`,
    badgeClass: `border font-bold ${badgeClass}`
  }
}

/**
 * Robustly resolve scoring metric definition text for a given year & criteria label.
 * Handles exact matches, trailing index strips like " (1)", and case insensitivity.
 */
export function lookupCriteriaMetric(year, label) {
  if (!label) return null
  const yrStr = String(year)
  const yrData = criteriaMetrics[yrStr] || {}

  // 1. Direct exact lookup
  if (yrData[label]) return yrData[label]

  // 2. Strip trailing parenthesized numbers e.g. "Meja (1)" -> "Meja"
  const clean = label.replace(/\s*\(\d+\)\s*$/, '').trim()
  if (yrData[clean]) return yrData[clean]

  // 3. Case-insensitive fallback
  const lower = clean.toLowerCase()
  for (const [k, v] of Object.entries(yrData)) {
    if (k.toLowerCase() === lower) return v
  }

  return null
}

