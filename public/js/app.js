// ─── API ─────────────────────────────────────────────────────────────────────

const API = {
  async _fetch(url, opts = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Error de servidor');
    return json.data;
  },

  getLogs:       (params = {}) => API._fetch('/api/logs?' + new URLSearchParams(params)),
  getLog:        date          => API._fetch(`/api/logs/${date}`),
  saveLog:       data          => API._fetch('/api/logs', { method: 'POST', body: JSON.stringify(data) }),
  updateLog:     (date, data)  => API._fetch(`/api/logs/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLog:     date          => API._fetch(`/api/logs/${date}`, { method: 'DELETE' }),

  getSettings:   ()     => API._fetch('/api/settings'),
  saveSettings:  data   => API._fetch('/api/settings', { method: 'POST', body: JSON.stringify(data) }),

  getSummary:    ()     => API._fetch('/api/stats/summary'),
  getWeightTrend: days  => API._fetch(`/api/stats/weight-trend?days=${days || 90}`),
  getCalTrend:   days   => API._fetch(`/api/stats/calories-trend?days=${days || 30}`),
  getPrediction: ()     => API._fetch('/api/stats/prediction'),
};

// ─── Fecha ────────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateEs(dateStr) {
  // dateStr = "2024-03-24"
  const [y, m, d] = dateStr.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  let wrap = document.getElementById('toastWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 2800);
}

// ─── Modal de confirmación ────────────────────────────────────────────────────

function showConfirm(title, body, onConfirm) {
  let overlay = document.getElementById('confirmModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'confirmModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title" id="confirmTitle"></div>
        <div class="modal-body" id="confirmBody"></div>
        <div class="modal-btns">
          <button class="btn btn-secondary" id="confirmCancel">Cancelar</button>
          <button class="btn btn-danger" id="confirmOk">Eliminar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeConfirm(); });
    document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  }

  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmBody').textContent  = body;

  const okBtn = document.getElementById('confirmOk');
  const newOk = okBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  newOk.addEventListener('click', () => { closeConfirm(); onConfirm(); });

  overlay.classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmModal')?.classList.remove('open');
}

// ─── Navegación activa ────────────────────────────────────────────────────────

function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(el => {
    const href = el.getAttribute('href');
    const isActive = href === '/' ? (path === '/' || path === '/index.html') : path.startsWith(href);
    el.classList.toggle('active', isActive);
  });
}

document.addEventListener('DOMContentLoaded', setActiveNav);
