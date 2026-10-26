"""
PCRWR NWQL lab report text extraction and field parsing.
Ported from SourceCode/backend/src/domain/water-quality (lab-document-extractor + pcrwr-report-parser).
"""

from __future__ import annotations

import re
import zipfile
from io import BytesIO
from typing import Any, Optional

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore


class LabDocumentExtractionError(Exception):
    pass


PARAMETER_ALIASES = {
    'COLOR': 'COLOR',
    'COLOUR': 'COLOR',
    'ODOUR': 'ODOUR',
    'ODOR': 'ODOUR',
    'TASTE': 'TASTE',
    'ELECTRICALCONDUCTIVITY': 'EC',
    'EC': 'EC',
    'PH': 'PH',
    'TURBIDITY': 'TURBIDITY',
    'ALKALINITYASCACO3': 'ALKALINITY',
    'ALKALINITY': 'ALKALINITY',
    'BICARBONATES': 'BICARBONATES',
    'CALCIUM': 'CALCIUM',
    'CARBONATES': 'CARBONATES',
    'CHLORIDES': 'CHLORIDES',
    'TOTALHARDNESS': 'TOTAL_HARDNESS',
    'MAGNESIUM': 'MAGNESIUM',
    'POTASSIUM': 'POTASSIUM',
    'SODIUM': 'SODIUM',
    'SULPHATE': 'SULPHATE',
    'SULFATE': 'SULPHATE',
    'NITRATEN': 'NITRATE_N',
    'NITRATE': 'NITRATE_N',
    'NITRITE': 'NITRITE',
    'TDS': 'TDS',
    'IRON': 'IRON',
    'FLUORIDE': 'FLUORIDE',
    'PHOSPHATE': 'PHOSPHATE',
    'ALUMINUM': 'ALUMINUM',
    'ALUMINIUM': 'ALUMINUM',
    'ARSENIC': 'ARSENIC',
    'BARIUM': 'BARIUM',
    'CADMIUM': 'CADMIUM',
    'CHROMIUM': 'CHROMIUM',
    'COPPER': 'COPPER',
    'MANGANESE': 'MANGANESE',
    'MOLYBDENUM': 'MOLYBDENUM',
    'NICKEL': 'NICKEL',
    'LEAD': 'LEAD',
    'SELENIUM': 'SELENIUM',
    'STRONTIUM': 'STRONTIUM',
    'ZINC': 'ZINC',
    'BORON': 'BORON',
    'ANTIMONY': 'ANTIMONY',
    'MERCURY': 'MERCURY',
    'CYANIDE': 'CYANIDE',
    'SILICA': 'SILICA',
    'TOTALCOLIFORMS': 'TOTAL_COLIFORMS',
    'FECALCOLIFORMS': 'FECAL_COLIFORMS',
    'FAECALCOLIFORMS': 'FECAL_COLIFORMS',
    'ECOLI': 'E_COLI',
}

