const express = require('express');
const router  = express.Router();
const https   = require('https');

const MUNICIPALITY = '46016'; // Alcàntera de Xúquer
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

let cache = { data: null, ts: 0 };

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

// Mapea código AEMET → emoji + descripción corta
function skyIcon(code) {
  const n = parseInt(code);
  if      (n <= 12) return { emoji: '☀️',  label: 'Despejado' };
  else if (n <= 14) return { emoji: '⛅',  label: 'Parcialmente nuboso' };
  else if (n <= 17) return { emoji: '☁️',  label: 'Nuboso' };
  else if (n >= 43 && n <= 46) return { emoji: '🌧️', label: 'Lluvia' };
  else if (n >= 23 && n <= 26) return { emoji: '🌦️', label: 'Lluvia escasa' };
  else if (n >= 33 && n <= 36) return { emoji: '🌨️', label: 'Nieve' };
  else if (n >= 51 && n <= 56) return { emoji: '⛈️',  label: 'Tormenta' };
  else if (n >= 61 && n <= 66) return { emoji: '⛈️',  label: 'Tormenta con lluvia' };
  else if (n >= 71 && n <= 76) return { emoji: '🌩️', label: 'Tormenta intensa' };
  else                         return { emoji: '🌤️',  label: 'Variable' };
}

async function getWeather() {
  const apiKey = process.env.AEMET_API_KEY;
  if (!apiKey) throw new Error('AEMET_API_KEY no configurada');

  // 1. Obtener URL de datos
  const meta = await fetchJson(
    `https://opendata.aemet.es/opendata/api/prediccion/especifica/municipio/diaria/${MUNICIPALITY}?api_key=${apiKey}`
  );

  if (meta.estado !== 200) throw new Error('AEMET error: ' + meta.descripcion);

  // 2. Obtener datos del forecast
  const forecast = await fetchJson(meta.datos);
  const hoy = forecast[0]?.prediccion?.dia?.[0];
  if (!hoy) throw new Error('Sin datos para hoy');

  // Estado del cielo: preferimos el periodo 00-24 o el primero disponible
  const cielo = (hoy.estadoCielo || []);
  const cieloEntry = cielo.find(c => c.periodo === '00-24') || cielo[0] || {};
  const icon = skyIcon(cieloEntry.value || '13');

  // Probabilidad de lluvia
  const probPrecip = (hoy.probPrecipitacion || []);
  const precip = probPrecip.find(p => p.periodo === '00-24') || probPrecip[0] || {};
  const rainProb = precip.value != null ? parseInt(precip.value) : null;

  // Temperatura
  const tempMax = hoy.temperatura?.maxima != null ? parseInt(hoy.temperatura.maxima) : null;
  const tempMin = hoy.temperatura?.minima != null ? parseInt(hoy.temperatura.minima) : null;

  // Sensación térmica
  const stMax = hoy.sensTermica?.maxima != null ? parseInt(hoy.sensTermica.maxima) : null;
  const stMin = hoy.sensTermica?.minima != null ? parseInt(hoy.sensTermica.minima) : null;

  // Viento (periodo 00-24 o primero)
  const vientos = hoy.viento || [];
  const viento = vientos.find(v => v.periodo === '00-24') || vientos[0] || {};
  const wind = viento.velocidad != null ? parseInt(viento.velocidad) : null;
  const windDir = viento.direccion || null;

  return {
    date: hoy.fecha?.split('T')[0] || null,
    icon: icon.emoji,
    sky: cieloEntry.descripcion || icon.label,
    tempMax,
    tempMin,
    feelsMax: stMax,
    feelsMin: stMin,
    rainProb,
    wind,
    windDir,
  };
}

// GET /api/weather
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && (now - cache.ts) < CACHE_TTL_MS) {
      return res.json({ success: true, data: cache.data, cached: true });
    }

    const data = await getWeather();
    cache = { data, ts: now };
    res.json({ success: true, data, cached: false });
  } catch (e) {
    console.error('[weather] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
