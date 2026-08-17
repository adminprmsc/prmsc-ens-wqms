-- prisma-migrate-skip-transaction
-- Revamp report workflow, sample classification, GPS integrity, and
-- four-way conformity grouping (physical / chemical / trace / microbial).

-- ── Conformity groups ────────────────────────────────────────────────────────
ALTER TYPE "ParameterConformityGroup" RENAME TO "ParameterConformityGroup_old";
CREATE TYPE "ParameterConformityGroup" AS ENUM ('PHYSICAL', 'CHEMICAL', 'TRACE', 'MICROBIAL');

ALTER TABLE "water_quality_parameters"
  ALTER COLUMN "conformity_group" DROP DEFAULT;

ALTER TABLE "water_quality_parameters"
  ALTER COLUMN "conformity_group" TYPE "ParameterConformityGroup"
  USING (
    CASE "conformity_group"::text
      WHEN 'MICROBIAL' THEN 'MICROBIAL'::"ParameterConformityGroup"
      ELSE 'CHEMICAL'::"ParameterConformityGroup"
    END
  );

DROP TYPE "ParameterConformityGroup_old";

UPDATE "water_quality_parameters"
SET "conformity_group" = CASE "category"::text
  WHEN 'PHYSICAL_AESTHETIC' THEN 'PHYSICAL'::"ParameterConformityGroup"
  WHEN 'TRACE_ELEMENT' THEN 'TRACE'::"ParameterConformityGroup"
  WHEN 'MICROBIOLOGICAL' THEN 'MICROBIAL'::"ParameterConformityGroup"
  ELSE 'CHEMICAL'::"ParameterConformityGroup"
END;

ALTER TABLE "water_quality_parameters"
  ADD COLUMN IF NOT EXISTS "included_in_priority" BOOLEAN NOT NULL DEFAULT false;

UPDATE "water_quality_parameters"
SET "included_in_priority" = true
WHERE "code" IN (
  'COLOR', 'ODOUR', 'TASTE', 'EC', 'PH', 'TURBIDITY', 'TDS',
  'TOTAL_COLIFORMS', 'FECAL_COLIFORMS', 'E_COLI'
);

CREATE INDEX IF NOT EXISTS "water_quality_parameters_included_in_priority_idx"
  ON "water_quality_parameters" ("included_in_priority");

-- ── Result types ─────────────────────────────────────────────────────────────
ALTER TYPE "ResultValueType" ADD VALUE IF NOT EXISTS 'TNTC';

-- ── Report status ────────────────────────────────────────────────────────────
ALTER TABLE "water_quality_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "WaterQualityReportStatus" RENAME TO "WaterQualityReportStatus_old";
CREATE TYPE "WaterQualityReportStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "water_quality_reports"
  ALTER COLUMN "status" TYPE "WaterQualityReportStatus"
  USING (
    CASE "status"::text
      WHEN 'FINALIZED' THEN 'APPROVED'::"WaterQualityReportStatus"
      WHEN 'DRAFT' THEN 'DRAFT'::"WaterQualityReportStatus"
      ELSE 'SUBMITTED'::"WaterQualityReportStatus"
    END
  );

DROP TYPE "WaterQualityReportStatus_old";
ALTER TABLE "water_quality_reports"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"WaterQualityReportStatus";

-- ── New enums ────────────────────────────────────────────────────────────────
CREATE TYPE "SampleType" AS ENUM ('SOURCE_WELL', 'POU_TAP', 'OHR');
CREATE TYPE "ReportCategory" AS ENUM ('PCRWR', 'BASELINE');
CREATE TYPE "FormType" AS ENUM ('PRIORITY', 'FULL');

-- ── Audit actions ────────────────────────────────────────────────────────────
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_REJECTED';

-- ── Report columns ───────────────────────────────────────────────────────────
ALTER TABLE "water_quality_reports"
  ADD COLUMN IF NOT EXISTS "sample_type" "SampleType",
  ADD COLUMN IF NOT EXISTS "report_category" "ReportCategory" NOT NULL DEFAULT 'PCRWR',
  ADD COLUMN IF NOT EXISTS "form_type" "FormType" NOT NULL DEFAULT 'PRIORITY',
  ADD COLUMN IF NOT EXISTS "gps_latitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "gps_longitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "physical_conformity" "ConformityStatus",
  ADD COLUMN IF NOT EXISTS "trace_conformity" "ConformityStatus",
  ADD COLUMN IF NOT EXISTS "terms_agreed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "submitted_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewed_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

UPDATE "water_quality_reports"
SET "sample_type" = 'SOURCE_WELL'
WHERE "sample_type" IS NULL;

ALTER TABLE "water_quality_reports"
  ALTER COLUMN "sample_type" SET NOT NULL;

UPDATE "water_quality_reports"
SET "physical_conformity" = "chemical_conformity"
WHERE "physical_conformity" IS NULL;

ALTER TABLE "water_quality_reports"
  ALTER COLUMN "physical_conformity" SET NOT NULL;

-- Drop legacy free-text source if present
ALTER TABLE "water_quality_reports" DROP COLUMN IF EXISTS "source";

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_gps_latitude_chk"
    CHECK ("gps_latitude" IS NULL OR ("gps_latitude" >= -90 AND "gps_latitude" <= 90)),
  ADD CONSTRAINT "water_quality_reports_gps_longitude_chk"
    CHECK ("gps_longitude" IS NULL OR ("gps_longitude" >= -180 AND "gps_longitude" <= 180)),
  ADD CONSTRAINT "water_quality_reports_gps_pair_chk"
    CHECK (
      ("gps_latitude" IS NULL AND "gps_longitude" IS NULL)
      OR ("gps_latitude" IS NOT NULL AND "gps_longitude" IS NOT NULL)
    );

ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_created_by_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_submitted_by_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_submitted_by_id_fkey"
    FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_reviewed_by_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tighten location FK delete behavior (settlement was SET NULL)
ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_settlement_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_settlement_id_fkey"
    FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "water_quality_reports_sample_type_idx" ON "water_quality_reports" ("sample_type");
CREATE INDEX IF NOT EXISTS "water_quality_reports_report_category_idx" ON "water_quality_reports" ("report_category");
CREATE INDEX IF NOT EXISTS "water_quality_reports_form_type_idx" ON "water_quality_reports" ("form_type");
CREATE INDEX IF NOT EXISTS "water_quality_reports_physical_conformity_idx" ON "water_quality_reports" ("physical_conformity");
CREATE INDEX IF NOT EXISTS "water_quality_reports_created_by_id_idx" ON "water_quality_reports" ("created_by_id");
CREATE INDEX IF NOT EXISTS "water_quality_reports_submitted_by_id_idx" ON "water_quality_reports" ("submitted_by_id");
