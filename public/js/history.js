let allLogs = [];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filterBtn').addEventListener('click', applyFilter);
  document.getElementById('clearFilterBtn').addEventListener('click', clearFilter);
  loadHistory();
});

// ─── Cargar historial ────────────────────────────────────────────────────────

async function loadHistory() {
  const list = document.getElementById('logList');
  list.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    allLogs = await API.getLogs();
    renderLogs(allLogs);
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Error al cargar datos</p></div>';
  }
}

// ─── Filtrar ─────────────────────────────────────────────────────────────────

async function applyFilter() {
  const from = document.getElementById('filterFrom').value;
  const to   = document.getElementById('filterTo').value;

  const params = {};
  if (from) params.from = from;
  if (to)   params.to   = to;

  try {
    const logs = await API.getLogs(params);
    renderLogs(logs);
  } catch (e) {
    showToast('Error al filtrar', 'error');
  }
}

async function clearFilter() {
  document.getElementById('filterFrom').value = '';
  document.getElementById('filterTo').value   = '';
  renderLogs(allLogs);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderLogs(logs) {
  const list = document.getElementById('logList');
  document.getElementById('logCount').textContent = logs.length + (logs.length === 1 ? ' día' : ' días');

  if (!logs.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <h3>Sin registros</h3>
        <p>Empieza registrando tu peso en Inicio</p>
      </div>`;
    return;
  }

  list.innerHTML = logs.map(log => buildLogCard(log)).join('');
}

function buildLogCard(log) {
  const chips = [];

  if (log.kcal_total != null) {
    const net = log.kcal_total - (log.kcal_activity || 0);
    chips.push(`<span class="chip">${Math.round(log.kcal_total)} kcal ingeridas</span>`);
    if (log.kcal_activity) chips.push(`<span class="chip green">${Math.round(log.kcal_activity)} kcal ejercicio</span>`);
    chips.push(`<span class="chip">Neto: ${Math.round(net)} kcal</span>`);
  }

  if (log.notes) chips.push(`<span class="chip" style="font-style:italic;">${truncate(log.notes, 30)}</span>`);

  return `
    <div class="log-card ${log.weight_kg != null ? 'has-weight' : ''}">
      <div class="log-card-top">
        <div>
          <div class="log-date-label">${formatDateEs(log.date)}</div>
          ${log.weight_kg != null ? `<div class="log-weight-badge">${parseFloat(log.weight_kg.toFixed(1))} kg</div>` : '<div style="color:var(--text-light);font-size:0.85rem;">Sin peso</div>'}
        </div>
        <div class="log-actions">
          <button class="btn-icon" onclick="editLog('${log.date}')" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="deleteLog('${log.date}')" title="Eliminar">🗑️</button>
        </div>
      </div>
      ${chips.length ? `<div class="log-chips">${chips.join('')}</div>` : ''}
    </div>`;
}

// ─── Editar → ir a home con esa fecha ────────────────────────────────────────

function editLog(date) {
  window.location.href = `/?date=${date}`;
}

// ─── Eliminar ────────────────────────────────────────────────────────────────

function deleteLog(date) {
  showConfirm(
    'Eliminar registro',
    `¿Eliminar el registro del ${formatDateEs(date)}? Esta acción no se puede deshacer.`,
    async () => {
      try {
        await API.deleteLog(date);
        showToast('Registro eliminado');
        allLogs = allLogs.filter(l => l.date !== date);
        renderLogs(allLogs);
      } catch (e) {
        showToast('Error al eliminar', 'error');
      }
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
