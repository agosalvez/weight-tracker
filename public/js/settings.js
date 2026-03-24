document.addEventListener('DOMContentLoaded', () => {
  ['sex','age','heightCm','activityLevel'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateBMRPreview);
    document.getElementById(id)?.addEventListener('input',  updateBMRPreview);
  });

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  initLocationSearch();
  loadSettings();
});

// ─── Cargar ajustes ──────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const s = await API.getSettings();
    if (!s) return;

    setVal('userName',      s.name);
    setVal('sex',           s.sex);
    setVal('age',           s.age);
    setVal('heightCm',      s.height_cm);
    setVal('targetWeight',  s.target_weight_kg);
    setVal('activityLevel', s.activity_level || 'sedentary');
    setVal('manualTDEE',    s.estimated_tdee);

    if (s.aemet_municipality_id && s.aemet_municipality_name) {
      document.getElementById('locationId').value     = s.aemet_municipality_id;
      document.getElementById('locationSearch').value = s.aemet_municipality_name;
    }

    updateBMRDisplay(s.estimated_bmr, s.estimated_tdee);
  } catch (e) {
    showToast('Error al cargar ajustes', 'error');
  }
}

// ─── Guardar ajustes ─────────────────────────────────────────────────────────

async function saveSettings() {
  const locationId   = document.getElementById('locationId').value   || null;
  const locationName = document.getElementById('locationSearch').value.trim() || null;

  const data = {
    name:                   getVal('userName'),
    sex:                    getVal('sex') || null,
    age:                    getVal('age') ? parseInt(getVal('age')) : null,
    height_cm:              getVal('heightCm') ? parseFloat(getVal('heightCm')) : null,
    target_weight_kg:       getVal('targetWeight') ? parseFloat(getVal('targetWeight')) : null,
    activity_level:         getVal('activityLevel') || 'sedentary',
    estimated_tdee:         getVal('manualTDEE') ? parseFloat(getVal('manualTDEE')) : null,
    aemet_municipality_id:  locationId,
    aemet_municipality_name: locationName,
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;

  try {
    const saved = await API.saveSettings(data);
    showToast('Ajustes guardados');
    updateBMRDisplay(saved.estimated_bmr, saved.estimated_tdee);
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── Preview BMR/TDEE ─────────────────────────────────────────────────────────

function updateBMRPreview() {
  const sex    = getVal('sex');
  const age    = parseInt(getVal('age'));
  const height = parseFloat(getVal('heightCm'));

  if (!sex || !age || !height) {
    hideBMRBox();
    return;
  }

  // Necesita peso → usar el del campo objetivo o dejarlo a la API
  // Mostrar solo que se calculará al guardar
  document.getElementById('bmrNote').textContent = 'Se calculará automáticamente al guardar (usa el último peso registrado).';
  document.getElementById('bmrBox').classList.remove('hidden');
}

function updateBMRDisplay(bmr, tdee) {
  if (!bmr && !tdee) { hideBMRBox(); return; }

  document.getElementById('bmrNote').textContent = '';
  document.getElementById('bmrBox').classList.remove('hidden');

  const bmrRow  = document.getElementById('bmrRow');
  const tdeeRow = document.getElementById('tdeeRow');

  if (bmr)  { bmrRow.classList.remove('hidden');  document.getElementById('bmrValue').textContent  = Math.round(bmr)  + ' kcal'; }
  if (tdee) { tdeeRow.classList.remove('hidden'); document.getElementById('tdeeValue').textContent = Math.round(tdee) + ' kcal'; }
}

function hideBMRBox() {
  document.getElementById('bmrBox').classList.add('hidden');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVal(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val != null ? val : '';
}

// ─── Buscador de localidad AEMET ──────────────────────────────────────────────

function initLocationSearch() {
  const input    = document.getElementById('locationSearch');
  const dropdown = document.getElementById('locationDropdown');
  const hiddenId = document.getElementById('locationId');

  let debounceTimer;

  input.addEventListener('input', () => {
    hiddenId.value = ''; // limpiar selección al escribir
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    debounceTimer = setTimeout(() => searchMunicipality(q), 300);
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  async function searchMunicipality(q) {
    try {
      const results = await API._fetch(`/api/weather/municipalities?q=${encodeURIComponent(q)}`);
      if (!results.length) { dropdown.style.display = 'none'; return; }

      dropdown.innerHTML = results.map(r =>
        `<div data-id="${r.id}" data-name="${r.name}" style="padding:10px 14px;cursor:pointer;font-size:0.88rem;border-bottom:1px solid var(--border)">${r.name}</div>`
      ).join('');

      dropdown.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'var(--bg)');
        el.addEventListener('mouseleave', () => el.style.background = '');
        el.addEventListener('click', () => {
          hiddenId.value = el.dataset.id;
          input.value    = el.dataset.name;
          dropdown.style.display = 'none';
        });
      });

      dropdown.style.display = 'block';
    } catch {
      dropdown.style.display = 'none';
    }
  }
}
