const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');
const { calcBMR, calcTDEE } = require('../../utils/calculations');

router.use(requireAuth);

// GET /api/settings
router.get('/', (req, res) => {
  try {
    const s = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
    res.json({ success: true, data: s || null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const uid = req.user.id;
    const { name, sex, age, height_cm, target_weight_kg, estimated_bmr, estimated_tdee, activity_level } = req.body;

    const latestLog = db.prepare('SELECT weight_kg FROM daily_logs WHERE weight_kg IS NOT NULL AND user_id = ? ORDER BY date DESC LIMIT 1').get(uid);
    const weight = latestLog?.weight_kg;

    let bmr  = estimated_bmr || null;
    let tdee = estimated_tdee || null;

    if (!bmr && weight && height_cm && age && sex) {
      bmr = calcBMR(weight, parseFloat(height_cm), parseInt(age), sex);
    }
    if (!tdee && bmr) {
      tdee = calcTDEE(bmr, activity_level || 'sedentary');
    }

    // Upsert settings para el usuario
    db.prepare(`
      INSERT INTO settings (user_id, name, sex, age, height_cm, target_weight_kg, estimated_bmr, estimated_tdee, activity_level, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        name=excluded.name, sex=excluded.sex, age=excluded.age,
        height_cm=excluded.height_cm, target_weight_kg=excluded.target_weight_kg,
        estimated_bmr=excluded.estimated_bmr, estimated_tdee=excluded.estimated_tdee,
        activity_level=excluded.activity_level, updated_at=excluded.updated_at
    `).run(uid, name ?? null, sex ?? null, age ? parseInt(age) : null,
           height_cm ? parseFloat(height_cm) : null,
           target_weight_kg ? parseFloat(target_weight_kg) : null,
           bmr, tdee, activity_level || 'sedentary');

    res.json({ success: true, data: db.prepare('SELECT * FROM settings WHERE user_id = ?').get(uid) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
