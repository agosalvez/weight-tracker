# Weight Tracker

App web mobile-first para registrar peso diario, calorías y ver estadísticas de evolución. Pensada para usarse desde el móvil como si fuera una app nativa (añadir a pantalla de inicio).

## Stack

- **Backend:** Node.js + Express
- **Base de datos:** SQLite (better-sqlite3)
- **Frontend:** HTML + CSS + JavaScript vanilla
- **Gráficas:** Chart.js
- **Deploy:** Docker

## Funcionalidades

- Registro diario de peso con navegación entre días (flechas ‹ ›)
- Calorías totales y desglose por comidas (desayuno, comida, cena, snacks)
- Calorías quemadas por ejercicio
- Notas del día
- Historial con filtro por fechas, edición y borrado
- Estadísticas: peso actual, media 7 días, cambio semanal, déficit estimado
- Gráfica de evolución del peso con media móvil de 7 días
- Gráfica de calorías ingeridas vs quemadas
- Predicción de fecha para llegar al peso objetivo
- Evaluación del ritmo de bajada (saludable / agresivo / estancado)
- Cálculo automático de BMR (Mifflin-St Jeor) y TDEE
- Soporte para añadir a pantalla de inicio en iOS/Android

## Arrancar en local

```bash
npm install
npm run dev     # con auto-reload
# o
npm start       # producción
```

Abre **http://localhost:3000**

Para usarlo desde el móvil en la misma red:

```bash
ipconfig        # Windows — busca IPv4 en tu WiFi
ifconfig        # Mac/Linux
# Abre http://TU_IP:3000 en Safari → Compartir → Añadir a pantalla de inicio
```

## Docker

```bash
docker build -t weight-tracker .
docker run -p 3000:3000 -v weight-tracker-data:/app/data weight-tracker
```

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |

## Estructura

```
├── server.js
├── db/database.js          # Schema SQLite (data/tracker.db)
├── routes/api/
│   ├── logs.js             # CRUD registros diarios
│   ├── settings.js         # Perfil y objetivos
│   └── stats.js            # Estadísticas y predicción
├── utils/calculations.js   # BMR, TDEE, media móvil, regresión lineal
└── public/
    ├── css/app.css
    ├── js/                 # app.js, home.js, history.js, stats.js, settings.js
    └── pages/              # home.html, history.html, stats.html, settings.html
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/logs` | Listar registros (`?from=&to=&limit=`) |
| GET | `/api/logs/:date` | Registro de un día concreto |
| POST | `/api/logs` | Crear o actualizar (upsert por fecha) |
| DELETE | `/api/logs/:date` | Eliminar día |
| GET | `/api/settings` | Obtener ajustes del perfil |
| POST | `/api/settings` | Guardar ajustes |
| GET | `/api/stats/summary` | KPIs principales |
| GET | `/api/stats/weight-trend` | Datos para gráfica de peso (`?days=90`) |
| GET | `/api/stats/calories-trend` | Datos para gráfica de calorías (`?days=30`) |
| GET | `/api/stats/prediction` | Predicción de llegada al objetivo |
