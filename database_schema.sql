-- ============================================================================
-- PCRWR NATIONAL WATER QUALITY LABORATORY - DATABASE SCHEMA
-- ============================================================================
-- Database: PostgreSQL 12+
-- Purpose: Store water quality test data from add_water_test.html form
-- Supports: Priority Parameters Mode (15 params) & Full Parameters Mode (43+ params)
-- Created: 2025-11-08
-- ============================================================================

-- Enable UUID extension for potential future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE 1: TEST REPORT METADATA
-- ============================================================================
-- Purpose: Stores core information about each water quality test report
-- One record per test submission
-- ============================================================================

CREATE TABLE test_report_metadata (
    -- Primary Key
    report_id SERIAL PRIMARY KEY,
    
    -- Report Identification
    report_serial_no VARCHAR(100) NOT NULL UNIQUE,
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    
    -- Customer Information
    customer_name_address TEXT NOT NULL,
    customer_code VARCHAR(50) NOT NULL,
    
    -- Sample Information
    nwql_sample_code VARCHAR(100) NOT NULL UNIQUE,
    sampling_datetime TIMESTAMP NOT NULL,
    sample_receipt_datetime TIMESTAMP NOT NULL,
    
    -- Sample Conditions at Receipt
    temperature_at_receipt DECIMAL(5,2) NOT NULL CHECK (temperature_at_receipt >= -50 AND temperature_at_receipt <= 100),
    humidity_at_receipt DECIMAL(5,2) NOT NULL CHECK (humidity_at_receipt >= 0 AND humidity_at_receipt <= 100),
    
    -- Analysis Timeline
    analysis_date_from DATE NOT NULL,
    analysis_date_to DATE,
    reporting_date DATE NOT NULL,
    
    -- Location Information
    gps_latitude DECIMAL(10,7),  -- Precision: ~1.1 cm
    gps_longitude DECIMAL(10,7), -- Precision: ~1.1 cm
    location VARCHAR(255) NOT NULL,
    work_order_no VARCHAR(100) NOT NULL,
    
    -- Administrative Location Hierarchy
    tehsil VARCHAR(100) NOT NULL,
    village VARCHAR(100) NOT NULL,
    settlement VARCHAR(100) NOT NULL,
    
    -- Sample Metadata
    total_samples INTEGER NOT NULL CHECK (total_samples > 0),
    
    -- Form Type Tracking
    form_type VARCHAR(20) NOT NULL CHECK (form_type IN ('priority', 'full')),
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_analysis_dates CHECK (
        analysis_date_to IS NULL OR analysis_date_to >= analysis_date_from
    ),
    CONSTRAINT valid_receipt_date CHECK (
        sample_receipt_datetime >= sampling_datetime
    )
);

-- Indexes for performance
CREATE INDEX idx_report_serial_no ON test_report_metadata(report_serial_no);
CREATE INDEX idx_nwql_sample_code ON test_report_metadata(nwql_sample_code);
CREATE INDEX idx_form_type ON test_report_metadata(form_type);
CREATE INDEX idx_tehsil ON test_report_metadata(tehsil);
CREATE INDEX idx_village ON test_report_metadata(village);
CREATE INDEX idx_reporting_date ON test_report_metadata(reporting_date);
CREATE INDEX idx_created_at ON test_report_metadata(created_at);

-- Comments
COMMENT ON TABLE test_report_metadata IS 'Core metadata for each water quality test report';
COMMENT ON COLUMN test_report_metadata.form_type IS 'Tracks whether Priority (15 params) or Full (43+ params) mode was used';
COMMENT ON COLUMN test_report_metadata.temperature_at_receipt IS 'Temperature of sample at receipt in Celsius';
COMMENT ON COLUMN test_report_metadata.humidity_at_receipt IS 'Humidity percentage at receipt (0-100)';


-- ============================================================================
-- TABLE 2: PHYSICAL AND AESTHETIC PARAMETERS
-- ============================================================================
-- Purpose: Stores physical and aesthetic water quality parameters
-- Used in BOTH Priority Mode (9 params) and Full Mode (all params)
-- One record per test report
-- ============================================================================

