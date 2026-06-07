// public/js/settings-foods.js - gestion de "Mis alimentos" en ajustes (WT3.0)

(function() {
  const setHTML = (el, s) => { el['inner' + 'HTML'] = s; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  let allFoods = [];

  const SOURCE_BADGES = {
    manual:       { label: 'Manual',     color: '#64748b' },
    barcode:      { label: 'Cod. barras', color: '#0ea5e9' },
    label_photo:  { label: 'Foto etiq.', color: '#8b5cf6' },
    ai_text:      { label: 'IA texto',   color: '#10b981' },
    ai_vision:    { label: 'IA foto',    color: '#10b981' },
  };

  document.addEventListener('DOMContentLoaded', () => {
    loadVersion();
    loadFoods();
    loadAiCost();
    document.getElementById('myFoodsFilter')?.addEventListener('input', e => render(e.target.value));
    const user = Auth.getUser();
    if (user && user.role === 'admin') loadAdminAiCost();
  });

  const fmtEur = (n) => {
    const v = Number(n) || 0;
    if (v > 0 && v < 0.01) return v.toFixed(4) + ' €';
    return v.toFixed(2) + ' €';
  };

  async function loadAiCost() {
    try {
      const c = await API.getAiCost();
      document.getElementById('aiCostSection').style.display = 'block';
      document.getElementById('aiCostMonth').textContent = fmtEur(c.month_cost);
      document.getElementById('aiCostTotal').textContent = fmtEur(c.total_cost);
      document.getElementById('aiCostCalls').textContent =
        `${c.month_calls} consulta${c.month_calls === 1 ? '' : 's'} este mes`;
    } catch {}
  }

  async function loadAdminAiCost() {
    try {
      const data = await API.getAdminAiCost();
      const sec = document.getElementById('adminAiCostSection');
      sec.style.display = 'block';
      const rows = data.users.map(u => `
        <tr data-uid="${u.id}" style="cursor:pointer;border-bottom:1px solid var(--border)">
          <td style="padding:8px 4px">${esc(u.display_name || u.username)}</td>
          <td style="padding:8px 4px;text-align:right;font-weight:700">${fmtEur(u.this_month)}</td>
          <td style="padding:8px 4px;text-align:right;color:var(--text-muted)">${fmtEur(u.last_month)}</td>
          <td style="padding:8px 4px;text-align:right;color:var(--text-muted)">${fmtEur(u.total)}</td>
        </tr>`).join('');
      setHTML(document.getElementById('adminAiCostTable'), `
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead><tr style="color:var(--text-muted);font-size:0.7rem;text-transform:uppercase">
            <th style="text-align:left;padding:4px">Usuario</th>
            <th style="text-align:right;padding:4px">Este mes</th>
            <th style="text-align:right;padding:4px">Mes ant.</th>
            <th style="text-align:right;padding:4px">Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="text-align:right;font-size:0.75rem;color:var(--text-muted);margin-top:8px">
          Total mes: <strong>${fmtEur(data.grand.this_month)}</strong> · Histórico: ${fmtEur(data.grand.total)}
        </div>`);
      document.querySelectorAll('#adminAiCostTable tr[data-uid]').forEach(tr => {
        tr.addEventListener('click', () => loadAdminUserDetail(parseInt(tr.dataset.uid)));
      });
    } catch {}
  }

  async function loadAdminUserDetail(uid) {
    try {
      const d = await API.getAdminAiCostUser(uid);
      const days = d.byDay.slice(0, 14).map(x => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.8rem">
          <span>${esc(x.day)}</span><span>${fmtEur(x.cost)} · ${x.calls}</span>
        </div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-muted)">Sin gasto</div>';
      const weeks = d.byWeek.slice(0, 8).map(x => `
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.8rem">
          <span>${esc(x.week)}</span><span>${fmtEur(x.cost)} · ${x.calls}</span>
        </div>`).join('') || '';
      setHTML(document.getElementById('adminAiCostDetail'), `
        <div class="card card-sm">
          <p class="sheet-section-title">Por día (últimos 14)</p>${days}
          <p class="sheet-section-title" style="margin-top:10px">Por semana</p>${weeks}
        </div>`);
    } catch {}
  }

  async function loadVersion() {
    try {
      const v = await API.getVersion();
      const footer = document.getElementById('appVersionFooter');
      if (footer && v?.label) {
        footer.textContent = `Weight Tracker ${v.label}`;
      }
    } catch {
      const footer = document.getElementById('appVersionFooter');
      if (footer) footer.textContent = 'Weight Tracker';
    }
  }

  async function loadFoods() {
    try {
      allFoods = await API.getFoods();
      render('');
    } catch (e) {
      const list = document.getElementById('myFoodsList');
      if (list) setHTML(list, '<p style="font-size:0.85rem;color:var(--text-muted)">No se pudieron cargar los alimentos.</p>');
    }
  }

  function render(filter) {
    const list = document.getElementById('myFoodsList');
    const counter = document.getElementById('myFoodsCount');
    if (!list) return;

    const q = (filter || '').trim().toLowerCase();
    const filtered = q
      ? allFoods.filter(f => (f.name + ' ' + (f.brand || '')).toLowerCase().includes(q))
      : allFoods;

    if (counter) counter.textContent = allFoods.length === 0 ? '' : `${filtered.length}/${allFoods.length}`;

    if (allFoods.length === 0) {
      setHTML(list, '<p style="font-size:0.85rem;color:var(--text-muted);font-style:italic">Aún no tienes alimentos guardados. Añade comidas en la pantalla principal para empezar a llenar tu caché.</p>');
      return;
    }

    if (filtered.length === 0) {
      setHTML(list, '<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:10px">Sin coincidencias.</p>');
      return;
    }

    setHTML(list, filtered.map(f => {
      const src = SOURCE_BADGES[f.source] || SOURCE_BADGES.manual;
      return `
        <div class="food-row" data-id="${f.id}" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <strong style="font-size:0.92rem">${esc(f.name)}</strong>
              ${f.brand ? `<span style="font-size:0.75rem;color:var(--text-muted)">· ${esc(f.brand)}</span>` : ''}
              <span style="font-size:0.65rem;background:${src.color};color:white;padding:2px 6px;border-radius:999px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em">${src.label}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">
              ${Math.round(f.kcal_per_100g)} kcal/100g · usado ${f.times_used} ${f.times_used === 1 ? 'vez' : 'veces'}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" data-edit="${f.id}" style="font-size:0.72rem">Editar</button>
          <button class="btn btn-ghost btn-sm" data-del="${f.id}" style="font-size:0.72rem;color:var(--error)">×</button>
        </div>`;
    }).join(''));

    list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => editFood(parseInt(b.dataset.edit))));
    list.querySelectorAll('[data-del]') .forEach(b => b.addEventListener('click', () => deleteFood(parseInt(b.dataset.del))));
  }

  function editFood(id) {
    const food = allFoods.find(f => f.id === id);
    if (!food) return;
    const newKcal = window.prompt(`Kcal por 100g para "${food.name}":`, food.kcal_per_100g);
    if (newKcal == null) return;
    const v = parseFloat(newKcal);
    if (isNaN(v) || v < 0 || v > 1000) {
      showToast('Valor inválido (0-1000)', 'error');
      return;
    }
    API.updateFood(id, { kcal_per_100g: v })
      .then(() => { showToast('Alimento actualizado'); loadFoods(); })
      .catch(e => showToast('Error: ' + e.message, 'error'));
  }

  function deleteFood(id) {
    const food = allFoods.find(f => f.id === id);
    if (!food) return;
    showConfirm('Eliminar alimento', `¿Eliminar "${food.name}" de tu caché? Las entradas pasadas se conservarán.`, async () => {
      try {
        await API.deleteFood(id);
        showToast('Alimento eliminado');
        loadFoods();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    });
  }
})();
