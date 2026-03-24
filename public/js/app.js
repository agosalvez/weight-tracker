// ─── Auth ─────────────────────────────────────────────────────────────────────

const Auth = {
  getToken() { return localStorage.getItem('wt_token'); },
  getUser()  { try { return JSON.parse(localStorage.getItem('wt_user')); } catch { return null; } },

  save(token, user) {
    localStorage.setItem('wt_token', token);
    localStorage.setItem('wt_user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('wt_token');
    localStorage.removeItem('wt_user');
  },

  guard() {
    if (!this.getToken() && window.location.pathname !== '/login') {
      window.location.href = '/login';
      return false;
    }
    return true;
  },
};

// Redirigir a home si ya está logado y va a /login
if (window.location.pathname === '/login' && Auth.getToken()) {
  window.location.href = '/';
}

// ─── API ─────────────────────────────────────────────────────────────────────

const API = {
  async _fetch(url, opts = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res  = await fetch(url, { ...opts, headers });
    const json = await res.json();

    if (res.status === 401) {
      Auth.clear();
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }

    if (!res.ok || !json.success) throw new Error(json.error || 'Error de servidor');
    return json.data;
  },

  getLogs:        (params = {}) => API._fetch('/api/logs?' + new URLSearchParams(params)),
  getLog:         date          => API._fetch(`/api/logs/${date}`),
  saveLog:        data          => API._fetch('/api/logs', { method: 'POST', body: JSON.stringify(data) }),
  deleteLog:      date          => API._fetch(`/api/logs/${date}`, { method: 'DELETE' }),

  getSettings:    ()     => API._fetch('/api/settings'),
  saveSettings:   data   => API._fetch('/api/settings', { method: 'POST', body: JSON.stringify(data) }),

  getSummary:     ()     => API._fetch('/api/stats/summary'),
  getWeightTrend: days   => API._fetch(`/api/stats/weight-trend?days=${days || 90}`),
  getCalTrend:    days   => API._fetch(`/api/stats/calories-trend?days=${days || 30}`),
  getPrediction:  ()     => API._fetch('/api/stats/prediction'),

  // Auth
  authStatus:     ()          => fetch('/api/auth/status').then(r => r.json()),
  login:          data        => API._fetch('/api/auth/login',   { method: 'POST', body: JSON.stringify(data) }),
  register:       data        => API._fetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe:          ()          => API._fetch('/api/auth/me'),
  getPasskeys:    ()          => API._fetch('/api/auth/webauthn/credentials'),
  deletePasskey:  id          => API._fetch(`/api/auth/webauthn/${id}`, { method: 'DELETE' }),
  passkeyRegOpts: ()          => API._fetch('/api/auth/webauthn/register/options'),
  passkeyRegVerify: data      => API._fetch('/api/auth/webauthn/register/verify', { method: 'POST', body: JSON.stringify(data) }),
  passkeyLoginOpts: ()        => fetch('/api/auth/webauthn/login/options', { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
  passkeyLoginVerify: data    => fetch('/api/auth/webauthn/login/verify',  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
};

// ─── Guard en páginas protegidas ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname !== '/login') {
    Auth.guard();
  }
});

// ─── Fecha ────────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateEs(dateStr) {
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
