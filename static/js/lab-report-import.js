/**
 * Import PCRWR NWQL lab reports (.pdf / .docx) or OCR from images into add_water_test form fields.
 * Mirrors SourceCode report-entry-form import + applyParsed behaviour.
 */
(function () {
  const PARAM_TO_FIELD = {
    COLOR: { name: 'color', type: 'select' },
    ODOUR: { name: 'odour', type: 'select' },
    TASTE: { name: 'taste', type: 'select' },
    EC: { name: 'electrical_conductivity', type: 'input' },
    PH: { id: 'phInput', type: 'input' },
    TURBIDITY: { id: 'turbidityInput', type: 'input' },
    ALKALINITY: { name: 'alkalinity_caco3', type: 'input' },
    BICARBONATES: { name: 'bicarbonates', type: 'input' },
    CALCIUM: { name: 'calcium', type: 'input' },
    CARBONATES: { name: 'carbonates', type: 'input' },
    CHLORIDES: { id: 'chloridesInput', type: 'input' },
    TOTAL_HARDNESS: { id: 'totalHardnessInput', type: 'input' },
    MAGNESIUM: { name: 'magnesium', type: 'input' },
    POTASSIUM: { name: 'potassium', type: 'input' },
    SODIUM: { name: 'sodium', type: 'input' },
    SULPHATE: { name: 'sulphate', type: 'input' },
    NITRATE_N: { id: 'nitrateInput', type: 'input' },
    NITRITE: { id: 'nitriteInput', type: 'input' },
    TDS: { id: 'tds19Input', type: 'input' },
    IRON: { id: 'ironInput', type: 'input' },
    FLUORIDE: { id: 'fluorideInput', type: 'input' },
    PHOSPHATE: { name: 'phosphate', type: 'input' },
    ALUMINUM: { name: 'aluminum', type: 'input' },
    ARSENIC: { name: 'arsenic', type: 'input' },
    BARIUM: { name: 'barium', type: 'input' },
    CADMIUM: { name: 'cadmium', type: 'input' },
    CHROMIUM: { name: 'chromium', type: 'input' },
    COPPER: { name: 'copper', type: 'input' },
    MANGANESE: { name: 'manganese', type: 'input' },
    MOLYBDENUM: { name: 'molybdenum', type: 'input' },
    NICKEL: { name: 'nickel', type: 'input' },
    LEAD: { name: 'lead', type: 'input' },
    SELENIUM: { name: 'selenium', type: 'input' },
    STRONTIUM: { name: 'strontium', type: 'input' },
    ZINC: { name: 'zinc', type: 'input' },
    BORON: { name: 'boron', type: 'input' },
    ANTIMONY: { name: 'antimony', type: 'input' },
    MERCURY: { name: 'mercury', type: 'input' },
    CYANIDE: { name: 'cyanide', type: 'input' },
    SILICA: { name: 'silica', type: 'input' },
    TOTAL_COLIFORMS: { id: 'total_coliforms_input', type: 'input' },
    FECAL_COLIFORMS: { name: 'fecal_coliforms', type: 'input' },
    E_COLI: { id: 'e_coli_input', type: 'input' },
  };

  const SAMPLE_TYPE_MAP = {
    SOURCE_WELL: 'source_well',
    POU_TAP: 'pou_tap',
    OHR: 'ohr',
  };

  function isoToFormDateTime(iso, withTime) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const dd = pad(d.getDate());
    const mm = pad(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    if (!withTime) return `${dd}/${mm}/${yyyy}`;
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  function setInputValue(idOrName, value, byId) {
    if (value === null || value === undefined || value === '') return;
    const el = byId
      ? document.getElementById(idOrName)
      : document.querySelector(`[name="${idOrName}"]`);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function normalizePlace(s) {
    return (s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scorePlaceMatch(haystack, needle) {
    const left = normalizePlace(haystack);
    const right = normalizePlace(needle);
    if (!left || !right) return 0;
    if (left === right) return 100;
    if (left.includes(right) || right.includes(left)) return 75;
    const lt = new Set(left.split(' '));
    const rt = right.split(' ').filter((t) => t.length > 2);
    if (!rt.length) return 0;
    const overlap = rt.filter((t) => lt.has(t)).length;
    return Math.round((overlap / rt.length) * 85);
  }

  function pickSelectOption(selectEl, hint) {
    if (!selectEl || !hint) return;
    let best = null;
    let bestScore = 0;
    for (const opt of selectEl.options) {
      if (!opt.value) continue;
      const score = scorePlaceMatch(opt.text, hint);
      if (score > bestScore) {
        bestScore = score;
        best = opt;
      }
    }
    if (best && bestScore >= 50) {
      selectEl.value = best.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function resultDisplayValue(result) {
    if (result.qualitativeValue) return String(result.qualitativeValue);
    if (result.numericValue != null) return String(result.numericValue);
    return result.rawValue || '';
  }

  function applyParameterResult(code, result) {
    const mapping = PARAM_TO_FIELD[code];
    if (!mapping) return;
    const display = resultDisplayValue(result);
    if (!display) return;

    if (result.resultType === 'TNTC') {
      const fieldBase = mapping.name || mapping.id?.replace(/_input$/, '').replace(/Input$/, '');
      const tntc = document.getElementById(`${fieldBase}_tntc`);
      if (tntc) {
        tntc.checked = true;
        tntc.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    if (mapping.type === 'select') {
      const sel = document.querySelector(`select[name="${mapping.name}"]`);
      if (!sel) return;
      const lower = display.toLowerCase();
      for (const opt of sel.options) {
        if (opt.value && opt.value.toLowerCase() === lower) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
      if (/colorless|colourless|non-objectionable|unobj|unobjectionable/i.test(display)) {
        setInputValue(mapping.name, 'non-objectionable', false);
      } else if (/objectionable/i.test(display)) {
        setInputValue(mapping.name, 'objectionable', false);
      }
      return;
    }

    if (mapping.id) setInputValue(mapping.id, display, true);
    else setInputValue(mapping.name, display, false);
  }

  function applyParsedToForm(parsed) {
    // Only switch priority/full when import runs — never required for manual entry.
    if (typeof window.selectFormType === 'function' && parsed.formType) {
      const target = parsed.formType === 'FULL' ? 'full' : 'priority';
      window.selectFormType(target);
    }
    const importSection = document.getElementById('labReportImportSection');
    if (importSection) importSection.open = true;

    setInputValue('reportSerialNo', parsed.reportSerialNo, true);
    setInputValue('nwqlSampleCode', parsed.nwqlSampleCode, true);
    setInputValue('customerCode', parsed.customerCode, true);
    if (parsed.customerName) setInputValue('customerName', parsed.customerName, true);
    setInputValue('workOrderNo', parsed.workOrder, true);
    setInputValue('location', parsed.locationDetail, true);
    if (parsed.receiptTempC != null) setInputValue('temperatureSample', String(parsed.receiptTempC), true);
    if (parsed.receiptHumidityPct != null) setInputValue('humidity', String(parsed.receiptHumidityPct), true);
    if (parsed.totalPages != null) setInputValue('totalSamples', String(parsed.totalPages), true);

    setInputValue('samplingDate', isoToFormDateTime(parsed.samplingAt, true), true);
    setInputValue('sampleReceiptDate', isoToFormDateTime(parsed.receivedAt, true), true);
    setInputValue('analysisDateFrom', isoToFormDateTime(parsed.analysisFrom, false), true);
    setInputValue('analysisDateTo', isoToFormDateTime(parsed.analysisTo, false), true);
    setInputValue('reportingDate', isoToFormDateTime(parsed.reportingDate, false), true);

    const sampleType = SAMPLE_TYPE_MAP[parsed.sampleType] || 'source_well';
    const sampleSel = document.getElementById('sampleType');
    if (sampleSel) {
      sampleSel.value = sampleType;
      sampleSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const tehsilSel = document.getElementById('tehsil');
    const villageSel = document.getElementById('village');
    const settlementSel = document.getElementById('settlement');
    if (tehsilSel && parsed.tehsilName) {
      pickSelectOption(tehsilSel, parsed.tehsilName);
      if (window.LocationCascade && villageSel) {
        window.LocationCascade.populateVillages(tehsilSel, villageSel, settlementSel, null);
        pickSelectOption(villageSel, parsed.villageName);
        if (settlementSel && villageSel.value) {
          window.LocationCascade.populateSettlements(tehsilSel, villageSel, settlementSel, null);
        }
      } else {
        pickSelectOption(villageSel, parsed.villageName);
      }
    }

    (parsed.results || []).forEach((r) => applyParameterResult(r.parameterCode, r));

    const summaryEl = document.getElementById('labImportSummary');
    if (summaryEl) {
      const loc = [parsed.tehsilName, parsed.villageName].filter(Boolean).join(' / ');
      summaryEl.textContent = `${parsed.sourceFileName || 'Report'} · ${(parsed.results || []).length} parameters · ${parsed.confidence || 0}% confidence${loc ? ' · ' + loc : ''}`;
      summaryEl.style.display = 'block';
    }

    const warnEl = document.getElementById('labImportWarnings');
    if (warnEl && parsed.warnings && parsed.warnings.length) {
      warnEl.innerHTML = parsed.warnings.map((w) => `<li>${w}</li>`).join('');
      warnEl.style.display = 'block';
    } else if (warnEl) {
      warnEl.style.display = 'none';
    }
  }

  async function parseViaApi(body, isJson) {
    const opts = { method: 'POST', credentials: 'same-origin' };
    if (isJson) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
      const res = await fetch('/api/lab-report/parse-text', opts);
      return res.json();
    }
    const fd = new FormData();
    fd.append('file', body);
    opts.body = fd;
    const res = await fetch('/api/lab-report/parse', opts);
    return res.json();
  }

  function setImportLoading(active, message, progressPercent) {
    const loader = document.getElementById('labImportLoader');
    const dropContent = document.getElementById('labImportDropContent');
    const drop = document.getElementById('labReportDropZone');
    const loaderText = document.getElementById('labImportLoaderText');
    const progressBar = document.getElementById('labImportProgressBar');
    const hint = document.getElementById('labImportLoaderHint');

    if (drop) {
      drop.dataset.busy = active ? '1' : '0';
    }
    if (loader) {
      loader.hidden = !active;
      loader.setAttribute('aria-busy', active ? 'true' : 'false');
    }
    if (dropContent) {
      dropContent.hidden = active;
    }
    if (loaderText && message) {
      loaderText.textContent = message;
    }
    if (hint) {
      hint.hidden = !active;
    }
    if (progressBar) {
      if (active && typeof progressPercent === 'number' && progressPercent >= 0) {
        progressBar.classList.add('determinate');
        progressBar.style.width = `${Math.min(100, progressPercent)}%`;
        progressBar.style.transform = 'none';
        progressBar.style.animation = 'none';
      } else if (active) {
        progressBar.classList.remove('determinate');
        progressBar.style.width = '';
        progressBar.style.transform = '';
        progressBar.style.animation = '';
      }
    }
  }

  async function ocrImageFile(file) {
    if (typeof Tesseract === 'undefined') {
      throw new Error('OCR library still loading. Try again in a moment.');
    }
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (info) => {
        if (info.status === 'recognizing text' && typeof info.progress === 'number') {
          const pct = Math.round(info.progress * 100);
          setImportLoading(true, `Running OCR on image… ${pct}%`, pct);
        } else if (info.status === 'loading language traineddata') {
          setImportLoading(true, 'Loading OCR engine…');
        }
      },
    });
    return result.data.text || '';
  }

  function setImportState(state, message) {
    const status = document.getElementById('labImportStatus');
    if (!status) return;
    status.dataset.state = state;
    status.textContent = message || '';
    if (state === 'loading') {
      setImportLoading(true, message || 'Processing document…');
    } else {
      setImportLoading(false);
    }
  }

  async function onLabImportFile(file) {
    if (!file) return;
    setImportState('loading', 'Reading document…');
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    try {
      let payload;
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
        setImportState('loading', 'Running OCR on image…');
        const text = await ocrImageFile(file);
        setImportLoading(true, 'Parsing extracted text…');
        payload = await parseViaApi({ text, fileName: file.name }, true);
      } else if (ext === 'pdf') {
        setImportState('loading', 'Reading PDF…');
        setImportLoading(true, 'Reading PDF… (OCR runs if this is a scan)');
        payload = await parseViaApi(file, false);
      } else {
        setImportState('loading', 'Reading document…');
        payload = await parseViaApi(file, false);
      }
      if (!payload.success) {
        throw new Error(payload.message || 'Import failed');
      }
      applyParsedToForm(payload.data);
      setImportState('done', 'Suggestions applied — edit any field manually, then save or submit.');
    } catch (err) {
      console.error(err);
      setImportState('error', err.message || 'Could not import report');
    }
  }

  function initLabReportImport() {
    const input = document.getElementById('labReportFileInput');
    const drop = document.getElementById('labReportDropZone');
    if (!input || !drop) return;

    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (file) void onLabImportFile(file);
      input.value = '';
    });

    drop.addEventListener('click', function () {
      if (drop.dataset.busy === '1') return;
      input.click();
    });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    ['dragenter', 'dragover'].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add('lab-import-drag');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove('lab-import-drag');
      });
    });
    drop.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) void onLabImportFile(file);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLabReportImport);
  } else {
    initLabReportImport();
  }

  window.applyLabReportParsed = applyParsedToForm;
})();
