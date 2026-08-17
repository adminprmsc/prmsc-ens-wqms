-- Source catalog, report provenance, and composite location FKs.
-- Village must belong to the report tehsil; settlement must belong to the report village.

CREATE TABLE "source_types" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "SampleType" NOT NULL,
  "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sort_order" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_types_code_key" ON "source_types"("code");
CREATE INDEX "source_types_category_idx" ON "source_types"("category");
CREATE INDEX "source_types_is_active_sort_order_idx"
  ON "source_types"("is_active", "sort_order");

INSERT INTO "source_types"
  ("id", "code", "name", "category", "aliases", "sort_order", "is_active", "created_at", "updated_at")
VALUES
  (
    'src_6062406e06533afc6678c823',
    'TAP_WATER',
    'Tap water',
    'POU_TAP',
    ARRAY['tap', 'tap water', 'point of use', 'pou', 'pou tap', 'public tap', 'stand post', 'standpost'],
    10,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_dcb1211dfaab0f58477fd9e0',
    'SOURCE_WELL',
    'Source well',
    'SOURCE_WELL',
    ARRAY['well', 'well water', 'source well', 'open well', 'dug well'],
    20,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_8210ad84eb4addb76692f57d',
    'HAND_PUMP',
    'Hand pump',
    'SOURCE_WELL',
    ARRAY['hand pump', 'handpump', 'hp'],
    30,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_55e27881f0bd2904735e8e6d',
    'TUBEWELL',
    'Tubewell',
    'SOURCE_WELL',
    ARRAY['tubewell', 'tube well', 'bore', 'borehole', 'bore well'],
    40,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_27b2eec78419c13a4ae28e11',
    'SPRING',
    'Spring',
    'SOURCE_WELL',
    ARRAY['spring', 'spring water'],
    50,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_fefc6773498fa1c1ca67a827',
    'OHR',
    'Overhead reservoir',
    'OHR',
    ARRAY['ohr', 'overhead', 'overhead reservoir', 'overhead tank', 'oht'],
    60,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_940d81245f57febf578eea5f',
    'FILTER_PLANT',
    'Filter plant',
    'POU_TAP',
    ARRAY['filter plant', 'filtration plant', 'wtp', 'treatment plant'],
    70,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'src_957c024b38ce820878f03177',
    'OTHER',
    'Other / unspecified',
    'SOURCE_WELL',
    ARRAY['other', 'unknown', 'unspecified'],
    900,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

ALTER TABLE "water_quality_reports"
  ADD COLUMN "source_type_id" TEXT,
  ADD COLUMN "source_label" TEXT,
  ADD COLUMN "document_tehsil_name" TEXT,
  ADD COLUMN "document_village_name" TEXT,
  ADD COLUMN "site_name" TEXT;

UPDATE "water_quality_reports"
SET "source_type_id" = CASE "sample_type"
  WHEN 'POU_TAP' THEN 'src_6062406e06533afc6678c823'
  WHEN 'OHR' THEN 'src_fefc6773498fa1c1ca67a827'
  ELSE 'src_dcb1211dfaab0f58477fd9e0'
END;

ALTER TABLE "water_quality_reports"
  ALTER COLUMN "source_type_id" SET NOT NULL;

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_source_type_id_fkey"
  FOREIGN KEY ("source_type_id") REFERENCES "source_types"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "water_quality_reports_source_type_id_idx"
  ON "water_quality_reports"("source_type_id");

CREATE UNIQUE INDEX "villages_id_tehsil_id_key" ON "villages"("id", "tehsil_id");
CREATE UNIQUE INDEX "settlements_id_village_id_key" ON "settlements"("id", "village_id");

ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_village_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_village_id_tehsil_id_fkey"
  FOREIGN KEY ("village_id", "tehsil_id") REFERENCES "villages"("id", "tehsil_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  DROP CONSTRAINT IF EXISTS "water_quality_reports_settlement_id_fkey";
ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_settlement_id_village_id_fkey"
  FOREIGN KEY ("settlement_id", "village_id") REFERENCES "settlements"("id", "village_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
