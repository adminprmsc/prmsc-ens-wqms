import {
  canonicalQualitativeValue,
  parseResultLiteral,
} from './parameter-judgment';
import { WATER_QUALITY_PARAMETERS } from './water-quality-parameters.catalog';

export type ParsedLabResult = {
  parameterCode: string;
  parameterName: string;
  rawValue: string;
  resultType:
    'NUMERIC' | 'BDL' | 'QUALITATIVE' | 'NEGATIVE' | 'POSITIVE' | 'TNTC';
  numericValue: number | null;
  qualitativeValue: string | null;
  uncertainty: string | null;
};

export type ParsedLabReport = {
  reportSerialNo: string | null;
  nwqlSampleCode: string | null;
  customerCode: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  locationDetail: string | null;
  tehsilName: string | null;
  villageName: string | null;
  sourceLabel: string | null;
  workOrder: string | null;
  sampleType: 'SOURCE_WELL' | 'POU_TAP' | 'OHR';
  reportCategory: 'PCRWR' | 'BASELINE';
  formType: 'PRIORITY' | 'FULL';
  totalPages: number | null;
  samplingAt: string | null;
  receivedAt: string | null;
  receiptTempC: number | null;
  receiptHumidityPct: number | null;
  analysisFrom: string | null;
  analysisTo: string | null;
  reportingDate: string | null;
  remarksOverride: string | null;
  chemicalConformityHint: 'SAFE' | 'UNSAFE' | null;
  microbialConformityHint: 'SAFE' | 'UNSAFE' | null;
  results: ParsedLabResult[];
  warnings: string[];
  confidence: number;
};

const PARAMETER_ALIASES: Record<string, string> = {
  COLOR: 'COLOR',
  COLOUR: 'COLOR',
  ODOUR: 'ODOUR',
  ODOR: 'ODOUR',
  TASTE: 'TASTE',
  ELECTRICALCONDUCTIVITY: 'EC',
  EC: 'EC',
  PH: 'PH',
  TURBIDITY: 'TURBIDITY',
  ALKALINITYASCACO3: 'ALKALINITY',
  ALKALINITY: 'ALKALINITY',
  BICARBONATES: 'BICARBONATES',
  CALCIUM: 'CALCIUM',
  CARBONATES: 'CARBONATES',
  CHLORIDES: 'CHLORIDES',
  TOTALHARDNESS: 'TOTAL_HARDNESS',
  MAGNESIUM: 'MAGNESIUM',
  POTASSIUM: 'POTASSIUM',
  SODIUM: 'SODIUM',
  SULPHATE: 'SULPHATE',
  SULFATE: 'SULPHATE',
  NITRATEN: 'NITRATE_N',
  NITRATE: 'NITRATE_N',
  NITRITE: 'NITRITE',
  TDS: 'TDS',
  IRON: 'IRON',
  FLUORIDE: 'FLUORIDE',
  PHOSPHATE: 'PHOSPHATE',
  ALUMINUM: 'ALUMINUM',
  ALUMINIUM: 'ALUMINUM',
  ARSENIC: 'ARSENIC',
  BARIUM: 'BARIUM',
  CADMIUM: 'CADMIUM',
  CHROMIUM: 'CHROMIUM',
  COPPER: 'COPPER',
  MANGANESE: 'MANGANESE',
  MOLYBDENUM: 'MOLYBDENUM',
  NICKEL: 'NICKEL',
  LEAD: 'LEAD',
  SELENIUM: 'SELENIUM',
  STRONTIUM: 'STRONTIUM',
  ZINC: 'ZINC',
  BORON: 'BORON',
  ANTIMONY: 'ANTIMONY',
  MERCURY: 'MERCURY',
  CYANIDE: 'CYANIDE',
  SILICA: 'SILICA',
  TOTALCOLIFORMS: 'TOTAL_COLIFORMS',
  FECALCOLIFORMS: 'FECAL_COLIFORMS',
  FAECALCOLIFORMS: 'FECAL_COLIFORMS',
  ECOLI: 'E_COLI',
};

