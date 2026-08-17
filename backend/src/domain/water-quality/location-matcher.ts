import { LOCATION_ALIASES, scorePlaceMatch } from './pcrwr-report-parser';

export type LocationCatalogTehsil = {
  id: string;
  name: string;
  villages: Array<{
    id: string;
    name: string;
    settlements: Array<{ id: string; name: string }>;
  }>;
};

export type LocationHints = {
  tehsilName: string | null;
  villageName: string | null;
  locationDetail: string | null;
  settlementHint: string | null;
};

export type MatchedLocation = {
  tehsilId: string | null;
  tehsilName: string | null;
  villageId: string | null;
  villageName: string | null;
  settlementId: string | null;
  settlementName: string | null;
  siteName: string | null;
  score: number;
  linked: boolean;
  warnings: string[];
};

const TEHSIL_MIN = 55;
const VILLAGE_MIN = 50;
const SETTLEMENT_MIN = 55;

function scoreName(
  haystack: string | null | undefined,
  official: string,
): number {
  if (!haystack?.trim()) return 0;
  const aliases = LOCATION_ALIASES[official] ?? [];
  return Math.max(
    scorePlaceMatch(haystack, official),
    ...aliases.map((alias) => scorePlaceMatch(haystack, alias)),
  );
}

function bestOf<T>(
  items: T[],
  scoreOf: (item: T) => number,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const score = scoreOf(item);
    if (!best || score > best.score) {
      best = { item, score };
    }
  }
  return best;
}

function deriveSettlementHint(
  locationDetail: string | null,
  villageName: string | null,
): string | null {
  if (!locationDetail?.trim()) return null;
  const parts = locationDetail
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? '';
    const villageScore = villageName ? scoreName(last, villageName) : 0;
    if (
      villageScore >= 50 ||
      (villageName && scorePlaceMatch(last, villageName) >= 50)
    ) {
      const site = parts.slice(0, -1).join(', ').trim();
      return site || null;
    }
  }
  if (villageName) {
    const stripped = locationDetail
      .replace(
        new RegExp(villageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'),
        '',
      )
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .trim();
    return stripped || null;
  }
  return locationDetail.trim();
}

export function settlementHintFromReport(
  locationDetail: string | null,
  villageName: string | null,
): string | null {
  return deriveSettlementHint(locationDetail, villageName);
}

/**
 * Resolve tehsil → village → settlement as a linked hierarchy.
 * A village is never chosen from a different tehsil once tehsil is locked.
 * A settlement is never chosen from a different village.
 */
export function matchLocationHierarchy(
  hints: LocationHints,
  catalog: LocationCatalogTehsil[],
): MatchedLocation {
  const empty: MatchedLocation = {
    tehsilId: null,
    tehsilName: null,
    villageId: null,
    villageName: null,
    settlementId: null,
    settlementName: null,
    siteName: null,
    score: 0,
    linked: false,
    warnings: [],
  };
  if (catalog.length === 0) return empty;

  const warnings: string[] = [];
  const settlementHint =
    hints.settlementHint ??
    deriveSettlementHint(hints.locationDetail, hints.villageName);

  const tehsilBest = bestOf(catalog, (tehsil) => {
    const explicit = scoreName(hints.tehsilName, tehsil.name);
    const fromCombined = scoreName(
      [hints.tehsilName, hints.villageName, hints.locationDetail]
        .filter(Boolean)
        .join(' '),
      tehsil.name,
    );
    return Math.max(explicit, hints.tehsilName ? explicit : fromCombined);
  });

  let tehsilLocked: LocationCatalogTehsil | null = null;
  if (tehsilBest) {
    if (hints.tehsilName && tehsilBest.score >= TEHSIL_MIN) {
      tehsilLocked = tehsilBest.item;
    } else if (tehsilBest.score >= 70) {
      tehsilLocked = tehsilBest.item;
    }
  }

  const villagePool = tehsilLocked
    ? tehsilLocked.villages.map((village) => ({
        tehsil: tehsilLocked,
        village,
      }))
    : catalog.flatMap((tehsil) =>
        tehsil.villages.map((village) => ({ tehsil, village })),
      );

  const villageBest = bestOf(villagePool, ({ village }) => {
    const fromVillageField = scoreName(hints.villageName, village.name);
    const fromLocation = scoreName(hints.locationDetail, village.name);
    const fromHint = scoreName(settlementHint, village.name);
    if (hints.villageName) {
      return fromVillageField * 2 + Math.max(fromLocation, fromHint) * 0.35;
    }
    return Math.max(fromLocation, fromHint);
  });

  const villageAccepted =
    villageBest &&
    (hints.villageName
      ? scoreName(hints.villageName, villageBest.item.village.name) >=
          VILLAGE_MIN || villageBest.score >= 80
      : villageBest.score >= 60)
      ? villageBest
      : null;

  if (hints.tehsilName && !tehsilLocked) {
    warnings.push(
      `Tehsil "${hints.tehsilName}" could not be matched. Select tehsil manually.`,
    );
  }
  if (hints.villageName && !villageAccepted) {
    warnings.push(
      `Village "${hints.villageName}" could not be matched inside the selected tehsil. Select village manually.`,
    );
  }

  const tehsil = villageAccepted?.item.tehsil ?? tehsilLocked;
  const village = villageAccepted?.item.village ?? null;

  if (!tehsil) {
    return { ...empty, siteName: settlementHint, warnings };
  }

  let settlementId: string | null = null;
  let settlementName: string | null = null;
  let settlementScore = 0;

  if (village) {
    const settlementBest = bestOf(village.settlements, (settlement) => {
      const fromSite = scoreName(settlementHint, settlement.name);
      const fromLocation = scoreName(hints.locationDetail, settlement.name);
      const sameAsVillage =
        scorePlaceMatch(settlement.name, village.name) >= 85
          ? Math.max(fromLocation, 40)
          : 0;
      return Math.max(fromSite, fromLocation, sameAsVillage);
    });

    if (settlementBest && settlementBest.score >= SETTLEMENT_MIN) {
      settlementId = settlementBest.item.id;
      settlementName = settlementBest.item.name;
      settlementScore = settlementBest.score;
    } else if (village.settlements.length === 1) {
      const only = village.settlements[0];
      if (only && scorePlaceMatch(only.name, village.name) >= 70) {
        settlementId = only.id;
        settlementName = only.name;
        settlementScore = 60;
      }
    }
  }

  const tehsilScore =
    tehsilBest?.item.id === tehsil.id ? (tehsilBest?.score ?? 0) : 70;
  const villageScore = villageAccepted?.score ?? 0;
  const linked = Boolean(tehsil && village);
  const score = Math.round(
    tehsilScore + villageScore + settlementScore + (linked ? 20 : 0),
  );

  return {
    tehsilId: tehsil.id,
    tehsilName: tehsil.name,
    villageId: village?.id ?? null,
    villageName: village?.name ?? null,
    settlementId,
    settlementName,
    siteName: settlementHint,
    score,
    linked,
    warnings,
  };
}
