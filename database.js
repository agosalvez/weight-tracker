const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'weight_tracker.db'));

// Mejor rendimiento con WAL mode
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS weight_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    calories_kcal INTEGER,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Ajustes por defecto
const insertDefault = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
[
  ['calorie_goal', '2000'],
  ['weight_goal', ''],
  ['start_weight', '']
].forEach(([k, v]) => insertDefault.run(k, v));

// ─── Utilidades de fecha ─────────────────────────────────────────────────────

function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return getLocalDateStr(d);
}

// ─── Media móvil 7 días ──────────────────────────────────────────────────────

function computeMovingAverages(entries) {
  // Media de peso por día
  const dailyMap = {};
  for (const e of entries) {
    const date = e.timestamp.slice(0, 10);
    if (!dailyMap[date]) dailyMap[date] = { sum: 0, count: 0 };
    dailyMap[date].sum += e.weight_kg;
    dailyMap[date].count++;
  }

  const sortedDates = Object.keys(dailyMap).sort();

  // Media móvil de 7 días para cada fecha
  const movingAvg = {};
  for (let i = 0; i < sortedDates.length; i++) {
    const window = sortedDates.slice(Math.max(0, i - 6), i + 1);
    const avg = window.reduce((acc, d) => acc + dailyMap[d].sum / dailyMap[d].count, 0) / window.length;
    movingAvg[sortedDates[i]] = parseFloat(avg.toFixed(2));
  }

  return entries.map(e => ({
    ...e,
    moving_avg_7d: movingAvg[e.timestamp.slice(0, 10)] ?? null
  }));
}

// ─── Queries ─────────────────────────────────────────────────────────────────

function getEntries(from, to) {
  // Calcular MA sobre todos los datos, luego filtrar
  const all = db.prepare('SELECT * FROM weight_entries ORDER BY timestamp ASC').all();
  const withMA = computeMovingAverages(all);

  if (!from && !to) return withMA.reverse(); // DESC para UI por defecto

  const filtered = withMA.filter(e => {
    const date = e.timestamp.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });

  return filtered; // ASC ya que viene de MA (útil para gráficas)
}

function createEntry({ timestamp, weight_kg, calories_kcal, note }) {
  const stmt = db.prepare(`
    INSERT INTO weight_entries (timestamp, weight_kg, calories_kcal, note)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(timestamp, weight_kg, calories_kcal ?? null, note ?? null);
  return db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(info.lastInsertRowid);
}

function updateEntry(id, { weight_kg, calories_kcal, note, timestamp }) {
  const existing = db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id);
  if (!existing) return null;

  const stmt = db.prepare(`
    UPDATE weight_entries
    SET weight_kg = ?, calories_kcal = ?, note = ?, timestamp = ?
    WHERE id = ?
  `);
  stmt.run(
    weight_kg ?? existing.weight_kg,
    calories_kcal !== undefined ? (calories_kcal ?? null) : existing.calories_kcal,
    note !== undefined ? (note ?? null) : existing.note,
    timestamp ?? existing.timestamp,
    id
  );
  return db.prepare('SELECT * FROM weight_entries WHERE id = ?').get(id);
}

function deleteEntry(id) {
  const info = db.prepare('DELETE FROM weight_entries WHERE id = ?').run(id);
  return info.changes > 0;
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function saveSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// ─── Estadísticas ─────────────────────────────────────────────────────────────

function getStreak() {
  const dates = db.prepare(`
    SELECT DISTINCT DATE(timestamp) as date
    FROM weight_entries
    ORDER BY date DESC
  `).all().map(r => r.date);

  if (!dates.length) return 0;

  const today = getLocalDateStr();
  const yesterday = addDays(today, -1);

  // La racha debe incluir hoy o ayer
  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  let streak = 0;
  let expected = dates[0];

  for (const date of dates) {
    if (date === expected) {
      streak++;
      expected = addDays(expected, -1);
    } else {
      break;
    }
  }

  return streak;
}

function getTrend7d() {
  // Últimos 7 días con datos (orden ASC para regresión intuitiva)
  const rows = db.prepare(`
    SELECT date, avg_weight FROM (
      SELECT DATE(timestamp) as date, AVG(weight_kg) as avg_weight
      FROM weight_entries
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 7
    ) ORDER BY date ASC
  `).all();

  if (rows.length < 2) return 'stable';

  const n = rows.length;
  const x = rows.map((_, i) => i);
  const y = rows.map(r => r.avg_weight);

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Umbral: ~350g/semana (~0.05 kg/día)
  if (slope < -0.05) return 'losing';
  if (slope > 0.05) return 'gaining';
  return 'stable';
}

module.exports = {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getSettings,
  saveSetting,
  getStreak,
  getTrend7d
};