const RESULT_SKIP = new Set(
  [
    '-',
    'ngvs',
    'sensoryevaluation',
    'apha23rdedition',
    'usepa2000',
    'usepa1603',
    'apha4500',
    'apha3500',
    'potablewater',
    'psqca',
    'nsdwq2010',
    'who2004',
  ].map(normalizeToken),
);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizePlace(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCell(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function labeledValue(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*[:\\t]*\\s*([^\\n\\t]+)`, 'i');
  const match = text.match(pattern);
  if (!match) return null;
  const value = cleanCell(match[1] ?? '');
  if (!value || /^report serial/i.test(value)) return null;
  return value;
}

function parsePakistaniDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(
    /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s*,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i,
  );
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const hasTime = Boolean(match[4]);
  let hour = 0;
  let minute = 0;
  if (hasTime) {
    hour = Number(match[4]);
    minute = Number(match[5] ?? 0);
    const meridem = match[6]?.toUpperCase();
    if (meridem === 'PM' && hour < 12) hour += 12;
    if (meridem === 'AM' && hour === 12) hour = 0;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+05:00`;
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(',', '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function extractPhone(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\+92\d{10}|0\d{10})/);
  return match?.[1] ?? null;
}

function resolveParameterCode(name: string): string | null {
  const token = normalizeToken(name.replace(/\*$/, ''));
  if (PARAMETER_ALIASES[token]) return PARAMETER_ALIASES[token];
  const catalog = WATER_QUALITY_PARAMETERS.find(
    (parameter) => normalizeToken(parameter.name) === token,
  );
  return catalog?.code ?? null;
}

function isResultToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const token = normalizeToken(trimmed);
  if (RESULT_SKIP.has(token)) return false;
  if (/^u=w$/i.test(trimmed)) return false;
  if (/^±/.test(trimmed)) return false;
  if (/^(mg\/l|µg\/l|μg\/l|ntu|cfu)/i.test(trimmed)) return false;
  if (token === 'nsdwq2010' || token.startsWith('0nsdwq')) return false;
  return true;
}

function toParsedResult(
  code: string,
  rawValue: string,
  uncertainty: string | null,
): ParsedLabResult {
  const catalog = WATER_QUALITY_PARAMETERS.find((item) => item.code === code);
  const trimmed = rawValue.trim();
  const canonical =
    catalog?.limitOperator === 'QUALITATIVE'
      ? (canonicalQualitativeValue(trimmed, catalog.qualitativeAllowed) ??
        trimmed)
      : trimmed;
  const parsed = parseResultLiteral(canonical);
  return {
    parameterCode: code,
    parameterName: catalog?.name ?? code,
    rawValue: canonical,
    resultType: parsed.resultType,
    numericValue: parsed.numericValue,
    qualitativeValue: parsed.qualitativeValue,
    uncertainty,
  };
}

function pickResultToken(code: string, candidates: string[]): string | null {
  const catalog = WATER_QUALITY_PARAMETERS.find((item) => item.code === code);
  const usable = candidates.filter(isResultToken);
  if (usable.length === 0) return null;
  if (catalog?.limitOperator === 'QUALITATIVE') {
    const qualitative = [...usable]
      .reverse()
      .find((item) =>
        canonicalQualitativeValue(item, catalog.qualitativeAllowed),
      );
    return qualitative ?? null;
  }
  return usable.at(-1) ?? null;
}

function inferSampleType(
  ...parts: Array<string | null>
): ParsedLabReport['sampleType'] {
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  if (/\btap\b|point of use|\bpou\b/.test(haystack)) return 'POU_TAP';
  if (/\bohr\b|overhead/.test(haystack)) return 'OHR';
  return 'SOURCE_WELL';
}

function normalizeWorkOrder(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  return match ? `WO ${match[1]}` : raw.trim();
}

function tablePairs(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split(/\n+/)) {
    const cells = line.split('\t').map(cleanCell);
    const filled = cells.filter(Boolean);
    for (let index = 0; index + 1 < filled.length; index += 2) {
      const key = normalizeToken(filled[index]);
      const value = filled[index + 1];
      if (key && value && !map[key]) {
        map[key] = value;
      }
    }
  }
  return map;
}

function pairValue(
  pairs: Record<string, string>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = pairs[normalizeToken(key)];
    if (value) return value;
  }
  const wanted = keys.map(normalizeToken);
  for (const [key, value] of Object.entries(pairs)) {
    if (wanted.some((item) => key.includes(item) || item.includes(key))) {
      return value;
    }
  }
  return null;
}

