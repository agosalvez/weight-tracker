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
  document.getElementById('addFoodSheet').classList.add('open');
  showTopFoods();
  setTimeout(() => document.getElementById('foodSearchInput').focus(), 100);
}

function closeAddFoodSheet() {
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
}

async function showTopFoods() {
  try {
    const foods = await API.getFoods();
    if (foods.length === 0) {
      setHTML(document.getElementById('foodResults'),
        '<div class="food-empty-state">Aún no tienes alimentos guardados.<br>Empieza creando uno nuevo.</div>');
      showCreateFoodPanelWithName('');
      return;
    }
    renderFoodList(foods.slice(0, 8), 'Más usados');
  } catch {}
}

async function doFoodSearch(q) {
  const resultsEl = document.getElementById('foodResults');
  if (!q) {
    showTopFoods();
    return;
  }
  try {
    const results = await API.searchFoods(q);
    if (results.length === 0) {
      setHTML(resultsEl,
        '<div class="food-empty-state"><strong>"' + esc(q) + '"</strong> no está en tu caché.<br>Créalo abajo y se guardará para la próxima vez.</div>');
      showCreateFoodPanelWithName(q);
    } else {
      renderFoodList(results, 'Coincidencias');
      document.getElementById('createFoodPanel').style.display = 'none';
    }
  } catch (e) {
    showToast('Error buscando: ' + e.message, 'error');
  }
}

function renderFoodList(foods, sectionTitle) {
  const resultsEl = document.getElementById('foodResults');
  setHTML(resultsEl, `
    <div class="sheet-section-title">${esc(sectionTitle)}</div>
    ${foods.map(f => `
      <div class="food-result-item" data-id="${f.id}">
        <div>
          <div class="name">${esc(f.name)}${f.brand ? ' <span class="brand">. ' + esc(f.brand) + '</span>' : ''}</div>
          <div class="kcal">${Math.round(f.kcal_per_100g)} kcal/100g</div>
        </div>
        <span style="color:var(--primary);font-weight:700">></span>
      </div>
    `).join('')}
  `);
  resultsEl.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => selectFood(parseInt(el.dataset.id), foods));
  });
}

function selectFood(id, foods) {
  const food = foods.find(f => f.id === id);
  if (!food) return;
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
    selectFood(food.id, [food]);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}
