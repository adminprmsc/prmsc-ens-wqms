export type LimitOperator =
  | 'NONE'
  | 'MAX_INCLUSIVE'
  | 'MAX_EXCLUSIVE'
  | 'RANGE'
  | 'EQUALS_ZERO'
  | 'QUALITATIVE';

export type ResultValueType =
  'NUMERIC' | 'BDL' | 'QUALITATIVE' | 'NEGATIVE' | 'POSITIVE' | 'TNTC';

export type ConformityStatus = 'SAFE' | 'UNSAFE';

export type ParameterConformityGroup =
  'PHYSICAL' | 'CHEMICAL' | 'TRACE' | 'MICROBIAL';

export type ParameterJudgmentRule = {
  code: string;
  name: string;
  conformityGroup: ParameterConformityGroup;
  limitOperator: LimitOperator;
  limitMin: number | null;
  limitMax: number | null;
  limitDisplay: string;
  qualitativeAllowed: string[];
  detectionLimit: number | null;
};

export type RawParameterResultInput = {
  parameterCode: string;
  /** Prefer explicit type; otherwise inferred from value. */
  resultType?: ResultValueType;
  numericValue?: number | null;
  qualitativeValue?: string | null;
  uncertainty?: string | null;
};

export type JudgedParameterResult = {
  parameterCode: string;
  resultType: ResultValueType;
  numericValue: number | null;
  qualitativeValue: string | null;
  uncertainty: string | null;
  exceedsLimit: boolean;
  isJudged: boolean;
  limitDisplay: string;
  message: string;
};

export type ReportConformity = {
  physicalConformity: ConformityStatus;
  chemicalConformity: ConformityStatus;
  traceConformity: ConformityStatus | null;
  microbialConformity: ConformityStatus;
  overallRemarks: string;
  exceededParameters: string[];
};

export class WaterQualityValidationError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'WaterQualityValidationError';
  }
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

const BDL_TOKENS = new Set(
  ['bdl', 'ndl', 'nd', 'nil', 'notdetected', 'belowdetectionlimit'].map(
    normalizeToken,
  ),
);

const NEGATIVE_TOKENS = new Set(
  ['-ve', 've', 'negative', 'absent', 'notdetected', 'nil', 'nd'].map(
    normalizeToken,
  ),
);

const TNTC_TOKENS = new Set(['tntc', 'toonumeroustocount'].map(normalizeToken));

export function parseResultLiteral(raw: string): {
  resultType: ResultValueType;
  numericValue: number | null;
  qualitativeValue: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new WaterQualityValidationError('Result value cannot be empty');
  }

  const token = normalizeToken(trimmed);
  if (BDL_TOKENS.has(token)) {
    return { resultType: 'BDL', numericValue: null, qualitativeValue: 'BDL' };
  }
  if (NEGATIVE_TOKENS.has(token) || trimmed === '-ve' || trimmed === '-Ve') {
    return {
      resultType: 'NEGATIVE',
      numericValue: 0,
      qualitativeValue: '-ve',
    };
  }
  if (TNTC_TOKENS.has(token)) {
    return { resultType: 'TNTC', numericValue: null, qualitativeValue: 'TNTC' };
  }

  const asNumber = Number(trimmed.replace(/,/g, ''));
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) {
    return {
      resultType: 'NUMERIC',
      numericValue: asNumber,
      qualitativeValue: null,
    };
  }

  return {
    resultType: 'QUALITATIVE',
    numericValue: null,
    qualitativeValue: trimmed,
  };
}

function normalizeInput(input: RawParameterResultInput): Omit<
  RawParameterResultInput,
  'resultType'
