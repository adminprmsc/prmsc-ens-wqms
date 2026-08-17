import { readFileSync } from 'fs';
import { join } from 'path';
import { parseLabDocument } from './lab-document-extractor';
import { parsePcrwrLabReport, scorePlaceMatch } from './pcrwr-report-parser';

describe('PCRWR NWQL lab report parser', () => {
  it('extracts header and results from Cl-10409', async () => {
    const buffer = readFileSync(
      join(__dirname, 'fixtures/pcrwr-cl-10409.docx'),
    );
    const { report } = await parseLabDocument({
      buffer,
      fileName: 'Cl-10409-25 (1).docx',
    });

    expect(report.reportSerialNo).toBe('AR-04992');
    expect(report.nwqlSampleCode).toBe('MCL-10409-23');
    expect(report.customerCode).toMatch(/FWQL/);
    expect(report.customerPhone).toBe('03365137405');
    expect(report.tehsilName).toMatch(/isa\s*khel/i);
    expect(report.villageName).toMatch(/tunder khel/i);
    expect(report.locationDetail).toMatch(/Chughlan/i);
    expect(report.sourceLabel).toMatch(/tap/i);
    expect(report.sampleType).toBe('POU_TAP');
    expect(report.workOrder).toBe('WO 3');
    expect(report.formType).toBe('FULL');
    expect(report.samplingAt).toBe('2023-10-03T12:30:00+05:00');
    expect(report.receivedAt).toBe('2023-10-02T00:00:00+05:00');
    expect(report.reportingDate).toBe('2023-10-12T00:00:00+05:00');
    expect(report.receiptTempC).toBe(19);
    expect(report.receiptHumidityPct).toBe(60);
    expect(report.chemicalConformityHint).toBe('UNSAFE');
    expect(report.microbialConformityHint).toBe('UNSAFE');
    expect(report.remarksOverride).toMatch(/un-?safe/i);

    const byCode = Object.fromEntries(
      report.results.map((result) => [result.parameterCode, result]),
    );
    expect(byCode.COLOR?.qualitativeValue).toMatch(/colorless/i);
    expect(byCode.PH?.numericValue).toBe(7.6);
    expect(byCode.IRON?.numericValue).toBe(0.75);
    expect(byCode.ARSENIC?.numericValue).toBe(26);
    expect(byCode.TOTAL_COLIFORMS?.numericValue).toBe(28);
    expect(byCode.FECAL_COLIFORMS?.numericValue).toBe(4);
    expect(byCode.E_COLI?.qualitativeValue).toMatch(/-ve/i);
    expect(byCode.E_COLI?.resultType).toBe('NEGATIVE');
    expect(byCode.IRON?.resultType).toBe('NUMERIC');
    expect(byCode.CARBONATES?.resultType).toBe('BDL');
    expect(report.results.length).toBeGreaterThanOrEqual(30);
  });

  it('parses labeled text without tables', () => {
    const report = parsePcrwrLabReport(`
Report Serial No	AR-04985
NWQL Sample Code	MCL-10399-23
Customer Code	MSG/ISA/17
Tehsil	Isa khel
Village Name	Masti Khel
Source	Well water
Work Order	3
Location	Masti Khail Mianwali
Sampling Date & Time	03-10-2023, 12:30 PM
Reporting Date	12-10-2023
1	Color	-	-	Sensory Evaluation	Colorless	Colorless	-
4	Electrical Conductivity	(µS/cm)	0.11	APHA, 23rd Edition	NGVS	916	± 4%
20	Iron*	mg/L	0.04	APHA, 23rd Edition	0.3 (WHO, 2004)	BDL	± 3%
    `);
    expect(report.tehsilName).toMatch(/isa/i);
    expect(report.villageName).toMatch(/masti/i);
    expect(report.workOrder).toBe('WO 3');
    expect(report.sampleType).toBe('SOURCE_WELL');
    expect(report.samplingAt).toBe('2023-10-03T12:30:00+05:00');
    expect(report.reportingDate).toBe('2023-10-12T00:00:00+05:00');
    expect(report.reportSerialNo).toBe('AR-04985');
    expect(report.nwqlSampleCode).toBe('MCL-10399-23');
    expect(
      report.results.find((item) => item.parameterCode === 'EC')?.numericValue,
    ).toBe(916);
    expect(
      report.results.find((item) => item.parameterCode === 'IRON')
        ?.qualitativeValue,
    ).toBe('BDL');
    expect(
      report.results.find((item) => item.parameterCode === 'IRON')?.resultType,
    ).toBe('BDL');
  });

  it('scores Isa Khel location aliases', () => {
    expect(
      scorePlaceMatch('Kuch tunder Khel', 'KACH TUNDER KHEL'),
    ).toBeGreaterThan(60);
    expect(scorePlaceMatch('Kot Chandanda', 'KOT CHANDANA')).toBeGreaterThan(
      50,
    );
  });
});
