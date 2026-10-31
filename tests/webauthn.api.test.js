// Integration tests for WebAuthn (passkeys / Face ID) en /api/auth
// Usa un autenticador por software: clave ES256 real, CBOR mínimo y firmas
// con el mismo formato que envía el navegador.
const crypto = require('crypto');
const request = require('supertest');
const db = require('../db/database');
const authRouter = require('../routes/api/auth');
const { buildApp, resetDb, createUser, tokenFor, authHeader } = require('./helpers');

const app = buildApp({ '/api/auth': authRouter });

const RP_ID  = 'localhost';
const ORIGIN = 'http://localhost:3000';

// ─── CBOR mínimo (enteros, bytes, texto y mapas) ─────────────────────────────

function cborHead(major, n) {
  if (n < 24)    return Buffer.from([(major << 5) | n]);
  if (n < 256)   return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
}

function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? cborHead(0, v) : cborHead(1, -1 - v);
  if (Buffer.isBuffer(v))    return Buffer.concat([cborHead(2, v.length), v]);
  if (typeof v === 'string') { const s = Buffer.from(v, 'utf8'); return Buffer.concat([cborHead(3, s.length), s]); }
  if (v instanceof Map) {
    const parts = [cborHead(5, v.size)];
    for (const [k, val] of v) parts.push(cbor(k), cbor(val));
    return Buffer.concat(parts);
  }
  throw new Error('Tipo CBOR no soportado');
}

// ─── Autenticador por software ───────────────────────────────────────────────

const b64url = buf => Buffer.from(buf).toString('base64url');
const sha256 = buf => crypto.createHash('sha256').update(buf).digest();

function newAuthenticator() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cosePublicKey = cbor(new Map([
    [1, 2],                                  // kty: EC2
    [3, -7],                                 // alg: ES256
    [-1, 1],                                 // crv: P-256
    [-2, Buffer.from(jwk.x, 'base64url')],
    [-3, Buffer.from(jwk.y, 'base64url')],
  ]));
  return { privateKey, cosePublicKey, rawId: crypto.randomBytes(16), counter: 0 };
}

const FLAGS_UP_UV = 0x01 | 0x04;
const FLAG_AT     = 0x40;

function authData(flags, counter, attested = Buffer.alloc(0)) {
  const c = Buffer.alloc(4); c.writeUInt32BE(counter);
  return Buffer.concat([sha256(Buffer.from(RP_ID)), Buffer.from([flags]), c, attested]);
}

function clientData(type, challenge) {
  return Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN, crossOrigin: false }));
}

