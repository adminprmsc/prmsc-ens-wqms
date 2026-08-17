import type { LocationOption } from '@/lib/locations-api'

const TOKEN_SYNONYMS: Record<string, string> = {
  KUCH: 'KACH',
  KHAIL: 'KHEL',
  CHANDNA: 'CHANDANA',
  CHANDANDA: 'CHANDANA',
  ISAKHEL: 'ISA KHEL',
  ESSA: 'ISA',
  PAKKA: 'PACCA',
  KHAAS: 'KIS',
}

const PLACE_ALIASES: Record<string, string[]> = {
  'ISA KHEL': ['ISAKHEL', 'ISA KHEL', 'IS KHEL', 'ESSA KHEL'],
  'KACH TUNDER KHEL': [
    'KUCH TUNDER KHEL',
    'KUCH TANDER KHEL',
    'TUNDER KHEL',
    'CHUGHLAN',
    'CHUGHLAN PUMPING STATION',
  ],
  'MASTI KHEL': ['MASTI KHAIL', 'MASTI KHEL'],
}

function canonToken(token: string): string {
  return TOKEN_SYNONYMS[token] ?? token
}

export function normalizePlaceName(value: string): string {
  return value
    .toUpperCase()
    .replace(/KUCH/g, 'KACH')
    .replace(/KHAIL/g, 'KHEL')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function scorePlaceName(
  query: string | null | undefined,
  official: string,
): number {
  if (!query?.trim()) return 0
  const left = normalizePlaceName(query)
  const right = normalizePlaceName(official)
  if (!left || !right) return 0
  if (left === right) return 100

  const aliases = PLACE_ALIASES[right] ?? []
  for (const alias of aliases) {
    const aliasNorm = normalizePlaceName(alias)
    if (left === aliasNorm) return 98
    if (left.includes(aliasNorm) || aliasNorm.includes(left)) return 88
  }

  if (left.includes(right) || right.includes(left)) {
    return (
      70 +
      Math.min(
        20,
        Math.round(
          (Math.min(left.length, right.length) /
            Math.max(left.length, right.length)) *
            20,
        ),
      )
    )
  }

  const leftTokens = new Set(left.split(' ').map(canonToken))
  const rightTokens = right
    .split(' ')
    .map(canonToken)
    .filter((token) => token.length > 2)
  if (rightTokens.length === 0) return 0
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length
  return Math.round((overlap / rightTokens.length) * 85)
}

export function pickBestLocation(
  options: LocationOption[],
  hints: Array<string | null | undefined>,
  minScore = 55,
): LocationOption | null {
  const usable = hints.map((hint) => hint?.trim()).filter(Boolean) as string[]
  if (options.length === 0 || usable.length === 0) return null

  let best: { option: LocationOption; score: number } | null = null
  for (const option of options) {
    const score = Math.max(
      ...usable.map((hint) => scorePlaceName(hint, option.name)),
    )
    if (!best || score > best.score) {
      best = { option, score }
    }
  }
  return best && best.score >= minScore ? best.option : null
}

export function locationLabel(
  options: LocationOption[],
  id: string | null | undefined,
): string | undefined {
  if (!id) return undefined
  return options.find((option) => option.id === id)?.name
}
