const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');
const { fuzzyScore, normalize } = require('../../utils/meals');
const off = require('../../utils/openfoodfacts');
const openai = require('../../utils/openai');
const { recordUsage } = require('../../utils/usage');

router.use(requireAuth);

const VALID_SOURCES = ['manual', 'barcode', 'label_photo', 'ai_text', 'ai_vision'];

function validateFoodPayload(body) {
  const errors = [];
  const name = (body.name || '').trim();
  if (!name) errors.push('El nombre es obligatorio');
  if (name.length > 120) errors.push('El nombre no puede superar 120 caracteres');

  const kcal = parseFloat(body.kcal_per_100g);
  if (isNaN(kcal) || kcal < 0 || kcal > 1000) {
    errors.push('kcal_per_100g debe ser un número entre 0 y 1000');
  }

  const source = body.source || 'manual';
  if (!VALID_SOURCES.includes(source)) {
    errors.push(`source inválido (válidos: ${VALID_SOURCES.join(', ')})`);
  }

  return { errors, value: {
    name,
    brand: body.brand ? String(body.brand).trim().slice(0, 80) : null,
    barcode: body.barcode ? String(body.barcode).trim().slice(0, 32) : null,
    kcal_per_100g: kcal,
    protein_g: body.protein_g != null ? parseFloat(body.protein_g) : null,
    carbs_g:   body.carbs_g   != null ? parseFloat(body.carbs_g)   : null,
    fat_g:     body.fat_g     != null ? parseFloat(body.fat_g)     : null,
    source,
    confidence: body.confidence != null ? Math.max(0, Math.min(100, parseInt(body.confidence))) : 100,
  }};
}

// GET /api/foods — listar alimentos del usuario, ordenados por más usados
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM foods
      WHERE user_id = ?
      ORDER BY times_used DESC, name ASC
      LIMIT 500
    `).all(req.user.id);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/foods/search?q=jamon — búsqueda fuzzy en el caché personal
router.get('/search', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.json({ success: true, data: [] });

    const all = db.prepare('SELECT * FROM foods WHERE user_id = ?').all(req.user.id);
    const scored = all
      .map(f => ({ ...f, score: Math.max(
        fuzzyScore(q, f.name),
        f.brand ? fuzzyScore(q, `${f.name} ${f.brand}`) : 0,
      ) }))
      .filter(f => f.score > 0)
      .sort((a, b) => b.score - a.score || b.times_used - a.times_used)
      .slice(0, 20);

    res.json({ success: true, data: scored });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/foods/catalog/search?q= — busca productos en Open Food Facts por nombre.
// No persiste nada: el cliente decide qué importar a su caché vía POST /api/foods.
router.get('/catalog/search', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store'); // resultados de búsqueda nunca cacheados
    const q = (req.query.q || '').toString().trim();
    if (q.length < 2) return res.json({ success: true, data: [] });

    let results = [];
    try {
      results = (await off.searchByName(q, 15)).map(f => ({ ...f, origin: 'openfoodfacts' }));
    } catch {
      results = []; // Open Food Facts caído → lista vacía, el usuario puede crear a mano
    }

    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/foods/catalog/barcode/:code — busca un producto por código de barras.
router.get('/catalog/barcode/:code', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const code = (req.params.code || '').replace(/\D/g, '');
    if (!code) return res.status(400).json({ success: false, error: 'Código de barras inválido' });

    // 1) ¿Ya lo tiene el usuario en su caché por barcode?
    const cached = db.prepare('SELECT * FROM foods WHERE user_id = ? AND barcode = ?')
      .get(req.user.id, code);
    if (cached) return res.json({ success: true, data: { food: cached, origin: 'cache' } });

    // 2) Open Food Facts
    const product = await off.getByBarcode(code);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado. Prueba a crearlo a mano o con foto a la etiqueta.' });
    }
    res.json({ success: true, data: { food: { ...product, origin: 'openfoodfacts' }, origin: 'openfoodfacts' } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/foods/from-label-photo — lee una etiqueta nutricional con IA (Vision).
// Devuelve una previsualización (no guarda); el cliente la crea con POST /api/foods.
router.post('/from-label-photo', async (req, res) => {
  try {
    if (!openai.isConfigured()) {
      return res.status(503).json({ success: false, error: 'La lectura por foto no está disponible (falta configurar OPENAI_API_KEY).' });
    }
    const { image } = req.body;
    if (!image) return res.status(400).json({ success: false, error: 'Falta la imagen' });

    const modelRow = db.prepare("SELECT value FROM app_config WHERE key = 'openai_model'").get();
    let result;
    try {
      result = await openai.parseLabelPhoto(image, { model: modelRow?.value });
    } catch (e) {
      if (e.code === 'NO_KEY') return res.status(503).json({ success: false, error: 'OPENAI_API_KEY no configurada' });
      if (e.code === 'BAD_IMAGE') return res.status(400).json({ success: false, error: 'Imagen inválida' });
      return res.status(502).json({ success: false, error: 'No se pudo leer la etiqueta ahora mismo. Inténtalo de nuevo.' });
    }

    if (result.usage) recordUsage(req.user.id, 'label_photo', result.model, result.usage);

    if (!result.food) {
      return res.status(422).json({ success: false, error: 'No he podido leer las calorías de la etiqueta. Prueba con más luz o enfoca la tabla nutricional.' });
    }
    res.json({ success: true, data: { food: { ...result.food, source: 'label_photo', confidence: 90, origin: 'label_photo' } } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/foods/:id
router.get('/:id', (req, res) => {
  try {
    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!food) return res.status(404).json({ success: false, error: 'Alimento no encontrado' });
    res.json({ success: true, data: food });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/foods — crear alimento en el caché del usuario
router.post('/', (req, res) => {
  try {
    const { errors, value } = validateFoodPayload(req.body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

    // Si ya existe (mismo user_id + name + brand), devolverlo en vez de duplicar
    const existing = db.prepare(`
      SELECT * FROM foods WHERE user_id = ? AND LOWER(name) = LOWER(?) AND IFNULL(brand,'') = IFNULL(?, '')
    `).get(req.user.id, value.name, value.brand);
    if (existing) {
      return res.json({ success: true, data: existing, deduplicated: true });
    }

    const info = db.prepare(`
      INSERT INTO foods (user_id, name, brand, barcode, kcal_per_100g, protein_g, carbs_g, fat_g, source, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, value.name, value.brand, value.barcode, value.kcal_per_100g,
           value.protein_g, value.carbs_g, value.fat_g, value.source, value.confidence);

    const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(info.lastInsertRowid);
    res.json({ success: true, data: food });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/foods/:id — editar alimento (parcial)
router.patch('/:id', (req, res) => {
  try {
    const food = db.prepare('SELECT * FROM foods WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!food) return res.status(404).json({ success: false, error: 'Alimento no encontrado' });

    const fields = ['name', 'brand', 'barcode', 'kcal_per_100g', 'protein_g', 'carbs_g', 'fat_g', 'confidence'];
    const updates = [];
    const params  = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }
    if (!updates.length) return res.json({ success: true, data: food });

    params.push(req.user.id, req.params.id);
    db.prepare(`UPDATE foods SET ${updates.join(', ')}, updated_at = datetime('now') WHERE user_id = ? AND id = ?`)
      .run(...params);

    const updated = db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/foods/:id
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM foods WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    if (info.changes === 0) {
      return res.status(404).json({ success: false, error: 'Alimento no encontrado' });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