WATER_QUALITY_PARAMETERS = [
    {'code': 'COLOR', 'name': 'Color', 'limit_operator': 'QUALITATIVE', 'qualitative_allowed': ['Colorless', 'colourless']},
    {'code': 'ODOUR', 'name': 'Odour', 'limit_operator': 'QUALITATIVE', 'qualitative_allowed': ['Unobjectionable', 'UnObj', 'Unobj']},
    {'code': 'TASTE', 'name': 'Taste', 'limit_operator': 'QUALITATIVE', 'qualitative_allowed': ['Unobjectionable', 'UnObj', 'Unobj']},
    {'code': 'EC', 'name': 'Electrical Conductivity', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'PH', 'name': 'pH', 'limit_operator': 'RANGE', 'qualitative_allowed': []},
    {'code': 'TURBIDITY', 'name': 'Turbidity', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'ALKALINITY', 'name': 'Alkalinity as CaCO3', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'BICARBONATES', 'name': 'Bicarbonates', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'CALCIUM', 'name': 'Calcium', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'CARBONATES', 'name': 'Carbonates', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'CHLORIDES', 'name': 'Chlorides', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'TOTAL_HARDNESS', 'name': 'Total Hardness', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'MAGNESIUM', 'name': 'Magnesium', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'POTASSIUM', 'name': 'Potassium', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'SODIUM', 'name': 'Sodium', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'SULPHATE', 'name': 'Sulphate', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'NITRATE_N', 'name': 'Nitrate-N', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'NITRITE', 'name': 'Nitrite', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'TDS', 'name': 'TDS', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'IRON', 'name': 'Iron', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'FLUORIDE', 'name': 'Fluoride', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'PHOSPHATE', 'name': 'Phosphate', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'ALUMINUM', 'name': 'Aluminum', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'ARSENIC', 'name': 'Arsenic', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'BARIUM', 'name': 'Barium', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'CADMIUM', 'name': 'Cadmium', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'CHROMIUM', 'name': 'Chromium', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'COPPER', 'name': 'Copper', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'MANGANESE', 'name': 'Manganese', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'MOLYBDENUM', 'name': 'Molybdenum', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'NICKEL', 'name': 'Nickel', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'LEAD', 'name': 'Lead', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'SELENIUM', 'name': 'Selenium', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'STRONTIUM', 'name': 'Strontium', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'ZINC', 'name': 'Zinc', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'BORON', 'name': 'Boron', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'ANTIMONY', 'name': 'Antimony', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'MERCURY', 'name': 'Mercury', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'CYANIDE', 'name': 'Cyanide', 'limit_operator': 'MAX_INCLUSIVE', 'qualitative_allowed': []},
    {'code': 'SILICA', 'name': 'Silica', 'limit_operator': 'NONE', 'qualitative_allowed': []},
    {'code': 'TOTAL_COLIFORMS', 'name': 'Total Coliforms', 'limit_operator': 'EQUALS_ZERO', 'qualitative_allowed': []},
    {'code': 'FECAL_COLIFORMS', 'name': 'Fecal Coliforms', 'limit_operator': 'EQUALS_ZERO', 'qualitative_allowed': []},
    {'code': 'E_COLI', 'name': 'E. coli', 'limit_operator': 'EQUALS_ZERO', 'qualitative_allowed': []},
]

RESULT_SKIP = {
    'ngvs', 'sensoryevaluation', 'apha23rdedition', 'usepa2000', 'usepa1603',
    'apha4500', 'apha3500', 'potablewater', 'psqca', 'nsdwq2010', 'who2004',
}


