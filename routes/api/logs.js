const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');

router.use(requireAuth);

// GET /api/logs
router.get('/', (req, res) => {
  try {
    const uid = req.user.id;
    const { from, to, limit } = req.query;
    let query = 'SELECT * FROM daily_logs WHERE user_id = ?';
    const params = [uid];
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
    const log = db.prepare('SELECT * FROM daily_logs WHERE date = ? AND user_id = ?')
      .get(req.params.date, req.user.id);
    res.json({ success: true, data: log || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/logs — upsert por fecha
router.post('/', (req, res) => {
  try {
    const uid = req.user.id;
    const { date, weight_kg, kcal_total, kcal_breakfast, kcal_lunch, kcal_dinner, kcal_snacks, kcal_activity, notes } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'La fecha es obligatoria' });

    const existing = db.prepare('SELECT id FROM daily_logs WHERE date = ? AND user_id = ?').get(date, uid);
    if (existing) {
      db.prepare(`UPDATE daily_logs SET weight_kg=?,kcal_total=?,kcal_breakfast=?,kcal_lunch=?,kcal_dinner=?,kcal_snacks=?,kcal_activity=?,notes=?,updated_at=datetime('now') WHERE date=? AND user_id=?`)
        .run(weight_kg ?? null, kcal_total ?? null, kcal_breakfast ?? null, kcal_lunch ?? null,
             kcal_dinner ?? null, kcal_snacks ?? null, kcal_activity ?? null, notes ?? null, date, uid);
    } else {
      db.prepare(`INSERT INTO daily_logs (user_id,date,weight_kg,kcal_total,kcal_breakfast,kcal_lunch,kcal_dinner,kcal_snacks,kcal_activity,notes) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(uid, date, weight_kg ?? null, kcal_total ?? null, kcal_breakfast ?? null,
             kcal_lunch ?? null, kcal_dinner ?? null, kcal_snacks ?? null, kcal_activity ?? null, notes ?? null);
    }
    res.json({ success: true, data: db.prepare('SELECT * FROM daily_logs WHERE date = ? AND user_id = ?').get(date, uid) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/logs/:date
router.delete('/:date', (req, res) => {
  try {
    db.prepare('DELETE FROM daily_logs WHERE date = ? AND user_id = ?').run(req.params.date, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