> & {
  resultType: ResultValueType;
} {
  if (input.resultType) {
    if (input.resultType === 'NUMERIC') {
      if (input.numericValue === null || input.numericValue === undefined) {
        throw new WaterQualityValidationError(
          `Parameter ${input.parameterCode}: numericValue is required for NUMERIC results`,
        );
      }
      if (!Number.isFinite(input.numericValue)) {
        throw new WaterQualityValidationError(
          `Parameter ${input.parameterCode}: numericValue must be a finite number`,
        );
      }
    }
    if (
      (input.resultType === 'QUALITATIVE' ||
        input.resultType === 'BDL' ||
        input.resultType === 'NEGATIVE' ||
        input.resultType === 'POSITIVE' ||
        input.resultType === 'TNTC') &&
      !input.qualitativeValue &&
      input.resultType !== 'BDL' &&
      input.resultType !== 'NEGATIVE' &&
      input.resultType !== 'POSITIVE' &&
      input.resultType !== 'TNTC'
    ) {
      throw new WaterQualityValidationError(
        `Parameter ${input.parameterCode}: qualitativeValue is required`,
      );
    }
    return {
      ...input,
      resultType: input.resultType,
      qualitativeValue:
        input.qualitativeValue ??
        (input.resultType === 'BDL'
          ? 'BDL'
          : input.resultType === 'NEGATIVE'
            ? '-ve'
            : input.resultType === 'POSITIVE'
              ? '+ve'
              : input.resultType === 'TNTC'
                ? 'TNTC'
                : null),
      numericValue:
        input.resultType === 'NEGATIVE'
          ? (input.numericValue ?? 0)
          : (input.numericValue ?? null),
    };
  }

  if (input.qualitativeValue) {
    const parsed = parseResultLiteral(input.qualitativeValue);
    return {
      parameterCode: input.parameterCode,
      uncertainty: input.uncertainty,
      ...parsed,
      numericValue: input.numericValue ?? parsed.numericValue,
    };
  }

  if (input.numericValue !== null && input.numericValue !== undefined) {
    if (!Number.isFinite(input.numericValue)) {
      throw new WaterQualityValidationError(
        `Parameter ${input.parameterCode}: numericValue must be a finite number`,
      );
    }
    return {
      parameterCode: input.parameterCode,
      resultType: 'NUMERIC',
      numericValue: input.numericValue,
      qualitativeValue: null,
      uncertainty: input.uncertainty,
    };
  }

  throw new WaterQualityValidationError(
    `Parameter ${input.parameterCode}: provide numericValue or qualitativeValue`,
  );
}

function isQualitativeAllowed(value: string, allowed: string[]): boolean {
  const token = normalizeToken(value);
  return allowed.some((item) => normalizeToken(item) === token);
}

function judgeNumericAgainstLimit(
  value: number,
  rule: ParameterJudgmentRule,
): { exceeds: boolean; message: string } {
  switch (rule.limitOperator) {
    case 'NONE':
      return {
        exceeds: false,
        message: `${rule.name}: NGVS — recorded only`,
      };
    case 'MAX_INCLUSIVE':
      if (rule.limitMax === null) {
        throw new WaterQualityValidationError(
          `${rule.code}: MAX_INCLUSIVE requires limitMax`,
        );
      }
      return value <= rule.limitMax
        ? {
            exceeds: false,
            message: `${rule.name}: ${value} ≤ ${rule.limitDisplay}`,
          }
        : {
            exceeds: true,
            message: `${rule.name}: ${value} exceeds ${rule.limitDisplay}`,
          };
    case 'MAX_EXCLUSIVE':
      if (rule.limitMax === null) {
        throw new WaterQualityValidationError(
          `${rule.code}: MAX_EXCLUSIVE requires limitMax`,
        );
      }
      return value < rule.limitMax
        ? {
            exceeds: false,
            message: `${rule.name}: ${value} < ${rule.limitMax}`,
          }
        : {
            exceeds: true,
            message: `${rule.name}: ${value} is not < ${rule.limitMax}`,
          };
    case 'RANGE':
      if (rule.limitMin === null || rule.limitMax === null) {
        throw new WaterQualityValidationError(
          `${rule.code}: RANGE requires limitMin and limitMax`,
        );
      }
      return value >= rule.limitMin && value <= rule.limitMax
        ? {
            exceeds: false,
            message: `${rule.name}: ${value} within ${rule.limitDisplay}`,
          }
        : {
            exceeds: true,
            message: `${rule.name}: ${value} outside ${rule.limitDisplay}`,
          };
    case 'EQUALS_ZERO':
      return value === 0
        ? { exceeds: false, message: `${rule.name}: absent (0)` }
        : {
            exceeds: true,
            message: `${rule.name}: ${value} CFU detected (limit 0)`,
          };
    case 'QUALITATIVE':
      throw new WaterQualityValidationError(
        `${rule.code}: QUALITATIVE parameter cannot receive a bare numeric value without qualitativeValue`,
      );
    default: {
      const exhaustive: never = rule.limitOperator;
      throw new WaterQualityValidationError(
        `Unknown operator: ${String(exhaustive)}`,
      );
    }
  }
}

/**
 * Core water-quality analyst judgment for a single parameter result
 * against PSQCA / NSDWQ / WHO catalog rules.
 */
