-- Water quality parameter catalog, PCRWR-style reports, and results.
-- Linked to tehsil → village → settlement.

CREATE TYPE "ParameterCategory" AS ENUM (
  'PHYSICAL_AESTHETIC',
  'CHEMICAL',
  'TRACE_ELEMENT',
  'MICROBIOLOGICAL'
);

CREATE TYPE "ParameterConformityGroup" AS ENUM (
  'CHEMICAL',
  'MICROBIAL'
);

CREATE TYPE "LimitOperator" AS ENUM (
  'NONE',
  'MAX_INCLUSIVE',
  'MAX_EXCLUSIVE',
  'RANGE',
  'EQUALS_ZERO',
  'QUALITATIVE'
);

CREATE TYPE "ResultValueType" AS ENUM (
  'NUMERIC',
  'BDL',
  'QUALITATIVE',
  'NEGATIVE',
  'POSITIVE'
);

CREATE TYPE "ConformityStatus" AS ENUM (
  'SAFE',
  'UNSAFE'
);

CREATE TYPE "WaterQualityReportStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'FINALIZED'
);

CREATE TABLE "water_quality_parameters" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ParameterCategory" NOT NULL,
  "conformity_group" "ParameterConformityGroup" NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "units" TEXT,
  "detection_limit" DECIMAL(18,6),
  "reference_method" TEXT NOT NULL,
  "limit_operator" "LimitOperator" NOT NULL,
  "limit_min" DECIMAL(18,6),
  "limit_max" DECIMAL(18,6),
  "limit_display" TEXT NOT NULL,
  "qualitative_allowed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_accredited" BOOLEAN NOT NULL DEFAULT true,
  "limit_source" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "water_quality_parameters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "water_quality_parameters_code_key" ON "water_quality_parameters"("code");
CREATE INDEX "water_quality_parameters_category_idx" ON "water_quality_parameters"("category");
CREATE INDEX "water_quality_parameters_sort_order_idx" ON "water_quality_parameters"("sort_order");

CREATE TABLE "water_quality_reports" (
  "id" TEXT NOT NULL,
  "report_serial_no" TEXT NOT NULL,
  "nwql_sample_code" TEXT,
  "customer_code" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_address" TEXT,
  "customer_phone" TEXT,
  "tehsil_id" TEXT NOT NULL,
  "village_id" TEXT NOT NULL,
  "settlement_id" TEXT,
  "source" TEXT NOT NULL,
  "work_order" TEXT,
  "location_detail" TEXT NOT NULL,
  "sampling_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3),
  "receipt_temp_c" DECIMAL(6,2),
  "receipt_humidity_pct" DECIMAL(6,2),
  "analysis_from" TIMESTAMP(3),
  "analysis_to" TIMESTAMP(3),
  "reporting_date" TIMESTAMP(3) NOT NULL,
  "total_pages" INTEGER,
  "chemical_conformity" "ConformityStatus" NOT NULL,
  "microbial_conformity" "ConformityStatus" NOT NULL,
  "overall_remarks" TEXT,
  "status" "WaterQualityReportStatus" NOT NULL DEFAULT 'SUBMITTED',
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "water_quality_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "water_quality_reports_report_serial_no_key" ON "water_quality_reports"("report_serial_no");
CREATE UNIQUE INDEX "water_quality_reports_nwql_sample_code_key" ON "water_quality_reports"("nwql_sample_code");
CREATE INDEX "water_quality_reports_tehsil_id_idx" ON "water_quality_reports"("tehsil_id");
CREATE INDEX "water_quality_reports_village_id_idx" ON "water_quality_reports"("village_id");
CREATE INDEX "water_quality_reports_settlement_id_idx" ON "water_quality_reports"("settlement_id");
CREATE INDEX "water_quality_reports_reporting_date_idx" ON "water_quality_reports"("reporting_date");
CREATE INDEX "water_quality_reports_chemical_conformity_idx" ON "water_quality_reports"("chemical_conformity");
CREATE INDEX "water_quality_reports_microbial_conformity_idx" ON "water_quality_reports"("microbial_conformity");
CREATE INDEX "water_quality_reports_status_idx" ON "water_quality_reports"("status");

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_tehsil_id_fkey"
  FOREIGN KEY ("tehsil_id") REFERENCES "tehsils"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_village_id_fkey"
  FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "water_quality_reports"
  ADD CONSTRAINT "water_quality_reports_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "water_quality_results" (
  "id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "parameter_id" TEXT NOT NULL,
  "result_type" "ResultValueType" NOT NULL,
  "numeric_value" DECIMAL(18,6),
  "qualitative_value" TEXT,
  "uncertainty" TEXT,
  "exceeds_limit" BOOLEAN NOT NULL,
  "is_judged" BOOLEAN NOT NULL,
  "limit_display_snap" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "water_quality_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "water_quality_results_report_id_parameter_id_key"
  ON "water_quality_results"("report_id", "parameter_id");
CREATE INDEX "water_quality_results_parameter_id_idx" ON "water_quality_results"("parameter_id");
CREATE INDEX "water_quality_results_exceeds_limit_idx" ON "water_quality_results"("exceeds_limit");

ALTER TABLE "water_quality_results"
  ADD CONSTRAINT "water_quality_results_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "water_quality_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "water_quality_results"
  ADD CONSTRAINT "water_quality_results_parameter_id_fkey"
  FOREIGN KEY ("parameter_id") REFERENCES "water_quality_parameters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
