// Integration tests for label photo (Vision) + AI cost recording
const request = require('supertest');
const db = require('../db/database');
const openai = require('../utils/openai');
const foodsRouter = require('../routes/api/foods');
const statsRouter = require('../routes/api/stats');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/foods': foodsRouter, '/api/stats': statsRouter });
const IMG = 'data:image/jpeg;base64,/9j/aaaa';
let user, token;

beforeEach(() => {
  resetDb(db);
  db.prepare("DELETE FROM token_usage").run();
  user = createUser(db, { username: 'alice' });
  token = tokenFor(user);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/foods/from-label-photo', () => {
  it('503 si no hay key', async () => {
    jest.spyOn(openai, 'isConfigured').mockReturnValue(false);
    const res = await request(app).post('/api/foods/from-label-photo')
      .set(authHeader(token)).send({ image: IMG });
    expect(res.status).toBe(503);
  });

  it('400 si falta la imagen', async () => {
    jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
    const res = await request(app).post('/api/foods/from-label-photo')
      .set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  it('devuelve el alimento leído y registra el coste', async () => {
    jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
    jest.spyOn(openai, 'parseLabelPhoto').mockResolvedValue({
      food: { name: 'Galletas', brand: 'Marca', kcal_per_100g: 480, protein_g: 7, carbs_g: 64, fat_g: 21 },
      usage: { prompt_tokens: 1000, completion_tokens: 50 },
      model: 'gpt-4o-mini',
    });
    const res = await request(app).post('/api/foods/from-label-photo')
      .set(authHeader(token)).send({ image: IMG });

    expect(res.status).toBe(200);
    expect(res.body.data.food.name).toBe('Galletas');
    expect(res.body.data.food.source).toBe('label_photo');

    const usage = db.prepare('SELECT * FROM token_usage WHERE user_id = ?').get(user.id);
    expect(usage.endpoint).toBe('label_photo');
    expect(usage.input_tokens).toBe(1000);
    expect(usage.cost_eur).toBeGreaterThan(0);
  });

  it('422 si la IA no pudo leer las kcal', async () => {
    jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
    jest.spyOn(openai, 'parseLabelPhoto').mockResolvedValue({
      food: null, usage: { prompt_tokens: 800, completion_tokens: 10 }, model: 'gpt-4o-mini',
    });
    const res = await request(app).post('/api/foods/from-label-photo')
      .set(authHeader(token)).send({ image: IMG });
    expect(res.status).toBe(422);
    // aún así se registra el gasto (la llamada se hizo)
    expect(db.prepare('SELECT COUNT(*) c FROM token_usage WHERE user_id = ?').get(user.id).c).toBe(1);
  });
});

describe('GET /api/stats/ai-cost', () => {
  it('suma el gasto del usuario', async () => {
    db.prepare(`INSERT INTO token_usage (user_id, endpoint, model, input_tokens, output_tokens, cost_eur) VALUES (?, 'label_photo','gpt-4o-mini',1000,50,0.0005)`).run(user.id);
    db.prepare(`INSERT INTO token_usage (user_id, endpoint, model, input_tokens, output_tokens, cost_eur) VALUES (?, 'parse_text','gpt-4o-mini',80,30,0.0001)`).run(user.id);
    const res = await request(app).get('/api/stats/ai-cost').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.total_cost).toBeCloseTo(0.0006, 6);
    expect(res.body.data.month_calls).toBe(2);
  });

  it('no mezcla el gasto de otros usuarios', async () => {
    const other = createUser(db, { username: 'bob' });
    db.prepare(`INSERT INTO token_usage (user_id, endpoint, model, input_tokens, output_tokens, cost_eur) VALUES (?, 'parse_text','gpt-4o-mini',80,30,0.5)`).run(other.id);
    const res = await request(app).get('/api/stats/ai-cost').set(authHeader(token));
    expect(res.body.data.total_cost).toBe(0);
  });
});

describe('sanitizeLabel (kJ y validación)', () => {
  it('rechaza kcal fuera de rango', () => {
    expect(openai.sanitizeLabel({ kcal_per_100g: 0 })).toBeNull();
    expect(openai.sanitizeLabel({ kcal_per_100g: 5000 })).toBeNull();
  });
  it('acepta y redondea valores válidos', () => {
    const f = openai.sanitizeLabel({ name: 'X', kcal_per_100g: 86.4, protein_g: 1.49, carbs_g: 10, fat_g: 4.2 });
    expect(f.kcal_per_100g).toBe(86);
    expect(f.protein_g).toBe(1.5);
  });
});
