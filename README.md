# 📊 Weight Tracker

> Registra tu peso, calorías y evolución — desde el móvil, en segundos.

Una web app **mobile-first** pensada para que abrir, registrar y cerrar te lleve menos de 10 segundos. Sin instalación, sin cuenta, sin suscripción. Solo tú y tus datos.

![Node.js](https://img.shields.io/badge/Node.js-22-green?style=flat-square&logo=node.js)
![Express](https://img.shields.io/badge/Express-4-black?style=flat-square&logo=express)
![SQLite](https://img.shields.io/badge/SQLite-local-blue?style=flat-square&logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker)

---

## ¿Qué hace?

- **Registra** peso diario, calorías, desglose por comidas y ejercicio
- **Navega** entre días con flechas para editar registros anteriores
- **Visualiza** tu evolución con gráficas de peso y calorías (Chart.js)
- **Calcula** tu BMR, TDEE y déficit calórico estimado automáticamente
- **Predice** cuándo llegarás a tu peso objetivo con regresión lineal
- **Avisa** si tu ritmo de bajada es demasiado agresivo o saludable

Todo esto corriendo en **tu propio servidor**, con tus datos solo en tu máquina.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | SQLite (better-sqlite3) |
| Frontend | HTML + CSS + JavaScript vanilla |
| Gráficas | Chart.js |
| Deploy | Docker + Docker Swarm |

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

### 2. Instala dependencias

```bash
npm install
```

### 3. Arranca

```bash
npm run dev
```

Abre **http://localhost:3000** en tu navegador.

---

## Usarlo desde el móvil (recomendado)

La app está pensada para usarse como si fuera una app nativa en iPhone o Android.

**1.** Arranca el servidor en tu ordenador

**2.** Encuentra tu IP local:
```bash
# Windows
ipconfig

# Mac / Linux
ifconfig
```

**3.** Abre en Safari (iPhone) o Chrome (Android):
```
http://TU_IP_LOCAL:3000
```

**4.** En Safari → botón compartir → **"Añadir a pantalla de inicio"**

Ya la tienes como app en tu móvil, sin App Store.

---

## Docker

```bash
# Build
docker build -t weight-tracker .

# Run (con volumen para persistir datos)
docker run -p 3000:3000 -v weight-tracker-data:/app/data weight-tracker
```

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |

---

## Estructura del proyecto

```
weight-tracker/
├── server.js                   # Servidor Express + rutas de página
├── db/database.js              # Schema SQLite
├── routes/api/
│   ├── logs.js                 # CRUD registros diarios
│   ├── settings.js             # Perfil y objetivos
│   └── stats.js                # Estadísticas y predicción
├── utils/calculations.js       # BMR, TDEE, media móvil, regresión lineal
└── public/
    ├── css/app.css
    ├── js/
    │   ├── app.js              # Utilidades compartidas y API client
    │   ├── home.js
    │   ├── history.js
    │   ├── stats.js
    │   └── settings.js
    └── pages/
        ├── home.html
        ├── history.html
        ├── stats.html
        └── settings.html
```

---

## API Reference

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/logs` | Listar registros (`?from=&to=&limit=`) |
| `GET` | `/api/logs/:date` | Registro de un día concreto |
| `POST` | `/api/logs` | Crear o actualizar (upsert por fecha) |
| `DELETE` | `/api/logs/:date` | Eliminar día |
| `GET` | `/api/settings` | Obtener ajustes del perfil |
| `POST` | `/api/settings` | Guardar ajustes |
| `GET` | `/api/stats/summary` | KPIs principales |
| `GET` | `/api/stats/weight-trend` | Datos para gráfica de peso (`?days=90`) |
| `GET` | `/api/stats/calories-trend` | Datos para gráfica de calorías (`?days=30`) |
| `GET` | `/api/stats/prediction` | Predicción de llegada al objetivo |

---

## Licencia

MIT — úsalo, modifícalo, despliégalo. Sin restricciones.
