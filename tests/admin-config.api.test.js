// Integration tests for admin OpenAI model config
const request = require('supertest');
const db = require('../db/database');
const adminRouter = require('../routes/api/admin');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/admin': adminRouter });
let admin, adminToken, normal, normalToken;

beforeEach(() => {
  resetDb(db);
  admin = createUser(db, { username: 'boss', role: 'admin' });
  normal = createUser(db, { username: 'joe', role: 'user' });
  adminToken = tokenFor(admin);
  normalToken = tokenFor(normal);
});

it('un usuario normal no puede tocar la config', async () => {
  const res = await request(app).patch('/api/admin/config').set(authHeader(normalToken))
    .send({ openai_model: 'gpt-4o' });
  expect(res.status).toBe(403);
});

it('el admin puede fijar un modelo válido', async () => {
  const res = await request(app).patch('/api/admin/config').set(authHeader(adminToken))
    .send({ openai_model: 'gpt-4o' });
  expect(res.status).toBe(200);
  expect(res.body.data.openai_model).toBe('gpt-4o');
});

it('ignora un modelo no permitido', async () => {
  db.prepare("INSERT OR REPLACE INTO app_config (key,value) VALUES ('openai_model','gpt-4o-mini')").run();
  const res = await request(app).patch('/api/admin/config').set(authHeader(adminToken))
    .send({ openai_model: 'gpt-malicioso' });
  expect(res.status).toBe(200);
  expect(res.body.data.openai_model).toBe('gpt-4o-mini'); // sin cambios
});