function attestation(auth, challenge) {
  const idLen = Buffer.alloc(2); idLen.writeUInt16BE(auth.rawId.length);
  const attested = Buffer.concat([Buffer.alloc(16), idLen, auth.rawId, auth.cosePublicKey]);
  const attestationObject = cbor(new Map([
    ['fmt', 'none'],
    ['attStmt', new Map()],
    ['authData', authData(FLAGS_UP_UV | FLAG_AT, 0, attested)],
  ]));
  return {
    id: b64url(auth.rawId),
    rawId: b64url(auth.rawId),
    type: 'public-key',
    response: {
      clientDataJSON:    b64url(clientData('webauthn.create', challenge)),
      attestationObject: b64url(attestationObject),
      transports: ['internal'],
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  };
}

function assertion(auth, challenge) {
  auth.counter += 1;
  const ad  = authData(FLAGS_UP_UV, auth.counter);
  const cdj = clientData('webauthn.get', challenge);
  const signature = crypto.sign('sha256', Buffer.concat([ad, sha256(cdj)]), auth.privateKey);
  return {
    id: b64url(auth.rawId),
    rawId: b64url(auth.rawId),
    type: 'public-key',
    response: {
      clientDataJSON:    b64url(cdj),
      authenticatorData: b64url(ad),
      signature:         b64url(signature),
    },
    clientExtensionResults: {},
    authenticatorAttachment: 'platform',
  };
}

async function login(auth) {
  const opts = await request(app).post('/api/auth/webauthn/login/options').expect(200);
  return request(app)
    .post('/api/auth/webauthn/login/verify')
    .send(assertion(auth, opts.body.data.challenge));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let user, token;

beforeEach(() => {
  resetDb(db);
  user  = createUser(db, { username: 'alice' });
  token = tokenFor(user);
});

describe('WebAuthn: registro de passkey', () => {
  it('registra una passkey y la guarda en BD', async () => {
    const auth = newAuthenticator();
    const opts = await request(app).get('/api/auth/webauthn/register/options')
      .set(authHeader(token)).expect(200);

    expect(opts.body.data.rp.id).toBe(RP_ID);

    await request(app).post('/api/auth/webauthn/register/verify')
      .set(authHeader(token))
      .send({ ...attestation(auth, opts.body.data.challenge), deviceName: 'iPhone' })
      .expect(200);

    const row = db.prepare('SELECT * FROM webauthn_credentials WHERE user_id = ?').get(user.id);
    expect(row.credential_id).toBe(b64url(auth.rawId));
    expect(Buffer.from(row.public_key, 'base64').equals(auth.cosePublicKey)).toBe(true);
    expect(row.device_name).toBe('iPhone');
  });

  it('excluye en las opciones las passkeys ya registradas', async () => {
    db.prepare('INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter) VALUES (?, ?, ?, 0)')
      .run(user.id, 'abc123', 'AAAA');
    const opts = await request(app).get('/api/auth/webauthn/register/options')
      .set(authHeader(token)).expect(200);
    expect(opts.body.data.excludeCredentials).toEqual([expect.objectContaining({ id: 'abc123', type: 'public-key' })]);
  });

  it('rechaza un challenge que no es el emitido', async () => {
    const auth = newAuthenticator();
    await request(app).get('/api/auth/webauthn/register/options').set(authHeader(token)).expect(200);
    const res = await request(app).post('/api/auth/webauthn/register/verify')
      .set(authHeader(token))
      .send(attestation(auth, b64url(crypto.randomBytes(32))));
    expect(res.status).not.toBe(200);
    expect(db.prepare('SELECT COUNT(*) n FROM webauthn_credentials').get().n).toBe(0);
  });
});

describe('WebAuthn: login con passkey', () => {
  async function register(auth) {
    const opts = await request(app).get('/api/auth/webauthn/register/options').set(authHeader(token));
    await request(app).post('/api/auth/webauthn/register/verify')
      .set(authHeader(token)).send(attestation(auth, opts.body.data.challenge)).expect(200);
  }

  it('inicia sesión y actualiza el contador', async () => {
    const auth = newAuthenticator();
    await register(auth);

    const res = await login(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.username).toBe('alice');

    const row = db.prepare('SELECT counter FROM webauthn_credentials WHERE user_id = ?').get(user.id);
    expect(row.counter).toBe(1);
  });

  it('acepta passkeys guardadas con la versión anterior de la librería', async () => {
    // Mismo formato que escribía @simplewebauthn/server v9
    const auth = newAuthenticator();
    db.prepare('INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_name) VALUES (?, ?, ?, 0, ?)')
      .run(user.id, Buffer.from(auth.rawId).toString('base64url'), Buffer.from(auth.cosePublicKey).toString('base64'), 'iPhone');

    const res = await login(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
  });

  it('rechaza una firma de otra clave', async () => {
    const auth = newAuthenticator();
    await register(auth);
    const impostor = { ...newAuthenticator(), rawId: auth.rawId };

    const res = await login(impostor);
    expect(res.status).not.toBe(200);
  });

  it('rechaza una credencial desconocida', async () => {
    const res = await login(newAuthenticator());
    expect(res.status).toBe(400);
  });
});
