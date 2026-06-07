// Integration tests for /api/foods/catalog/* (Open Food Facts proxy)
const request = require('supertest');
const db = require('../db/database');
const off = require('../utils/openfoodfacts');
const foodsRouter = require('../routes/api/foods');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/foods': foodsRouter });

let user, token;

beforeEach(() => {
  resetDb(db);
  user = createUser(db, { username: 'alice' });
  token = tokenFor(user);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /api/foods/catalog/search', () => {
  it('rechaza sin token', async () => {
    await request(app).get('/api/foods/catalog/search?q=leche').expect(401);
  });

  it('devuelve [] con query corta (<2)', async () => {
    const res = await request(app).get('/api/foods/catalog/search?q=a').set(authHeader(token));
    expect(res.body.data).toEqual([]);
  });

  it('devuelve resultados de Open Food Facts marcados con origin', async () => {
    jest.spyOn(off, 'searchByName').mockResolvedValue([
      { name: 'Leche entera', brand: 'Pascual', barcode: '123', kcal_per_100g: 64, protein_g: 3.2, carbs_g: 4.8, fat_g: 3.6, source: 'barcode', confidence: 95 },
    ]);
    const res = await request(app).get('/api/foods/catalog/search?q=leche').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Leche entera');
    expect(res.body.data[0].origin).toBe('openfoodfacts');
  });

  it('devuelve [] si Open Food Facts falla (no rompe)', async () => {
    jest.spyOn(off, 'searchByName').mockRejectedValue(new Error('OFF down'));
    const res = await request(app).get('/api/foods/catalog/search?q=leche').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/foods/catalog/barcode/:code', () => {
  it('limpia el código y rechaza si queda vacío', async () => {
    const res = await request(app).get('/api/foods/catalog/barcode/abc').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  it('devuelve el alimento de la caché si ya existe por barcode', async () => {
    db.prepare(`INSERT INTO foods (user_id, name, barcode, kcal_per_100g, source) VALUES (?, 'Mi yogur', '8410188012345', 60, 'barcode')`).run(user.id);
    const res = await request(app).get('/api/foods/catalog/barcode/8410188012345').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.origin).toBe('cache');
    expect(res.body.data.food.name).toBe('Mi yogur');
  });

  it('consulta Open Food Facts si no está en caché', async () => {
    jest.spyOn(off, 'getByBarcode').mockResolvedValue({
      name: 'Tomate frito', brand: 'Orlando', barcode: '8410188099999', kcal_per_100g: 86, protein_g: 1.5, carbs_g: 10, fat_g: 4.2, source: 'barcode', confidence: 95,
    });
    const res = await request(app).get('/api/foods/catalog/barcode/8410188099999').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.origin).toBe('openfoodfacts');
    expect(res.body.data.food.name).toBe('Tomate frito');
  });

  it('404 si el producto no existe en ningún sitio', async () => {
    jest.spyOn(off, 'getByBarcode').mockResolvedValue(null);
    const res = await request(app).get('/api/foods/catalog/barcode/0000000000000').set(authHeader(token));
    expect(res.status).toBe(404);
  });

  it('no devuelve la caché de otro usuario', async () => {
    const other = createUser(db, { username: 'bob' });
    db.prepare(`INSERT INTO foods (user_id, name, barcode, kcal_per_100g, source) VALUES (?, 'Suyo', '7777777777777', 60, 'barcode')`).run(other.id);
    jest.spyOn(off, 'getByBarcode').mockResolvedValue(null);
    const res = await request(app).get('/api/foods/catalog/barcode/7777777777777').set(authHeader(token));
    expect(res.status).toBe(404); // no lo encuentra en SU caché ni en OFF
  });
});

describe('catalog search does not collide with /:id or /search', () => {
  it('GET /api/foods/search sigue funcionando (caché personal)', async () => {
    db.prepare(`INSERT INTO foods (user_id, name, kcal_per_100g) VALUES (?, 'Pan', 265)`).run(user.id);
    const res = await request(app).get('/api/foods/search?q=pan').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Pan');
  });
});
