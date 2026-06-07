# Changelog

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
