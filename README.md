# Weight Tracker — WT3.3

> Registra tu peso, calorías y evolución — desde el móvil, en segundos.

Una web app **mobile-first** pensada para que abrir, registrar y cerrar te lleve menos de 10 segundos. Multi-usuario, con autenticación por Face ID / huella digital y widget del tiempo local. Sin instalación, sin suscripción. Solo tú y tus datos, en tu propio servidor.

![Node.js](https://img.shields.io/badge/Node.js-22-green?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4-black?style=flat-square&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-local-blue?style=flat-square&logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker)

---

## ¿Qué hace?

- **Comidas habituales y copiar de ayer** (nuevo en WT3.3): marca cualquier comida como "habitual ★" para guardarla, y aplícala a otro día con un toque. O copia la comida del día anterior. Luego editas/quitas alimentos normalmente. El administrador puede elegir el modelo de IA desde Ajustes.
- **Registro por texto libre con IA** (WT3.2): escribe *"pan tostado 60g, 2 huevos y un café"* y la IA (`gpt-4o-mini`) lo desglosa en alimentos con sus kcal. Lo que ya tengas en tu caché se reutiliza sin gastar tokens. Requiere configurar `OPENAI_API_KEY` (si no, esta función se desactiva sola y el resto sigue igual).
- **Buscador de productos + escaneo de código de barras** (WT3.1): busca cualquier producto por nombre en [Open Food Facts](https://world.openfoodfacts.org) (gratis, sin API key) o escanea su código de barras con la cámara. Al elegirlo se guarda en tu caché personal y queda editable.
- **Desglose por comidas con caché personal de alimentos** (WT3.0): registra cada comida del día (desayuno / almuerzo / comida / merienda / cena / snack) eligiendo alimentos de tu caché o creando uno nuevo. El total del día se calcula automáticamente.
- **Mis alimentos** (nuevo en WT3.0): cada alimento que registras se guarda en tu caché personal con su valor nutricional, así la próxima vez es un solo toque. Gestionable desde Ajustes → Mis alimentos.
- **Registra** peso diario, calorías, desglose por comidas y ejercicio
- **Navega** entre días con flechas para editar registros anteriores
- **Visualiza** tu evolución con gráficas de peso y calorías (Chart.js)
- **Calcula** tu BMR, TDEE y déficit calórico estimado automáticamente
- **Predice** cuándo llegarás a tu peso objetivo con regresión lineal
- **Avisa** si tu ritmo de bajada es demasiado agresivo o saludable
- **IMC** con barra visual y categoría de peso
- **Widget del tiempo** de AEMET con localidad configurable por usuario
- **Multi-usuario** — cada persona tiene sus propios datos completamente separados
- **Face ID / huella digital** — acceso sin contraseña desde móvil o tablet (WebAuthn)
- **Panel de administración** — gestión de usuarios, roles y configuración del registro

Todo esto corriendo en **tu propio servidor**, con tus datos solo en tu máquina.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | SQLite (better-sqlite3) |
| Auth | JWT + bcrypt + WebAuthn (passkeys) |
| Frontend | HTML + CSS + JavaScript vanilla |
| Gráficas | Chart.js |
| Deploy | Docker + Traefik |

Sin frameworks frontend. Sin dependencias innecesarias. Rápido y directo.

---

## Inicio rápido

### Requisitos

- [Node.js 18+](https://nodejs.org)
- npm

### 1. Clona el repositorio

```bash
git clone https://github.com/agosalvez/weight-tracker.git
cd weight-tracker
```

### 2. Configura las variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y pon al menos un `JWT_SECRET` aleatorio:

```env
JWT_SECRET=un-secreto-largo-y-aleatorio-que-solo-tu-conoces
RP_ID=localhost
ORIGIN=http://localhost:3000
```

### 3. Instala dependencias y arranca

```bash
npm install
npm run dev
```

### 4. Ejecutar los tests

```bash
npm test
```

Suite con Jest + supertest. Las pruebas usan SQLite en memoria (`DB_PATH=:memory:`), por lo que no tocan tu base de datos real.

Abre **http://localhost:3000** en tu navegador. La primera vez te pedirá crear tu usuario.

---

## Autenticación

### Primer acceso

Al arrancar por primera vez la app no tiene usuarios. Aparecerá un formulario de registro para crear el usuario administrador. Introduce usuario, nombre visible y contraseña (mín. 6 caracteres) y ya está.

### Face ID / Huella digital

Una vez dentro, ve a **Ajustes → Face ID / Huella digital** y pulsa **"Añadir este dispositivo"**. El navegador pedirá confirmar con Face ID o huella. A partir de entonces puedes entrar con un solo toque desde ese dispositivo.

Funciona en:
- iPhone / iPad con Safari (Face ID o Touch ID)
- Android con Chrome (huella o desbloqueo de pantalla)
- Mac con Safari o Chrome (Touch ID)

Requiere HTTPS en producción (ya incluido si usas Traefik).

### Múltiples usuarios

Cada usuario tiene sus propios registros, ajustes y estadísticas completamente separados. El administrador puede gestionar usuarios desde **Ajustes → Panel de administración**: crear cuentas, cambiar roles y activar/desactivar el registro público con un toggle. El primer usuario registrado siempre es administrador.

### Widget del tiempo

Cada usuario configura su propia localidad en **Ajustes → Localidad para el tiempo**. Al escribir el nombre del municipio aparece un autocompletado con los ~8.000 municipios de España de AEMET. El widget muestra icono del cielo, temperaturas min/máx y probabilidad de lluvia. Requiere `AEMET_API_KEY`.

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `JWT_SECRET` | *(dev secret)* | Secreto para firmar los tokens JWT. **Cámbialo en producción** |
| `RP_ID` | `localhost` | Dominio para WebAuthn (sin protocolo). En prod: `tu-dominio.com` |
| `ORIGIN` | `http://localhost:3000` | URL completa del origen. En prod: `https://tu-dominio.com` |
| `AEMET_API_KEY` | — | API key de [AEMET OpenData](https://opendata.aemet.es) para el widget del tiempo |
| `OPENAI_API_KEY` | — | API key de [OpenAI](https://platform.openai.com) para el registro por texto libre (WT3.2). Si falta, esa función se desactiva |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo de OpenAI a usar |

---

## Docker

```bash
# Build
docker build -t weight-tracker .

# Run (con volumen para persistir datos)
docker run -p 3000:3000 \
  -e JWT_SECRET=mi-secreto \
  -e RP_ID=localhost \
  -e ORIGIN=http://localhost:3000 \
  -v weight-tracker-data:/app/data \
  weight-tracker
```

Para producción con Traefik usa el `docker-stack.yml` incluido. Las variables de entorno sensibles (`JWT_SECRET`, `AEMET_API_KEY`) se configuran en Portainer o como secrets de Docker.

---

## Usarlo desde el móvil (recomendado)

La app está pensada para usarse como si fuera una app nativa en iPhone o Android.

**1.** Arranca el servidor y abre en Safari (iPhone) o Chrome (Android):
```
http://TU_IP_LOCAL:3000
```

**2.** En Safari → botón compartir → **"Añadir a pantalla de inicio"**

**3.** En Ajustes, añade Face ID para entrar sin contraseña la próxima vez.

---

## Estructura del proyecto

```
weight-tracker/
├── server.js                   # Servidor Express + rutas de página
├── db/database.js              # Schema SQLite + migración multi-usuario
├── middleware/
│   └── auth.js                 # Verificación JWT
├── routes/api/
│   ├── auth.js                 # Login, registro, WebAuthn (passkeys)
│   ├── logs.js                 # CRUD registros diarios
│   ├── settings.js             # Perfil y objetivos
│   ├── stats.js                # Estadísticas y predicción
│   ├── admin.js                # Panel de administración (solo admin)
│   └── weather.js              # Widget del tiempo (AEMET, caché por municipio)
├── utils/calculations.js       # BMR, TDEE, media móvil, regresión lineal
└── public/
    ├── css/app.css
    ├── js/
    │   ├── app.js              # API client (con auth), utilidades compartidas
    │   ├── home.js
    │   ├── history.js
    │   ├── stats.js
    │   └── settings.js
    └── pages/
        ├── login.html
        ├── home.html
        ├── history.html
        ├── stats.html
        └── settings.html
```

---

## API Reference

Todas las rutas de datos requieren autenticación (`Authorization: Bearer <token>`).

### Auth

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/auth/status` | Estado del setup (¿hay usuarios?) |
| `POST` | `/api/auth/register` | Crear primer usuario |
| `POST` | `/api/auth/login` | Login con contraseña → JWT |
| `GET` | `/api/auth/me` | Usuario actual |
| `GET` | `/api/auth/webauthn/register/options` | Iniciar registro de passkey |
| `POST` | `/api/auth/webauthn/register/verify` | Verificar y guardar passkey |
| `POST` | `/api/auth/webauthn/login/options` | Iniciar login con passkey |
| `POST` | `/api/auth/webauthn/login/verify` | Verificar passkey → JWT |
| `GET` | `/api/auth/webauthn/credentials` | Listar passkeys del usuario |
| `DELETE` | `/api/auth/webauthn/:id` | Eliminar passkey |

### Datos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/logs` | Listar registros (`?from=&to=&limit=`) |
| `GET` | `/api/logs/:date` | Registro de un día concreto |
| `POST` | `/api/logs` | Crear o actualizar (upsert por fecha) |
| `DELETE` | `/api/logs/:date` | Eliminar día |
| `GET` | `/api/settings` | Ajustes del perfil |
| `POST` | `/api/settings` | Guardar ajustes |
| `GET` | `/api/stats/summary` | KPIs principales |
| `GET` | `/api/stats/weight-trend` | Gráfica de peso (`?days=90`) |
| `GET` | `/api/stats/calories-trend` | Gráfica de calorías (`?days=30`) |
| `GET` | `/api/stats/prediction` | Predicción de llegada al objetivo |
| `GET` | `/api/weather` | Tiempo del día según localidad del usuario (caché 1h) |
| `GET` | `/api/weather/municipalities?q=` | Buscar municipios AEMET por nombre |
| `GET` | `/api/version` | Versión de la app (sin auth) |

### Alimentos y comidas (WT3.0)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/foods` | Caché personal de alimentos del usuario |
| `GET` | `/api/foods/search?q=` | Búsqueda fuzzy ignorando acentos |
| `POST` | `/api/foods` | Crear alimento (dedup por nombre+marca) |
| `PATCH` | `/api/foods/:id` | Editar alimento |
| `DELETE` | `/api/foods/:id` | Eliminar alimento |
| `GET` | `/api/meals/:date` | Entradas de comidas del día agrupadas por tipo |
| `POST` | `/api/meals` | Añadir entrada (`date`, `meal_type`, `food_id`, `grams`) |
| `DELETE` | `/api/meals/:id` | Eliminar entrada |
| `POST` | `/api/meals/:date/use-from-meals` | Calcular el total diario desde el desglose |
| `POST` | `/api/meals/parse-text` | Interpretar texto libre con IA → previsualización de alimentos (WT3.2) |
| `GET` | `/api/meals/templates` | Listar comidas habituales (WT3.3) |
| `POST` | `/api/meals/templates` | Guardar un día/comida como habitual |
| `POST` | `/api/meals/templates/:id/apply` | Aplicar una habitual a un día |
| `DELETE` | `/api/meals/templates/:id` | Eliminar una habitual |
| `POST` | `/api/meals/copy-day` | Copiar comidas de un día a otro |
| `GET` | `/api/foods/catalog/search?q=` | Buscar productos por nombre en Open Food Facts |
| `GET` | `/api/foods/catalog/barcode/:code` | Buscar producto por código de barras (caché → Open Food Facts) |

Los tipos de comida válidos son: `desayuno`, `almuerzo`, `comida`, `merienda`, `cena`, `snack`.

### Admin

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/users` | Listar todos los usuarios con estadísticas |
| `POST` | `/api/admin/users` | Crear usuario |
| `PATCH` | `/api/admin/users/:id` | Cambiar rol, email o nombre |
| `DELETE` | `/api/admin/users/:id` | Eliminar usuario y sus datos |
| `GET` | `/api/admin/config` | Leer configuración de la app |
| `PATCH` | `/api/admin/config` | Actualizar configuración (ej: registro abierto) |
| `GET` | `/api/admin/stats` | Estadísticas globales |

---

## Contribuir

Las contribuciones son bienvenidas. Sigue estas buenas prácticas:

### Commits

Usa [Conventional Commits](https://www.conventionalcommits.org):

```
feat: añadir exportación de datos a CSV
fix: corregir cálculo de déficit cuando no hay TDEE
chore: actualizar dependencias
docs: mejorar README
style: ajustar padding en mobile
refactor: extraer lógica de predicción a utils
```

### Pull Requests

1. Haz fork del repositorio
2. Crea una rama descriptiva:
   ```bash
   git checkout -b feat/exportar-csv
   ```
3. Haz commits pequeños y atómicos (una cosa por commit)
4. Asegúrate de que el servidor arranca sin errores antes de abrir el PR
5. Describe qué hace el PR y por qué en la descripción
6. Abre el PR contra `main`

---

## Licencia

MIT — úsalo, modifícalo, despliégalo. Sin restricciones.

---

Hecho con café y obsesión por los datos — [Adrián Gosálvez](https://github.com/agosalvez)
