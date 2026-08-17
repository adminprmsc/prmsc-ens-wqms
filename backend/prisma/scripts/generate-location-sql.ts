/**
 * Generates SQL INSERT statements for tehsil/village/settlement reference data
 * and appends them to the locations migration. Run from backend/:
 *   npx ts-node prisma/scripts/generate-location-sql.ts
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  LOCATION_DATA,
  SETTLEMENT_DATA,
  TEHSIL_OPTIONS,
} from '../data/locations';

function stableId(prefix: string, ...parts: string[]): string {
  const hash = crypto
    .createHash('sha1')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${hash}`;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(): string {
  const lines: string[] = [
    '',
    '-- ---------------------------------------------------------------------------',
    '-- Seed reference location data (Tehsil → Village → Settlement)',
    '-- Deterministic IDs so re-runs / fresh deploys stay stable.',
    '-- ---------------------------------------------------------------------------',
    '',
  ];

  lines.push('-- Tehsils');
  for (const tehsil of TEHSIL_OPTIONS) {
    const id = stableId('teh', tehsil);
    lines.push(
      `INSERT INTO "tehsils" ("id", "name", "created_at", "updated_at") VALUES (${sqlString(id)}, ${sqlString(tehsil)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("name") DO NOTHING;`,
    );
  }

  lines.push('', '-- Villages');
  for (const tehsil of TEHSIL_OPTIONS) {
    const villages = LOCATION_DATA[tehsil] ?? [];
    const tehsilId = stableId('teh', tehsil);
    for (const village of villages) {
      const villageId = stableId('vil', tehsil, village);
      lines.push(
        `INSERT INTO "villages" ("id", "name", "tehsil_id", "created_at", "updated_at") VALUES (${sqlString(villageId)}, ${sqlString(village)}, ${sqlString(tehsilId)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("tehsil_id", "name") DO NOTHING;`,
      );
    }
  }

  lines.push('', '-- Settlements (matched by village name under each tehsil)');
  for (const tehsil of TEHSIL_OPTIONS) {
    const villages = LOCATION_DATA[tehsil] ?? [];
    for (const village of villages) {
      const settlements = SETTLEMENT_DATA[village];
      if (!settlements || settlements.length === 0) continue;
      const villageId = stableId('vil', tehsil, village);
      for (const settlement of settlements) {
        const settlementId = stableId('set', tehsil, village, settlement);
        lines.push(
          `INSERT INTO "settlements" ("id", "name", "village_id", "created_at", "updated_at") VALUES (${sqlString(settlementId)}, ${sqlString(settlement)}, ${sqlString(villageId)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("village_id", "name") DO NOTHING;`,
        );
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

const migrationPath = path.join(
  __dirname,
  '..',
  'migrations',
  '20260715170000_locations_tehsil_village_settlement',
  'migration.sql',
);

const existing = fs.readFileSync(migrationPath, 'utf8');
const marker = '-- Seed reference location data';
const base = existing.includes(marker)
  ? existing.slice(0, existing.indexOf(marker)).trimEnd()
  : existing.trimEnd();

fs.writeFileSync(migrationPath, `${base}\n${buildSql()}`, 'utf8');

const villageCount = TEHSIL_OPTIONS.reduce(
  (sum, tehsil) => sum + (LOCATION_DATA[tehsil]?.length ?? 0),
  0,
);
let settlementCount = 0;
for (const tehsil of TEHSIL_OPTIONS) {
  for (const village of LOCATION_DATA[tehsil] ?? []) {
    settlementCount += SETTLEMENT_DATA[village]?.length ?? 0;
  }
}

console.log(
  `Updated ${migrationPath} with ${TEHSIL_OPTIONS.length} tehsils, ${villageCount} villages, ${settlementCount} settlements`,
);
