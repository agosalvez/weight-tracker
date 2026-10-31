let currentDate = today();
let optionalOpen = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('dateInput');
  dateInput.value = currentDate;
  dateInput.max   = today();

  dateInput.addEventListener('change', () => {
    currentDate = dateInput.value;
    loadDayData();
    loadQuickStats();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    currentDate = today();
    dateInput.value = currentDate;
    loadDayData();
  });

  document.getElementById('prevDayBtn').addEventListener('click', () => changeDay(-1));
  document.getElementById('nextDayBtn').addEventListener('click', () => changeDay(+1));
  document.getElementById('nextDayBtn').style.opacity = '0.3'; // empieza en hoy

  document.getElementById('toggleOptBtn').addEventListener('click', toggleOptional);
  document.getElementById('saveBtn').addEventListener('click', saveLog);

  // Autosum kcal breakdown → total
  ['kcalBreakfast','kcalLunch','kcalDinner','kcalSnacks'].forEach(id => {
    document.getElementById(id).addEventListener('input', autosumKcal);
  });

  loadDayData();
  loadQuickStats();
});

// ─── Cargar día ───────────────────────────────────────────────────────────────

async function loadDayData() {
  try {
    const log = await API.getLog(currentDate);
    if (log) {
      fillForm(log);
      showDaySummary(log);
    } else {
      clearForm();
      hideDaySummary();
    }
  } catch (e) {
    clearForm();
    hideDaySummary();
  }
}

function fillForm(log) {
  setVal('weightInput',   log.weight_kg);
  setVal('kcalTotal',     log.kcal_total);
  setVal('kcalBreakfast', log.kcal_breakfast);
  setVal('kcalLunch',     log.kcal_lunch);
  setVal('kcalDinner',    log.kcal_dinner);
  setVal('kcalSnacks',    log.kcal_snacks);
  setVal('kcalActivity',  log.kcal_activity);
  document.getElementById('notes').value = log.notes || '';

  // Si hay desglose, abrir opcionales
  if (log.kcal_breakfast || log.kcal_lunch || log.kcal_dinner || log.kcal_snacks || log.kcal_activity || log.notes) {
    openOptional();
  }
}

function clearForm() {
  ['weightInput','kcalTotal','kcalBreakfast','kcalLunch','kcalDinner','kcalSnacks','kcalActivity'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('notes').value = '';
}

function setVal(id, val) {
  document.getElementById(id).value = val != null ? val : '';
}

// ─── Resumen del día ──────────────────────────────────────────────────────────

function showDaySummary(log) {
  const el = document.getElementById('daySummary');
  const parts = [];
  if (log.weight_kg != null)   parts.push(`Peso: <strong>${parseFloat(log.weight_kg.toFixed(1))} kg</strong>`);
  if (log.kcal_total != null)  parts.push(`Kcal: <strong>${Math.round(log.kcal_total)}</strong>`);
  if (log.kcal_activity != null) parts.push(`Ejercicio: <strong>${Math.round(log.kcal_activity)} kcal</strong>`);
  el.innerHTML = parts.length ? `Ya registrado hoy — ${parts.join(' · ')}` : 'Ya tienes un registro para este día.';
  el.classList.remove('hidden');
}

function hideDaySummary() {
  document.getElementById('daySummary').classList.add('hidden');
}

// ─── Quick stats ──────────────────────────────────────────────────────────────

async function loadQuickStats() {
  try {
    const s = await API.getSummary();

    setText('statLastWeight', s.current_weight != null ? s.current_weight.toFixed(1) : '—');
    setText('statAvg7', s.avg_7d != null ? s.avg_7d.toFixed(1) : '—');

    const diffEl = document.getElementById('statDiff');
    const diffCard = document.getElementById('statDiffCard');
    if (s.weekly_change != null) {
      const sign = s.weekly_change > 0 ? '+' : '';
      diffEl.textContent = sign + s.weekly_change.toFixed(1);
      diffCard.className = 'stat-card ' + (s.weekly_change < 0 ? 'down' : s.weekly_change > 0 ? 'up' : '');
    } else {
      diffEl.textContent = '—';
    }
  } catch (e) {
    // Silencioso si no hay datos
  }
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

async function saveLog() {
  const weightVal = parseFloat(document.getElementById('weightInput').value);
  const kcalVal   = parseNumber('kcalTotal');

  // Peso es obligatorio solo si se rellena
  if (document.getElementById('weightInput').value && (isNaN(weightVal) || weightVal < 30 || weightVal > 300)) {
    showToast('Peso fuera de rango (30–300 kg)', 'error');
    return;
  }

  if (!document.getElementById('weightInput').value && !kcalVal) {
    showToast('Introduce al menos el peso o las kcal', 'error');
    return;
  }

  const data = {
    date:          currentDate,
    weight_kg:     document.getElementById('weightInput').value ? weightVal : null,
    kcal_total:    kcalVal,
    kcal_breakfast: parseNumber('kcalBreakfast'),
    kcal_lunch:    parseNumber('kcalLunch'),
    kcal_dinner:   parseNumber('kcalDinner'),
    kcal_snacks:   parseNumber('kcalSnacks'),
    kcal_activity: parseNumber('kcalActivity'),
    notes:         document.getElementById('notes').value.trim() || null,
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    await API.saveLog(data);
    showToast('Guardado correctamente');
    loadDayData();
    loadQuickStats();
  } catch (e) {
    showToast('Error al guardar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar';
  }
}

// ─── Toggle opcionales ────────────────────────────────────────────────────────

function toggleOptional() {
  optionalOpen ? closeOptional() : openOptional();
}

function openOptional() {
  optionalOpen = true;
  document.getElementById('optionalSection').classList.add('open');
  document.getElementById('toggleOptBtn').textContent = '− Ocultar detalles';
}

function closeOptional() {
  optionalOpen = false;
  document.getElementById('optionalSection').classList.remove('open');
  document.getElementById('toggleOptBtn').textContent = '+ Más detalles (opcionales)';
}

// ─── Autosum desglose → total ────────────────────────────────────────────────

function autosumKcal() {
  const ids = ['kcalBreakfast','kcalLunch','kcalDinner','kcalSnacks'];
  const total = ids.reduce((s, id) => s + (parseNumber(id) || 0), 0);
  if (total > 0) document.getElementById('kcalTotal').value = total;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNumber(id) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) ? null : v;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function changeDay(delta) {
  const [y, m, d] = currentDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);

  // No permitir ir al futuro
  if (date > new Date()) return;

  const newDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  currentDate = newDate;
  document.getElementById('dateInput').value = newDate;

  // Deshabilitar flecha derecha si estamos en hoy
  document.getElementById('nextDayBtn').style.opacity = currentDate === today() ? '0.3' : '1';

  loadDayData();
}
