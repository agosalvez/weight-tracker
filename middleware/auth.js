const jwt = require('jsonwebtoken');
const db  = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'weight-tracker-dev-secret-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;

    // Actualizar last_seen_at (sin bloquear la respuesta)
    setImmediate(() => {
      try {
        db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(payload.id);
      } catch {}
    });

    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acceso restringido a administradores' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
