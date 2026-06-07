// utils/usage.js — registra el uso de IA y su coste en token_usage.
const db = require('../db/database');
const { computeCostEur } = require('./pricing');

// Registra una llamada a IA. `usage` es el objeto de OpenAI ({prompt_tokens, completion_tokens}).
// Nunca lanza: si algo falla, no debe tumbar la petición principal.
function recordUsage(userId, endpoint, model, usage) {
  try {
    const input  = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
    const output = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
    const cost = computeCostEur(model, input, output);
    db.prepare(`
      INSERT INTO token_usage (user_id, endpoint, model, input_tokens, output_tokens, cost_eur)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, endpoint, model, input, output, cost);
    return cost;
  } catch {
    return 0;
  }
}

module.exports = { recordUsage };
