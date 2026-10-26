/**
 * LocationCascade – Shared automatic Tehsil → Village → Settlement cascade
 * Works in both add_water_test.html (form) and dashboard.html (filters).
 *
 * Usage:
 *   LocationCascade.init({
 *     tehsilId:     'tehsil',          // <select> id for Tehsil
 *     villageId:    'village',         // <select> id for Village
 *     settlementId: 'settlement',      // <select> id for Settlement (optional)
 *     allLabel:     null,              // set to 'ALL' for dashboard filters
 *     onTehsilChange:    null,         // optional callback after tehsil changes
 *     onVillageChange:   null,         // optional callback after village changes
 *   });
 *
 * Data sources (use whichever is available on the page):
 *   window.villageData          – { TEHSIL: ['village', ...] }
 *   window.settlementData       – { TEHSIL: { village: ['settlement', ...] } }
 *   window.dashboardVillageData / window.dashboardSettlementData  (dashboard fallbacks)
 */
window.LocationCascade = (function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────── */
  function getVillageSource() {
    return window.villageData || window.dashboardVillageData || {};
  }
  function getSettlementSource() {
    return window.settlementData || window.dashboardSettlementData || {};
  }

  function clearAndAdd(select, items, allLabel) {
    const firstOption = allLabel
      ? `<option value="ALL">${allLabel}</option>`
      : `<option value="">-- Select --</option>`;
    select.innerHTML = firstOption;
    items.forEach(function (item) {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
  }

  /* ── search box injector ──────────────────────────────── */
  function injectSearchBox(selectEl, placeholder) {
    if (!selectEl || selectEl.parentElement.querySelector('.lc-search')) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder || 'Type to search…';
    input.className = 'lc-search';
    input.style.cssText =
      'width:100%;padding:8px 10px;margin-bottom:4px;border:1.5px solid #c0ccda;' +
      'border-radius:6px;font-size:14px;box-sizing:border-box;outline:none;' +
      'transition:border-color .2s;';

    input.addEventListener('focus', function () { this.style.borderColor = '#1e3c72'; });
    input.addEventListener('blur',  function () { this.style.borderColor = '#c0ccda'; });

    input.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      Array.from(selectEl.options).forEach(function (opt) {
        if (opt.value === '' || opt.value === 'ALL') return; // keep placeholder
        opt.style.display = opt.text.toLowerCase().includes(q) ? '' : 'none';
      });
      // Auto-select first visible match
      const first = Array.from(selectEl.options).find(
        function (o) { return o.style.display !== 'none' && o.value && o.value !== 'ALL'; }
      );
      if (first && q.length > 0) selectEl.value = first.value;
    });

    selectEl.parentElement.insertBefore(input, selectEl);
  }

  /* ── core population functions ────────────────────────── */
  function populateTehsil(tehsilSelect, allLabel) {
    if (!tehsilSelect) return;
    const data   = getVillageSource();
    const tehsils = Object.keys(data).sort();
    const first   = allLabel ? `<option value="ALL">ALL Tehsils</option>`
                             : `<option value="">-- Select Tehsil --</option>`;
    tehsilSelect.innerHTML = first;
    tehsils.forEach(function (t) {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      tehsilSelect.appendChild(opt);
    });
  }

  function populateVillages(tehsilSelect, villageSelect, settlementSelect, allLabel) {
    if (!tehsilSelect || !villageSelect) return;
    const tehsil  = tehsilSelect.value;
    const data    = getVillageSource();
    const villages = (tehsil && tehsil !== 'ALL' && data[tehsil])
      ? [...data[tehsil]].sort() : [];

    clearAndAdd(villageSelect, villages, allLabel ? 'ALL Villages' : null);
    if (settlementSelect) clearAndAdd(settlementSelect, [], allLabel ? 'ALL Settlements' : null);

    // reset search boxes
    const vSearch = villageSelect.parentElement.querySelector('.lc-search');
    if (vSearch) vSearch.value = '';
    if (settlementSelect) {
      const sSearch = settlementSelect.parentElement.querySelector('.lc-search');
      if (sSearch) sSearch.value = '';
    }
    // restore all options visibility
    Array.from(villageSelect.options).forEach(function (o) { o.style.display = ''; });
  }

  function populateSettlements(tehsilSelect, villageSelect, settlementSelect, allLabel) {
    if (!tehsilSelect || !villageSelect || !settlementSelect) return;
    const tehsil  = tehsilSelect.value;
    const village = villageSelect.value;
    const data    = getSettlementSource();
    const settlements =
      (tehsil && tehsil !== 'ALL' && village && village !== 'ALL' &&
       data[tehsil] && data[tehsil][village])
        ? [...data[tehsil][village]] : [];

    clearAndAdd(settlementSelect, settlements, allLabel ? 'ALL Settlements' : null);
    const sSearch = settlementSelect.parentElement.querySelector('.lc-search');
    if (sSearch) sSearch.value = '';
    Array.from(settlementSelect.options).forEach(function (o) { o.style.display = ''; });
  }

  /* ── public API ───────────────────────────────────────── */
  function init(cfg) {
    const tehsilEl     = document.getElementById(cfg.tehsilId);
    const villageEl    = document.getElementById(cfg.villageId);
    const settlementEl = cfg.settlementId ? document.getElementById(cfg.settlementId) : null;
    const allLabel     = cfg.allLabel || null;

    if (!tehsilEl || !villageEl) {
      console.warn('[LocationCascade] Required elements not found:', cfg);
      return;
    }

    // Populate tehsil and inject search on village / settlement
    populateTehsil(tehsilEl, allLabel);
    injectSearchBox(villageEl,    'Search village…');
    if (settlementEl) injectSearchBox(settlementEl, 'Search settlement…');

    // Tehsil change → fill villages
    tehsilEl.addEventListener('change', function () {
      populateVillages(tehsilEl, villageEl, settlementEl, allLabel);
      if (typeof cfg.onTehsilChange === 'function') cfg.onTehsilChange();
    });

    // Village change → fill settlements
    villageEl.addEventListener('change', function () {
      populateSettlements(tehsilEl, villageEl, settlementEl, allLabel);
      if (typeof cfg.onVillageChange === 'function') cfg.onVillageChange();
    });

    console.log('[LocationCascade] Initialised for', cfg.tehsilId, '→', cfg.villageId,
      settlementEl ? '→ ' + cfg.settlementId : '');
  }

  // Expose individual helpers for pages that still call them by name
  return {
    init:                init,
    populateTehsil:      populateTehsil,
    populateVillages:    populateVillages,
    populateSettlements: populateSettlements,
  };
}());
