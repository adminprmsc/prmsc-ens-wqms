import type { WaterQualitySourceType } from '@/lib/water-quality-api'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreAlias(label: string, alias: string): number {
  const needle = normalize(label)
  const target = normalize(alias)
  if (!needle || !target) return 0
  if (needle === target) return 100
  const needleWords = needle.split(' ')
  const targetWords = target.split(' ')
  if (targetWords.every((word) => needleWords.includes(word))) {
    return 80 + Math.min(target.length, 15)
  }
  if (
    target.length >= 4 &&
    (needle.includes(target) || target.includes(needle))
  ) {
    return 70 + Math.min(target.length, 10)
  }
  return 0
}

export function matchSourceTypeFromCatalog(
  label: string | null | undefined,
  catalog: WaterQualitySourceType[],
): WaterQualitySourceType | null {
  if (!label?.trim() || catalog.length === 0) return null

  let best: { sourceType: WaterQualitySourceType; score: number } | null = null
  for (const sourceType of catalog) {
    if (sourceType.code === 'OTHER') continue
    const candidates = [sourceType.name, sourceType.code, ...sourceType.aliases]
    const score = Math.max(
      ...candidates.map((candidate) => scoreAlias(label, candidate)),
    )
    if (!best || score > best.score) {
      best = { sourceType, score }
    }
  }

  if (best && best.score >= 70) return best.sourceType
  return catalog.find((item) => item.code === 'OTHER') ?? null
}

export function isOtherSourceType(
  catalog: WaterQualitySourceType[],
  sourceTypeId: string,
): boolean {
  return catalog.find((item) => item.id === sourceTypeId)?.code === 'OTHER'
}

export function sourceTypeName(
  catalog: WaterQualitySourceType[],
  sourceTypeId: string,
): string | undefined {
  return catalog.find((item) => item.id === sourceTypeId)?.name
}
