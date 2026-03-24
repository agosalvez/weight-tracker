require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('[boot] Iniciando Weight Tracker...');

// Cargar base de datos
let db;
try {
  db = require('./db/database');
  console.log('[boot] Base de datos conectada correctamente');
} catch (e) {
  console.error('[boot] ERROR al conectar la base de datos:', e.message);
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Log de cada petición
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// API routes
app.use('/api/logs',     require('./routes/api/logs'));
app.use('/api/settings', require('./routes/api/settings'));
app.use('/api/stats',    require('./routes/api/stats'));
app.use('/api/weather',  require('./routes/api/weather'));
app.use('/api/auth',     require('./routes/api/auth'));
app.use('/api/admin',    require('./routes/api/admin'));

// Page routes
const pages = path.join(__dirname, 'public', 'pages');
app.get('/login',    (req, res) => res.sendFile(path.join(pages, 'login.html')));
app.get('/',         (req, res) => res.sendFile(path.join(pages, 'home.html')));
app.get('/history',  (req, res) => res.sendFile(path.join(pages, 'history.html')));
app.get('/stats',    (req, res) => res.sendFile(path.join(pages, 'stats.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(pages, 'settings.html')));

// Error handler
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`[boot] Servidor escuchando en puerto ${PORT}`);
  console.log(`[boot] Rutas cargadas: /, /history, /stats, /settings`);
  console.log(`[boot] API cargada: /api/logs, /api/settings, /api/stats`);
  console.log(`[boot] Health check disponible en /api/health`);
  console.log(`[boot] Weight Tracker listo`);
});