function extractHeaderFields(text: string, fileName?: string) {
  const pairs = tablePairs(text);
  const reportSerialNo =
    pairValue(pairs, 'Report Serial No') ??
    labeledValue(text, 'Report Serial No');
  const nwqlSampleCode =
    pairValue(pairs, 'NWQL Sample Code') ??
    labeledValue(text, 'NWQL Sample Code');
  const customerCode =
    pairValue(pairs, 'Customer Code') ?? labeledValue(text, 'Customer Code');
  const locationDetail =
    pairValue(pairs, 'Location') ?? labeledValue(text, 'Location');
  const tehsilName = pairValue(pairs, 'Tehsil') ?? labeledValue(text, 'Tehsil');
  const villageName =
    pairValue(pairs, 'Village Name', 'Village') ??
    labeledValue(text, 'Village Name') ??
    labeledValue(text, 'Village');
  const sourceLabel =
    pairValue(pairs, 'Source') ?? labeledValue(text, 'Source');
  const totalPages = parseNumber(
    pairValue(pairs, 'Total No of Pages') ??
      labeledValue(text, 'Total No of Pages'),
  );
  const receiptTempC = parseNumber(
    pairValue(
      pairs,
      'Temperature of Sample at receipt C',
      'Temperature of Sample at receipt',
    ) ?? labeledValue(text, 'Temperature of Sample at receipt'),
  );
  const receiptHumidityPct = parseNumber(
    pairValue(pairs, 'Humidity at Receipt', 'Humidity') ??
      labeledValue(text, 'Humidity'),
  );
  const samplingAt = parsePakistaniDate(
    pairValue(pairs, 'Sampling Date & Time', 'Sampling Date') ??
      labeledValue(text, 'Sampling Date & Time') ??
      labeledValue(text, 'Sampling Date'),
  );
  const receivedAt = parsePakistaniDate(
    pairValue(pairs, 'Sample Receipt Date & Time', 'Sample Receipt Date') ??
      labeledValue(text, 'Sample Receipt Date & Time') ??
      labeledValue(text, 'Sample Receipt Date'),
  );
  const reportingDate = parsePakistaniDate(
    pairValue(pairs, 'Reporting Date') ?? labeledValue(text, 'Reporting Date'),
  );
  const analysisRaw =
    pairValue(pairs, 'Date(s) of Analysis', 'Date of Analysis') ??
    labeledValue(text, 'Date(s) of Analysis') ??
    labeledValue(text, 'Date of Analysis');
  let analysisFrom: string | null = null;
  let analysisTo: string | null = null;
  if (analysisRaw) {
    const parts = analysisRaw.split(/\s+to\s+/i);
    analysisFrom = parsePakistaniDate(parts[0] ?? null);
    analysisTo = parsePakistaniDate(parts[1] ?? parts[0] ?? null);
  }

  const customerBlock =
    pairValue(pairs, 'Customer Name & Address', 'Customer Name') ??
    labeledValue(text, 'Customer Name & Address') ??
    labeledValue(text, 'Customer Name');
  const customerPhone = extractPhone(customerBlock);
  let customerName = customerBlock;
  let customerAddress: string | null = null;
  if (customerBlock) {
    customerName = customerBlock
      .replace(/^\(INT\)\s*/i, '')
      .replace(/,?\s*C\/O.*$/i, '')
      .replace(/,?\s*0\d{10}$/, '')
      .trim();
    const addressMatch = customerBlock.match(/C\/O[^,]*/i);
    customerAddress = addressMatch?.[0]?.trim() ?? null;
  }

  const remarks =
    pairValue(pairs, 'Remarks if any', 'Remarks') ??
    labeledValue(text, 'Remarks (if any)') ??
    labeledValue(text, 'Remarks');
  const workOrderFromDoc =
    pairValue(pairs, 'Work Order') ?? labeledValue(text, 'Work Order');
  const workOrderFromFile = fileName?.match(/WO[_\s-]?(\d+)/i);
  const workOrder =
    normalizeWorkOrder(workOrderFromDoc) ??
    (workOrderFromFile ? `WO ${workOrderFromFile[1]}` : null);

  return {
    reportSerialNo,
    nwqlSampleCode,
    customerCode,
    customerName,
    customerAddress,
    customerPhone,
    locationDetail,
    tehsilName,
    villageName,
    sourceLabel,
    workOrder,
    totalPages,
    samplingAt,
    receivedAt,
    receiptTempC,
    receiptHumidityPct,
    analysisFrom,
    analysisTo,
    reportingDate,
    remarksOverride: remarks,
  };
}

