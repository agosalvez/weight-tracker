let weightChart = null;
let calChart    = null;
let activeDaysW = 90;
let activeDaysC = 30;

document.addEventListener('DOMContentLoaded', () => {
  loadAll();

  // Range buttons weight
  document.querySelectorAll('[data-range-w]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDaysW = parseInt(btn.dataset.rangeW);
      document.querySelectorAll('[data-range-w]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadWeightChart();
    });
  });

  // Range buttons kcal
  document.querySelectorAll('[data-range-c]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDaysC = parseInt(btn.dataset.rangeC);
      document.querySelectorAll('[data-range-c]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadCalChart();
    });
  });
});

async function loadAll() {
  await Promise.all([loadSummary(), loadWeightChart(), loadCalChart(), loadPrediction()]);
}

// ─── Resumen KPIs ─────────────────────────────────────────────────────────────

async function loadSummary() {
  try {
    const s = await API.getSummary();

    setKpi('kpiCurrentWeight', s.current_weight != null ? s.current_weight.toFixed(1) + ' kg' : '—');
    setKpi('kpiAvg7', s.avg_7d != null ? s.avg_7d.toFixed(1) + ' kg' : '—');
    setKpi('kpiWeeklyChange', formatChange(s.weekly_change, ' kg'));
    setKpi('kpiAvgKcal', s.avg_kcal_7d != null ? s.avg_kcal_7d + ' kcal' : '—');
    setKpi('kpiDeficit', s.avg_deficit_7d != null ? s.avg_deficit_7d + ' kcal' : '—');
    setKpi('kpiTarget', s.target_weight != null ? s.target_weight.toFixed(1) + ' kg' : '—');
    setKpi('kpiDiffTarget', s.diff_to_target != null ? formatChange(-s.diff_to_target, ' kg') : '—');

    // Color del cambio semanal
    const changeEl = document.getElementById('kpiWeeklyChange');
    if (changeEl && s.weekly_change != null) {
      changeEl.style.color = s.weekly_change < 0 ? 'var(--success)' : s.weekly_change > 0 ? 'var(--error)' : '';
    }
  } catch (e) {
    console.error('Error cargando resumen:', e);
  }
}

function formatChange(val, unit) {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return sign + val.toFixed(1) + unit;
}

function setKpi(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── Gráfica de peso ──────────────────────────────────────────────────────────

async function loadWeightChart() {
  try {
    const data = await API.getWeightTrend(activeDaysW);

    const withWeight = data.filter(d => d.weight != null);

    if (withWeight.length < 2) {
      document.getElementById('weightChartEmpty').classList.remove('hidden');
      document.getElementById('weightChartWrap').classList.add('hidden');
      return;
    }

    document.getElementById('weightChartEmpty').classList.add('hidden');
    document.getElementById('weightChartWrap').classList.remove('hidden');

    const labels  = data.map(d => shortDate(d.date));
    const weights = data.map(d => d.weight);
    const movAvg  = data.map(d => d.moving_avg);

    const allVals = [...weights, ...movAvg].filter(v => v != null);
    const minY = Math.floor(Math.min(...allVals) - 0.5);
    const maxY = Math.ceil(Math.max(...allVals)  + 0.5);

    const ctx = document.getElementById('weightChart').getContext('2d');

    if (weightChart) { weightChart.destroy(); weightChart = null; }

    weightChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Peso diario',
            data: weights,
            borderColor: 'rgba(99,102,241,0.5)',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgba(99,102,241,0.7)',
            pointBorderColor: 'transparent',
            tension: 0.3,
            spanGaps: true,
          },
          {
            label: 'Media 7 días',
            data: movAvg,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99,102,241,0.08)',
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.4,
            fill: true,
            spanGaps: true,
          }
        ]
      },
      options: chartOptions(minY, maxY, v => v.toFixed(1) + ' kg')
    });
  } catch (e) {
    console.error('Error cargando gráfica de peso:', e);
  }
}

// ─── Gráfica de calorías ──────────────────────────────────────────────────────

