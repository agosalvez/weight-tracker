const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../../db/database');
const { requireAuth, JWT_SECRET } = require('../../middleware/auth');


const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'Weight Tracker';
const RP_ID   = process.env.RP_ID   || 'localhost';
const ORIGIN  = process.env.ORIGIN  || `http://localhost:${process.env.PORT || 3000}`;

// challenges pendientes: Map<challenge, { userId?, ts }>
const pending = new Map();

function cleanPending() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [k, v] of pending) {
    if (v.ts < cutoff) pending.delete(k);
  }
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function userPublic(user) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role || 'user' };
}

function ensureSettings(userId) {
  db.prepare('INSERT OR IGNORE INTO settings (user_id) VALUES (?)').run(userId);
}

// GET /api/auth/status — ¿hay usuarios? ¿hace falta setup?
router.get('/status', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  res.json({ success: true, data: { needsSetup: count === 0 } });
});

// POST /api/auth/register — crear primer usuario (o con ALLOW_REGISTRATION=true)
router.post('/register', (req, res) => {
  try {
    const { username, password, displayName, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña obligatorios' });
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (count > 0 && process.env.ALLOW_REGISTRATION !== 'true') {
      return res.status(403).json({ success: false, error: 'Registro cerrado' });
    }

    // El primer usuario es admin automáticamente
    const role = count === 0 ? 'admin' : 'user';
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, email, role) VALUES (?, ?, ?, ?, ?)'
    ).run(username, hash, displayName || username, email || null, role);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    ensureSettings(user.id);

    res.json({ success: true, data: { token: makeToken(user), user: userPublic(user) } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'El usuario ya existe' });
    }
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/auth/login — login con contraseña
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash || '')) {
      return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
    }
    ensureSettings(user.id);

    const token = makeToken(user);
    // Si debe cambiar contraseña, indicarlo pero dar token igualmente
    res.json({
      success: true,
      data: {
        token,
        user: userPublic(user),
        forcePasswordChange: !!user.force_password_change,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/auth/change-password — cambiar contraseña propia
router.post('/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    // Si tiene contraseña previa, verificar la actual (salvo que sea cambio forzado)
    if (user.password_hash && !user.force_password_change) {
      if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Contraseña actual incorrecta' });
      }
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?')
      .run(hash, req.user.id);

    // Devolver token actualizado
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, data: { token: makeToken(updated), user: userPublic(updated) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, role, email FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
  res.json({ success: true, data: user });
});

// ─── WebAuthn: registro de passkey (requiere estar logado) ────────────────────

router.get('/webauthn/register/options', requireAuth, async (req, res) => {
  try {
    const user    = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const existing = db.prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ?').all(req.user.id);

    const options = await generateRegistrationOptions({
      rpName:    RP_NAME,
      rpID:      RP_ID,
      userID:    Buffer.from(String(user.id)),
      userName:  user.username,
      userDisplayName: user.display_name || user.username,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.credential_id, type: 'public-key' })),
      authenticatorSelection: {
        residentKey:      'preferred',
        userVerification: 'preferred',
      },
    });

    cleanPending();
    pending.set(options.challenge, { userId: req.user.id, ts: Date.now() });
    res.json({ success: true, data: options });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/webauthn/register/verify', requireAuth, async (req, res) => {
  try {
    const { deviceName, ...credential } = req.body;
    const entry = [...pending.entries()].find(([, v]) => v.userId === req.user.id);
    if (!entry) return res.status(400).json({ success: false, error: 'Sin challenge pendiente' });

    const [expectedChallenge] = entry;

    const verification = await verifyRegistrationResponse({
      response:          credential,
      expectedChallenge,
      expectedOrigin:    ORIGIN,
      expectedRPID:      RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ success: false, error: 'Verificación fallida' });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const credIdB64  = Buffer.from(credentialID).toString('base64url');
    const pubKeyB64  = Buffer.from(credentialPublicKey).toString('base64');

    db.prepare(
      'INSERT OR IGNORE INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, credIdB64, pubKeyB64, counter, deviceName || 'Dispositivo');

    pending.delete(expectedChallenge);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/auth/webauthn/credentials — listar passkeys del usuario
router.get('/webauthn/credentials', requireAuth, (req, res) => {
  const creds = db.prepare(
    'SELECT id, device_name, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);
  res.json({ success: true, data: creds });
});

// DELETE /api/auth/webauthn/:id — eliminar passkey
router.delete('/webauthn/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ─── WebAuthn: login (sin sesión previa) ─────────────────────────────────────

router.post('/webauthn/login/options', async (req, res) => {
  try {
    const options = await generateAuthenticationOptions({
      rpID:             RP_ID,
      userVerification: 'preferred',
      allowCredentials: [], // passkey mode — el navegador elige
    });

    cleanPending();
    pending.set(options.challenge, { ts: Date.now() });
    res.json({ success: true, data: options });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/webauthn/login/verify', async (req, res) => {
  try {
    const credential = req.body;

    // Buscar credencial en BD por ID
    const dbCred = db.prepare(
      'SELECT * FROM webauthn_credentials WHERE credential_id = ?'
    ).get(credential.id);
    if (!dbCred) return res.status(400).json({ success: false, error: 'Credencial no reconocida' });

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: (challenge) => {
        if (pending.has(challenge)) {
          pending.delete(challenge);
          return true;
        }
        return false;
      },
      expectedOrigin:  ORIGIN,
      expectedRPID:    RP_ID,
      authenticator: {
        credentialID:        Uint8Array.from(Buffer.from(dbCred.credential_id, 'base64url')),
        credentialPublicKey: Uint8Array.from(Buffer.from(dbCred.public_key, 'base64')),
        counter:             dbCred.counter,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ success: false, error: 'Verificación fallida' });
    }

    // Actualizar counter anti-replay
    db.prepare('UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?')
      .run(verification.authenticationInfo.newCounter, credential.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(dbCred.user_id);
    ensureSettings(user.id);

    res.json({ success: true, data: { token: makeToken(user), user: userPublic(user) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
