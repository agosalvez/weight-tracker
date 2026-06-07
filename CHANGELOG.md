# Changelog

## WT3.4 — 2026-06-07

### Nuevo
- **Foto a la etiqueta nutricional (IA Vision)**: botón "Foto a la etiqueta" en el panel de añadir alimento. La imagen se redimensiona en el cliente (máx 1000px, JPEG 0.8) y la lee `gpt-4o-mini` en modo visión (detalle `low` para abaratar). Convierte kJ→kcal si hace falta, usa valores por 100 g y guarda el alimento en tu caché (origen `label_photo`).
- **Control de gasto en euros**: cada llamada a IA (texto y foto) registra tokens y coste en `token_usage`. Cada usuario ve "Mi gasto en IA" en Ajustes (mes y total). El administrador ve una tabla de gasto por usuario (este mes / mes anterior / total) y, al pulsar un usuario, su desglose por día y semana.
- Helper de precios (`utils/pricing.js`) con tarifas por modelo en USD → EUR (`USD_TO_EUR`, por defecto 0.92). Endpoints `GET /api/stats/ai-cost`, `GET /api/admin/ai-cost`, `GET /api/admin/ai-cost/:userId` y `POST /api/foods/from-label-photo`.
- Límite de body subido a 8 MB para admitir la foto en base64.
- 14 tests nuevos (6 precios + 8 vision/coste). Suite total: 107.

### Coste
- Una lectura de etiqueta con `gpt-4o-mini` a detalle `low` ≈ 0,0001–0,0002 €. El gasto queda siempre visible para usuario y admin.

---

## WT3.3 — 2026-06-07

### Nuevo
- **Comidas habituales (plantillas)**: en cada comida, botón "★ Habitual" para guardarla con un nombre. Al abrir "Añadir alimento" aparecen tus habituales aplicables como chips; un toque las añade enteras. Luego puedes editar/quitar alimentos como siempre.
- **Copiar de ayer**: botón por comida que copia esa misma comida del día anterior.
- **Modelo de IA configurable por el administrador** desde Ajustes → Panel de administración (gpt-4o-mini / gpt-4o / gpt-4.1-mini / gpt-4.1). Se guarda en `app_config.openai_model` y lo usa el texto libre. Validado contra una lista permitida.
- Tablas `meal_templates` y `meal_template_items` (snapshot de nombre y kcal/100g, robustas ante borrado de alimentos).
- Endpoints: `GET/POST /api/meals/templates`, `POST /api/meals/templates/:id/apply`, `DELETE /api/meals/templates/:id`, `POST /api/meals/copy-day`.
- 19 tests nuevos (8 plantillas + 3 config admin + ajustes). Suite total: 93.

### Notas
- `app_config` arranca con `openai_model = gpt-4o-mini`. Cambiarlo desde la UI no requiere redeploy.

---

## WT3.2 — 2026-06-07

### Nuevo
- **Registro por texto libre con IA**: en el panel de añadir alimento, un desplegable "✨ Describir con mis palabras" donde escribes algo como *"pan tostado 60g, 2 huevos y un café con leche"*. La IA (`gpt-4o-mini`) lo desglosa en alimentos con gramos y kcal estimadas, muestra una previsualización y, al confirmar, crea las entradas. Los alimentos nuevos se guardan en tu caché (origen `ai_text`) para reutilizarlos sin IA la próxima vez.
- **Cascada de ahorro de tokens**: antes de estimar, cada alimento se busca en tu caché personal (match fuzzy). Si ya lo tienes, se usa tu valor guardado y no se gasta IA en re-estimarlo.
- Cliente OpenAI (`utils/openai.js`) por `fetch` (sin SDK), con `response_format: json_object`, `temperature: 0` y `max_tokens` acotado. Endpoint `POST /api/meals/parse-text` que devuelve solo previsualización (no guarda hasta confirmar).
- 11 tests nuevos (7 cliente + 4 ruta), red mockeada. Suite total: 82.

### Configuración
- Nueva variable **opcional** `OPENAI_API_KEY` (y `OPENAI_MODEL`, por defecto `gpt-4o-mini`). Si no se configura, el texto libre se desactiva con un aviso claro y **el resto de la app funciona igual**. La key va en el `.env` de Portainer, nunca en el repo.

### Coste
- Con `gpt-4o-mini`: ~0,0001 € por interpretación. Las comidas que ya estén en tu caché no consumen IA.

