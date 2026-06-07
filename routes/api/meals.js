const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');
const { MEAL_TYPES, computeEntryKcal, aggregateLegacyBuckets, fuzzyScore } = require('../../utils/meals');
const openai  = require('../../utils/openai');

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

// Inserta una entrada de comida directamente (usado por plantillas y copiar día).
function insertEntry(userId, date, mealType, { food_id, food_name_snapshot, grams, units, unit_label, kcal }) {
  db.prepare(`
    INSERT INTO meal_entries (user_id, date, meal_type, food_id, food_name_snapshot, grams, units, unit_label, kcal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, date, mealType, food_id ?? null, food_name_snapshot,
         grams ?? null, units ?? null, unit_label ?? null, Math.round(kcal) || 0);
}

// ─── Plantillas de comidas habituales ─────────────────────────────────────────

// GET /api/meals/templates — lista las plantillas del usuario
router.get('/templates', (req, res) => {
  try {
    const tpls = db.prepare(`
      SELECT t.*,
             (SELECT COUNT(*) FROM meal_template_items i WHERE i.template_id = t.id) AS item_count,
             (SELECT IFNULL(SUM(ROUND(i.kcal_per_100g * i.grams / 100)), 0)
                FROM meal_template_items i WHERE i.template_id = t.id) AS total_kcal
      FROM meal_templates t
      WHERE t.user_id = ?
      ORDER BY t.name ASC
    `).all(req.user.id);
    res.json({ success: true, data: tpls });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/meals/templates — guarda las entradas de un día/comida como habitual
router.post('/templates', (req, res) => {
  try {
    const { date, meal_type, name } = req.body;
    if (!DATE_RE.test(date || '')) return res.status(400).json({ success: false, error: 'Fecha inválida' });
    if (meal_type && !MEAL_TYPES.includes(meal_type)) return res.status(400).json({ success: false, error: 'meal_type inválido' });
    const tplName = (name || '').toString().trim();
    if (!tplName) return res.status(400).json({ success: false, error: 'Ponle un nombre a la comida habitual' });

    let query = 'SELECT * FROM meal_entries WHERE user_id = ? AND date = ?';
    const params = [req.user.id, date];
    if (meal_type) { query += ' AND meal_type = ?'; params.push(meal_type); }
    const entries = db.prepare(query).all(...params);
    if (entries.length === 0) return res.status(400).json({ success: false, error: 'No hay alimentos en esa comida para guardar' });

    const tx = db.transaction(() => {
      const info = db.prepare('INSERT INTO meal_templates (user_id, name, meal_type) VALUES (?, ?, ?)')
        .run(req.user.id, tplName, meal_type || null);
      const tplId = info.lastInsertRowid;
      const ins = db.prepare(`
        INSERT INTO meal_template_items (template_id, food_id, food_name_snapshot, grams, units, unit_label, kcal_per_100g)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of entries) {
        // kcal_per_100g: del alimento si existe, si no se deriva de la entrada
        const food = e.food_id ? db.prepare('SELECT kcal_per_100g FROM foods WHERE id = ?').get(e.food_id) : null;
        const kcalPer100 = food ? food.kcal_per_100g
          : (e.grams ? Math.round(e.kcal * 100 / e.grams) : e.kcal);
        ins.run(tplId, e.food_id, e.food_name_snapshot, e.grams, e.units, e.unit_label, kcalPer100);
      }
      return tplId;
    });
    const id = tx();
    res.json({ success: true, data: { id, name: tplName } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/meals/templates/:id/apply — aplica una plantilla a un día/comida
router.post('/templates/:id/apply', (req, res) => {
  try {
    const tpl = db.prepare('SELECT * FROM meal_templates WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });

    const date = req.body.date;
    if (!DATE_RE.test(date || '')) return res.status(400).json({ success: false, error: 'Fecha inválida' });
    const mealType = req.body.meal_type || tpl.meal_type;
    if (!MEAL_TYPES.includes(mealType)) return res.status(400).json({ success: false, error: 'Indica la comida (meal_type)' });

    const items = db.prepare('SELECT * FROM meal_template_items WHERE template_id = ?').all(tpl.id);
    const tx = db.transaction(() => {
      for (const it of items) {
        const kcal = it.grams ? (it.kcal_per_100g * it.grams / 100) : it.kcal_per_100g;
        insertEntry(req.user.id, date, mealType, {
          food_id: it.food_id, food_name_snapshot: it.food_name_snapshot,
          grams: it.grams, units: it.units, unit_label: it.unit_label, kcal,
        });
        if (it.food_id) db.prepare('UPDATE foods SET times_used = times_used + 1 WHERE id = ?').run(it.food_id);
      }
    });
    tx();
    const totals = recalcDailyLog(req.user.id, date);
    res.json({ success: true, data: { totals, applied: items.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/meals/templates/:id
router.delete('/templates/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM meal_templates WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    if (info.changes === 0) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/meals/copy-day — copia las entradas de un día a otro (opcionalmente una comida)
router.post('/copy-day', (req, res) => {
  try {
    const { from_date, to_date, meal_type } = req.body;
    if (!DATE_RE.test(from_date || '') || !DATE_RE.test(to_date || '')) {
      return res.status(400).json({ success: false, error: 'Fechas inválidas' });
    }
    if (meal_type && !MEAL_TYPES.includes(meal_type)) return res.status(400).json({ success: false, error: 'meal_type inválido' });

    let query = 'SELECT * FROM meal_entries WHERE user_id = ? AND date = ?';
    const params = [req.user.id, from_date];
    if (meal_type) { query += ' AND meal_type = ?'; params.push(meal_type); }
    const entries = db.prepare(query).all(...params);
    if (entries.length === 0) return res.status(400).json({ success: false, error: 'No hay nada que copiar de ese día' });

    const tx = db.transaction(() => {
      for (const e of entries) {
        insertEntry(req.user.id, to_date, e.meal_type, {
          food_id: e.food_id, food_name_snapshot: e.food_name_snapshot,
          grams: e.grams, units: e.units, unit_label: e.unit_label, kcal: e.kcal,
        });
        if (e.food_id) db.prepare('UPDATE foods SET times_used = times_used + 1 WHERE id = ?').run(e.food_id);
      }
    });
    tx();
    const totals = recalcDailyLog(req.user.id, to_date);
    res.json({ success: true, data: { totals, copied: entries.length } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

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

// POST /api/meals/parse-text — interpreta texto libre ("pan tostado 60g y un café")
// con IA. Devuelve una PREVISUALIZACIÓN (no guarda nada). Para cada alimento ya
// presente en la caché del usuario se usa su valor guardado (sin gastar tokens
// en re-estimarlo); el resto los estima el modelo.
router.post('/parse-text', async (req, res) => {
  try {
    if (!openai.isConfigured()) {
      return res.status(503).json({ success: false, error: 'El reconocimiento por texto no está disponible (falta configurar OPENAI_API_KEY).' });
    }
    const text = (req.body.text || '').toString().trim();
    if (!text) return res.status(400).json({ success: false, error: 'Escribe qué has comido' });

    const modelRow = db.prepare("SELECT value FROM app_config WHERE key = 'openai_model'").get();
    let parsed;
    try {
      parsed = await openai.parseFreeText(text, { model: modelRow?.value });
    } catch (e) {
      if (e.code === 'NO_KEY') return res.status(503).json({ success: false, error: 'OPENAI_API_KEY no configurada' });
      return res.status(502).json({ success: false, error: 'No se pudo interpretar el texto ahora mismo. Inténtalo de nuevo.' });
    }

    const cache = db.prepare('SELECT * FROM foods WHERE user_id = ?').all(req.user.id);

    const items = parsed.items.map(it => {
      // ¿Está ya en la caché del usuario? (match fuzzy por nombre)
      let best = null, bestScore = 0;
      for (const f of cache) {
        const s = fuzzyScore(it.name, f.name);
        if (s > bestScore) { bestScore = s; best = f; }
      }
      const matched = bestScore >= 75 ? best : null;
      const kcalPer100 = matched ? matched.kcal_per_100g : it.kcal_per_100g;
      return {
        name: matched ? matched.name : it.name,
        grams: it.grams,
        kcal_per_100g: kcalPer100,
        kcal: Math.round(kcalPer100 * it.grams / 100),
        from_cache: !!matched,
        food_id: matched ? matched.id : null,
      };
    });

    const total_kcal = items.reduce((s, i) => s + i.kcal, 0);
    res.json({ success: true, data: { items, total_kcal } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
