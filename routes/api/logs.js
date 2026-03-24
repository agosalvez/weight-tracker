const express = require('express');
const router = express.Router();
const db = require('../../db/database');

// GET /api/logs
router.get('/', (req, res) => {
  try {
    const { from, to, limit } = req.query;
    let query = 'SELECT * FROM daily_logs WHERE 1=1';
    const params = [];
    if (from)  { query += ' AND date >= ?'; params.push(from); }
    if (to)    { query += ' AND date <= ?'; params.push(to); }
    query += ' ORDER BY date DESC';
    if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
    res.json({ success: true, data: db.prepare(query).all(...params) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/logs/:date
router.get('/:date', (req, res) => {
  try {
    const log = db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(req.params.date);
    res.json({ success: true, data: log || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/logs — upsert por fecha
router.post('/', (req, res) => {
  try {
    const { date, weight_kg, kcal_total, kcal_breakfast, kcal_lunch, kcal_dinner, kcal_snacks, kcal_activity, notes } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'La fecha es obligatoria' });

    const existing = db.prepare('SELECT id FROM daily_logs WHERE date = ?').get(date);
    if (existing) {
      db.prepare(`UPDATE daily_logs SET weight_kg=?,kcal_total=?,kcal_breakfast=?,kcal_lunch=?,kcal_dinner=?,kcal_snacks=?,kcal_activity=?,notes=?,updated_at=datetime('now') WHERE date=?`)
        .run(weight_kg ?? null, kcal_total ?? null, kcal_breakfast ?? null, kcal_lunch ?? null, kcal_dinner ?? null, kcal_snacks ?? null, kcal_activity ?? null, notes ?? null, date);
    } else {
      db.prepare(`INSERT INTO daily_logs (date,weight_kg,kcal_total,kcal_breakfast,kcal_lunch,kcal_dinner,kcal_snacks,kcal_activity,notes) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(date, weight_kg ?? null, kcal_total ?? null, kcal_breakfast ?? null, kcal_lunch ?? null, kcal_dinner ?? null, kcal_snacks ?? null, kcal_activity ?? null, notes ?? null);
    }
    res.json({ success: true, data: db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(date) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/logs/:date
router.put('/:date', (req, res) => {
  try {
    const { weight_kg, kcal_total, kcal_breakfast, kcal_lunch, kcal_dinner, kcal_snacks, kcal_activity, notes } = req.body;
    db.prepare(`UPDATE daily_logs SET weight_kg=?,kcal_total=?,kcal_breakfast=?,kcal_lunch=?,kcal_dinner=?,kcal_snacks=?,kcal_activity=?,notes=?,updated_at=datetime('now') WHERE date=?`)
      .run(weight_kg ?? null, kcal_total ?? null, kcal_breakfast ?? null, kcal_lunch ?? null, kcal_dinner ?? null, kcal_snacks ?? null, kcal_activity ?? null, notes ?? null, req.params.date);
    res.json({ success: true, data: db.prepare('SELECT * FROM daily_logs WHERE date = ?').get(req.params.date) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/logs/:date
router.delete('/:date', (req, res) => {
  try {
    db.prepare('DELETE FROM daily_logs WHERE date = ?').run(req.params.date);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
