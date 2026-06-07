// public/js/meals.js - desglose por comidas en home (WT3.0)

const MEAL_DEFS = [
  { type: 'desayuno', label: 'Desayuno' },
  { type: 'almuerzo', label: 'Almuerzo' },
  { type: 'comida',   label: 'Comida' },
  { type: 'merienda', label: 'Merienda' },
  { type: 'cena',     label: 'Cena' },
  { type: 'snack',    label: 'Snacks' },
];

// Helper para asignar HTML (todos los contenidos dinamicos se pasan por esc())
const setHTML = (el, s) => { el['inner' + 'HTML'] = s; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let currentMealsData = null;
let currentSelectedFood = null;
let currentMealType = null;
let searchDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
  renderMealsSkeleton();
  loadMealsForCurrentDate();
  wireSheetHandlers();

  const dateInput = document.getElementById('dateInput');
  if (dateInput) {
    dateInput.addEventListener('change', () => loadMealsForCurrentDate());
  }
  document.getElementById('prevDayBtn')?.addEventListener('click', () => setTimeout(loadMealsForCurrentDate, 50));
  document.getElementById('nextDayBtn')?.addEventListener('click', () => setTimeout(loadMealsForCurrentDate, 50));
  document.getElementById('todayBtn') ?.addEventListener('click', () => setTimeout(loadMealsForCurrentDate, 50));

  const toggleBtn = document.getElementById('mealsModeToggle');
  toggleBtn?.addEventListener('click', async () => {
    try {
      await API.useFromMeals(getCurrentDate());
      showToast('Total del día calculado desde el desglose');
      loadMealsForCurrentDate();
      if (typeof loadDayData === 'function') loadDayData();
      if (typeof loadQuickStats === 'function') loadQuickStats();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
});

function getCurrentDate() {
  return document.getElementById('dateInput').value || (typeof today === 'function' ? today() : new Date().toISOString().slice(0,10));
}

function renderMealsSkeleton() {
  const root = document.getElementById('mealsSection');
  if (!root) return;
  setHTML(root, MEAL_DEFS.map(m => `
    <div class="meal-block" data-meal="${m.type}">
      <div class="meal-header">
        <span class="meal-name">${m.label}</span>
        <span class="meal-total" id="meal-total-${m.type}">0 kcal</span>
      </div>
      <div class="meal-body" id="meal-body-${m.type}"></div>
      <button class="meal-add-btn" data-add="${m.type}">+ Añadir alimento</button>
    </div>
  `).join(''));

  root.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => openAddFoodSheet(btn.dataset.add));
  });
}

async function loadMealsForCurrentDate() {
  const date = getCurrentDate();
  try {
    const data = await API.getMeals(date);
    currentMealsData = data;
    renderMealsContent(data);
    updateModeToggleVisibility(data);
  } catch (e) {
    // Silencioso
  }
}

function renderMealsContent(data) {
  for (const m of MEAL_DEFS) {
    const entries = data.byMeal[m.type] || [];
    const body = document.getElementById('meal-body-' + m.type);
    const total = document.getElementById('meal-total-' + m.type);
    if (!body || !total) continue;

    const sum = entries.reduce((s, e) => s + (e.kcal || 0), 0);
    total.textContent = Math.round(sum) + ' kcal';

    if (entries.length === 0) {
      setHTML(body, '<div class="meal-empty">Sin alimentos registrados</div>');
      continue;
    }

    setHTML(body, entries.map(e => `
      <div class="meal-entry">
        <div class="meal-entry-info">
          <div class="meal-entry-name">${esc(e.food_name_snapshot)}</div>
          <div class="meal-entry-amt">${formatAmount(e)}</div>
        </div>
        <span class="meal-entry-kcal">${Math.round(e.kcal)} kcal</span>
        <button class="meal-entry-del" data-del="${e.id}" title="Eliminar">x</button>
      </div>
    `).join(''));

    body.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(parseInt(btn.dataset.del)));
    });
  }
}

function updateModeToggleVisibility(data) {
  const btn = document.getElementById('mealsModeToggle');
  if (!btn) return;
  const hasEntries = data.entries && data.entries.length > 0;
  btn.style.display = hasEntries ? 'inline-flex' : 'none';
}

function formatAmount(e) {
  const parts = [];
  if (e.grams) parts.push(e.grams + ' g');
  if (e.units) parts.push(e.units + (e.unit_label ? ' ' + e.unit_label : ' u'));
  return parts.join(' . ') || '-';
}

