const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'tracker.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Paso 1: tablas base (esquema original, por si la BD ya existe) ─────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    sex TEXT,
    age INTEGER,
    height_cm REAL,
    target_weight_kg REAL,
    estimated_bmr REAL,
    estimated_tdee REAL,
    activity_level TEXT DEFAULT 'sedentary',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    weight_kg REAL,
    kcal_total REAL,
    kcal_breakfast REAL,
    kcal_lunch REAL,
    kcal_dinner REAL,
    kcal_snacks REAL,
    kcal_activity REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO settings (id) VALUES (1);
`);

// ── Paso 2: migración multi-usuario (solo se ejecuta una vez) ──────────────────
const usersExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

if (!usersExists) {
  console.log('[db] Ejecutando migración multi-usuario...');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE webauthn_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER DEFAULT 0,
      device_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Recrear daily_logs con user_id y UNIQUE compuesto
    CREATE TABLE daily_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 1,
      date TEXT NOT NULL,
      weight_kg REAL,
      kcal_total REAL,
      kcal_breakfast REAL,
      kcal_lunch REAL,
      kcal_dinner REAL,
      kcal_snacks REAL,
      kcal_activity REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, user_id)
    );
    INSERT INTO daily_logs_new
      SELECT id, 1, date, weight_kg, kcal_total, kcal_breakfast, kcal_lunch,
             kcal_dinner, kcal_snacks, kcal_activity, notes, created_at, updated_at
      FROM daily_logs;
    DROP TABLE daily_logs;
    ALTER TABLE daily_logs_new RENAME TO daily_logs;

    -- Recrear settings con user_id
    CREATE TABLE settings_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      name TEXT,
      sex TEXT,
      age INTEGER,
      height_cm REAL,
      target_weight_kg REAL,
      estimated_bmr REAL,
      estimated_tdee REAL,
      activity_level TEXT DEFAULT 'sedentary',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO settings_new
      (user_id, name, sex, age, height_cm, target_weight_kg,
       estimated_bmr, estimated_tdee, activity_level, created_at, updated_at)
      SELECT 1, name, sex, age, height_cm, target_weight_kg,
             estimated_bmr, estimated_tdee, activity_level, created_at, updated_at
      FROM settings;
    DROP TABLE settings;
    ALTER TABLE settings_new RENAME TO settings;
  `);

  console.log('[db] Migración multi-usuario completada');
}

// ── Paso 3: añadir role y email a users (migración incremental) ───────────────
const userCols = db.pragma('table_info(users)').map(c => c.name);

if (!userCols.includes('role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  // El primer usuario (id más bajo) es admin
  db.exec(`UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users)`);
  console.log('[db] Columna role añadida; primer usuario promovido a admin');
}

if (!userCols.includes('email')) {
  db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  console.log('[db] Columna email añadida');
}

if (!userCols.includes('last_seen_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN last_seen_at TEXT`);
  console.log('[db] Columna last_seen_at añadida');
}

if (!userCols.includes('force_password_change')) {
  db.exec(`ALTER TABLE users ADD COLUMN force_password_change INTEGER NOT NULL DEFAULT 0`);
  console.log('[db] Columna force_password_change añadida');
}

// ── Paso 4: añadir columnas de localidad del tiempo a settings ────────────────
const settingsCols = db.pragma('table_info(settings)').map(c => c.name);
if (!settingsCols.includes('aemet_municipality_id')) {
  db.exec(`ALTER TABLE settings ADD COLUMN aemet_municipality_id TEXT`);
  db.exec(`ALTER TABLE settings ADD COLUMN aemet_municipality_name TEXT`);
  console.log('[db] Columnas aemet_municipality añadidas a settings');
}

// ── Tabla de configuración de la app ──────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO app_config (key, value) VALUES ('allow_registration', '0');
  INSERT OR IGNORE INTO app_config (key, value) VALUES ('openai_model', 'gpt-4o-mini');
`);

// ── Paso 5: caché personal de alimentos y desglose por comidas (WT3.0) ────────
db.exec(`
  CREATE TABLE IF NOT EXISTS foods (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    brand           TEXT,
    barcode         TEXT,
    kcal_per_100g   REAL NOT NULL,
    protein_g       REAL,
    carbs_g         REAL,
    fat_g           REAL,
    source          TEXT NOT NULL DEFAULT 'manual',
    confidence      INTEGER NOT NULL DEFAULT 100,
    times_used      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, name, brand)
  );

  CREATE INDEX IF NOT EXISTS idx_foods_user_name ON foods(user_id, name);
  CREATE INDEX IF NOT EXISTS idx_foods_user_barcode ON foods(user_id, barcode);

  CREATE TABLE IF NOT EXISTS meal_entries (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date                TEXT NOT NULL,
    meal_type           TEXT NOT NULL,
    food_id             INTEGER REFERENCES foods(id) ON DELETE SET NULL,
    food_name_snapshot  TEXT NOT NULL,
    grams               REAL,
    units               REAL,
    unit_label          TEXT,
    kcal                REAL NOT NULL,
    created_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meal_entries(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_meals_user_date_type ON meal_entries(user_id, date, meal_type);
`);

// ── Paso 6: columna calories_source en daily_logs (manual | from_meals) ────────
const logCols = db.pragma('table_info(daily_logs)').map(c => c.name);
if (!logCols.includes('calories_source')) {
  db.exec(`ALTER TABLE daily_logs ADD COLUMN calories_source TEXT NOT NULL DEFAULT 'manual'`);
  console.log('[db] Columna calories_source añadida a daily_logs');
}

// ── Paso 7: plantillas de comidas habituales (WT3.3) ──────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS meal_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    meal_type   TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meal_template_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id         INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
    food_id             INTEGER REFERENCES foods(id) ON DELETE SET NULL,
    food_name_snapshot  TEXT NOT NULL,
    grams               REAL,
    units               REAL,
    unit_label          TEXT,
    kcal_per_100g       REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_templates_user ON meal_templates(user_id);
`);

module.exports = db;