export function judgeParameterResult(
  rule: ParameterJudgmentRule,
  raw: RawParameterResultInput,
): JudgedParameterResult {
  if (raw.parameterCode !== rule.code) {
    throw new WaterQualityValidationError(
      `Parameter code mismatch: expected ${rule.code}, got ${raw.parameterCode}`,
    );
  }

  const input = normalizeInput(raw);

  if (
    input.numericValue !== null &&
    input.numericValue !== undefined &&
    input.resultType === 'NUMERIC' &&
    input.numericValue < 0
  ) {
    throw new WaterQualityValidationError(
      `${rule.name}: numericValue cannot be negative`,
    );
  }

  let exceedsLimit = false;
  let isJudged = rule.limitOperator !== 'NONE';
  let message = '';

  switch (input.resultType) {
    case 'BDL': {
      if (rule.limitOperator === 'NONE') {
        exceedsLimit = false;
        isJudged = false;
        message = `${rule.name}: BDL (NGVS)`;
      } else if (rule.limitOperator === 'QUALITATIVE') {
        exceedsLimit = true;
        message = `${rule.name}: BDL is invalid for qualitative sensory parameters`;
      } else {
        // Below detection ⇒ does not exceed potable limits.
        exceedsLimit = false;
        message = `${rule.name}: BDL — within limit ${rule.limitDisplay}`;
      }
      break;
    }
    case 'NEGATIVE': {
      if (rule.limitOperator === 'EQUALS_ZERO' || rule.code === 'E_COLI') {
        exceedsLimit = false;
        message = `${rule.name}: -ve / absent — safe`;
      } else if (rule.limitOperator === 'NONE') {
        exceedsLimit = false;
        isJudged = false;
        message = `${rule.name}: -ve (NGVS)`;
      } else {
        throw new WaterQualityValidationError(
          `${rule.name}: -ve is only valid for microbiological absence tests`,
        );
      }
      break;
    }
    case 'POSITIVE': {
      if (rule.limitOperator === 'EQUALS_ZERO') {
        exceedsLimit = true;
        message = `${rule.name}: +ve — microbial contamination`;
      } else {
        throw new WaterQualityValidationError(
          `${rule.name}: +ve is only valid for microbiological presence/absence tests`,
        );
      }
      break;
    }
    case 'TNTC': {
      if (rule.limitOperator === 'EQUALS_ZERO') {
        exceedsLimit = true;
        message = `${rule.name}: TNTC — microbial contamination`;
      } else {
        throw new WaterQualityValidationError(
          `${rule.name}: TNTC is only valid for microbiological counts`,
        );
      }
      break;
    }
    case 'QUALITATIVE': {
      const value = input.qualitativeValue ?? '';
      if (rule.limitOperator === 'QUALITATIVE') {
        const ok = isQualitativeAllowed(value, rule.qualitativeAllowed);
        exceedsLimit = !ok;
        message = ok
          ? `${rule.name}: "${value}" acceptable`
          : `${rule.name}: "${value}" not in allowed values (${rule.qualitativeAllowed.join(', ')})`;
      } else if (
        rule.limitOperator === 'EQUALS_ZERO' &&
        isQualitativeAllowed(value, rule.qualitativeAllowed)
      ) {
        exceedsLimit = false;
        message = `${rule.name}: "${value}" treated as absent`;
      } else {
        throw new WaterQualityValidationError(
          `${rule.name}: qualitative "${value}" is not valid for limit ${rule.limitDisplay}`,
        );
      }
      break;
    }
    case 'NUMERIC': {
      const value = input.numericValue!;
      if (rule.limitOperator === 'QUALITATIVE') {
        throw new WaterQualityValidationError(
          `${rule.name}: expects qualitative result (${rule.limitDisplay}), not a number`,
        );
      }
      const judged = judgeNumericAgainstLimit(value, rule);
      exceedsLimit = judged.exceeds;
      isJudged = rule.limitOperator !== 'NONE';
      message = judged.message;
      break;
    }
    default: {
      const exhaustive: never = input.resultType;
      throw new WaterQualityValidationError(
        `Unknown result type: ${String(exhaustive)}`,
      );
    }
  }

  return {
    parameterCode: rule.code,
    resultType: input.resultType,
    numericValue: input.numericValue === undefined ? null : input.numericValue,
    qualitativeValue: input.qualitativeValue ?? null,
    uncertainty: input.uncertainty ?? null,
    exceedsLimit,
    isJudged,
    limitDisplay: rule.limitDisplay,
    message,
  };
}

