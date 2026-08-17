export type MatchableSourceType = {
  id: string;
  code: string;
  name: string;
  category: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
  aliases: string[];
};

export type MatchedSourceType = {
  sourceType: MatchableSourceType | null;
  score: number;
  unmatched: boolean;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreAlias(label: string, alias: string): number {
  const needle = normalize(label);
  const target = normalize(alias);
  if (!needle || !target) return 0;
  if (needle === target) return 100;
  const needleWords = needle.split(' ');
  const targetWords = target.split(' ');
  if (targetWords.every((word) => needleWords.includes(word))) {
    return 80 + Math.min(target.length, 15);
  }
  if (
    target.length >= 4 &&
    (needle.includes(target) || target.includes(needle))
  ) {
    return 70 + Math.min(target.length, 10);
  }
  return 0;
}

/**
 * Resolve a lab "Source" label against the catalog.
 * Unknown labels are not inserted; the caller should keep the raw label
 * and fall back to OTHER.
 */
export function matchSourceType(
  label: string | null | undefined,
  catalog: MatchableSourceType[],
): MatchedSourceType {
  if (!label?.trim() || catalog.length === 0) {
    return { sourceType: null, score: 0, unmatched: false };
  }

  let best: { sourceType: MatchableSourceType; score: number } | null = null;
  for (const sourceType of catalog) {
    if (sourceType.code === 'OTHER') continue;
    const candidates = [
      sourceType.name,
      sourceType.code,
      ...sourceType.aliases,
    ];
    const score = Math.max(
      ...candidates.map((candidate) => scoreAlias(label, candidate)),
    );
    if (!best || score > best.score) {
      best = { sourceType, score };
    }
  }

  if (best && best.score >= 70) {
    return { sourceType: best.sourceType, score: best.score, unmatched: false };
  }

  const other = catalog.find((item) => item.code === 'OTHER') ?? null;
  return { sourceType: other, score: best?.score ?? 0, unmatched: true };
}

export function sourceTypeByCode(
  catalog: MatchableSourceType[],
  code: string,
): MatchableSourceType | null {
  return catalog.find((item) => item.code === code) ?? null;
}