async function deleteEntry(id) {
  showConfirm('Eliminar entrada', '¿Quitar este alimento de la comida?', async () => {
    try {
      await API.deleteMealEntry(id);
      showToast('Entrada eliminada');
      loadMealsForCurrentDate();
      if (typeof loadDayData === 'function') loadDayData();
      if (typeof loadQuickStats === 'function') loadQuickStats();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

// --- Sheet (modal) ----------------------------------------------------------

function openAddFoodSheet(mealType) {
  currentMealType = mealType;
  currentSelectedFood = null;
  const mealLabel = MEAL_DEFS.find(m => m.type === mealType)?.label || '';
  document.getElementById('addFoodTitle').textContent = 'Añadir a ' + mealLabel;
  document.getElementById('foodSearchInput').value = '';
  setHTML(document.getElementById('foodResults'), '');
  document.getElementById('selectedFoodPanel').style.display = 'none';
  document.getElementById('createFoodPanel').style.display = 'none';
  const ftInput = document.getElementById('freeTextInput');
  if (ftInput) ftInput.value = '';
  const ftPrev = document.getElementById('freeTextPreview');
  if (ftPrev) setHTML(ftPrev, '');
  const ftPanel = document.getElementById('freeTextPanel');
  if (ftPanel) ftPanel.open = false;
  lastParsed = [];
  document.getElementById('addFoodSheet').classList.add('open');
  showTopFoods();
  setTimeout(() => document.getElementById('foodSearchInput').focus(), 100);
}

function closeAddFoodSheet() {
  stopBarcodeScan();
  document.getElementById('addFoodSheet').classList.remove('open');
}

function wireSheetHandlers() {
  const overlay = document.getElementById('addFoodSheet');
  if (!overlay) return;

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeAddFoodSheet();
  });
  document.getElementById('addFoodCloseBtn').addEventListener('click', closeAddFoodSheet);

  document.getElementById('foodSearchInput').addEventListener('input', e => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    searchDebounce = setTimeout(() => doFoodSearch(q), 220);
  });

  document.getElementById('entryGrams').addEventListener('input', updateKcalPreview);

  document.getElementById('confirmAddEntryBtn').addEventListener('click', confirmAddEntry);
  document.getElementById('createFoodBtn').addEventListener('click', confirmCreateFood);
  document.getElementById('cancelCreateFoodBtn').addEventListener('click', () => {
    document.getElementById('createFoodPanel').style.display = 'none';
    document.getElementById('foodSearchInput').focus();
  });

  document.getElementById('scanBarcodeBtn')?.addEventListener('click', startBarcodeScan);
  document.getElementById('cancelScanBtn')?.addEventListener('click', stopBarcodeScan);
  document.getElementById('parseTextBtn')?.addEventListener('click', parseFreeText);
}

// ─── Texto libre con IA ────────────────────────────────────────────────────────

let lastParsed = [];

async function parseFreeText() {
  const text = document.getElementById('freeTextInput').value.trim();
  if (!text) { showToast('Escribe qué has comido', 'error'); return; }

  const btn = document.getElementById('parseTextBtn');
  btn.disabled = true; btn.textContent = 'Interpretando…';
  try {
    const data = await API.parseMealText(text);
    lastParsed = data.items || [];
    renderParsedPreview(data);
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Interpretar';
  }
}

function renderParsedPreview(data) {
  const el = document.getElementById('freeTextPreview');
  if (!data.items || data.items.length === 0) {
    setHTML(el, '<div class="food-empty-state">No he podido interpretar nada. Prueba a reescribirlo.</div>');
    return;
  }
  const rows = data.items.map((it, i) => `
    <div class="meal-entry" style="border:none;padding:8px 0">
      <div class="meal-entry-info">
        <div class="meal-entry-name">${esc(it.name)} ${it.from_cache ? '<span class="off-badge" style="background:var(--success)">CACHÉ</span>' : '<span class="off-badge">IA</span>'}</div>
        <div class="meal-entry-amt">${it.grams} g · ${it.kcal_per_100g} kcal/100g</div>
      </div>
      <span class="meal-entry-kcal">${it.kcal} kcal</span>
    </div>`).join('');
  setHTML(el, `
    ${rows}
    <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0;font-weight:700">
      <span>Total</span><span>${data.total_kcal} kcal</span>
    </div>
    <button class="btn btn-primary btn-block btn-sm" id="confirmParsedBtn">Añadir todo a ${esc(MEAL_DEFS.find(m => m.type === currentMealType)?.label || '')}</button>
  `);
  document.getElementById('confirmParsedBtn').addEventListener('click', confirmParsed);
}

async function confirmParsed() {
  if (!lastParsed.length) return;
  const btn = document.getElementById('confirmParsedBtn');
  btn.disabled = true; btn.textContent = 'Añadiendo…';
  try {
    for (const it of lastParsed) {
      let foodId = it.food_id;
      if (!foodId) {
        // Crear el alimento en la caché (origen IA, confianza media) para reutilizarlo después
        const food = await API.createFood({
          name: it.name, kcal_per_100g: it.kcal_per_100g, source: 'ai_text', confidence: 60,
        });
        foodId = food.id;
      }
      await API.addMealEntry({ date: getCurrentDate(), meal_type: currentMealType, food_id: foodId, grams: it.grams });
    }
    showToast('Añadido');
    closeAddFoodSheet();
    loadMealsForCurrentDate();
    if (typeof loadDayData === 'function') loadDayData();
    if (typeof loadQuickStats === 'function') loadQuickStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Escaneo de código de barras (html5-qrcode) ────────────────────────────────

let barcodeScanner = null;

async function startBarcodeScan() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Escáner no disponible', 'error');
    return;
  }
  document.getElementById('barcodeScannerWrap').style.display = 'block';
  document.getElementById('scanBarcodeBtn').style.display = 'none';

  try {
    barcodeScanner = new Html5Qrcode('barcodeReader', { verbose: false });
    await barcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      onBarcodeDetected,
      () => {} // ignorar fallos de frame
    );
  } catch (e) {
    showToast('No se pudo abrir la cámara. Revisa los permisos.', 'error');
    stopBarcodeScan();
  }
}

