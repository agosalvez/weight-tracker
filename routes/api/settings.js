const express = require('express');
const router = express.Router();
const db = require('../../db/database');
const { calcBMR, calcTDEE } = require('../../utils/calculations');

// GET /api/settings
router.get('/', (req, res) => {
  try {
    res.json({ success: true, data: db.prepare('SELECT * FROM settings WHERE id = 1').get() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/settings
router.post('/', (req, res) => {
  try {
    const { name, sex, age, height_cm, target_weight_kg, estimated_bmr, estimated_tdee, activity_level } = req.body;

    // Calcular BMR/TDEE automáticamente si hay datos suficientes
    const latestLog = db.prepare('SELECT weight_kg FROM daily_logs WHERE weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1').get();
    const weight = latestLog?.weight_kg;

    let bmr = estimated_bmr || null;
    let tdee = estimated_tdee || null;

    if (!bmr && weight && height_cm && age && sex) {
      bmr = calcBMR(weight, parseFloat(height_cm), parseInt(age), sex);
    }
    if (!tdee && bmr) {
      tdee = calcTDEE(bmr, activity_level || 'sedentary');
    }

    db.prepare(`UPDATE settings SET name=?,sex=?,age=?,height_cm=?,target_weight_kg=?,estimated_bmr=?,estimated_tdee=?,activity_level=?,updated_at=datetime('now') WHERE id=1`)
      .run(name ?? null, sex ?? null, age ? parseInt(age) : null, height_cm ? parseFloat(height_cm) : null,
           target_weight_kg ? parseFloat(target_weight_kg) : null, bmr, tdee, activity_level || 'sedentary');

    res.json({ success: true, data: db.prepare('SELECT * FROM settings WHERE id = 1').get() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
