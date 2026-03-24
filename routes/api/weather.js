const express = require('express');
const router  = express.Router();
const https   = require('https');
const db      = require('../../db/database');
const { requireAuth } = require('../../middleware/auth');

router.use(requireAuth);

const WEATHER_TTL_MS = 60 * 60 * 1000;       // 1h por municipio
const MUNI_TTL_MS    = 24 * 60 * 60 * 1000;  // 24h lista de municipios

const weatherCache = new Map(); // id → { data, ts }
let   muniCache    = { data: null, ts: 0 };

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'weight-tracker/2.0' } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function skyIcon(code) {
  const n = parseInt(code);
  if      (n <= 12)              return { emoji: '☀️',  label: 'Despejado' };
  else if (n <= 14)              return { emoji: '⛅',  label: 'Parcialmente nuboso' };
  else if (n <= 17)              return { emoji: '☁️',  label: 'Nuboso' };
  else if (n >= 43 && n <= 46)   return { emoji: '🌧️', label: 'Lluvia' };
  else if (n >= 23 && n <= 26)   return { emoji: '🌦️', label: 'Lluvia escasa' };
  else if (n >= 33 && n <= 36)   return { emoji: '🌨️', label: 'Nieve' };
  else if (n >= 51 && n <= 56)   return { emoji: '⛈️',  label: 'Tormenta' };
  else if (n >= 61 && n <= 66)   return { emoji: '⛈️',  label: 'Tormenta con lluvia' };
  else if (n >= 71 && n <= 76)   return { emoji: '🌩️', label: 'Tormenta intensa' };
  else                           return { emoji: '🌤️',  label: 'Variable' };
}

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
}

async function fetchMunicipalities() {
  const apiKey = process.env.AEMET_API_KEY;
  if (!apiKey) throw new Error('AEMET_API_KEY no configurada');
  const now = Date.now();
  if (muniCache.data && (now - muniCache.ts) < MUNI_TTL_MS) return muniCache.data;
  const meta = await fetchJson(`https://opendata.aemet.es/opendata/api/maestro/municipios?api_key=${apiKey}`);
  if (meta.estado !== 200) throw new Error('AEMET: ' + meta.descripcion);
  const list = await fetchJson(meta.datos);
  muniCache = { data: list, ts: now };
  return list;
}

async function fetchWeather(municipalityId) {
  const code   = municipalityId.replace(/^id/, '');
  const apiKey = process.env.AEMET_API_KEY;
  if (!apiKey) throw new Error('AEMET_API_KEY no configurada');

  const now    = Date.now();
  const cached = weatherCache.get(municipalityId);
  if (cached && (now - cached.ts) < WEATHER_TTL_MS) return cached.data;

  const meta = await fetchJson(
    `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${code}?api_key=${apiKey}`
  );
  if (meta.estado !== 200) throw new Error('AEMET: ' + meta.descripcion);

  const forecast = await fetchJson(meta.datos);
  const hoy = forecast[0]?.prediccion?.dia?.[0];
  if (!hoy) throw new Error('Sin datos para hoy');

  const cielo      = hoy.estadoCielo || [];
  const cieloEntry = cielo.find(c => c.periodo === '00-24') || cielo[0] || {};
  const icon       = skyIcon(cieloEntry.value || '13');

  const probPrecip = hoy.probPrecipitacion || [];
  const precip     = probPrecip.find(p => p.periodo === '00-24') || probPrecip[0] || {};
  const rainProb   = precip.value != null ? parseInt(precip.value) : null;

  const tempMax = hoy.temperatura?.maxima != null ? parseInt(hoy.temperatura.maxima) : null;
  const tempMin = hoy.temperatura?.minima != null ? parseInt(hoy.temperatura.minima) : null;

  const vientos = hoy.viento || [];
  const viento  = vientos.find(v => v.periodo === '00-24') || vientos[0] || {};
  const wind    = viento.velocidad != null ? parseInt(viento.velocidad) : null;

  const data = {
    date: hoy.fecha?.split('T')[0] || null,
    icon: icon.emoji,
    sky:  cieloEntry.descripcion || icon.label,
    tempMax, tempMin, rainProb, wind,
  };
  weatherCache.set(municipalityId, { data, ts: now });
  return data;
}

// GET /api/weather/municipalities?q=xxx
router.get('/municipalities', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, data: [] });
  try {
    const list = await fetchMunicipalities();
    const qn   = normalize(q);
    const results = list
      .filter(m => normalize(m.nombre).includes(qn))
      .slice(0, 10)
      .map(m => ({ id: m.id, name: m.nombre }));
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/weather
router.get('/', async (req, res) => {
  try {
    const settings = db.prepare(
      'SELECT aemet_municipality_id, aemet_municipality_name FROM settings WHERE user_id = ?'
    ).get(req.user.id);

    const municipalityId = settings?.aemet_municipality_id;
    if (!municipalityId) {
      return res.json({ success: true, data: null });
    }

    const data = await fetchWeather(municipalityId);
    res.json({ success: true, data: { ...data, locationName: settings.aemet_municipality_name } });
  } catch (e) {
    console.error('[weather] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
