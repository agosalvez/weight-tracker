const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');
const { MEAL_TYPES, computeEntryKcal, aggregateLegacyBuckets } = require('../../utils/meals');

router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Recalcula daily_logs (kcal_breakfast/lunch/dinner/snacks/total) a partir de meal_entries
// Solo si calories_source = 'from_meals' (o si la fila aún no existía).
function recalcDailyLog(userId, date) {
  const entries = db.prepare(
    `SELECT meal_type, kcal FROM meal_entries WHERE user_id = ? AND date = ?`
  ).all(userId, date);
  const buckets = aggregateLegacyBuckets(entries);

  const existing = db.prepare(
    'SELECT id, calories_source FROM daily_logs WHERE user_id = ? AND date = ?'
  ).get(userId, date);

  if (existing) {
    // Solo sobreescribimos si el usuario está en modo "from_meals" o si el registro está vacío
    if (existing.calories_source === 'from_meals') {
      db.prepare(`
        UPDATE daily_logs
        SET kcal_total = ?, kcal_breakfast = ?, kcal_lunch = ?, kcal_dinner = ?, kcal_snacks = ?,
            updated_at = datetime('now')
        WHERE user_id = ? AND date = ?
      `).run(buckets.kcal_total, buckets.kcal_breakfast, buckets.kcal_lunch,
             buckets.kcal_dinner, buckets.kcal_snacks, userId, date);
    }
  } else if (entries.length > 0) {
    // Crear automáticamente con calories_source = 'from_meals'
    db.prepare(`
      INSERT INTO daily_logs (user_id, date, kcal_total, kcal_breakfast, kcal_lunch, kcal_dinner, kcal_snacks, calories_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'from_meals')
    `).run(userId, date, buckets.kcal_total, buckets.kcal_breakfast,
           buckets.kcal_lunch, buckets.kcal_dinner, buckets.kcal_snacks);
  }
  return buckets;
}

// GET /api/meals/:date — lista entradas del día agrupadas por comida
router.get('/:date', (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) return res.status(400).json({ success: false, error: 'Fecha inválida' });

    const entries = db.prepare(`
      SELECT m.*, f.name AS food_current_name, f.brand, f.confidence AS food_confidence
      FROM meal_entries m
      LEFT JOIN foods f ON f.id = m.food_id
      WHERE m.user_id = ? AND m.date = ?
      ORDER BY m.created_at ASC
    `).all(req.user.id, date);

    const byMeal = {};
    for (const t of MEAL_TYPES) byMeal[t] = [];
    for (const e of entries) {
      if (byMeal[e.meal_type]) byMeal[e.meal_type].push(e);
    }
    const totals = aggregateLegacyBuckets(entries);

    res.json({ success: true, data: { date, entries, byMeal, totals } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/meals — crear una entrada
router.post('/', (req, res) => {
  try {
    const { date, meal_type, food_id, grams, units, unit_label } = req.body;

    if (!DATE_RE.test(date || '')) return res.status(400).json({ success: false, error: 'Fecha inválida (YYYY-MM-DD)' });
    if (!MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({ success: false, error: `meal_type inválido (válidos: ${MEAL_TYPES.join(', ')})` });
    }
    if (!food_id) return res.status(400).json({ success: false, error: 'food_id es obligatorio' });

    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?')
      .get(food_id, req.user.id);
    if (!food) return res.status(404).json({ success: false, error: 'Alimento no encontrado en tu caché' });

    const gramsNum = grams != null && grams !== '' ? parseFloat(grams) : null;
    const unitsNum = units != null && units !== '' ? parseFloat(units) : null;
    if ((gramsNum == null || gramsNum <= 0) && (unitsNum == null || unitsNum <= 0)) {
      return res.status(400).json({ success: false, error: 'Indica gramos o unidades (> 0)' });
    }

    const kcal = computeEntryKcal({
      kcal_per_100g: food.kcal_per_100g,
      grams: gramsNum,
      units: unitsNum,
      grams_per_unit: null, // se ampliará en fases posteriores
    });

    const info = db.prepare(`
      INSERT INTO meal_entries
        (user_id, date, meal_type, food_id, food_name_snapshot, grams, units, unit_label, kcal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, date, meal_type, food.id, food.name,
           gramsNum, unitsNum, unit_label || null, kcal);

    db.prepare('UPDATE foods SET times_used = times_used + 1 WHERE id = ?').run(food.id);

    const entry = db.prepare('SELECT * FROM meal_entries WHERE id = ?').get(info.lastInsertRowid);
    const totals = recalcDailyLog(req.user.id, date);

    res.json({ success: true, data: { entry, totals } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/meals/:id — borra una entrada
router.delete('/:id', (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM meal_entries WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!entry) return res.status(404).json({ success: false, error: 'Entrada no encontrada' });

    db.prepare('DELETE FROM meal_entries WHERE id = ?').run(entry.id);
    const totals = recalcDailyLog(req.user.id, entry.date);

    res.json({ success: true, data: { totals } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/meals/:date/use-from-meals — activar el modo "from_meals" para un día
router.post('/:date/use-from-meals', (req, res) => {
  try {
    const { date } = req.params;
    if (!DATE_RE.test(date)) return res.status(400).json({ success: false, error: 'Fecha inválida' });

    const existing = db.prepare('SELECT id FROM daily_logs WHERE user_id = ? AND date = ?')
      .get(req.user.id, date);
    if (existing) {
      db.prepare(`UPDATE daily_logs SET calories_source = 'from_meals' WHERE id = ?`).run(existing.id);
    }
    const totals = recalcDailyLog(req.user.id, date);
    res.json({ success: true, data: { totals } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
