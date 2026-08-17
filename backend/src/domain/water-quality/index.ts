import {
  judgeParameterResult,
  judgeReportResults,
  parseResultLiteral,
  validateReceiptMeta,
  WaterQualityValidationError,
  type JudgedParameterResult,
  type ParameterJudgmentRule,
  type RawParameterResultInput,
  type ReportConformity,
} from './parameter-judgment';
import { parsePcrwrLabReport } from './pcrwr-report-parser';
import { matchSourceType } from './source-type-matcher';
import {
  SOURCE_TYPE_CATALOG,
  DEFAULT_SOURCE_TYPE_BY_CATEGORY,
} from './source-types.catalog';
import {
  categoryToConformityGroup,
  isPriorityParameter,
  PRIORITY_PARAMETER_CODES,
  WATER_QUALITY_PARAMETERS,
} from './water-quality-parameters.catalog';

export {
  WATER_QUALITY_PARAMETERS,
  PRIORITY_PARAMETER_CODES,
  SOURCE_TYPE_CATALOG,
  DEFAULT_SOURCE_TYPE_BY_CATEGORY,
  categoryToConformityGroup,
  isPriorityParameter,
  judgeParameterResult,
  judgeReportResults,
  matchSourceType,
  parseResultLiteral,
  parsePcrwrLabReport,
  validateReceiptMeta,
  WaterQualityValidationError,
};
export type {
  JudgedParameterResult,
  ParameterJudgmentRule,
  RawParameterResultInput,
  ReportConformity,
};

export function toJudgmentRules(
  parameters: Array<{
    code: string;
    name: string;
    conformityGroup: ParameterJudgmentRule['conformityGroup'];
    limitOperator: ParameterJudgmentRule['limitOperator'];
    limitMin: number | null;
    limitMax: number | null;
    limitDisplay: string;
    qualitativeAllowed: string[];
    detectionLimit: number | null;
  }>,
): ParameterJudgmentRule[] {
  return parameters.map((parameter) => ({
    code: parameter.code,
    name: parameter.name,
    conformityGroup: parameter.conformityGroup,
    limitOperator: parameter.limitOperator,
    limitMin: parameter.limitMin,
    limitMax: parameter.limitMax,
    limitDisplay: parameter.limitDisplay,
    qualitativeAllowed: parameter.qualitativeAllowed,
    detectionLimit: parameter.detectionLimit,
  }));
}

/** Catalog rules used when DB is not yet loaded (seed / offline judgment). */
export function catalogJudgmentRules(): ParameterJudgmentRule[] {
  return toJudgmentRules(
    WATER_QUALITY_PARAMETERS.map((parameter) => ({
      code: parameter.code,
      name: parameter.name,
      conformityGroup: categoryToConformityGroup(parameter.category),
      limitOperator: parameter.limitOperator,
      limitMin: parameter.limitMin,
      limitMax: parameter.limitMax,
      limitDisplay: parameter.limitDisplay,
      qualitativeAllowed: parameter.qualitativeAllowed,
      detectionLimit: parameter.detectionLimit,
    })),
  );
}
