const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../../db/database');
const { requireAuth, requireAdmin } = require('../../middleware/auth');

router.use(requireAuth, requireAdmin);

// ─── GET /api/admin/users — lista todos los usuarios con stats ────────────────
router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.email,
        u.role,
        u.created_at,
        u.last_seen_at,
        (SELECT COUNT(*) FROM daily_logs d WHERE d.user_id = u.id) AS total_logs,
        (SELECT COUNT(*) FROM daily_logs d WHERE d.user_id = u.id AND d.weight_kg IS NOT NULL) AS weight_logs,
        (SELECT COUNT(*) FROM daily_logs d WHERE d.user_id = u.id AND d.kcal_total IS NOT NULL) AS kcal_logs,
        (SELECT MAX(d.date) FROM daily_logs d WHERE d.user_id = u.id) AS last_log_date,
        (SELECT COUNT(*) FROM webauthn_credentials w WHERE w.user_id = u.id) AS passkeys
      FROM users u
      ORDER BY u.created_at ASC
    `).all();

    res.json({ success: true, data: users });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── PATCH /api/admin/users/:id — cambiar rol o email ─────────────────────────
router.patch('/users/:id', (req, res) => {
  try {
    const id   = parseInt(req.params.id);
    const self = req.user.id;

    // No puede quitarse el rol de admin a sí mismo
    if (id === self && req.body.role && req.body.role !== 'admin') {
      return res.status(400).json({ success: false, error: 'No puedes quitarte el rol de admin' });
    }

    const allowed = ['role', 'email', 'display_name'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ success: false, error: 'Sin campos a actualizar' });

    const set    = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f]);
    db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...values, id);

    const user = db.prepare('SELECT id, username, display_name, email, role FROM users WHERE id = ?').get(id);
    res.json({ success: true, data: user });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/admin/users/:id/reset-password — resetear contraseña ───────────
router.post('/users/:id/reset-password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── DELETE /api/admin/users/:id — eliminar usuario y todos sus datos ─────────
router.delete('/users/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ success: false, error: 'No puedes eliminarte a ti mismo' });
    }
    db.prepare('DELETE FROM daily_logs WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM settings WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/admin/users — crear nuevo usuario ──────────────────────────────
router.post('/users', (req, res) => {
  try {
    const { username, password, displayName, email, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña obligatorios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hash   = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, role, force_password_change) VALUES (?, ?, ?, ?, ?, 1)'
    ).run(username, hash, displayName || username, email || null, role === 'admin' ? 'admin' : 'user');

    const user = db.prepare('SELECT id, username, display_name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    // Crear fila de settings vacía para el nuevo usuario
    db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(user.id);

    res.json({ success: true, data: user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'El usuario ya existe' });
    }
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/admin/stats — estadísticas globales de la app ──────────────────
router.get('/stats', (req, res) => {
  try {
    const stats = {
      total_users:    db.prepare('SELECT COUNT(*) as c FROM users').get().c,
      total_logs:     db.prepare('SELECT COUNT(*) as c FROM daily_logs').get().c,
      total_passkeys: db.prepare('SELECT COUNT(*) as c FROM webauthn_credentials').get().c,
      logs_last_7d:   db.prepare(`SELECT COUNT(*) as c FROM daily_logs WHERE date >= date('now', '-7 days')`).get().c,
    };
    res.json({ success: true, data: stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