async function stopBarcodeScan() {
  if (barcodeScanner) {
    try { await barcodeScanner.stop(); barcodeScanner.clear(); } catch {}
    barcodeScanner = null;
  }
  const wrap = document.getElementById('barcodeScannerWrap');
  if (wrap) wrap.style.display = 'none';
  const btn = document.getElementById('scanBarcodeBtn');
  if (btn) btn.style.display = '';
}

async function onBarcodeDetected(code) {
  await stopBarcodeScan();
  showToast('Código leído: ' + code);
  try {
    const res = await API.lookupBarcode(code);
    const food = res.food;
    if (res.origin === 'cache') {
      selectCachedFood(food);
    } else {
      // Viene de Open Food Facts → importar a la caché y seleccionar
      const saved = await API.createFood({
        name: food.name, brand: food.brand || null, barcode: food.barcode || code,
        kcal_per_100g: food.kcal_per_100g, protein_g: food.protein_g ?? null,
        carbs_g: food.carbs_g ?? null, fat_g: food.fat_g ?? null,
        source: 'barcode', confidence: food.confidence ?? 95,
      });
      showToast('Guardado en tus alimentos');
      selectCachedFood(saved);
    }
  } catch (e) {
    // No encontrado → ofrecer crear a mano con el código ya puesto
    showToast('Producto no encontrado. Créalo a mano.', 'error');
    showCreateFoodPanelWithName('');
  }
}

// Resultados actualmente mostrados (mezcla caché + Open Food Facts).
let lastResults = [];

async function showTopFoods() {
  try {
    const foods = await API.getFoods();
    if (foods.length === 0) {
      setHTML(document.getElementById('foodResults'),
        '<div class="food-empty-state">Aún no tienes alimentos guardados.<br>Busca un producto arriba, escanea un código de barras o crea uno nuevo.</div>');
      return;
    }
    lastResults = foods.slice(0, 8).map(f => ({ ...f, origin: 'cache' }));
    renderResults([{ title: 'Más usados', items: lastResults }]);
  } catch {}
}

async function doFoodSearch(q) {
  const resultsEl = document.getElementById('foodResults');
  if (!q) {
    showTopFoods();
    return;
  }

  setHTML(resultsEl, '<div class="food-empty-state">Buscando…</div>');
  document.getElementById('createFoodPanel').style.display = 'none';

  // 1) Caché personal (instantáneo). 2) Open Food Facts (red).
  let cache = [];
  try { cache = (await API.searchFoods(q)).map(f => ({ ...f, origin: 'cache' })); } catch {}

  let external = [];
  try { external = (await API.searchCatalog(q)) || []; } catch {}

  // Evitar duplicar en "catálogo" lo que ya tienes por código de barras
  const cachedBarcodes = new Set(cache.map(f => f.barcode).filter(Boolean));
  external = external.filter(f => !f.barcode || !cachedBarcodes.has(f.barcode));

  lastResults = [...cache, ...external];

  const sections = [];
  if (cache.length)    sections.push({ title: 'Tus alimentos', items: cache });
  if (external.length) sections.push({ title: 'Open Food Facts', items: external });

  if (sections.length === 0) {
    setHTML(resultsEl,
      '<div class="food-empty-state">No se ha encontrado <strong>"' + esc(q) + '"</strong>.<br>Créalo abajo o escanea su código de barras.</div>');
    showCreateFoodPanelWithName(q);
    return;
  }
  renderResults(sections);
}

