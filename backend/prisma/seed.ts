import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import 'dotenv/config';
import {
  LOCATION_DATA,
  SETTLEMENT_DATA,
  TEHSIL_OPTIONS,
} from './data/locations';
import { WATER_QUALITY_PARAMETERS, categoryToConformityGroup, isPriorityParameter } from '../src/domain/water-quality/water-quality-parameters.catalog';
import { SOURCE_TYPE_CATALOG } from '../src/domain/water-quality/source-types.catalog';

function stableId(prefix: string, ...parts: string[]): string {
  const hash = crypto
    .createHash('sha1')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${hash}`;
}

async function seedSystemAdmin(prisma: PrismaClient) {
  const email = (
    process.env.SYSTEM_ADMIN_EMAIL ?? 'system.admin@prmsc.gov.pk'
  ).toLowerCase();
  const password = process.env.SYSTEM_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: 'SYSTEM_ADMIN',
      isActive: true,
      name: 'System Administrator',
      organization: 'PRMSC-HO',
    },
    create: {
      name: 'System Administrator',
      email,
      passwordHash,
      role: 'SYSTEM_ADMIN',
      organization: 'PRMSC-HO',
      isActive: true,
      mustChangePassword: true,
    },
  });

  console.log(`WQMS seed: SYSTEM_ADMIN ready (${admin.email})`);
}

async function seedPortalUsers(prisma: PrismaClient) {
  const password = process.env.SYSTEM_ADMIN_PASSWORD ?? 'ChangeMe@123';
  const passwordHash = await bcrypt.hash(password, 10);

  const manager = await prisma.user.upsert({
    where: { email: 'prmsc.manager@prmsc.gov.pk' },
    update: {
      role: 'SUPER_ADMIN',
      isActive: true,
      organization: 'PRMSC-HO',
    },
    create: {
      name: 'PRMSC Manager',
      email: 'prmsc.manager@prmsc.gov.pk',
      passwordHash,
      role: 'SUPER_ADMIN',
      organization: 'PRMSC-HO',
      isActive: true,
      mustChangePassword: true,
    },
  });

  const analyst = await prisma.user.upsert({
    where: { email: 'pcrwr.analyst@pcrwr.gov.pk' },
    update: {
      role: 'USER',
      isActive: true,
      organization: 'PCRWR',
    },
    create: {
      name: 'PCRWR Analyst',
      email: 'pcrwr.analyst@pcrwr.gov.pk',
      passwordHash,
      role: 'USER',
      organization: 'PCRWR',
      isActive: true,
      mustChangePassword: true,
    },
  });

  console.log(
    `WQMS seed: portal users ready (${manager.email}, ${analyst.email})`,
  );
}

async function seedLocations(prisma: PrismaClient) {
  const tehsilRows = TEHSIL_OPTIONS.map((name) => ({
    id: stableId('teh', name),
    name,
  }));

  await prisma.tehsil.createMany({
    data: tehsilRows,
    skipDuplicates: true,
  });

  const villageRows: Array<{ id: string; name: string; tehsilId: string }> = [];
  const settlementRows: Array<{
    id: string;
    name: string;
    villageId: string;
  }> = [];

  for (const tehsilName of TEHSIL_OPTIONS) {
    const tehsilId = stableId('teh', tehsilName);
    for (const villageName of LOCATION_DATA[tehsilName] ?? []) {
      const villageId = stableId('vil', tehsilName, villageName);
      villageRows.push({
        id: villageId,
        name: villageName,
        tehsilId,
      });

      for (const settlementName of SETTLEMENT_DATA[villageName] ?? []) {
        settlementRows.push({
          id: stableId('set', tehsilName, villageName, settlementName),
          name: settlementName,
          villageId,
        });
      }
    }
  }

  const chunkSize = 500;
  for (let i = 0; i < villageRows.length; i += chunkSize) {
    await prisma.village.createMany({
      data: villageRows.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  for (let i = 0; i < settlementRows.length; i += chunkSize) {
    await prisma.settlement.createMany({
      data: settlementRows.slice(i, i + chunkSize),
      skipDuplicates: true,
    });
  }

  console.log(
    `WQMS seed: locations ready (${tehsilRows.length} tehsils, ${villageRows.length} villages, ${settlementRows.length} settlements)`,
  );
}

async function seedWaterQualityParameters(prisma: PrismaClient) {
  for (const parameter of WATER_QUALITY_PARAMETERS) {
    const conformityGroup = categoryToConformityGroup(parameter.category);
    const includedInPriority = isPriorityParameter(parameter.code);
    await prisma.waterQualityParameter.upsert({
      where: { code: parameter.code },
      update: {
        name: parameter.name,
        category: parameter.category,
        conformityGroup,
        sortOrder: parameter.sortOrder,
        units: parameter.units,
        detectionLimit: parameter.detectionLimit,
        referenceMethod: parameter.referenceMethod,
        limitOperator: parameter.limitOperator,
        limitMin: parameter.limitMin,
        limitMax: parameter.limitMax,
        limitDisplay: parameter.limitDisplay,
        qualitativeAllowed: parameter.qualitativeAllowed,
        isAccredited: parameter.isAccredited,
        limitSource: parameter.limitSource,
        includedInPriority,
        isActive: true,
      },
      create: {
        id: stableId('wqp', parameter.code),
        code: parameter.code,
        name: parameter.name,
        category: parameter.category,
        conformityGroup,
        sortOrder: parameter.sortOrder,
        units: parameter.units,
        detectionLimit: parameter.detectionLimit,
        referenceMethod: parameter.referenceMethod,
        limitOperator: parameter.limitOperator,
        limitMin: parameter.limitMin,
        limitMax: parameter.limitMax,
        limitDisplay: parameter.limitDisplay,
        qualitativeAllowed: parameter.qualitativeAllowed,
        isAccredited: parameter.isAccredited,
        limitSource: parameter.limitSource,
        includedInPriority,
        isActive: true,
      },
    });
  }

  console.log(
    `WQMS seed: water quality parameters ready (${WATER_QUALITY_PARAMETERS.length})`,
  );
}

async function seedSourceTypes(prisma: PrismaClient) {
  for (const sourceType of SOURCE_TYPE_CATALOG) {
    await prisma.sourceType.upsert({
      where: { code: sourceType.code },
      update: {
        name: sourceType.name,
        category: sourceType.category,
        aliases: sourceType.aliases,
        sortOrder: sourceType.sortOrder,
        isActive: true,
      },
      create: {
        id: sourceType.id,
        code: sourceType.code,
        name: sourceType.name,
        category: sourceType.category,
        aliases: sourceType.aliases,
        sortOrder: sourceType.sortOrder,
        isActive: true,
      },
    });
  }

  console.log(
    `WQMS seed: source types ready (${SOURCE_TYPE_CATALOG.length})`,
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for seeding');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedSystemAdmin(prisma);
    await seedPortalUsers(prisma);
    await seedLocations(prisma);
    await seedWaterQualityParameters(prisma);
    await seedSourceTypes(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