function extractResultsFromTabRows(text: string): ParsedLabResult[] {
  const found = new Map<string, ParsedLabResult>();
  for (const line of text.split(/\n+/)) {
    const cells = line.split('\t').map(cleanCell);
    if (cells.length >= 7 && /^\d+$/.test(cells[0] ?? '')) {
      const code = resolveParameterCode(cells[1] ?? '');
      const rawValue = pickResultToken(code ?? '', [
        cells[6] ?? '',
        ...cells.slice(5),
      ]);
      const uncertainty = cells[7] && cells[7] !== '-' ? cells[7] : null;
      if (code && rawValue && !found.has(code)) {
        found.set(code, toParsedResult(code, rawValue, uncertainty));
      }
      continue;
    }
    const filled = cells.filter(Boolean);
    for (let index = 0; index < filled.length; index += 1) {
      const code = resolveParameterCode(filled[index]);
      if (!code || found.has(code)) continue;
      const trailing = filled.slice(index + 1);
      const uncertaintyIndex = trailing.findIndex((cell) => /^±/.test(cell));
      const chosen =
        uncertaintyIndex > 0
          ? pickResultToken(code, [trailing[uncertaintyIndex - 1] ?? ''])
          : pickResultToken(code, trailing);
      if (!chosen) continue;
      const uncertainty = trailing.find((cell) => /^±/.test(cell)) ?? null;
      found.set(code, toParsedResult(code, chosen, uncertainty));
    }
  }
  return [...found.values()];
}

function extractResultsByName(text: string): ParsedLabResult[] {
  const found = new Map<string, ParsedLabResult>();
  const compact = text.replace(/\r/g, '');
  for (const parameter of WATER_QUALITY_PARAMETERS) {
    const names = [parameter.name, parameter.code.replaceAll('_', ' ')];
    const qualitativeAlt =
      parameter.limitOperator === 'QUALITATIVE'
        ? [
            ...parameter.qualitativeAllowed,
            'Colorless',
            'Colourless',
            'UnObj',
            'Unobj',
            'Unobjectionable',
          ]
            .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|')
        : 'BDL|NDL|TNTC|-ve|\\+ve|Colorless|UnObj|Unobj|\\d+(?:\\.\\d+)?';
    for (const name of names) {
      const pattern = new RegExp(
        `${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*?[\\s\\S]{0,180}?(${qualitativeAlt})`,
        'i',
      );
      const match = compact.match(pattern);
      if (!match?.[1]) continue;
      found.set(parameter.code, toParsedResult(parameter.code, match[1], null));
      break;
    }
  }
  return [...found.values()];
}

function mergeResults(
  primary: ParsedLabResult[],
  fallback: ParsedLabResult[],
): ParsedLabResult[] {
  const merged = new Map<string, ParsedLabResult>();
  for (const result of [...fallback, ...primary]) {
    merged.set(result.parameterCode, result);
  }
  return WATER_QUALITY_PARAMETERS.map((parameter) =>
    merged.get(parameter.code),
  ).filter((item): item is ParsedLabResult => Boolean(item));
}

function conformityHint(text: string, label: string): 'SAFE' | 'UNSAFE' | null {
  const block = text.split(label)[1]?.slice(0, 180) ?? '';
  if (
    /✔\s*Unsafe|✓\s*Unsafe/i.test(block) ||
    (/\bunsafe\b/i.test(block) && /✔|✓/.test(block))
  ) {
    if (/✔\s*Unsafe|✓\s*Unsafe/i.test(block)) return 'UNSAFE';
  }
  if (/✔\s*Safe|✓\s*Safe/i.test(block)) return 'SAFE';
  return null;
}