export function judgeReportResults(
  rules: ParameterJudgmentRule[],
  inputs: RawParameterResultInput[],
  options?: { requireAllParameters?: boolean },
): {
  results: JudgedParameterResult[];
  conformity: ReportConformity;
} {
  const ruleByCode = new Map(rules.map((rule) => [rule.code, rule]));
  const errors: string[] = [];
  const seen = new Set<string>();

  if (inputs.length === 0) {
    throw new WaterQualityValidationError(
      'At least one parameter result is required',
    );
  }

  for (const input of inputs) {
    if (seen.has(input.parameterCode)) {
      errors.push(`Duplicate result for parameter ${input.parameterCode}`);
    }
    seen.add(input.parameterCode);
    if (!ruleByCode.has(input.parameterCode)) {
      errors.push(`Unknown parameter code: ${input.parameterCode}`);
    }
  }

  if (options?.requireAllParameters) {
    for (const rule of rules) {
      if (!seen.has(rule.code)) {
        errors.push(`Missing required parameter: ${rule.code} (${rule.name})`);
      }
    }
  }

  if (errors.length > 0) {
    throw new WaterQualityValidationError('Invalid parameter results', errors);
  }

  const results = inputs.map((input) =>
    judgeParameterResult(ruleByCode.get(input.parameterCode)!, input),
  );

  const physicalFails = results.some((result) => {
    const rule = ruleByCode.get(result.parameterCode)!;
    return rule.conformityGroup === 'PHYSICAL' && result.exceedsLimit;
  });
  const chemicalFails = results.some((result) => {
    const rule = ruleByCode.get(result.parameterCode)!;
    return rule.conformityGroup === 'CHEMICAL' && result.exceedsLimit;
  });
  const traceInputs = results.filter((result) => {
    const rule = ruleByCode.get(result.parameterCode)!;
    return rule.conformityGroup === 'TRACE';
  });
  const traceFails = traceInputs.some((result) => result.exceedsLimit);
  const microbialFails = results.some((result) => {
    const rule = ruleByCode.get(result.parameterCode)!;
    return rule.conformityGroup === 'MICROBIAL' && result.exceedsLimit;
  });

  const exceededParameters = results
    .filter((result) => result.exceedsLimit)
    .map((result) => result.parameterCode);

  const physicalConformity: ConformityStatus = physicalFails
    ? 'UNSAFE'
    : 'SAFE';
  const chemicalConformity: ConformityStatus = chemicalFails
    ? 'UNSAFE'
    : 'SAFE';
  const traceConformity: ConformityStatus | null =
    traceInputs.length === 0 ? null : traceFails ? 'UNSAFE' : 'SAFE';
  const microbialConformity: ConformityStatus = microbialFails
    ? 'UNSAFE'
    : 'SAFE';

  const overallUnsafe =
    physicalConformity === 'UNSAFE' ||
    chemicalConformity === 'UNSAFE' ||
    traceConformity === 'UNSAFE' ||
    microbialConformity === 'UNSAFE';

  const overallRemarks = overallUnsafe
    ? 'Un-Safe For drinking'
    : 'Safe for drinking';

  return {
    results,
    conformity: {
      physicalConformity,
      chemicalConformity,
      traceConformity,
      microbialConformity,
      overallRemarks,
      exceededParameters,
    },
  };
}

export function validateReceiptMeta(input: {
  receiptTempC?: number | null;
  receiptHumidityPct?: number | null;
  samplingAt: Date;
  receivedAt?: Date | null;
  analysisFrom?: Date | null;
  analysisTo?: Date | null;
  reportingDate: Date;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
}): string[] {
  const errors: string[] = [];

  if (
    input.receiptTempC !== null &&
    input.receiptTempC !== undefined &&
    (input.receiptTempC < -5 || input.receiptTempC > 50)
  ) {
    errors.push('receiptTempC must be between -5 and 50 °C');
  }

  if (
    input.receiptHumidityPct !== null &&
    input.receiptHumidityPct !== undefined &&
    (input.receiptHumidityPct < 0 || input.receiptHumidityPct > 100)
  ) {
    errors.push('receiptHumidityPct must be between 0 and 100');
  }

  const hasLat = input.gpsLatitude !== null && input.gpsLatitude !== undefined;
  const hasLng =
    input.gpsLongitude !== null && input.gpsLongitude !== undefined;
  if (hasLat !== hasLng) {
    errors.push('gpsLatitude and gpsLongitude must be provided together');
  }
  if (hasLat && (input.gpsLatitude! < -90 || input.gpsLatitude! > 90)) {
    errors.push('gpsLatitude must be between -90 and 90');
  }
  if (hasLng && (input.gpsLongitude! < -180 || input.gpsLongitude! > 180)) {
    errors.push('gpsLongitude must be between -180 and 180');
  }

  if (input.receivedAt) {
    const daysReceivedBeforeSampling = calendarDaysBetween(
      input.samplingAt,
      input.receivedAt,
    );
    if (daysReceivedBeforeSampling > 14) {
      errors.push('receivedAt cannot be more than 14 days before samplingAt');
    }
  }

  if (
    input.analysisFrom &&
    input.analysisTo &&
    calendarDaysBetween(input.analysisFrom, input.analysisTo) > 0
  ) {
    errors.push('analysisTo cannot be before analysisFrom');
  }

  if (calendarDaysBetween(input.samplingAt, input.reportingDate) > 0) {
    errors.push('reportingDate cannot be before samplingAt');
  }

  return errors;
}

function calendarDayUtc(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarDaysBetween(later: Date, earlier: Date): number {
  return Math.round(
    (calendarDayUtc(later) - calendarDayUtc(earlier)) / 86_400_000,
  );
}