def normalize_token(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', value.lower())


def clean_cell(value: str) -> str:
    return re.sub(r'\s+', ' ', value).strip()


def labeled_value(text: str, label: str) -> Optional[str]:
    escaped = re.escape(label)
    match = re.search(rf'{escaped}\s*[:\t]*\s*([^\n\t]+)', text, re.I)
    if not match:
        return None
    value = clean_cell(match.group(1))
    if not value or re.search(r'^report serial', value, re.I):
        return None
    return value


def parse_pakistani_date(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    match = re.search(
        r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s*,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?',
        raw,
        re.I,
    )
    if not match:
        return None
    day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if year < 100:
        year += 2000
    hour, minute = 0, 0
    if match.group(4):
        hour = int(match.group(4))
        minute = int(match.group(5) or 0)
        mer = (match.group(6) or '').upper()
        if mer == 'PM' and hour < 12:
            hour += 12
        if mer == 'AM' and hour == 12:
            hour = 0
    pad = lambda n: str(n).zfill(2)
    return f'{year}-{pad(month)}-{pad(day)}T{pad(hour)}:{pad(minute)}:00+05:00'


def parse_number(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    match = re.search(r'-?\d+(?:\.\d+)?', raw.replace(',', ''))
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def parse_result_literal(raw: str) -> dict[str, Any]:
    trimmed = raw.strip()
    token = normalize_token(trimmed)
    bdl = {'bdl', 'ndl', 'nd', 'nil', 'notdetected', 'belowdetectionlimit'}
    if token in bdl:
        return {'resultType': 'BDL', 'numericValue': None, 'qualitativeValue': 'BDL'}
    if token in {'tntc'} or trimmed.upper() == 'TNTC':
        return {'resultType': 'TNTC', 'numericValue': None, 'qualitativeValue': 'TNTC'}
    if trimmed in ('-ve', '-Ve') or token in {'negative', 'neg'}:
        return {'resultType': 'NEGATIVE', 'numericValue': 0, 'qualitativeValue': '-ve'}
    try:
        num = float(trimmed.replace(',', ''))
        return {'resultType': 'NUMERIC', 'numericValue': num, 'qualitativeValue': None}
    except ValueError:
        pass
    return {'resultType': 'QUALITATIVE', 'numericValue': None, 'qualitativeValue': trimmed}


def resolve_parameter_code(name: str) -> Optional[str]:
    token = normalize_token(name.rstrip('*'))
    if token in PARAMETER_ALIASES:
        return PARAMETER_ALIASES[token]
    for param in WATER_QUALITY_PARAMETERS:
        if normalize_token(param['name']) == token:
            return param['code']
    return None


def is_result_token(value: str) -> bool:
    trimmed = value.strip()
    if not trimmed:
        return False
    token = normalize_token(trimmed)
    if token in RESULT_SKIP or token.startswith('0nsdwq'):
        return False
    if re.match(r'^u=w$', trimmed, re.I):
        return False
    if trimmed.startswith('±'):
        return False
    if re.match(r'^(mg/l|µg/l|μg/l|ntu|cfu)', trimmed, re.I):
        return False
    return True


def table_pairs(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.split('\n'):
        cells = [clean_cell(c) for c in line.split('\t')]
        filled = [c for c in cells if c]
        for i in range(0, len(filled) - 1, 2):
            key = normalize_token(filled[i])
            val = filled[i + 1]
            if key and val and key not in result:
                result[key] = val
    return result


def pair_value(pairs: dict[str, str], *keys: str) -> Optional[str]:
    for key in keys:
        val = pairs.get(normalize_token(key))
        if val:
            return val
    wanted = [normalize_token(k) for k in keys]
    for key, val in pairs.items():
        if any(w in key or key in w for w in wanted):
            return val
    return None


def extract_header_fields(text: str, file_name: Optional[str] = None) -> dict[str, Any]:
    pairs = table_pairs(text)
    analysis_raw = (
        pair_value(pairs, 'Date(s) of Analysis', 'Date of Analysis')
        or labeled_value(text, 'Date(s) of Analysis')
        or labeled_value(text, 'Date of Analysis')
    )
    analysis_from, analysis_to = None, None
    if analysis_raw:
        parts = re.split(r'\s+to\s+', analysis_raw, flags=re.I)
        analysis_from = parse_pakistani_date(parts[0] if parts else None)
        analysis_to = parse_pakistani_date(parts[1] if len(parts) > 1 else parts[0])

    customer_block = (
        pair_value(pairs, 'Customer Name & Address', 'Customer Name')
        or labeled_value(text, 'Customer Name & Address')
        or labeled_value(text, 'Customer Name')
    )
    customer_name = customer_block
    if customer_block:
        customer_name = re.sub(r',?\s*0\d{10}$', '', customer_block)
        customer_name = re.sub(r',?\s*C/O.*$', '', customer_name, flags=re.I)
        customer_name = re.sub(r'^\(INT\)\s*', '', customer_name, flags=re.I).strip()

    source_raw = pair_value(pairs, 'Source') or labeled_value(text, 'Source')
    source_label = source_raw if source_raw and len(source_raw) <= 80 and not re.search(
        r'www\.|https?:|ministry|pcrwr\.gov', source_raw, re.I
    ) else None

    work_order_doc = pair_value(pairs, 'Work Order') or labeled_value(text, 'Work Order')
    work_order = None
    if work_order_doc:
        m = re.search(r'(\d+)', work_order_doc)
        work_order = f'WO {m.group(1)}' if m else work_order_doc.strip()
    elif file_name:
        m = re.search(r'WO[_\s-]?(\d+)', file_name, re.I)
        if m:
            work_order = f'WO {m.group(1)}'

    header = {
        'reportSerialNo': pair_value(pairs, 'Report Serial No') or labeled_value(text, 'Report Serial No'),
        'nwqlSampleCode': pair_value(pairs, 'NWQL Sample Code') or labeled_value(text, 'NWQL Sample Code'),
        'customerCode': pair_value(pairs, 'Customer Code') or labeled_value(text, 'Customer Code'),
        'customerName': customer_name,
        'locationDetail': pair_value(pairs, 'Location') or labeled_value(text, 'Location'),
        'tehsilName': pair_value(pairs, 'Tehsil') or labeled_value(text, 'Tehsil'),
        'villageName': (
            pair_value(pairs, 'Village Name', 'Village')
            or labeled_value(text, 'Village Name')
            or labeled_value(text, 'Village')
        ),
        'sourceLabel': source_label,
        'workOrder': work_order,
        'totalPages': parse_number(
            pair_value(pairs, 'Total No of Pages') or labeled_value(text, 'Total No of Pages')
        ),
        'samplingAt': parse_pakistani_date(
            pair_value(pairs, 'Sampling Date & Time', 'Sampling Date')
            or labeled_value(text, 'Sampling Date & Time')
            or labeled_value(text, 'Sampling Date')
        ),
        'receivedAt': parse_pakistani_date(
            pair_value(pairs, 'Sample Receipt Date & Time', 'Sample Receipt Date')
            or labeled_value(text, 'Sample Receipt Date & Time')
            or labeled_value(text, 'Sample Receipt Date')
        ),
        'receiptTempC': parse_number(
            pair_value(pairs, 'Temperature of Sample at receipt C', 'Temperature of Sample at receipt')
            or labeled_value(text, 'Temperature of Sample at receipt')
        ),
        'receiptHumidityPct': parse_number(
            pair_value(pairs, 'Humidity at Receipt', 'Humidity') or labeled_value(text, 'Humidity')
        ),
        'analysisFrom': analysis_from,
        'analysisTo': analysis_to,
        'reportingDate': parse_pakistani_date(
            pair_value(pairs, 'Reporting Date') or labeled_value(text, 'Reporting Date')
        ),
        'remarksOverride': (
            pair_value(pairs, 'Remarks if any', 'Remarks')
            or labeled_value(text, 'Remarks (if any)')
            or labeled_value(text, 'Remarks')
        ),
    }
    _supplement_header_from_ocr_text(text, header)
    return header



def _header_value_looks_wrong(field: str, value: Optional[str]) -> bool:
    if not value:
        return True
    lower = value.lower()
    junk = ('customer', 'address', 'temperature', 'receipt', 'sampling', 'report serial')
    if any(j in lower for j in junk):
        return True
    if field == 'reportSerialNo':
        return not re.match(r'^AR-[\d-]+$', value.strip(), re.I)
    if field == 'nwqlSampleCode':
        return not re.match(r'^MCL-[\d-]+$', value.strip(), re.I)
    return False


def _supplement_header_from_ocr_text(text: str, header: dict[str, Any]) -> None:
    """Fill header gaps when OCR breaks table layout (common on scanned NWQL PDFs)."""
    if _header_value_looks_wrong('reportSerialNo', header.get('reportSerialNo')):
        match = re.search(r'\b(AR-\d[\d-]*)\b', text, re.I)
        if match:
            header['reportSerialNo'] = match.group(1).upper()
    if _header_value_looks_wrong('nwqlSampleCode', header.get('nwqlSampleCode')):
        match = re.search(r'\b(MCL-\d+-\d+)\b', text, re.I)
        if match:
            header['nwqlSampleCode'] = match.group(1).upper()
    if not header.get('customerCode'):
        match = re.search(r'Customer Code\s*[\n:\t]*([A-Z0-9-]+)', text, re.I)
        if match:
            header['customerCode'] = match.group(1).strip()
    name = header.get('customerName') or ''
    if len(name) < 15 or 'customer name' in name.lower():
        match = re.search(r'(PRMSC[^\n]{10,120})', text, re.I)
        if match:
            header['customerName'] = clean_cell(match.group(1))
    if header.get('receiptTempC') is None:
        match = re.search(
            r'Temperature of Sample at receipt[^\d]*(\d{1,2}(?:\.\d+)?)',
            text,
            re.I,
        )
        if match:
            header['receiptTempC'] = float(match.group(1))
    if not header.get('samplingAt'):
        match = re.search(
            r'Sampling Date[^\d]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}[^,\n]*)',
            text,
            re.I,
        )
        if match:
            header['samplingAt'] = parse_pakistani_date(match.group(1))


def to_parsed_result(code: str, raw_value: str, uncertainty: Optional[str]) -> dict[str, Any]:
    catalog = next((p for p in WATER_QUALITY_PARAMETERS if p['code'] == code), None)
    trimmed = raw_value.strip()
    parsed = parse_result_literal(trimmed)
    return {
        'parameterCode': code,
        'parameterName': catalog['name'] if catalog else code,
        'rawValue': trimmed,
        **parsed,
        'uncertainty': uncertainty,
    }


def pick_result_token(code: str, candidates: list[str]) -> Optional[str]:
    usable = [c for c in candidates if is_result_token(c)]
    if not usable:
        return None
    return usable[-1]


def extract_results_from_tab_rows(text: str) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for line in text.split('\n'):
        cells = [clean_cell(c) for c in line.split('\t')]
        if len(cells) >= 7 and re.match(r'^\d+$', cells[0] or ''):
            code = resolve_parameter_code(cells[1] or '')
            raw = pick_result_token(code or '', [cells[6] or ''] + cells[5:])
            unc = cells[7] if len(cells) > 7 and cells[7] != '-' else None
            if code and raw and code not in found:
                found[code] = to_parsed_result(code, raw, unc)
            continue
        filled = [c for c in cells if c]
        for idx, cell in enumerate(filled):
            code = resolve_parameter_code(cell)
            if not code or code in found:
                continue
            trailing = filled[idx + 1:]
            chosen = pick_result_token(code, trailing)
            if not chosen:
                continue
            unc = next((t for t in trailing if t.startswith('±')), None)
            found[code] = to_parsed_result(code, chosen, unc)
    return list(found.values())


def extract_results_by_name(text: str) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    compact = text.replace('\r', '')
    for param in WATER_QUALITY_PARAMETERS:
        names = [param['name'], param['code'].replace('_', ' ')]
        qual_alt = (
            '|'.join(re.escape(x) for x in param['qualitative_allowed'] + ['Colorless', 'UnObj', 'Unobj', 'Unobjectionable'])
            if param['limit_operator'] == 'QUALITATIVE'
            else r'BDL|NDL|TNTC|-ve|\+ve|Colorless|UnObj|Unobj|\d+(?:\.\d+)?'
        )
        for name in names:
            pattern = rf'{re.escape(name)}\*?[\s\S]{{0,180}}?({qual_alt})'
            match = re.search(pattern, compact, re.I)
            if match and match.group(1):
                found[param['code']] = to_parsed_result(param['code'], match.group(1), None)
                break
    return list(found.values())


def merge_results(primary: list[dict], fallback: list[dict]) -> list[dict]:
    merged = {r['parameterCode']: r for r in fallback}
    merged.update({r['parameterCode']: r for r in primary})
    return [merged[p['code']] for p in WATER_QUALITY_PARAMETERS if p['code'] in merged]


def parse_pcrwr_lab_report(text: str, file_name: Optional[str] = None) -> dict[str, Any]:
    warnings: list[str] = []
    header = extract_header_fields(text, file_name)
    results = merge_results(
        extract_results_from_tab_rows(text),
        extract_results_by_name(text),
    )

    if not header.get('reportSerialNo'):
        warnings.append('Report serial number was not found')
    if not header.get('nwqlSampleCode'):
        warnings.append('NWQL sample code was not found')
    if not header.get('locationDetail'):
        warnings.append('Location was not found')
    if not header.get('tehsilName'):
        warnings.append('Tehsil was not found')
    if not header.get('villageName'):
        warnings.append('Village name was not found')
    if len(results) < 8:
        warnings.append(
            f'Only {len(results)} parameter results were extracted; review the form before saving'
        )

    chemical_hits = [r for r in results if r['parameterCode'] in ('ALKALINITY', 'CHLORIDES', 'IRON', 'ARSENIC')]
    form_type = 'FULL' if len(chemical_hits) >= 2 or len(results) > 12 else 'PRIORITY'

    haystack = ' '.join(filter(None, [header.get('sourceLabel'), header.get('locationDetail')])).lower()
    if re.search(r'\btap\b|point of use|\bpou\b', haystack):
        sample_type = 'POU_TAP'
    elif re.search(r'\bohr\b|overhead', haystack):
        sample_type = 'OHR'
    else:
        sample_type = 'SOURCE_WELL'

    confidence = 20
    if header.get('reportSerialNo'):
        confidence += 10
    if header.get('nwqlSampleCode'):
        confidence += 20
    if header.get('locationDetail'):
        confidence += 10
    if header.get('tehsilName'):
        confidence += 5
    if header.get('villageName'):
        confidence += 5
    if header.get('samplingAt'):
        confidence += 10
    if len(results) >= 10:
        confidence += 20
    if len(results) >= 30:
        confidence += 10
    confidence = min(99, confidence)

    return {
        **header,
        'sampleType': sample_type,
        'reportCategory': 'PCRWR',
        'formType': form_type,
        'results': results,
        'warnings': warnings,
        'confidence': confidence,
    }


def _decode_xml_entities(value: str) -> str:
    return (
        value.replace('&amp;', '&')
        .replace('&lt;', '<')
        .replace('&gt;', '>')
        .replace('&quot;', '"')
        .replace('&#39;', "'")
    )


def _cell_text(cell_xml: str) -> str:
    parts = re.findall(r'<w:t(?:\s[^>]*)?>([^<]*)</w:t>', cell_xml)
    return clean_cell(''.join(_decode_xml_entities(p) for p in parts))


def extract_docx_text(buffer: bytes) -> str:
    if buffer[:2] != b'PK':
        raise LabDocumentExtractionError('The Word file is not a valid .docx archive')
    with zipfile.ZipFile(BytesIO(buffer)) as zf:
        try:
            xml = zf.read('word/document.xml').decode('utf-8')
        except KeyError as exc:
            raise LabDocumentExtractionError('The Word file has no document.xml') from exc

    tables: list[str] = []
    for table_xml in re.findall(r'<w:tbl\b[\s\S]*?</w:tbl>', xml):
        rows = []
        for row_xml in re.findall(r'<w:tr\b[\s\S]*?</w:tr>', table_xml):
            cells = [_cell_text(m.group(0)) for m in re.finditer(r'<w:tc\b[\s\S]*?</w:tc>', row_xml)]
            rows.append('\t'.join(cells))
        tables.append('\n'.join(rows))
    paragraphs = '\n'.join(
        _cell_text(m.group(0)) for m in re.finditer(r'<w:p\b[\s\S]*?</w:p>', xml)
    )
    return f"{chr(10).join(tables)}\n\n{paragraphs}"


def extract_pdf_text(buffer: bytes) -> str:
    if PdfReader is None:
        raise LabDocumentExtractionError('PDF support is not installed (pip install pypdf)')
    if buffer[:4] != b'%PDF':
        raise LabDocumentExtractionError('The file is not a valid PDF')
    reader = PdfReader(BytesIO(buffer))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or '')
    return '\n'.join(parts)


_MIN_PDF_TEXT_CHARS = 80


def ocr_pdf_bytes(buffer: bytes, max_pages: int = 20, dpi: int = 200) -> str:
    """OCR for image-only (scanned) PDFs using Poppler + Tesseract."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
    except ImportError as exc:
        raise LabDocumentExtractionError(
            'This PDF appears to be scanned. Install OCR support: pip install pdf2image pytesseract, '
            'and ensure Poppler (pdftoppm) and Tesseract are on the server PATH.'
        ) from exc

    try:
        images = convert_from_bytes(buffer, first_page=1, last_page=max_pages, dpi=dpi)
    except Exception as exc:
        raise LabDocumentExtractionError(
            'Could not render PDF pages for OCR. Install Poppler (pdftoppm) on the server.'
        ) from exc

    if not images:
        return ''

    texts: list[str] = []
    for image in images:
        texts.append(pytesseract.image_to_string(image))
    return '\n\n'.join(texts)


def extract_lab_document_text(
    buffer: bytes,
    file_name: str,
    mime_type: Optional[str] = None,
) -> tuple[str, bool]:
    ext = (file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else '')
    mime = (mime_type or '').lower()
    if ext == 'doc' and not file_name.lower().endswith('.docx'):
        raise LabDocumentExtractionError(
            'Legacy .doc files are not supported. Save the NWQL report as .docx or PDF.'
        )
    if ext == 'docx' or 'wordprocessingml' in mime:
        return extract_docx_text(buffer), False
    if ext == 'pdf' or mime == 'application/pdf' or buffer[:4] == b'%PDF':
        text = extract_pdf_text(buffer)
        if len(text.strip()) >= _MIN_PDF_TEXT_CHARS:
            return text, False
        ocr_text = ocr_pdf_bytes(buffer)
        if ocr_text.strip():
            return ocr_text, True
        raise LabDocumentExtractionError(
            'No text could be read from this PDF (scanned image). '
            'Try a clearer scan or upload page photos instead.'
        )
    raise LabDocumentExtractionError('Upload a PCRWR NWQL test report as .docx or .pdf')


def parse_lab_document_file(buffer: bytes, file_name: str, mime_type: Optional[str] = None) -> dict[str, Any]:
    text, used_ocr = extract_lab_document_text(buffer, file_name, mime_type)
    if not text.strip():
        raise LabDocumentExtractionError('No text could be read from the document')
    report = parse_pcrwr_lab_report(text, file_name)
    if used_ocr:
        report['warnings'] = [
            'Scanned PDF — fields were read with OCR. Please verify all values before saving.',
            *report.get('warnings', []),
        ]
    return {
        'sourceFileName': file_name,
        'textLength': len(text),
        'usedOcr': used_ocr,
        **report,
    }


def parse_lab_document_text(text: str, file_name: str = 'ocr.txt') -> dict[str, Any]:
    if not text.strip():
        raise LabDocumentExtractionError('No text to parse')
    report = parse_pcrwr_lab_report(text, file_name)
    return {
        'sourceFileName': file_name,
        'textLength': len(text),
        **report,
    }