---

## WT3.1 — 2026-06-07

### Nuevo
- **Buscador de productos por nombre** vía Open Food Facts (gratis, sin API key). En el panel de añadir alimento, la búsqueda combina tu caché personal ("Tus alimentos") con resultados de Open Food Facts ("OFF"). Al elegir un resultado externo se importa automáticamente a tu caché y queda editable.
- **Escaneo de código de barras** con la cámara (librería `html5-qrcode` alojada localmente, sin CDN). Busca primero en tu caché y, si no está, en Open Food Facts. Si no se encuentra, ofrece crearlo a mano.
- Endpoints `GET /api/foods/catalog/search?q=` y `GET /api/foods/catalog/barcode/:code`.
- Cliente Open Food Facts (`utils/openfoodfacts.js`) con mapeo a nuestro schema, filtrado de productos sin kcal y deduplicación. 26 tests nuevos (16 cliente + 10 rutas), todo con red mockeada.

### Decisiones de diseño
- **Sin catálogo genérico precargado**: por preferencia, los alimentos salen solo de Open Food Facts (datos reales de fabricante) o los creas tú. Tu caché personal es siempre la fuente de verdad y es editable.

### Seguridad / privacidad
- Se dejan de trackear los ficheros SQLite (`*.db`, `-wal`, `-shm`) que estaban en el repo. Auditado: **nunca se commitearon credenciales** (la tabla `users` jamás estuvo en el historial). La librería de escaneo se sirve localmente para no depender de CDNs externos.

### Sin nuevas variables de entorno
Open Food Facts no requiere API key. El `.env` de producción no cambia.

---

## WT3.0 — 2026-06-06

### Nuevo
- **Caché personal de alimentos** por usuario (`/api/foods`): cada alimento que registras se guarda con sus kcal/100g, marca opcional, código de barras, origen y nivel de confianza. La próxima vez aparece en un solo toque, ordenado por más usados.
- **Desglose por comidas** (`/api/meals`): tabla nueva `meal_entries` con seis tipos de comida (desayuno, almuerzo, comida, merienda, cena, snack). Suma automática por bucket y total del día.
- **Sección "Desglose por comidas" en home**: aparece dentro del flujo existente, con un bottom sheet móvil-first para buscar / añadir alimentos rápido.
- **"Mis alimentos" en Ajustes**: lista filtrable, edición rápida de kcal/100g, eliminación, badges de origen (manual, código de barras, foto etiqueta, IA texto, IA foto).
- **Modo "Usar para el total"**: convierte el desglose por comidas en el total oficial del día (`calories_source = 'from_meals'`), recalculado automáticamente en cada cambio. El modo `manual` (anterior) sigue siendo el default para no pisar registros existentes.
- **Versión visible** (`WT3.0`) en el footer de Ajustes y en home. Endpoint `/api/version` sin autenticación.
- **Búsqueda fuzzy** que ignora acentos (`jamon` encuentra `Jamón`).
- **Tests** (Jest + supertest): 45 tests cubriendo helpers, foods CRUD, meals CRUD, recálculo, aislamiento por usuario.

### Cambios
- `package.json` → v3.0.0 + script `npm test`.
- `db/database.js` acepta `DB_PATH` desde entorno (para tests en memoria).
- `daily_logs` ahora tiene `calories_source` (`'manual'` | `'from_meals'`).
- Las columnas legacy `kcal_breakfast / kcal_lunch / kcal_dinner / kcal_snacks` se siguen alimentando (mapeo: desayuno+almuerzo → breakfast, comida → lunch, cena → dinner, merienda+snack → snacks), así las gráficas y stats existentes siguen funcionando sin cambios.

### Migración
Idempotente, totalmente aditiva. Los usuarios existentes siguen viendo y editando sus registros como hasta ahora (`calories_source` arranca en `'manual'`). Quien empiece a usar el desglose puede activar el modo `from_meals` desde el botón "Usar para el total".

### Sin nuevas variables de entorno
Esta fase no requiere claves ni servicios externos. Las variables actuales (`JWT_SECRET`, `RP_ID`, `ORIGIN`, `AEMET_API_KEY`) siguen siendo las únicas necesarias.

---

## WT2.0
- Multi-usuario, WebAuthn (passkeys), panel de administración, widget del tiempo de AEMET por usuario.

## WT1.0
- Registro de peso y calorías mono-usuario.
