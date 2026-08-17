import {
  catalogJudgmentRules,
  judgeReportResults,
  judgeParameterResult,
  parseResultLiteral,
  validateReceiptMeta,
} from './index';

describe('water quality parameter judgment', () => {
  const rules = catalogJudgmentRules();
  const byCode = (code: string) => rules.find((rule) => rule.code === code)!;

  it('parses BDL, -ve, and numeric literals', () => {
    expect(parseResultLiteral('BDL').resultType).toBe('BDL');
    expect(parseResultLiteral('-ve').resultType).toBe('NEGATIVE');
    expect(parseResultLiteral('7.6').numericValue).toBe(7.6);
  });

  it('marks iron above 0.3 as unsafe (WHO)', () => {
    const judged = judgeParameterResult(byCode('IRON'), {
      parameterCode: 'IRON',
      numericValue: 0.75,
    });
    expect(judged.exceedsLimit).toBe(true);
  });

  it('accepts colourless / UnObj spellings for sensory parameters', () => {
    expect(
      judgeParameterResult(byCode('COLOR'), {
        parameterCode: 'COLOR',
        qualitativeValue: 'Colourless',
      }).exceedsLimit,
    ).toBe(false);
    expect(
      judgeParameterResult(byCode('ODOUR'), {
        parameterCode: 'ODOUR',
        qualitativeValue: 'UnObj',
      }).exceedsLimit,
    ).toBe(false);
  });

  it('accepts pH within 6.5–8.5', () => {
    const judged = judgeParameterResult(byCode('PH'), {
      parameterCode: 'PH',
      numericValue: 7.6,
    });
    expect(judged.exceedsLimit).toBe(false);
  });

  it('flags total coliforms above zero', () => {
    const judged = judgeParameterResult(byCode('TOTAL_COLIFORMS'), {
      parameterCode: 'TOTAL_COLIFORMS',
      numericValue: 28,
    });
    expect(judged.exceedsLimit).toBe(true);
  });

  it('treats E-coli -ve as safe', () => {
    const judged = judgeParameterResult(byCode('E_COLI'), {
      parameterCode: 'E_COLI',
      qualitativeValue: '-ve',
    });
    expect(judged.exceedsLimit).toBe(false);
  });

  it('computes sample Cl-10409 style overall conformity', () => {
    const { conformity, results } = judgeReportResults(rules, [
      { parameterCode: 'COLOR', qualitativeValue: 'Colorless' },
      { parameterCode: 'ODOUR', qualitativeValue: 'Unobj' },
      { parameterCode: 'TASTE', qualitativeValue: 'UnObj' },
      { parameterCode: 'EC', numericValue: 965 },
      { parameterCode: 'PH', numericValue: 7.6 },
      { parameterCode: 'TURBIDITY', numericValue: 4.0 },
      { parameterCode: 'CHLORIDES', numericValue: 12 },
      { parameterCode: 'TOTAL_HARDNESS', numericValue: 290 },
      { parameterCode: 'NITRATE_N', qualitativeValue: 'BDL' },
      { parameterCode: 'TDS', numericValue: 531 },
      { parameterCode: 'IRON', numericValue: 0.75 },
      { parameterCode: 'FLUORIDE', numericValue: 0.6 },
      { parameterCode: 'ARSENIC', numericValue: 26 },
      { parameterCode: 'TOTAL_COLIFORMS', numericValue: 28 },
      { parameterCode: 'FECAL_COLIFORMS', numericValue: 4 },
      { parameterCode: 'E_COLI', qualitativeValue: '-ve' },
    ]);

    expect(conformity.physicalConformity).toBe('SAFE');
    expect(conformity.chemicalConformity).toBe('UNSAFE');
    expect(conformity.traceConformity).toBe('SAFE');
    expect(conformity.microbialConformity).toBe('UNSAFE');
    expect(conformity.overallRemarks).toBe('Un-Safe For drinking');
    expect(
      results.filter((r) => r.exceedsLimit).map((r) => r.parameterCode),
    ).toEqual(
      expect.arrayContaining(['IRON', 'TOTAL_COLIFORMS', 'FECAL_COLIFORMS']),
    );
  });

  it('treats TNTC as microbial contamination', () => {
    const judged = judgeParameterResult(byCode('TOTAL_COLIFORMS'), {
      parameterCode: 'TOTAL_COLIFORMS',
      qualitativeValue: 'TNTC',
    });
    expect(judged.resultType).toBe('TNTC');
    expect(judged.exceedsLimit).toBe(true);
  });

  it('accepts historical NWQL dates including receipt one day before sampling', () => {
    const errors = validateReceiptMeta({
      samplingAt: new Date('2023-10-03T12:30:00+05:00'),
      receivedAt: new Date('2023-10-02T00:00:00+05:00'),
      analysisFrom: new Date('2023-10-06T00:00:00+05:00'),
      analysisTo: new Date('2023-10-12T00:00:00+05:00'),
      reportingDate: new Date('2023-10-12T00:00:00+05:00'),
    });
    expect(errors).toEqual([]);
  });
});
