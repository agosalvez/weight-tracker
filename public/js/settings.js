document.addEventListener('DOMContentLoaded', () => {
  // Recalcular BMR/TDEE al cambiar campos relevantes
  ['sex','age','heightCm','activityLevel'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateBMRPreview);
    document.getElementById(id)?.addEventListener('input',  updateBMRPreview);
  });

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
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

    updateBMRDisplay(s.estimated_bmr, s.estimated_tdee);
  } catch (e) {
    showToast('Error al cargar ajustes', 'error');
  }
}

// ─── Guardar ajustes ─────────────────────────────────────────────────────────

async function saveSettings() {
  const data = {
    name:             getVal('userName'),
    sex:              getVal('sex') || null,
    age:              getVal('age') ? parseInt(getVal('age')) : null,
    height_cm:        getVal('heightCm') ? parseFloat(getVal('heightCm')) : null,
    target_weight_kg: getVal('targetWeight') ? parseFloat(getVal('targetWeight')) : null,
    activity_level:   getVal('activityLevel') || 'sedentary',
    estimated_tdee:   getVal('manualTDEE') ? parseFloat(getVal('manualTDEE')) : null,
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