async function loadCalChart() {
  try {
    const data = await API.getCalTrend(activeDaysC);
    const withKcal = data.filter(d => d.kcal_total != null);

    if (withKcal.length < 2) {
      document.getElementById('calChartEmpty').classList.remove('hidden');
      document.getElementById('calChartWrap').classList.add('hidden');
      return;
    }

    document.getElementById('calChartEmpty').classList.add('hidden');
    document.getElementById('calChartWrap').classList.remove('hidden');

    const labels   = data.map(d => shortDate(d.date));
    const kcals    = data.map(d => d.kcal_total);
    const activity = data.map(d => d.kcal_activity);

    const allVals = [...kcals, ...activity].filter(v => v != null);
    const maxY = Math.ceil(Math.max(...allVals) * 1.15);

    const ctx = document.getElementById('calChart').getContext('2d');
    if (calChart) { calChart.destroy(); calChart = null; }

    calChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Kcal ingeridas',
            data: kcals,
            backgroundColor: 'rgba(99,102,241,0.7)',
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: 'Kcal ejercicio',
            data: activity,
            backgroundColor: 'rgba(16,185,129,0.7)',
            borderRadius: 4,
            borderSkipped: false,
          }
        ]
      },
      options: chartOptions(0, maxY, v => Math.round(v) + ' kcal')
    });
  } catch (e) {
    console.error('Error cargando gráfica de kcal:', e);
  }
}

// ─── Predicción ──────────────────────────────────────────────────────────────

async function loadPrediction() {
  const card = document.getElementById('predictionCard');
  const val  = document.getElementById('predValue');
  const sub  = document.getElementById('predSub');
  const badge = document.getElementById('trendBadge');

  try {
    const p = await API.getPrediction();

    if (p.error) {
      const msgs = {
        no_target:        'Sin peso objetivo configurado',
        insufficient_data: 'Necesitas al menos 5 registros',
        no_loss_trend:     'No se detecta tendencia de bajada',
        unreachable:       'Objetivo fuera del rango estimado'
      };
      val.textContent = msgs[p.error] || 'Datos insuficientes';
      sub.textContent = '';
      card.style.opacity = '0.7';
    } else {
      const dateStr = formatDateEs(p.goalDate);
      val.textContent = dateStr;
      sub.textContent = `En ${p.weeksToGoal} semanas · ${p.kgPerWeek.toFixed(2)} kg/semana`;
      card.style.opacity = '1';

      // Tendencia badge
      if (badge) {
        const paceConfig = {
          good:             { label: 'Ritmo correcto (0.4–0.8 kg/sem)', cls: 'good' },
          aggressive:       { label: 'Ritmo agresivo (>1% peso/sem)',   cls: 'bad'  },
          slow:             { label: 'Ritmo lento',                     cls: 'warning' },
          stagnant:         { label: 'Sin cambios significativos',      cls: 'neutral' },
          insufficient_data:{ label: 'Datos insuficientes',             cls: 'neutral' },
        };
        const cfg = paceConfig[p.pace] || paceConfig.insufficient_data;
        badge.textContent  = cfg.label;
        badge.className    = `trend-badge ${cfg.cls}`;
      }
    }
  } catch (e) {
    val.textContent = 'Sin objetivo definido';
    sub.textContent = 'Configúralo en Ajustes';
  }
}

// ─── Opciones comunes de Chart.js ─────────────────────────────────────────────

function chartOptions(minY, maxY, tickCb) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#64748b',
          font: { size: 12, family: '-apple-system, BlinkMacSystemFont, sans-serif' },
          boxWidth: 14,
          padding: 14
        }
      },
      tooltip: {
        backgroundColor: '#fff',
        titleColor: '#0f172a',
        bodyColor: '#64748b',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y;
            if (v == null || v === 0 && ctx.dataset.label.includes('ejercicio')) return null;
            return ` ${ctx.dataset.label}: ${typeof tickCb === 'function' ? tickCb(v) : v}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid:  { color: 'rgba(0,0,0,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 8 }
      },
      y: {
        min:   minY,
        max:   maxY,
        grid:  { color: 'rgba(0,0,0,0.04)' },
        ticks: { color: '#94a3b8', font: { size: 11 }, callback: tickCb }
      }
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m)-1]}`;
}
