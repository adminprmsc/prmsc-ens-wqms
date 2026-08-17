-- PCRWR NWQL reuses Report Serial No (e.g. AR-04992) across many samples.
-- The laboratory unique identifier is NWQL Sample Code (MCL-10409-23).

DROP INDEX IF EXISTS "water_quality_reports_report_serial_no_key";
CREATE INDEX IF NOT EXISTS "water_quality_reports_report_serial_no_idx"
  ON "water_quality_reports" ("report_serial_no");
