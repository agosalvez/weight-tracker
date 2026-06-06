// utils/meals.js — helpers para desglose por comidas y agregación diaria

const MEAL_TYPES = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'snack'];

// Mapeo a las columnas legacy de daily_logs (kcal_breakfast/lunch/dinner/snacks).
// Mantenemos compatibilidad para que las gráficas y stats existentes sigan funcionando.
const LEGACY_BUCKET = {
  desayuno: 'kcal_breakfast',
  almuerzo: 'kcal_breakfast',  // almuerzo cuenta como mañana
  comida:   'kcal_lunch',
  merienda: 'kcal_snacks',
  cena:     'kcal_dinner',
  snack:    'kcal_snacks',
};

// Calcula kcal de una entrada en función de la cantidad (gramos o unidades)
// y la densidad calórica del alimento (kcal/100g).
// Si vienen "units" + "grams_per_unit" en el alimento, asume gramos = units * grams_per_unit.
function computeEntryKcal({ kcal_per_100g, grams, units, grams_per_unit }) {
  if (grams != null && grams > 0) {
    return Math.round((kcal_per_100g * grams) / 100);
  }
  if (units != null && units > 0 && grams_per_unit) {
    return Math.round((kcal_per_100g * units * grams_per_unit) / 100);
  }
  return 0;
}

// Devuelve un objeto con totales por bucket legacy para un array de entradas.
function aggregateLegacyBuckets(entries) {
  const buckets = {
    kcal_breakfast: 0,
    kcal_lunch: 0,
    kcal_dinner: 0,
    kcal_snacks: 0,
    kcal_total: 0,
  };
  for (const e of entries) {
    const col = LEGACY_BUCKET[e.meal_type];
    if (col && buckets[col] != null) buckets[col] += e.kcal || 0;
    buckets.kcal_total += e.kcal || 0;
  }
  for (const k of Object.keys(buckets)) buckets[k] = Math.round(buckets[k]) || null;
  return buckets;
}

// Búsqueda fuzzy simple sobre nombres (normaliza acentos y trocea por palabras).
function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyScore(query, candidate) {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 90;
  if (c.includes(q)) return 75;
  const qTokens = q.split(' ');
  const cTokens = new Set(c.split(' '));
  const hits = qTokens.filter(t => cTokens.has(t)).length;
  if (hits === 0) return 0;
  return Math.round((hits / qTokens.length) * 60);
}

module.exports = {
  MEAL_TYPES,
  LEGACY_BUCKET,
  computeEntryKcal,
  aggregateLegacyBuckets,
  normalize,
  fuzzyScore,
};
