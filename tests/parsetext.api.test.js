// Integration tests for POST /api/meals/parse-text
const request = require('supertest');
const db = require('../db/database');
const openai = require('../utils/openai');
const mealsRouter = require('../routes/api/meals');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/meals': mealsRouter });
let user, token;

beforeEach(() => {
  resetDb(db);
  user = createUser(db, { username: 'alice' });
  token = tokenFor(user);
});
afterEach(() => jest.restoreAllMocks());

it('503 si OpenAI no está configurado', async () => {
  jest.spyOn(openai, 'isConfigured').mockReturnValue(false);
  const res = await request(app).post('/api/meals/parse-text')
    .set(authHeader(token)).send({ text: 'pan tostado 60g' });
  expect(res.status).toBe(503);
});

it('400 si no hay texto', async () => {
  jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
  const res = await request(app).post('/api/meals/parse-text')
    .set(authHeader(token)).send({ text: '' });
  expect(res.status).toBe(400);
});

it('devuelve preview con kcal calculadas (no guarda nada)', async () => {
  jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
  jest.spyOn(openai, 'parseFreeText').mockResolvedValue({
    items: [{ name: 'Pan tostado', grams: 60, kcal_per_100g: 290 }], usage: null,
  });
  const res = await request(app).post('/api/meals/parse-text')
    .set(authHeader(token)).send({ text: 'pan tostado 60 gramos' });

  expect(res.status).toBe(200);
  expect(res.body.data.items[0]).toMatchObject({ name: 'Pan tostado', grams: 60, kcal: 174, from_cache: false });
  expect(res.body.data.total_kcal).toBe(174);
  // No se ha creado ninguna entrada ni alimento
  expect(db.prepare('SELECT COUNT(*) c FROM meal_entries').get().c).toBe(0);
  expect(db.prepare('SELECT COUNT(*) c FROM foods').get().c).toBe(0);
});

it('usa el valor de la caché si el alimento ya existe (sin re-estimar)', async () => {
  db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Pan tostado', 250)`).run(user.id);
  jest.spyOn(openai, 'isConfigured').mockReturnValue(true);
  jest.spyOn(openai, 'parseFreeText').mockResolvedValue({
    items: [{ name: 'pan tostado', grams: 60, kcal_per_100g: 999 }], usage: null, // estimación absurda
  });
  const res = await request(app).post('/api/meals/parse-text')
    .set(authHeader(token)).send({ text: 'pan tostado 60g' });

  const item = res.body.data.items[0];
  expect(item.from_cache).toBe(true);
  expect(item.kcal_per_100g).toBe(250);     // usa el de la caché, no el 999 del modelo
  expect(item.kcal).toBe(150);              // 250 * 60 / 100
  expect(item.food_id).toBeTruthy();
});
