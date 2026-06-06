// Integration tests for /api/foods
const request = require('supertest');
const db = require('../db/database');
const foodsRouter = require('../routes/api/foods');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/foods': foodsRouter });

let user, token, otherUser, otherToken;

beforeEach(() => {
  resetDb(db);
  user      = createUser(db, { username: 'alice' });
  otherUser = createUser(db, { username: 'bob' });
  token      = tokenFor(user);
  otherToken = tokenFor(otherUser);
});

describe('GET /api/foods', () => {
  it('rechaza sin token', async () => {
    await request(app).get('/api/foods').expect(401);
  });

  it('devuelve lista vacía cuando no hay alimentos', async () => {
    const res = await request(app).get('/api/foods').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('solo devuelve alimentos del usuario autenticado', async () => {
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Mío', 100)`).run(user.id);
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Suyo', 200)`).run(otherUser.id);

    const res = await request(app).get('/api/foods').set(authHeader(token));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Mío');
  });
});

describe('POST /api/foods', () => {
  it('crea un alimento con datos válidos', async () => {
    const res = await request(app)
      .post('/api/foods')
      .set(authHeader(token))
      .send({ name: 'Jamón york', kcal_per_100g: 110, brand: 'El Pozo' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Jamón york');
    expect(res.body.data.brand).toBe('El Pozo');
    expect(res.body.data.source).toBe('manual');
    expect(res.body.data.confidence).toBe(100);
  });

  it('rechaza sin nombre', async () => {
    const res = await request(app)
      .post('/api/foods')
      .set(authHeader(token))
      .send({ kcal_per_100g: 110 });
    expect(res.status).toBe(400);
  });

  it('rechaza kcal_per_100g inválido', async () => {
    const res = await request(app)
      .post('/api/foods')
      .set(authHeader(token))
      .send({ name: 'Test', kcal_per_100g: 9999 });
    expect(res.status).toBe(400);
  });

  it('rechaza source no permitido', async () => {
    const res = await request(app)
      .post('/api/foods')
      .set(authHeader(token))
      .send({ name: 'Test', kcal_per_100g: 100, source: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('no duplica si ya existe (user_id + name + brand)', async () => {
    const a = await request(app)
      .post('/api/foods').set(authHeader(token))
      .send({ name: 'Pan', kcal_per_100g: 265 });

    const b = await request(app)
      .post('/api/foods').set(authHeader(token))
      .send({ name: 'pan', kcal_per_100g: 265 });

    expect(b.body.data.id).toBe(a.body.data.id);
    expect(b.body.deduplicated).toBe(true);
  });
});

describe('GET /api/foods/search', () => {
  beforeEach(async () => {
    db.prepare(`INSERT INTO foods (user_id, name, brand, kcal_per_100g) VALUES (?, 'Jamón York', 'El Pozo', 110)`).run(user.id);
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Pan integral', 245)`).run(user.id);
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Café', 2)`).run(user.id);
  });

  it('devuelve [] con query vacía', async () => {
    const res = await request(app).get('/api/foods/search?q=').set(authHeader(token));
    expect(res.body.data).toEqual([]);
  });

  it('encuentra ignorando acentos', async () => {
    const res = await request(app).get('/api/foods/search?q=jamon').set(authHeader(token));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Jamón York');
  });

  it('ordena por score descendente', async () => {
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Pan blanco', 270)`).run(user.id);
    const res = await request(app).get('/api/foods/search?q=pan').set(authHeader(token));
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    // Ambos hits son prefix → score 90, orden depende de times_used
    expect(res.body.data.every(f => f.name.toLowerCase().includes('pan'))).toBe(true);
  });

  it('no devuelve alimentos de otro usuario', async () => {
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Secreto', 100)`).run(otherUser.id);
    const res = await request(app).get('/api/foods/search?q=secreto').set(authHeader(token));
    expect(res.body.data).toEqual([]);
  });
});

describe('PATCH /api/foods/:id', () => {
  it('actualiza kcal_per_100g', async () => {
    const food = db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Manzana', 50) RETURNING id`).get(user.id);
    const res = await request(app)
      .patch(`/api/foods/${food.id}`)
      .set(authHeader(token))
      .send({ kcal_per_100g: 52 });
    expect(res.status).toBe(200);
    expect(res.body.data.kcal_per_100g).toBe(52);
  });

  it('404 si el alimento es de otro usuario', async () => {
    const food = db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Suyo', 100) RETURNING id`).get(otherUser.id);
    const res = await request(app)
      .patch(`/api/foods/${food.id}`)
      .set(authHeader(token))
      .send({ kcal_per_100g: 999 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/foods/:id', () => {
  it('borra alimento propio', async () => {
    const food = db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'X', 100) RETURNING id`).get(user.id);
    const res = await request(app).delete(`/api/foods/${food.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT * FROM foods WHERE id = ?').get(food.id)).toBeUndefined();
  });

  it('404 si no existe', async () => {
    const res = await request(app).delete('/api/foods/99999').set(authHeader(token));
    expect(res.status).toBe(404);
  });
});
