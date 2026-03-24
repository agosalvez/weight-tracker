const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'tracker.db'));
db.pragma('journal_mode = WAL');

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

module.exports = db;