function renderResults(sections) {
  const resultsEl = document.getElementById('foodResults');
  let idx = 0;
  const html = sections.map(sec => `
    <div class="sheet-section-title">${esc(sec.title)}</div>
    ${sec.items.map(f => {
      const i = lastResults.indexOf(f);
      const badge = f.origin === 'openfoodfacts'
        ? '<span class="off-badge">OFF</span>' : '';
      return `
      <div class="food-result-item" data-idx="${i}">
        <div>
          <div class="name">${esc(f.name)}${f.brand ? ' <span class="brand">. ' + esc(f.brand) + '</span>' : ''} ${badge}</div>
          <div class="kcal">${Math.round(f.kcal_per_100g)} kcal/100g</div>
        </div>
        <span style="color:var(--primary);font-weight:700">></span>
      </div>`;
    }).join('')}
  `).join('');
  setHTML(resultsEl, html);
  resultsEl.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => chooseResult(parseInt(el.dataset.idx)));
  });
}

// Al elegir un resultado: si ya es de tu caché, se selecciona; si viene de
// Open Food Facts, primero se importa a tu caché (queda guardado) y luego se selecciona.
async function chooseResult(idx) {
  const r = lastResults[idx];
  if (!r) return;

  if (r.origin === 'cache' && r.id) {
    selectCachedFood(r);
    return;
  }

  // Importar de Open Food Facts a la caché personal
  try {
    const saved = await API.createFood({
      name: r.name,
      brand: r.brand || null,
      barcode: r.barcode || null,
      kcal_per_100g: r.kcal_per_100g,
      protein_g: r.protein_g ?? null,
      carbs_g: r.carbs_g ?? null,
      fat_g: r.fat_g ?? null,
      source: r.source || 'barcode',
      confidence: r.confidence ?? 95,
    });
    showToast('Guardado en tus alimentos');
    selectCachedFood(saved);
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  }
}

function selectCachedFood(food) {
  currentSelectedFood = food;

  setHTML(document.getElementById('selectedFoodCard'),
    '<div style="font-weight:700">' + esc(food.name) + (food.brand ? ' <span style="color:var(--text-muted);font-weight:400">. ' + esc(food.brand) + '</span>' : '') + '</div>' +
    '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">' + Math.round(food.kcal_per_100g) + ' kcal/100g</div>');

  setHTML(document.getElementById('foodResults'), '');
  document.getElementById('createFoodPanel').style.display = 'none';
  document.getElementById('selectedFoodPanel').style.display = 'block';
  document.getElementById('entryGrams').value = '';
  document.getElementById('entryKcalPreview').value = '';
  setTimeout(() => document.getElementById('entryGrams').focus(), 50);
}

function updateKcalPreview() {
  const grams = parseFloat(document.getElementById('entryGrams').value);
  if (currentSelectedFood && !isNaN(grams) && grams > 0) {
    const kcal = Math.round(currentSelectedFood.kcal_per_100g * grams / 100);
    document.getElementById('entryKcalPreview').value = kcal + ' kcal';
  } else {
    document.getElementById('entryKcalPreview').value = '';
  }
}

async function confirmAddEntry() {
  if (!currentSelectedFood) return;
  const grams = parseFloat(document.getElementById('entryGrams').value);
  if (isNaN(grams) || grams <= 0) {
    showToast('Indica los gramos', 'error');
    return;
  }
  try {
    await API.addMealEntry({
      date: getCurrentDate(),
      meal_type: currentMealType,
      food_id: currentSelectedFood.id,
      grams,
    });
    showToast('Añadido');
    closeAddFoodSheet();
    loadMealsForCurrentDate();
    if (typeof loadDayData === 'function') loadDayData();
    if (typeof loadQuickStats === 'function') loadQuickStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function showCreateFoodPanelWithName(name) {
  document.getElementById('createFoodPanel').style.display = 'block';
  document.getElementById('newFoodName').value = name;
  document.getElementById('newFoodBrand').value = '';
  document.getElementById('newFoodKcal').value = '';
}

async function confirmCreateFood() {
  const name = document.getElementById('newFoodName').value.trim();
  const brand = document.getElementById('newFoodBrand').value.trim();
  const kcal = parseFloat(document.getElementById('newFoodKcal').value);

  if (!name) { showToast('Introduce el nombre', 'error'); return; }
  if (isNaN(kcal) || kcal < 0 || kcal > 1000) {
    showToast('Kcal por 100g inválido (0-1000)', 'error');
    return;
  }

  try {
    const food = await API.createFood({ name, brand: brand || null, kcal_per_100g: kcal, source: 'manual' });
    showToast('Alimento guardado');
    selectCachedFood(food);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