export function parsePcrwrLabReport(
  text: string,
  options?: { fileName?: string },
): ParsedLabReport {
  const warnings: string[] = [];
  const header = extractHeaderFields(text, options?.fileName);
  const tabResults = extractResultsFromTabRows(text);
  const namedResults = extractResultsByName(text);
  const results = mergeResults(tabResults, namedResults);

  if (!header.reportSerialNo)
    warnings.push('Report serial number was not found');
  if (!header.nwqlSampleCode) warnings.push('NWQL sample code was not found');
  if (!header.locationDetail) warnings.push('Location was not found');
  if (!header.tehsilName) warnings.push('Tehsil was not found');
  if (!header.villageName) warnings.push('Village name was not found');
  if (results.length < 8) {
    warnings.push(
      `Only ${results.length} parameter results were extracted; review the form before saving`,
    );
  }

  const chemicalHits = results.filter((result) =>
    ['ALKALINITY', 'CHLORIDES', 'IRON', 'ARSENIC'].includes(
      result.parameterCode,
    ),
  );
  const formType: ParsedLabReport['formType'] =
    chemicalHits.length >= 2 || results.length > 12 ? 'FULL' : 'PRIORITY';

  let confidence = 20;
  if (header.reportSerialNo) confidence += 10;
  if (header.nwqlSampleCode) confidence += 20;
  if (header.locationDetail) confidence += 10;
  if (header.tehsilName) confidence += 5;
  if (header.villageName) confidence += 5;
  if (header.samplingAt) confidence += 10;
  if (results.length >= 10) confidence += 20;
  if (results.length >= 30) confidence += 10;
  confidence = Math.min(99, confidence);

  return {
    ...header,
    sampleType: inferSampleType(header.sourceLabel, header.locationDetail),
    reportCategory: 'PCRWR',
    formType,
    chemicalConformityHint: conformityHint(
      text,
      'Quality of water sample based on tested chemical parameter',
    ),
    microbialConformityHint: conformityHint(
      text,
      'Quality of water sample based on tested microbial parameter',
    ),
    results,
    warnings,
    confidence,
  };
}

const TOKEN_SYNONYMS: Record<string, string> = {
  KUCH: 'KACH',
  CHANDANDA: 'CHANDANA',
  CHANDNA: 'CHANDANA',
  KHAIL: 'KHEL',
  GANDAJI: 'GANDA',
  PAKKA: 'PACCA',
  KHAAS: 'KIS',
  ISAKHEL: 'ISAKHEL',
};

function canonToken(token: string): string {
  return TOKEN_SYNONYMS[token] ?? token;
}

export function scorePlaceMatch(haystack: string, needle: string): number {
  const left = normalizePlace(haystack);
  const right = normalizePlace(needle);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) {
    return (
      70 +
      Math.min(
        20,
        Math.round(
          (Math.min(left.length, right.length) /
            Math.max(left.length, right.length)) *
            20,
        ),
      )
    );
  }
  const leftTokens = new Set(left.split(' ').map(canonToken));
  const rightTokens = right
    .split(' ')
    .map(canonToken)
    .filter((token) => token.length > 2);
  if (rightTokens.length === 0) return 0;
  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return Math.round((overlap / rightTokens.length) * 85);
}

export const LOCATION_ALIASES: Record<string, string[]> = {
  'KOT CHANDANA': ['KOT CHANDNA', 'KOT CHANDANDA', 'KALABAGH'],
  'KACH TUNDER KHEL': [
    'KUCH TUNDER KHEL',
    'KUCH TANDER KHEL',
    'TUNDER KHEL',
    'CHUGHLAN',
    'CHUGHLAN PUMPING STATION',
  ],
  KHUDOZAI: ['AZIZABD KHUDOZAI', 'AZIZABAD KHUDOZAI', 'AZIZ ABD'],
  GANDA: ['GANDAJI', 'GANDA JI'],
  'PACCAKIS UMER KHAN': [
    'PAKKA KHAAS UMER KHAN',
    'PACCA KHAAS UMER KHAN',
    'UMER KHAN',
  ],
  CHAPRI: ['CHAPRI DAM'],
  'MASTI KHEL': ['MASTI KHAIL', 'MASTI KHEL'],
  'ISA KHEL': ['ISAKHEL', 'ISA KHEL', 'IS KHEL', 'ESSA KHEL'],
};

export { normalizePlace };