CREATE TABLE physical_aesthetic_parameters (
    -- Primary Key
    physical_params_id SERIAL PRIMARY KEY,
    
    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,
    
    -- Priority Parameters (Row 1-9 in Priority Mode, Row 1-9 in Full Mode)
    ph DECIMAL(4,2) CHECK (ph >= 0 AND ph <= 14),  -- Permissible: 6.5-8.5
    electrical_conductivity DECIMAL(10,2) CHECK (electrical_conductivity >= 0),  -- μS/cm, Permissible: <1500
    temperature DECIMAL(5,2) CHECK (temperature >= -50 AND temperature <= 100),  -- °C, NGVS
    color VARCHAR(50),  -- Permissible: Colorless
    odour VARCHAR(50),  -- Permissible: Unobjectionable
    taste VARCHAR(50),  -- Permissible: Unobjectionable
    suspended_solids DECIMAL(10,4) CHECK (suspended_solids >= 0),  -- mg/L, NGVS
    total_dissolved_solids DECIMAL(10,4) CHECK (total_dissolved_solids >= 0),  -- mg/L, Permissible: <1000
    turbidity DECIMAL(10,4) CHECK (turbidity >= 0),  -- NTU, Permissible: <5
    
    -- Additional Full Mode Parameters (Row 10-22 in Full Mode only)
    residual_chlorine DECIMAL(10,4) CHECK (residual_chlorine >= 0),  -- mg/L
    free_chlorine DECIMAL(10,4) CHECK (free_chlorine >= 0),  -- mg/L
    total_chlorine DECIMAL(10,4) CHECK (total_chlorine >= 0),  -- mg/L
    conductivity_25c DECIMAL(10,2) CHECK (conductivity_25c >= 0),  -- μS/cm
    appearance VARCHAR(100),
    dissolved_oxygen DECIMAL(10,4) CHECK (dissolved_oxygen >= 0),  -- mg/L
    biochemical_oxygen_demand DECIMAL(10,4) CHECK (biochemical_oxygen_demand >= 0),  -- mg/L
    chemical_oxygen_demand DECIMAL(10,4) CHECK (chemical_oxygen_demand >= 0),  -- mg/L
    total_organic_carbon DECIMAL(10,4) CHECK (total_organic_carbon >= 0),  -- mg/L
    oil_grease DECIMAL(10,4) CHECK (oil_grease >= 0),  -- mg/L
    phenolic_compounds DECIMAL(10,6) CHECK (phenolic_compounds >= 0),  -- mg/L
    surfactants DECIMAL(10,4) CHECK (surfactants >= 0),  -- mg/L
    residue_filterable DECIMAL(10,4) CHECK (residue_filterable >= 0),  -- mg/L
    residue_non_filterable DECIMAL(10,4) CHECK (residue_non_filterable >= 0),  -- mg/L
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one record per report
    CONSTRAINT unique_physical_params_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_physical_report_id ON physical_aesthetic_parameters(report_id);

-- Comments
COMMENT ON TABLE physical_aesthetic_parameters IS 'Physical and aesthetic water quality parameters - used in both Priority and Full modes';
COMMENT ON COLUMN physical_aesthetic_parameters.ph IS 'pH value (0-14), Permissible: 6.5-8.5';
COMMENT ON COLUMN physical_aesthetic_parameters.electrical_conductivity IS 'EC in μS/cm, Permissible: <1500';
COMMENT ON COLUMN physical_aesthetic_parameters.total_dissolved_solids IS 'TDS in mg/L, Permissible: <1000';
COMMENT ON COLUMN physical_aesthetic_parameters.turbidity IS 'Turbidity in NTU, Permissible: <5';


-- ============================================================================
-- TABLE 3: MAJOR CHEMICAL PARAMETERS
-- ============================================================================
-- Purpose: Stores major chemical parameters
-- Used ONLY in Full Mode (Row 10-22 in Full Mode)
-- One record per test report (NULL if Priority Mode)
-- ============================================================================

CREATE TABLE major_chemical_parameters (
    -- Primary Key
    chemical_params_id SERIAL PRIMARY KEY,
    
    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,
    
    -- Major Chemical Parameters (Full Mode Only)
    alkalinity_caco3 DECIMAL(10,4) CHECK (alkalinity_caco3 >= 0),  -- mg/L, NGVS
    bicarbonates DECIMAL(10,4) CHECK (bicarbonates >= 0),  -- mg/L, NGVS
    calcium DECIMAL(10,4) CHECK (calcium >= 0),  -- mg/L, NGVS
    carbonates DECIMAL(10,4) CHECK (carbonates >= 0),  -- mg/L, NGVS
    chlorides DECIMAL(10,4) CHECK (chlorides >= 0),  -- mg/L, Permissible: <250
    total_hardness DECIMAL(10,4) CHECK (total_hardness >= 0),  -- mg/L, Permissible: <500
    magnesium DECIMAL(10,4) CHECK (magnesium >= 0),  -- mg/L, NGVS
    potassium DECIMAL(10,4) CHECK (potassium >= 0),  -- mg/L, NGVS
    sodium DECIMAL(10,4) CHECK (sodium >= 0),  -- mg/L, NGVS
    sulphate DECIMAL(10,4) CHECK (sulphate >= 0),  -- mg/L, NGVS
    nitrate_n DECIMAL(10,4) CHECK (nitrate_n >= 0),  -- mg/L, Permissible: ≤50
    nitrite DECIMAL(10,4) CHECK (nitrite >= 0),  -- mg/L, Permissible: ≤3
    tds DECIMAL(10,4) CHECK (tds >= 0),  -- mg/L, Permissible: <1000
    iron DECIMAL(10,4) CHECK (iron >= 0),  -- mg/L, Permissible: 0.3
    fluoride DECIMAL(10,4) CHECK (fluoride >= 0),  -- mg/L, Permissible: ≤1.5
    phosphate DECIMAL(10,4) CHECK (phosphate >= 0),  -- mg/L, NGVS
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one record per report
    CONSTRAINT unique_chemical_params_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_chemical_report_id ON major_chemical_parameters(report_id);

-- Comments
COMMENT ON TABLE major_chemical_parameters IS 'Major chemical parameters - used ONLY in Full mode';
COMMENT ON COLUMN major_chemical_parameters.chlorides IS 'Chlorides in mg/L, Permissible: <250';
COMMENT ON COLUMN major_chemical_parameters.total_hardness IS 'Total Hardness in mg/L, Permissible: <500';
COMMENT ON COLUMN major_chemical_parameters.nitrate_n IS 'Nitrate-N in mg/L, Permissible: ≤50';
COMMENT ON COLUMN major_chemical_parameters.iron IS 'Iron in mg/L, Permissible: 0.3';
COMMENT ON COLUMN major_chemical_parameters.fluoride IS 'Fluoride in mg/L, Permissible: ≤1.5';


-- ============================================================================
-- TABLE 4: TRACE AND ULTRA-TRACE ELEMENTS
-- ============================================================================
-- Purpose: Stores trace and ultra-trace toxic elements
-- Used ONLY in Full Mode (Row 23-40 in Full Mode)
-- One record per test report (NULL if Priority Mode)
-- Includes real-time validation limits from the form
-- ============================================================================

CREATE TABLE trace_ultratrace_elements (
    -- Primary Key
    trace_elements_id SERIAL PRIMARY KEY,
    
    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,
    
    -- Trace Elements in μg/L (micrograms per liter)
    aluminum DECIMAL(10,4) CHECK (aluminum >= 0),  -- μg/L, Permissible: ≤200
    arsenic DECIMAL(10,4) CHECK (arsenic >= 0),  -- μg/L, Permissible: ≤50
    barium DECIMAL(10,4) CHECK (barium >= 0),  -- μg/L, Permissible: 700
    cadmium DECIMAL(10,4) CHECK (cadmium >= 0),  -- μg/L, Permissible: 10
    chromium DECIMAL(10,4) CHECK (chromium >= 0),  -- μg/L, Permissible: ≤50
    copper DECIMAL(10,4) CHECK (copper >= 0),  -- μg/L, Permissible: 2000
    manganese DECIMAL(10,4) CHECK (manganese >= 0),  -- μg/L, Permissible: ≤500
    molybdenum DECIMAL(10,4) CHECK (molybdenum >= 0),  -- μg/L, NGVS
    nickel DECIMAL(10,4) CHECK (nickel >= 0),  -- μg/L, Permissible: 20
    lead DECIMAL(10,4) CHECK (lead >= 0),  -- μg/L, Permissible: 50
    selenium DECIMAL(10,4) CHECK (selenium >= 0),  -- μg/L, Permissible: 10
    strontium DECIMAL(10,4) CHECK (strontium >= 0),  -- μg/L, NGVS
    zinc DECIMAL(10,4) CHECK (zinc >= 0),  -- μg/L, Permissible: 5000
    
    -- Trace Elements in mg/L (milligrams per liter)
    boron DECIMAL(10,6) CHECK (boron >= 0),  -- mg/L, Permissible: 0.3
    antimony DECIMAL(10,6) CHECK (antimony >= 0),  -- mg/L, Permissible: ≤0.005
    mercury DECIMAL(10,6) CHECK (mercury >= 0),  -- mg/L, Permissible: ≤0.001
    cyanide DECIMAL(10,6) CHECK (cyanide >= 0),  -- mg/L, Permissible: <0.05
    silica DECIMAL(10,4) CHECK (silica >= 0),  -- mg/L, NGVS
    
    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one record per report
    CONSTRAINT unique_trace_elements_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_trace_report_id ON trace_ultratrace_elements(report_id);

-- Comments
COMMENT ON TABLE trace_ultratrace_elements IS 'Trace and ultra-trace toxic elements - used ONLY in Full mode with real-time validation';
COMMENT ON COLUMN trace_ultratrace_elements.aluminum IS 'Aluminum in μg/L, Permissible: ≤200';
COMMENT ON COLUMN trace_ultratrace_elements.arsenic IS 'Arsenic in μg/L, Permissible: ≤50 (validated with color coding)';
COMMENT ON COLUMN trace_ultratrace_elements.mercury IS 'Mercury in mg/L, Permissible: ≤0.001 (validated with color coding)';
COMMENT ON COLUMN trace_ultratrace_elements.cyanide IS 'Cyanide in mg/L, Permissible: <0.05 (validated with color coding)';


-- ============================================================================
-- TABLE 5: MICROBIOLOGICAL PARAMETERS
-- ============================================================================
-- Purpose: Stores microbiological water quality parameters
-- Used in BOTH Priority Mode (Row 10-12) and Full Mode (Row 41-43)
-- One record per test report
-- Note: Row numbering difference is UI-only, doesn't affect database
-- ============================================================================

CREATE TABLE microbiological_parameters (
    -- Primary Key
    microbio_params_id SERIAL PRIMARY KEY,

    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,

    -- Microbiological Parameters (Both Priority and Full Mode)
    -- Row 10-12 in Priority Mode, Row 41-43 in Full Mode (UI numbering only)
    total_coliforms DECIMAL(10,2) CHECK (total_coliforms >= 0),  -- CFU/100ml, Permissible: 0
    fecal_coliforms DECIMAL(10,2) CHECK (fecal_coliforms >= 0),  -- CFU/100ml, Permissible: 0
    e_coli DECIMAL(10,2) CHECK (e_coli >= 0),  -- CFU/100ml, Permissible: 0

    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: one record per report
    CONSTRAINT unique_microbio_params_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_microbio_report_id ON microbiological_parameters(report_id);

-- Comments
COMMENT ON TABLE microbiological_parameters IS 'Microbiological parameters - used in BOTH Priority and Full modes';
COMMENT ON COLUMN microbiological_parameters.total_coliforms IS 'Total Coliforms in CFU/100ml, Permissible: 0 (Row 10 in Priority, Row 41 in Full)';
COMMENT ON COLUMN microbiological_parameters.fecal_coliforms IS 'Fecal Coliforms in CFU/100ml, Permissible: 0 (Row 11 in Priority, Row 42 in Full)';
COMMENT ON COLUMN microbiological_parameters.e_coli IS 'E-coli in CFU/100ml, Permissible: 0 (Row 12 in Priority, Row 43 in Full)';


-- ============================================================================
-- TABLE 6: QUALITY ASSESSMENT AND INTERPRETATION
-- ============================================================================
-- Purpose: Stores quality assessment and statement of conformity
-- One record per test report
-- ============================================================================

CREATE TABLE quality_assessment (
    -- Primary Key
    quality_assessment_id SERIAL PRIMARY KEY,

    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,

    -- Quality Assessments
    physical_quality VARCHAR(20) CHECK (physical_quality IN ('excellent', 'good', 'fair', 'poor', 'unfit')),
    chemical_quality VARCHAR(20) CHECK (chemical_quality IN ('excellent', 'good', 'fair', 'poor', 'unfit')),
    microbial_quality VARCHAR(20) CHECK (microbial_quality IN ('safe', 'unsafe', 'contaminated')),

    -- Additional Information
    remarks TEXT,
    terms_agreed BOOLEAN DEFAULT FALSE NOT NULL,

    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: one record per report
    CONSTRAINT unique_quality_assessment_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_quality_report_id ON quality_assessment(report_id);
CREATE INDEX idx_physical_quality ON quality_assessment(physical_quality);
CREATE INDEX idx_chemical_quality ON quality_assessment(chemical_quality);
CREATE INDEX idx_microbial_quality ON quality_assessment(microbial_quality);

-- Comments
COMMENT ON TABLE quality_assessment IS 'Quality assessment and interpretation for each test report';
COMMENT ON COLUMN quality_assessment.physical_quality IS 'Quality based on physical parameters: excellent, good, fair, poor, unfit';
COMMENT ON COLUMN quality_assessment.chemical_quality IS 'Quality based on chemical parameters: excellent, good, fair, poor, unfit';
COMMENT ON COLUMN quality_assessment.microbial_quality IS 'Quality based on microbial parameters: safe, unsafe, contaminated';
COMMENT ON COLUMN quality_assessment.terms_agreed IS 'User agreement to terms and conditions';


-- ============================================================================
-- TABLE 7: PARAMETERS POST TREATMENT (OPTIONAL)
-- ============================================================================
-- Purpose: Stores post-treatment parameters (currently commented out in form)
-- Used ONLY in Priority Mode if uncommented
-- One record per test report (NULL if not applicable)
-- ============================================================================

CREATE TABLE parameters_post_treatment (
    -- Primary Key
    post_treatment_id SERIAL PRIMARY KEY,

    -- Foreign Key to Test Report
    report_id INTEGER NOT NULL REFERENCES test_report_metadata(report_id) ON DELETE CASCADE,

    -- Post Treatment Parameters (Priority Mode Only - if uncommented)
    residual_chlorine DECIMAL(10,4) CHECK (residual_chlorine >= 0),  -- mg/L
    free_chlorine DECIMAL(10,4) CHECK (free_chlorine >= 0),  -- mg/L
    total_chlorine DECIMAL(10,4) CHECK (total_chlorine >= 0),  -- mg/L

    -- Audit Fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Unique constraint: one record per report
    CONSTRAINT unique_post_treatment_per_report UNIQUE(report_id)
);

-- Indexes
CREATE INDEX idx_post_treatment_report_id ON parameters_post_treatment(report_id);

-- Comments
COMMENT ON TABLE parameters_post_treatment IS 'Post-treatment parameters - currently commented out in form, for future use';


-- ============================================================================
-- TABLE 8: AUDIT LOG (OPTIONAL BUT RECOMMENDED)
-- ============================================================================
-- Purpose: Track all changes to test reports for compliance and auditing
-- ============================================================================

CREATE TABLE audit_log (
    -- Primary Key
    audit_id SERIAL PRIMARY KEY,

    -- Audit Information
    report_id INTEGER REFERENCES test_report_metadata(report_id) ON DELETE SET NULL,
    table_name VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    changed_by VARCHAR(100),  -- User who made the change
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,  -- IP address of the user
    user_agent TEXT   -- Browser/client information
);

-- Indexes
CREATE INDEX idx_audit_report_id ON audit_log(report_id);
CREATE INDEX idx_audit_table_name ON audit_log(table_name);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at);

-- Comments
COMMENT ON TABLE audit_log IS 'Audit trail for all changes to test reports';


-- ============================================================================
-- VIEWS FOR EASY DATA RETRIEVAL
-- ============================================================================

-- View 1: Complete Test Report (Priority Mode)
CREATE OR REPLACE VIEW v_priority_test_report AS
SELECT
    -- Metadata
    trm.report_id,
    trm.report_serial_no,
    trm.nwql_sample_code,
    trm.customer_name_address,
    trm.sampling_datetime,
    trm.reporting_date,
    trm.location,
    trm.tehsil,
    trm.village,
    trm.settlement,
    trm.form_type,

    -- Physical & Aesthetic (9 priority parameters)
    pap.ph,
    pap.electrical_conductivity,
    pap.temperature,
    pap.color,
    pap.odour,
    pap.taste,
    pap.suspended_solids,
    pap.total_dissolved_solids,
    pap.turbidity,

    -- Microbiological (3 parameters)
    mp.total_coliforms,
    mp.fecal_coliforms,
    mp.e_coli,

    -- Quality Assessment
    qa.physical_quality,
    qa.chemical_quality,
    qa.microbial_quality,
    qa.remarks

FROM test_report_metadata trm
LEFT JOIN physical_aesthetic_parameters pap ON trm.report_id = pap.report_id
LEFT JOIN microbiological_parameters mp ON trm.report_id = mp.report_id
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
WHERE trm.form_type = 'priority';

COMMENT ON VIEW v_priority_test_report IS 'Complete view of Priority mode test reports (15 parameters)';


-- View 2: Complete Test Report (Full Mode)
CREATE OR REPLACE VIEW v_full_test_report AS
SELECT
    -- Metadata
    trm.report_id,
    trm.report_serial_no,
    trm.nwql_sample_code,
    trm.customer_name_address,
    trm.sampling_datetime,
    trm.reporting_date,
    trm.location,
    trm.tehsil,
    trm.village,
    trm.settlement,
    trm.form_type,

    -- Physical & Aesthetic (all parameters)
    pap.*,

    -- Major Chemical
    mcp.*,

    -- Trace Elements
    tut.*,

    -- Microbiological
    mp.*,

    -- Quality Assessment
    qa.*

FROM test_report_metadata trm
LEFT JOIN physical_aesthetic_parameters pap ON trm.report_id = pap.report_id
LEFT JOIN major_chemical_parameters mcp ON trm.report_id = mcp.report_id
LEFT JOIN trace_ultratrace_elements tut ON trm.report_id = tut.report_id
LEFT JOIN microbiological_parameters mp ON trm.report_id = mp.report_id
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
WHERE trm.form_type = 'full';

COMMENT ON VIEW v_full_test_report IS 'Complete view of Full mode test reports (43+ parameters)';


-- View 3: Water Quality Summary by Location
CREATE OR REPLACE VIEW v_water_quality_by_location AS
SELECT
    trm.tehsil,
    trm.village,
    trm.settlement,
    COUNT(*) as total_tests,
    COUNT(CASE WHEN trm.form_type = 'priority' THEN 1 END) as priority_tests,
    COUNT(CASE WHEN trm.form_type = 'full' THEN 1 END) as full_tests,
    AVG(pap.ph) as avg_ph,
    AVG(pap.total_dissolved_solids) as avg_tds,
    AVG(pap.turbidity) as avg_turbidity,
    COUNT(CASE WHEN qa.microbial_quality = 'safe' THEN 1 END) as safe_samples,
    COUNT(CASE WHEN qa.microbial_quality = 'unsafe' THEN 1 END) as unsafe_samples,
    COUNT(CASE WHEN qa.microbial_quality = 'contaminated' THEN 1 END) as contaminated_samples
FROM test_report_metadata trm
LEFT JOIN physical_aesthetic_parameters pap ON trm.report_id = pap.report_id
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
GROUP BY trm.tehsil, trm.village, trm.settlement
ORDER BY trm.tehsil, trm.village, trm.settlement;

COMMENT ON VIEW v_water_quality_by_location IS 'Summary statistics of water quality by location';


-- ============================================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC TIMESTAMP UPDATES
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_test_report_metadata_updated_at
    BEFORE UPDATE ON test_report_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_physical_aesthetic_parameters_updated_at
    BEFORE UPDATE ON physical_aesthetic_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_major_chemical_parameters_updated_at
    BEFORE UPDATE ON major_chemical_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trace_ultratrace_elements_updated_at
    BEFORE UPDATE ON trace_ultratrace_elements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_microbiological_parameters_updated_at
    BEFORE UPDATE ON microbiological_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quality_assessment_updated_at
    BEFORE UPDATE ON quality_assessment
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- VALIDATION FUNCTIONS
-- ============================================================================

-- Function to check if parameter values exceed permissible limits
CREATE OR REPLACE FUNCTION check_permissible_limits(p_report_id INTEGER)
RETURNS TABLE(
    parameter_name VARCHAR,
    measured_value DECIMAL,
    permissible_limit VARCHAR,
    status VARCHAR
) AS $$
BEGIN
    -- Check Physical & Aesthetic Parameters
    RETURN QUERY
    SELECT 'pH'::VARCHAR, pap.ph, '6.5-8.5'::VARCHAR,
           CASE WHEN pap.ph < 6.5 OR pap.ph > 8.5 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM physical_aesthetic_parameters pap
    WHERE pap.report_id = p_report_id AND pap.ph IS NOT NULL

    UNION ALL

    SELECT 'Electrical Conductivity'::VARCHAR, pap.electrical_conductivity, '<1500'::VARCHAR,
           CASE WHEN pap.electrical_conductivity >= 1500 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM physical_aesthetic_parameters pap
    WHERE pap.report_id = p_report_id AND pap.electrical_conductivity IS NOT NULL

    UNION ALL

    SELECT 'Total Dissolved Solids'::VARCHAR, pap.total_dissolved_solids, '<1000'::VARCHAR,
           CASE WHEN pap.total_dissolved_solids >= 1000 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM physical_aesthetic_parameters pap
    WHERE pap.report_id = p_report_id AND pap.total_dissolved_solids IS NOT NULL

    UNION ALL

    SELECT 'Turbidity'::VARCHAR, pap.turbidity, '<5'::VARCHAR,
           CASE WHEN pap.turbidity >= 5 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM physical_aesthetic_parameters pap
    WHERE pap.report_id = p_report_id AND pap.turbidity IS NOT NULL

    UNION ALL

    -- Check Microbiological Parameters
    SELECT 'Total Coliforms'::VARCHAR, mp.total_coliforms, '0'::VARCHAR,
           CASE WHEN mp.total_coliforms > 0 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM microbiological_parameters mp
    WHERE mp.report_id = p_report_id AND mp.total_coliforms IS NOT NULL

    UNION ALL

    SELECT 'Fecal Coliforms'::VARCHAR, mp.fecal_coliforms, '0'::VARCHAR,
           CASE WHEN mp.fecal_coliforms > 0 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM microbiological_parameters mp
    WHERE mp.report_id = p_report_id AND mp.fecal_coliforms IS NOT NULL

    UNION ALL

    SELECT 'E-coli'::VARCHAR, mp.e_coli, '0'::VARCHAR,
           CASE WHEN mp.e_coli > 0 THEN 'EXCEEDS' ELSE 'OK' END::VARCHAR
    FROM microbiological_parameters mp
    WHERE mp.report_id = p_report_id AND mp.e_coli IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_permissible_limits IS 'Returns all parameters that exceed permissible limits for a given report';


-- ============================================================================
-- SAMPLE DATA - PRIORITY MODE TEST SUBMISSION
-- ============================================================================

-- Sample 1: Priority Mode Test (15 Parameters)
-- This represents a quick assessment with essential water quality parameters

BEGIN;

-- Insert Test Report Metadata
INSERT INTO test_report_metadata (
    report_serial_no,
    total_pages,
    customer_name_address,
    customer_code,
    nwql_sample_code,
    sampling_datetime,
    sample_receipt_datetime,
    temperature_at_receipt,
    humidity_at_receipt,
    analysis_date_from,
    analysis_date_to,
    reporting_date,
    gps_latitude,
    gps_longitude,
    location,
    work_order_no,
    tehsil,
    village,
    settlement,
    total_samples,
    form_type
) VALUES (
    'NWQL-2025-001',
    2,
    'Village Development Committee, Bala Arain, Bahawalnagar',
    'CUST-001',
    'NWQL-SAMPLE-2025-001',
    '2025-11-08 09:30:00',
    '2025-11-08 14:00:00',
    22.5,
    65.0,
    '2025-11-09',
    '2025-11-10',
    '2025-11-11',
    30.5434,
    73.2516,
    'Community Well, Main Street',
    'WO-2025-001',
    'BAHAWALNAGAR',
    'BALA ARAIN',
    'Main Settlement',
    1,
    'priority'
) RETURNING report_id;

-- Assuming report_id = 1 from the above insert

-- Insert Physical & Aesthetic Parameters (9 priority parameters)
INSERT INTO physical_aesthetic_parameters (
    report_id,
    ph,
    electrical_conductivity,
    temperature,
    color,
    odour,
    taste,
    suspended_solids,
    total_dissolved_solids,
    turbidity
) VALUES (
    1,  -- report_id
    7.2,  -- pH (within 6.5-8.5) ✅
    1200,  -- EC (within <1500) ✅
    25.0,  -- Temperature
    'Colorless',  -- Color ✅
    'Unobjectionable',  -- Odour ✅
    'Unobjectionable',  -- Taste ✅
    5.0,  -- Suspended Solids
    850,  -- TDS (within <1000) ✅
    3.5  -- Turbidity (within <5) ✅
);

-- Insert Microbiological Parameters (3 parameters)
-- Row 10-12 in Priority Mode UI
INSERT INTO microbiological_parameters (
    report_id,
    total_coliforms,
    fecal_coliforms,
    e_coli
) VALUES (
    1,  -- report_id
    0,  -- Total Coliforms (safe) ✅
    0,  -- Fecal Coliforms (safe) ✅
    0   -- E-coli (safe) ✅
);

-- Insert Quality Assessment
INSERT INTO quality_assessment (
    report_id,
    physical_quality,
    chemical_quality,
    microbial_quality,
    remarks,
    terms_agreed
) VALUES (
    1,  -- report_id
    'excellent',
    'good',
    'safe',
    'Water sample meets all permissible limits for tested parameters. Safe for drinking.',
    TRUE
);

COMMIT;


-- ============================================================================
-- SAMPLE DATA - FULL MODE TEST SUBMISSION
-- ============================================================================

-- Sample 2: Full Mode Test (43+ Parameters)
-- This represents a comprehensive analysis with all water quality parameters

BEGIN;

-- Insert Test Report Metadata
INSERT INTO test_report_metadata (
    report_serial_no,
    total_pages,
    customer_name_address,
    customer_code,
    nwql_sample_code,
    sampling_datetime,
    sample_receipt_datetime,
    temperature_at_receipt,
    humidity_at_receipt,
    analysis_date_from,
    analysis_date_to,
    reporting_date,
    gps_latitude,
    gps_longitude,
    location,
    work_order_no,
    tehsil,
    village,
    settlement,
    total_samples,
    form_type
) VALUES (
    'NWQL-2025-002',
    5,
    'District Health Department, Pakpattan',
    'CUST-002',
    'NWQL-SAMPLE-2025-002',
    '2025-11-08 10:00:00',
    '2025-11-08 15:30:00',
    24.0,
    70.0,
    '2025-11-09',
    '2025-11-12',
    '2025-11-13',
    31.0340,
    73.3911,
    'Municipal Water Supply, Station Road',
    'WO-2025-002',
    'PAKPATTAN',
    'PAKPATTAN CITY',
    'Urban Settlement A',
    3,
    'full'
) RETURNING report_id;

-- Assuming report_id = 2 from the above insert

-- Insert Physical & Aesthetic Parameters (all parameters)
INSERT INTO physical_aesthetic_parameters (
    report_id,
    ph,
    electrical_conductivity,
    temperature,
    color,
    odour,
    taste,
    suspended_solids,
    total_dissolved_solids,
    turbidity
) VALUES (
    2,  -- report_id
    8.1,  -- pH (within 6.5-8.5) ✅
    1450,  -- EC (within <1500) ✅
    26.5,  -- Temperature
    'Slightly Yellow',  -- Color ⚠️
    'Unobjectionable',  -- Odour ✅
    'Slightly Salty',  -- Taste ⚠️
    8.5,  -- Suspended Solids
    1050,  -- TDS (EXCEEDS <1000) ❌
    6.2  -- Turbidity (EXCEEDS <5) ❌
);

-- Insert Major Chemical Parameters
INSERT INTO major_chemical_parameters (
    report_id,
    alkalinity_caco3,
    bicarbonates,
    calcium,
    carbonates,
    chlorides,
    total_hardness,
    magnesium,
    potassium,
    sodium,
    sulphate,
    nitrate_n,
    nitrite,
    tds,
    iron,
    fluoride,
    phosphate
) VALUES (
    2,  -- report_id
    250.0,  -- Alkalinity
    305.0,  -- Bicarbonates
    85.0,  -- Calcium
    12.0,  -- Carbonates
    180.0,  -- Chlorides (within <250) ✅
    420.0,  -- Total Hardness (within <500) ✅
    45.0,  -- Magnesium
    8.5,  -- Potassium
    120.0,  -- Sodium
    95.0,  -- Sulphate
    35.0,  -- Nitrate-N (within ≤50) ✅
    0.05,  -- Nitrite (within ≤3) ✅
    1050.0,  -- TDS (EXCEEDS <1000) ❌
    0.25,  -- Iron (within 0.3) ✅
    0.8,  -- Fluoride (within ≤1.5) ✅
    0.15  -- Phosphate
);

-- Insert Trace & Ultra-Trace Elements
INSERT INTO trace_ultratrace_elements (
    report_id,
    aluminum,
    arsenic,
    barium,
    cadmium,
    chromium,
    copper,
    manganese,
    molybdenum,
    nickel,
    lead,
    selenium,
    strontium,
    zinc,
    boron,
    antimony,
    mercury,
    cyanide,
    silica
) VALUES (
    2,  -- report_id
    150.0,  -- Aluminum (within ≤200) ✅
    25.0,  -- Arsenic (within ≤50) ✅
    450.0,  -- Barium (within 700) ✅
    3.0,  -- Cadmium (within 10) ✅
    30.0,  -- Chromium (within ≤50) ✅
    1200.0,  -- Copper (within 2000) ✅
    350.0,  -- Manganese (within ≤500) ✅
    5.0,  -- Molybdenum (NGVS)
    12.0,  -- Nickel (within 20) ✅
    35.0,  -- Lead (within 50) ✅
    5.0,  -- Selenium (within 10) ✅
    250.0,  -- Strontium (NGVS)
    2500.0,  -- Zinc (within 5000) ✅
    0.15,  -- Boron (within 0.3) ✅
    0.002,  -- Antimony (within ≤0.005) ✅
    0.0005,  -- Mercury (within ≤0.001) ✅
    0.01,  -- Cyanide (within <0.05) ✅
    25.0  -- Silica (NGVS)
);

-- Insert Microbiological Parameters
-- Row 41-43 in Full Mode UI (same data structure, different UI numbering)
INSERT INTO microbiological_parameters (
    report_id,
    total_coliforms,
    fecal_coliforms,
    e_coli
) VALUES (
    2,  -- report_id
    5.0,  -- Total Coliforms (EXCEEDS 0) ❌
    2.0,  -- Fecal Coliforms (EXCEEDS 0) ❌
    1.0   -- E-coli (EXCEEDS 0) ❌
);

-- Insert Quality Assessment
INSERT INTO quality_assessment (
    report_id,
    physical_quality,
    chemical_quality,
    microbial_quality,
    remarks,
    terms_agreed
) VALUES (
    2,  -- report_id
    'fair',
    'fair',
    'unsafe',
    'Water sample shows elevated TDS and turbidity levels. Microbiological contamination detected. NOT SAFE for drinking without treatment. Recommend boiling and filtration.',
    TRUE
);

COMMIT;


-- ============================================================================
-- USEFUL QUERIES FOR COMMON OPERATIONS
-- ============================================================================

-- Query 1: Get all test reports with quality assessment
-- Usage: View all test reports with their quality ratings
/*
SELECT
    trm.report_serial_no,
    trm.nwql_sample_code,
    trm.customer_name_address,
    trm.location,
    trm.tehsil,
    trm.village,
    trm.form_type,
    qa.physical_quality,
    qa.chemical_quality,
    qa.microbial_quality,
    trm.reporting_date
FROM test_report_metadata trm
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
ORDER BY trm.reporting_date DESC;
*/


-- Query 2: Find all unsafe water samples
-- Usage: Identify locations with unsafe water quality
/*
SELECT
    trm.report_serial_no,
    trm.location,
    trm.tehsil,
    trm.village,
    trm.settlement,
    qa.microbial_quality,
    mp.total_coliforms,
    mp.fecal_coliforms,
    mp.e_coli,
    trm.reporting_date
FROM test_report_metadata trm
JOIN quality_assessment qa ON trm.report_id = qa.report_id
JOIN microbiological_parameters mp ON trm.report_id = mp.report_id
WHERE qa.microbial_quality IN ('unsafe', 'contaminated')
ORDER BY trm.reporting_date DESC;
*/


-- Query 3: Check parameters exceeding permissible limits for a specific report
-- Usage: SELECT * FROM check_permissible_limits(1);


-- Query 4: Get average water quality parameters by Tehsil
-- Usage: Compare water quality across different Tehsils
/*
SELECT
    trm.tehsil,
    COUNT(*) as total_tests,
    ROUND(AVG(pap.ph), 2) as avg_ph,
    ROUND(AVG(pap.electrical_conductivity), 2) as avg_ec,
    ROUND(AVG(pap.total_dissolved_solids), 2) as avg_tds,
    ROUND(AVG(pap.turbidity), 2) as avg_turbidity,
    COUNT(CASE WHEN qa.microbial_quality = 'safe' THEN 1 END) as safe_count,
    COUNT(CASE WHEN qa.microbial_quality IN ('unsafe', 'contaminated') THEN 1 END) as unsafe_count
FROM test_report_metadata trm
LEFT JOIN physical_aesthetic_parameters pap ON trm.report_id = pap.report_id
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
GROUP BY trm.tehsil
ORDER BY unsafe_count DESC, trm.tehsil;
*/


-- Query 5: Get complete test report data for a specific report
-- Usage: Retrieve all data for report generation
/*
SELECT
    -- Metadata
    trm.*,
    -- Physical Parameters
    pap.*,
    -- Chemical Parameters (if full mode)
    mcp.*,
    -- Trace Elements (if full mode)
    tut.*,
    -- Microbiological
    mp.*,
    -- Quality Assessment
    qa.*
FROM test_report_metadata trm
LEFT JOIN physical_aesthetic_parameters pap ON trm.report_id = pap.report_id
LEFT JOIN major_chemical_parameters mcp ON trm.report_id = mcp.report_id
LEFT JOIN trace_ultratrace_elements tut ON trm.report_id = tut.report_id
LEFT JOIN microbiological_parameters mp ON trm.report_id = mp.report_id
LEFT JOIN quality_assessment qa ON trm.report_id = qa.report_id
WHERE trm.report_serial_no = 'NWQL-2025-001';
*/


-- Query 6: Monthly test statistics
-- Usage: Generate monthly reports
/*
SELECT
    DATE_TRUNC('month', reporting_date) as month,
    COUNT(*) as total_tests,
    COUNT(CASE WHEN form_type = 'priority' THEN 1 END) as priority_tests,
    COUNT(CASE WHEN form_type = 'full' THEN 1 END) as full_tests,
    COUNT(DISTINCT tehsil) as tehsils_covered,
    COUNT(DISTINCT village) as villages_covered
FROM test_report_metadata
GROUP BY DATE_TRUNC('month', reporting_date)
ORDER BY month DESC;
*/


-- Query 7: Find reports with trace elements exceeding limits
-- Usage: Identify heavy metal contamination
/*
SELECT
    trm.report_serial_no,
    trm.location,
    trm.tehsil,
    trm.village,
    CASE WHEN tut.aluminum > 200 THEN 'Aluminum: ' || tut.aluminum || ' μg/L' END as aluminum_issue,
    CASE WHEN tut.arsenic > 50 THEN 'Arsenic: ' || tut.arsenic || ' μg/L' END as arsenic_issue,
    CASE WHEN tut.lead > 50 THEN 'Lead: ' || tut.lead || ' μg/L' END as lead_issue,
    CASE WHEN tut.mercury > 0.001 THEN 'Mercury: ' || tut.mercury || ' mg/L' END as mercury_issue,
    trm.reporting_date
FROM test_report_metadata trm
JOIN trace_ultratrace_elements tut ON trm.report_id = tut.report_id
WHERE tut.aluminum > 200
   OR tut.arsenic > 50
   OR tut.lead > 50
   OR tut.mercury > 0.001
ORDER BY trm.reporting_date DESC;
*/


-- ============================================================================
-- DATABASE MAINTENANCE QUERIES
-- ============================================================================

-- Query 8: Database statistics
-- Usage: Monitor database growth and usage
/*
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
*/


-- Query 9: Find orphaned records (data integrity check)
-- Usage: Ensure referential integrity
/*
-- Check for physical parameters without metadata
SELECT pap.physical_params_id, pap.report_id
FROM physical_aesthetic_parameters pap
LEFT JOIN test_report_metadata trm ON pap.report_id = trm.report_id
WHERE trm.report_id IS NULL;

-- Check for quality assessments without metadata
SELECT qa.quality_assessment_id, qa.report_id
FROM quality_assessment qa
LEFT JOIN test_report_metadata trm ON qa.report_id = trm.report_id
WHERE trm.report_id IS NULL;
*/


-- ============================================================================
-- BACKUP AND RESTORE COMMANDS
-- ============================================================================

-- Backup entire database
-- pg_dump -U postgres -d pcrwr_water_quality -F c -b -v -f "pcrwr_backup_$(date +%Y%m%d).backup"

-- Restore database
-- pg_restore -U postgres -d pcrwr_water_quality -v "pcrwr_backup_20251108.backup"

-- Backup specific table
-- pg_dump -U postgres -d pcrwr_water_quality -t test_report_metadata -F c -f "metadata_backup.backup"


-- ============================================================================
-- PERFORMANCE OPTIMIZATION RECOMMENDATIONS
-- ============================================================================

-- 1. Regularly update table statistics
-- ANALYZE test_report_metadata;
-- ANALYZE physical_aesthetic_parameters;
-- ANALYZE major_chemical_parameters;
-- ANALYZE trace_ultratrace_elements;
-- ANALYZE microbiological_parameters;
-- ANALYZE quality_assessment;

-- 2. Vacuum tables to reclaim space
-- VACUUM ANALYZE test_report_metadata;

-- 3. Monitor slow queries
-- Enable pg_stat_statements extension
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 4. Create additional indexes based on query patterns
-- Example: If frequently searching by customer_code
-- CREATE INDEX idx_customer_code ON test_report_metadata(customer_code);


-- ============================================================================
-- SCHEMA DESIGN DECISIONS AND RATIONALE
-- ============================================================================

/*
1. **Normalized Design:**
   - Separate tables for different parameter categories
   - Reduces data redundancy
   - Allows NULL values for Full mode-only parameters
   - Easier to maintain and extend

2. **Foreign Key Constraints:**
   - ON DELETE CASCADE ensures data integrity
   - When a test report is deleted, all related parameters are automatically deleted
   - Prevents orphaned records

3. **Data Types:**
   - DECIMAL(10,4) for most measurements: supports values up to 999,999.9999
   - DECIMAL(10,6) for trace elements: supports very small values (e.g., 0.000001)
   - VARCHAR for text fields with reasonable length limits
   - TEXT for unlimited text (remarks, addresses)
   - TIMESTAMP for precise date/time tracking

4. **Check Constraints:**
   - Ensures data validity at database level
   - Prevents negative values for measurements
   - Validates enum values for quality assessments
   - Enforces logical date relationships

5. **Indexes:**
   - Primary keys automatically indexed
   - Foreign keys indexed for join performance
   - Frequently queried columns indexed (serial numbers, dates, locations)
   - Composite indexes can be added based on query patterns

6. **Audit Trail:**
   - created_at and updated_at timestamps on all tables
   - Optional audit_log table for compliance
   - Tracks who, when, and what changed

7. **Views:**
   - Simplify complex queries
   - Provide pre-joined data for common use cases
   - Separate views for Priority and Full modes
   - Summary views for reporting

8. **Triggers:**
   - Automatic timestamp updates
   - Can be extended for validation, logging, notifications

9. **Form Type Tracking:**
   - form_type column tracks whether Priority or Full mode was used
   - Helps with reporting and analytics
   - Allows filtering by test complexity

10. **Scalability:**
    - SERIAL primary keys support up to 2.1 billion records
    - Can be upgraded to BIGSERIAL if needed
    - Partitioning can be added for very large datasets (by date, location)
    - Read replicas can be added for reporting workload

11. **Data Validation:**
    - Database-level constraints complement frontend validation
    - Prevents invalid data even if frontend validation is bypassed
    - CHECK constraints enforce permissible limits where applicable

12. **Flexibility:**
    - NULL values allowed for optional parameters
    - Easy to add new parameters by adding columns
    - Views can be updated without changing application code
    - Supports both Priority (15 params) and Full (43+ params) modes seamlessly
*/


-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================

/*
If migrating from an existing system:

1. Create new database:
   CREATE DATABASE pcrwr_water_quality;

2. Run this schema file:
   psql -U postgres -d pcrwr_water_quality -f database_schema.sql

3. Import existing data:
   - Map old column names to new schema
   - Use COPY or INSERT statements
   - Validate data integrity after import

4. Update application connection strings:
   - Update database name
   - Update table/column references
   - Test all CRUD operations

5. Set up regular backups:
   - Daily automated backups
   - Weekly full backups
   - Monthly archive backups
*/


-- ============================================================================
-- SECURITY RECOMMENDATIONS
-- ============================================================================

/*
1. Create separate database users with appropriate permissions:

-- Read-only user for reporting
CREATE USER pcrwr_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE pcrwr_water_quality TO pcrwr_readonly;
GRANT USAGE ON SCHEMA public TO pcrwr_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pcrwr_readonly;

-- Application user with read/write access
CREATE USER pcrwr_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE pcrwr_water_quality TO pcrwr_app;
GRANT USAGE ON SCHEMA public TO pcrwr_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pcrwr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pcrwr_app;

-- Admin user with full access
CREATE USER pcrwr_admin WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE pcrwr_water_quality TO pcrwr_admin;

2. Enable SSL connections:
   - Configure postgresql.conf: ssl = on
   - Require SSL in pg_hba.conf: hostssl all all 0.0.0.0/0 md5

3. Regular security audits:
   - Review user permissions
   - Monitor failed login attempts
   - Check for SQL injection vulnerabilities

4. Data encryption:
   - Enable encryption at rest
   - Use pgcrypto extension for sensitive data
   - Encrypt backups
*/


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================

-- Schema Version: 1.0
-- Last Updated: 2025-11-08
-- Maintained By: PCRWR Development Team
-- Contact: nwql@pcrwr.gov.pk

