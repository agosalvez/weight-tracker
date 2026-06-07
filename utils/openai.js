// utils/openai.js — parsing de lenguaje natural a alimentos con OpenAI (gpt-4o-mini)
// La API key se lee SOLO del entorno (Portainer). Si no está, las funciones
// lanzan un error con code='NO_KEY' y la app degrada con elegancia.

const MODEL    = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'Eres un parser nutricional. Recibes una descripción libre en español de una ' +
  'ingesta de comida. Devuelve SOLO un JSON con esta forma exacta: ' +
  '{"items":[{"name":"<nombre del alimento en singular y normalizado>",' +
  '"grams":<número de gramos estimados>,"kcal_per_100g":<número>}]}. ' +
  'Si no se indica la cantidad, estima una ración típica en gramos. ' +
  'kcal_per_100g es la densidad calórica por 100 g del alimento. ' +
  'No incluyas texto fuera del JSON, ni explicaciones, ni unidades en los números.';

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
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
async function parseFreeText(text) {
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
      model: MODEL,
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

  return { items: sanitizeItems(parsed), usage: data.usage || null };
}

module.exports = { isConfigured, parseFreeText, sanitizeItems, MODEL };
