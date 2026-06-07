// utils/pricing.js — cálculo de coste de las llamadas a OpenAI en euros.
// Precios en USD por 1M de tokens (a fecha 2026). Configurables por entorno si
// hiciera falta, pero con valores razonables por defecto.

// [input_usd_per_1M, output_usd_per_1M]
const PRICING_USD = {
  'gpt-4o-mini':  [0.15, 0.60],
  'gpt-4o':       [2.50, 10.00],
  'gpt-4.1-mini': [0.40, 1.60],
  'gpt-4.1':      [2.00, 8.00],
};

const FALLBACK = PRICING_USD['gpt-4o-mini'];

function usdToEur() {
  const v = parseFloat(process.env.USD_TO_EUR);
  return isFinite(v) && v > 0 ? v : 0.92;
}

// Coste en euros de una llamada. Redondeado a 6 decimales (céntimos de céntimo).
function computeCostEur(model, inputTokens, outputTokens) {
  const [inUsd, outUsd] = PRICING_USD[model] || FALLBACK;
  const inp = Math.max(0, Number(inputTokens) || 0);
  const out = Math.max(0, Number(outputTokens) || 0);
  const usd = (inp / 1e6) * inUsd + (out / 1e6) * outUsd;
  const eur = usd * usdToEur();
  return Math.round(eur * 1e6) / 1e6;
}

function formatEur(eur) {
  const n = Number(eur) || 0;
  // Para importes muy pequeños mostramos más decimales
  if (n > 0 && n < 0.01) return n.toFixed(4) + ' €';
  return n.toFixed(2) + ' €';
}

module.exports = { PRICING_USD, computeCostEur, formatEur, usdToEur };
