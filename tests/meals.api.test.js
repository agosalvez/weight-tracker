// Integration tests for /api/meals
const request = require('supertest');
const db = require('../db/database');
const mealsRouter = require('../routes/api/meals');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/meals': mealsRouter });

let user, token, otherUser, otherToken, food;

function makeFood(userId, name, kcal_per_100g) {
  return db.prepare(
    `INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, ?, ?) RETURNING *`
  ).get(userId, name, kcal_per_100g);
}

beforeEach(() => {
  resetDb(db);
  user      = createUser(db, { username: 'alice' });
  otherUser = createUser(db, { username: 'bob' });
  token      = tokenFor(user);
  otherToken = tokenFor(otherUser);
  food = makeFood(user.id, 'Pan', 265);
});

describe('GET /api/meals/:date', () => {
  it('rechaza fecha mal formada', async () => {
    const res = await request(app).get('/api/meals/2025-1-1').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('devuelve estructura vacía si no hay entradas', async () => {
    const res = await request(app).get('/api/meals/2026-01-15').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.entries).toEqual([]);
    expect(res.body.data.byMeal.desayuno).toEqual([]);
    expect(res.body.data.totals.kcal_total).toBeNull();
  });

  it('agrupa por meal_type', async () => {
    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });
    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'comida', food_id: food.id, grams: 50 });

    const res = await request(app).get('/api/meals/2026-01-15').set(authHeader(token));
    expect(res.body.data.byMeal.desayuno).toHaveLength(1);
    expect(res.body.data.byMeal.comida).toHaveLength(1);
    expect(res.body.data.byMeal.cena).toEqual([]);
  });
});

describe('POST /api/meals', () => {
  it('crea una entrada y calcula kcal', async () => {
    const res = await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });

    expect(res.status).toBe(200);
    expect(res.body.data.entry.kcal).toBe(212); // 265 * 80 / 100 = 212
    expect(res.body.data.entry.meal_type).toBe('desayuno');
  });

  it('rechaza meal_type inválido', async () => {
    const res = await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'brunch', food_id: food.id, grams: 80 });
    expect(res.status).toBe(400);
  });

  it('rechaza si food_id pertenece a otro usuario', async () => {
    const otherFood = makeFood(otherUser.id, 'X', 100);
    const res = await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: otherFood.id, grams: 50 });
    expect(res.status).toBe(404);
  });

  it('rechaza sin cantidad', async () => {
    const res = await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id });
    expect(res.status).toBe(400);
  });

  it('incrementa times_used del alimento', async () => {
    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });
    const updated = db.prepare('SELECT times_used FROM foods WHERE id = ?').get(food.id);
    expect(updated.times_used).toBe(1);
  });

  it('crea daily_log con calories_source=from_meals automáticamente', async () => {
    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });
    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'cena', food_id: food.id, grams: 100 });

    const log = db.prepare('SELECT * FROM daily_logs WHERE user_id = ? AND date = ?')
      .get(user.id, '2026-01-15');
    expect(log).toBeDefined();
    expect(log.calories_source).toBe('from_meals');
    expect(log.kcal_total).toBe(477); // 212 + 265
    expect(log.kcal_breakfast).toBe(212);
    expect(log.kcal_dinner).toBe(265);
  });

  it('no sobreescribe daily_log si calories_source=manual', async () => {
    db.prepare(`INSERT INTO daily_logs (user_id, date, kcal_total, calories_source) VALUES (?, ?, ?, 'manual')`)
      .run(user.id, '2026-01-15', 1500);

    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });

    const log = db.prepare('SELECT * FROM daily_logs WHERE user_id = ? AND date = ?')
      .get(user.id, '2026-01-15');
    expect(log.kcal_total).toBe(1500); // intocado
  });
});

describe('DELETE /api/meals/:id', () => {
  it('borra la entrada y recalcula el daily_log', async () => {
    const created = await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });
    const entryId = created.body.data.entry.id;

    const res = await request(app).delete(`/api/meals/${entryId}`).set(authHeader(token));
    expect(res.status).toBe(200);

    const log = db.prepare('SELECT kcal_total FROM daily_logs WHERE user_id = ? AND date = ?')
      .get(user.id, '2026-01-15');
    expect(log.kcal_total).toBeNull();
  });

  it('404 si la entrada es de otro usuario', async () => {
    const otherFood = makeFood(otherUser.id, 'X', 100);
    const e = db.prepare(`INSERT INTO meal_entries (user_id, date, meal_type, food_id, food_name_snapshot, grams, kcal) VALUES (?, ?, 'desayuno', ?, 'X', 50, 50) RETURNING id`)
      .get(otherUser.id, '2026-01-15', otherFood.id);
    const res = await request(app).delete(`/api/meals/${e.id}`).set(authHeader(token));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/meals/:date/use-from-meals', () => {
  it('cambia calories_source a from_meals y recalcula', async () => {
    db.prepare(`INSERT INTO daily_logs (user_id, date, kcal_total, calories_source) VALUES (?, ?, ?, 'manual')`)
      .run(user.id, '2026-01-15', 1500);

    await request(app).post('/api/meals').set(authHeader(token))
      .send({ date: '2026-01-15', meal_type: 'desayuno', food_id: food.id, grams: 80 });
    // En este punto sigue siendo manual y kcal_total = 1500
    expect(db.prepare('SELECT kcal_total FROM daily_logs WHERE user_id = ?').get(user.id).kcal_total).toBe(1500);

    const res = await request(app).post('/api/meals/2026-01-15/use-from-meals').set(authHeader(token));
    expect(res.status).toBe(200);

    const log = db.prepare('SELECT * FROM daily_logs WHERE user_id = ? AND date = ?')
      .get(user.id, '2026-01-15');
    expect(log.calories_source).toBe('from_meals');
    expect(log.kcal_total).toBe(212);
  });
});
