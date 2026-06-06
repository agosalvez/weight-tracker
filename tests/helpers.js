// tests/helpers.js — utilidades comunes para tests
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

function buildApp(routes) {
  const app = express();
  app.use(express.json());
  for (const [path, router] of Object.entries(routes)) {
    app.use(path, router);
  }
  return app;
}

function resetDb(db) {
  // Order matters: child tables before parents.
  const tables = [
    'meal_entries',
    'foods',
    'daily_logs',
    'webauthn_credentials',
    'settings',
    'users',
  ];
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
}

function createUser(db, { username = 'tester', role = 'user', displayName = 'Tester' } = {}) {
  const hash = bcrypt.hashSync('test-password', 4);
  const info = db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)`
  ).run(username, hash, displayName, role);
  db.prepare(`INSERT OR IGNORE INTO settings (user_id) VALUES (?)`).run(info.lastInsertRowid);
  return { id: info.lastInsertRowid, username, role, display_name: displayName };
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { buildApp, resetDb, createUser, tokenFor, authHeader };
