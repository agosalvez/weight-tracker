// Jest global setup — runs before any test module is loaded.
// Forces an in-memory SQLite DB so tests never touch the real data file.
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
