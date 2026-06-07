// utils/openfoodfacts.js — cliente de Open Food Facts (búsqueda por nombre y código de barras)
// Gratis, sin API key. Documentación: https://openfoodfacts.github.io/openfoodfacts-server/api/

const SEARCH_BASE  = 'https://es.openfoodfacts.org/cgi/search.pl';
const PRODUCT_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'code,product_name,product_name_es,brands,nutriments';
const USER_AGENT = 'WeightTracker/3.1 (https://weight-tracker.gosalvez.es)';

function buildSearchUrl(q) {
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '20',
    fields: FIELDS,
  });
  return `${SEARCH_BASE}?${params.toString()}`;
}

function buildBarcodeUrl(code) {
  return `${PRODUCT_BASE}/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
}

// Convierte un producto de Open Food Facts a nuestro schema de `foods`.
// Devuelve null si el producto no es usable (sin nombre o sin kcal/100g).
function mapProduct(off) {
  if (!off) return null;
  const name = (off.product_name_es || off.product_name || '').trim();
  if (!name) return null;

  const n = off.nutriments || {};
  const kcal = n['energy-kcal_100g'];
  if (kcal == null || isNaN(kcal)) return null;

  const brand = (off.brands || '').split(',')[0].trim();

  const macro = (v) => (v == null || isNaN(v) ? null : Math.round(v * 10) / 10);

  return {
    name: name.slice(0, 120),
    brand: brand ? brand.slice(0, 80) : null,
    barcode: off.code ? String(off.code) : null,
    kcal_per_100g: Math.round(kcal),
    protein_g: macro(n.proteins_100g),
    carbs_g:   macro(n.carbohydrates_100g),
    fat_g:     macro(n.fat_100g),
    source: 'barcode',
    confidence: 95,
  };
}

async function _fetchJson(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Búsqueda por nombre. Devuelve array de alimentos mapeados (puede estar vacío).
// El endpoint de texto de Open Food Facts es lento e intermitente, por eso damos
// más margen y reintentamos una vez si la primera respuesta viene vacía.
async function searchByName(q, limit = 12) {
  let data = await _fetchJson(buildSearchUrl(q), 11000);
  if (!data || !Array.isArray(data.products) || data.products.length === 0) {
    data = await _fetchJson(buildSearchUrl(q), 11000); // reintento
  }
  if (!data || !Array.isArray(data.products)) return [];
  const seen = new Set();
  const out = [];
  for (const p of data.products) {
    const mapped = mapProduct(p);
    if (!mapped) continue;
    const key = (mapped.name + '|' + (mapped.brand || '')).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mapped);
    if (out.length >= limit) break;
  }
  return out;
}

// Lookup por código de barras. Devuelve un alimento mapeado o null.
async function getByBarcode(code) {
  const data = await _fetchJson(buildBarcodeUrl(code));
  if (!data || data.status !== 1 || !data.product) return null;
  return mapProduct({ ...data.product, code: data.code || code });
}

module.exports = { mapProduct, buildSearchUrl, buildBarcodeUrl, searchByName, getByBarcode };
