// Integration tests for meal templates + copy-day
const request = require('supertest');
const db = require('../db/database');
const mealsRouter = require('../routes/api/meals');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/meals': mealsRouter });
let user, token, food;

beforeEach(() => {
  resetDb(db);
  user = createUser(db, { username: 'alice' });
  token = tokenFor(user);
  food = db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Pan', 265) RETURNING *`).get(user.id);
});

async function addEntry(date, meal_type, grams = 80) {
  return request(app).post('/api/meals').set(authHeader(token))
    .send({ date, meal_type, food_id: food.id, grams });
}

describe('POST /api/meals/templates', () => {
  it('guarda una comida del día como habitual', async () => {
    await addEntry('2026-01-10', 'desayuno', 80);
    const res = await request(app).post('/api/meals/templates').set(authHeader(token))
      .send({ date: '2026-01-10', meal_type: 'desayuno', name: 'Desayuno típico' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeTruthy();
    const items = db.prepare('SELECT * FROM meal_template_items WHERE template_id = ?').all(res.body.data.id);
    expect(items).toHaveLength(1);
    expect(items[0].kcal_per_100g).toBe(265);
  });

  it('400 si no hay alimentos ese día', async () => {
    const res = await request(app).post('/api/meals/templates').set(authHeader(token))
      .send({ date: '2026-01-10', meal_type: 'desayuno', name: 'Vacío' });
    expect(res.status).toBe(400);
  });

  it('400 sin nombre', async () => {
    await addEntry('2026-01-10', 'desayuno');
    const res = await request(app).post('/api/meals/templates').set(authHeader(token))
      .send({ date: '2026-01-10', meal_type: 'desayuno', name: '' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/meals/templates', () => {
  it('lista con conteo y kcal totales, no colisiona con /:date', async () => {
    await addEntry('2026-01-10', 'desayuno', 80); // 212 kcal
    await request(app).post('/api/meals/templates').set(authHeader(token))
      .send({ date: '2026-01-10', meal_type: 'desayuno', name: 'Desayuno típico' });

    const res = await request(app).get('/api/meals/templates').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].item_count).toBe(1);
    expect(res.body.data[0].total_kcal).toBe(212);
  });
});

describe('POST /api/meals/templates/:id/apply', () => {
  it('aplica la plantilla a otro día y recalcula', async () => {
    await addEntry('2026-01-10', 'desayuno', 80);
    const t = await request(app).post('/api/meals/templates').set(authHeader(token))
      .send({ date: '2026-01-10', meal_type: 'desayuno', name: 'Desayuno típico' });

    const res = await request(app).post(`/api/meals/templates/${t.body.data.id}/apply`)
      .set(authHeader(token)).send({ date: '2026-02-01' });
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(1);

    const entries = db.prepare('SELECT * FROM meal_entries WHERE user_id = ? AND date = ?').all(user.id, '2026-02-01');
    expect(entries).toHaveLength(1);
    expect(entries[0].kcal).toBe(212);
    expect(entries[0].meal_type).toBe('desayuno');
  });

  it('404 si la plantilla es de otro usuario', async () => {
    const other = createUser(db, { username: 'bob' });
    const f2 = db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'X', 100) RETURNING *`).get(other.id);
    db.prepare(`INSERT INTO meal_entries (user_id,date,meal_type,food_id,food_name_snapshot,grams,kcal) VALUES (?, '2026-01-10','cena',?, 'X', 50, 50)`).run(other.id, f2.id);
    const ot = tokenFor(other);
    const t = await request(app).post('/api/meals/templates').set(authHeader(ot))
      .send({ date: '2026-01-10', meal_type: 'cena', name: 'Suya' });
    const res = await request(app).post(`/api/meals/templates/${t.body.data.id}/apply`)
      .set(authHeader(token)).send({ date: '2026-02-01' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/meals/copy-day', () => {
  it('copia las comidas de un día a otro', async () => {
    await addEntry('2026-01-10', 'desayuno', 80);
    await addEntry('2026-01-10', 'cena', 100);
    const res = await request(app).post('/api/meals/copy-day').set(authHeader(token))
      .send({ from_date: '2026-01-10', to_date: '2026-01-11' });
    expect(res.status).toBe(200);
    expect(res.body.data.copied).toBe(2);
    const entries = db.prepare('SELECT * FROM meal_entries WHERE user_id = ? AND date = ?').all(user.id, '2026-01-11');
    expect(entries).toHaveLength(2);
  });

  it('400 si el día origen está vacío', async () => {
    const res = await request(app).post('/api/meals/copy-day').set(authHeader(token))
      .send({ from_date: '2026-01-09', to_date: '2026-01-11' });
    expect(res.status).toBe(400);
  });
});
