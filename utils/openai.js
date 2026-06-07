// utils/openai.js — parsing de lenguaje natural a alimentos con OpenAI (gpt-4o-mini)
// La API key se lee SOLO del entorno (Portainer). Si no está, las funciones
// lanzan un error con code='NO_KEY' y la app degrada con elegancia.

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Modelos que el administrador puede elegir desde la configuración.
const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];
const DEFAULT_MODEL  = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Resuelve el modelo a usar: el pedido (si es válido) > env/default.
function resolveModel(requested) {
  return ALLOWED_MODELS.includes(requested) ? requested : DEFAULT_MODEL;
}

const SYSTEM_PROMPT =
  'Eres un parser nutricional. Recibes una descripción libre en español de una ' +
  'ingesta de comida. Devuelve SOLO un JSON con esta forma exacta: ' +
  '{"items":[{"name":"<nombre del alimento en singular y normalizado>",' +
  '"grams":<número de gramos estimados>,"kcal_per_100g":<número>}]}. ' +
  'Si no se indica la cantidad, estima una ración típica en gramos. ' +
  'kcal_per_100g es la densidad calórica por 100 g del alimento. ' +
  'No incluyas texto fuera del JSON, ni explicaciones, ni unidades en los números.';

const LABEL_PROMPT =
  'Eres un lector de etiquetas nutricionales. Recibes la FOTO de una etiqueta de ' +
  'información nutricional (normalmente en español). Devuelve SOLO un JSON con esta ' +
  'forma exacta: {"name":"<nombre del producto si se ve, o cadena vacía>",' +
  '"brand":"<marca si se ve, o cadena vacía>","kcal_per_100g":<número>,' +
  '"protein_g":<número o null>,"carbs_g":<número o null>,"fat_g":<número o null>}. ' +
  'Usa SIEMPRE los valores por 100 g (no por ración). Si la etiqueta solo da kJ, ' +
  'conviértelo a kcal (kcal = kJ / 4.184). Si no puedes leer las kcal, pon ' +
  'kcal_per_100g a 0. No incluyas texto fuera del JSON.';

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

// Valida la respuesta del lector de etiquetas. Devuelve un food o null.
function sanitizeLabel(parsed) {
  if (!parsed) return null;
  const kcal = Number(parsed.kcal_per_100g);
  if (!isFinite(kcal) || kcal <= 0 || kcal > 1000) return null;
  const macro = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null; };
  return {
    name: (parsed.name ? String(parsed.name) : '').trim().slice(0, 120),
    brand: (parsed.brand ? String(parsed.brand) : '').trim().slice(0, 80) || null,
    kcal_per_100g: Math.round(kcal),
    protein_g: macro(parsed.protein_g),
    carbs_g: macro(parsed.carbs_g),
    fat_g: macro(parsed.fat_g),
  };
}

// Lee una etiqueta nutricional desde una imagen (data URL base64).
// Devuelve { food, usage, model }. food puede ser null si no se pudo leer.
async function parseLabelPhoto(imageDataUrl, { model } = {}) {
  if (!isConfigured()) {
    const e = new Error('OPENAI_API_KEY no configurada');
    e.code = 'NO_KEY';
    throw e;
  }
  if (!imageDataUrl || !/^data:image\/(png|jpe?g|webp);base64,/.test(imageDataUrl)) {
    const e = new Error('Imagen inválida');
    e.code = 'BAD_IMAGE';
    throw e;
  }
  const useModel = resolveModel(model);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: useModel,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LABEL_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Lee esta etiqueta nutricional.' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
        ] },
      ],
    }),
  });

  if (!res.ok) {
    const e = new Error(`OpenAI respondió ${res.status}`);
    e.code = 'OPENAI_ERROR';
    throw e;
  }
  const data = await res.json();
  let parsed = {};
  try { parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  return { food: sanitizeLabel(parsed), usage: data.usage || null, model: useModel };
}

// Valida y limpia la estructura devuelta por el modelo.
function sanitizeItems(parsed) {
  if (!parsed || !Array.isArray(parsed.items)) return [];
  const out = [];
  for (const it of parsed.items) {
    const name = (it && it.name ? String(it.name) : '').trim();
    const grams = Number(it && it.grams);
    const kcal  = Number(it && it.kcal_per_100g);
    if (!name) continue;
    if (!isFinite(grams) || grams <= 0) continue;
    if (!isFinite(kcal) || kcal < 0 || kcal > 1000) continue;
    out.push({
      name: name.slice(0, 120),
      grams: Math.round(grams),
      kcal_per_100g: Math.round(kcal),
    });
  }
  return out;
}

// Parsea una descripción libre. Devuelve { items, usage }.
// `model` (opcional) lo decide el administrador; si no es válido cae al default.
async function parseFreeText(text, { model } = {}) {
  if (!isConfigured()) {
    const e = new Error('OPENAI_API_KEY no configurada');
    e.code = 'NO_KEY';
    throw e;
  }
  const clean = (text || '').toString().trim();
  if (!clean) return { items: [], usage: null };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolveModel(model),
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: clean.slice(0, 500) },
      ],
    }),
  });

  if (!res.ok) {
    const e = new Error(`OpenAI respondió ${res.status}`);
    e.code = 'OPENAI_ERROR';
    throw e;
  }

  const data = await res.json();
  let parsed = {};
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch {
    parsed = {};
  }

  return { items: sanitizeItems(parsed), usage: data.usage || null, model: resolveModel(model) };
}

module.exports = { isConfigured, parseFreeText, parseLabelPhoto, sanitizeItems, sanitizeLabel, resolveModel, ALLOWED_MODELS, DEFAULT_MODEL };
