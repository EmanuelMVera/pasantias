# 🎓 SisPasantías — Sistema de Gestión de Pasantías

Bolsa de empleo / pasantías institucional del **Instituto Tecnológico Beltrán**.
Monorepo con backend (API REST) y frontend (SPA).

| | Stack |
|---|---|
| **Backend** | Node.js · Express 5 · Sequelize 6 · PostgreSQL · JWT en cookie HttpOnly · pino |
| **Frontend** | React 19 · Vite 8 · React Router 7 · Axios · Recharts |
| **Migraciones** | Umzug v3 (`backend/scripts/migrate.js`) |
| **Tests** | Jest + Supertest (backend) · Playwright (E2E) |
| **CI** | GitHub Actions (`.github/workflows/ci.yml`) |

---

## 📋 Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Instalación paso a paso](#2-instalación-paso-a-paso)
3. [Puesta en marcha](#3-puesta-en-marcha)
4. [Usuarios y accesos](#4-usuarios-y-accesos)
5. [Scripts](#5-scripts)
6. [Tests](#6-tests)
7. [Variables de entorno](#7-variables-de-entorno)
8. [Estructura del proyecto](#8-estructura-del-proyecto)
9. [Documentación adicional](#9-documentación-adicional)
10. [Problemas frecuentes](#10-problemas-frecuentes)

---

## 1. Requisitos previos

| Herramienta | Versión | Notas |
|---|---|---|
| **Node.js** | 20 LTS o superior | CI corre en Node 22. `node --version` |
| **PostgreSQL** | 14 o superior | El CI usa 17.5. Durante la instalación anotá la contraseña del usuario `postgres`. Instalá también **pgAdmin 4**. |
| **Git** | cualquiera reciente | |

El cliente de línea de comandos de PostgreSQL (`psql`, `pg_dump`, `pg_restore`,
`createdb`) tiene que estar en el `PATH` para algunos scripts de base de datos
(`db:backup`, `db:schema:dump`). Viene en la carpeta `bin/` de cualquier
instalación de PostgreSQL.

---

## 2. Instalación paso a paso

### 2.1 Clonar

```bash
git clone https://github.com/lucashmercado/pasantias.git
cd pasantias
```

### 2.2 Crear la base de datos

Con `psql` (pedirá la contraseña del usuario `postgres`):

```bash
psql -U postgres -c "CREATE DATABASE pasantias_db;"
```

o desde pgAdmin: clic derecho en **Databases → Create → Database…** → nombre `pasantias_db`.

### 2.3 Configurar variables de entorno

```bash
# backend
cp backend/.env.example backend/.env       # PowerShell: Copy-Item backend\.env.example backend\.env

# frontend (opcional en local; el default ya apunta a http://localhost:5000/api)
cp frontend/.env.example frontend/.env
```

Editá `backend/.env` y poné **tu contraseña de PostgreSQL** en `DB_PASSWORD`. El
resto de los valores por defecto sirven para desarrollo local. Detalle de cada
variable en [§7](#7-variables-de-entorno).

### 2.4 Instalar dependencias

```bash
npm run install:all      # instala raíz + backend + frontend
```

(equivale a `npm install` en la raíz, en `backend/` y en `frontend/`).

### 2.5 Aplicar las migraciones

> El backend **ya no crea las tablas solo** (se eliminó `sequelize.sync`). El
> esquema se aplica siempre con migraciones, en desarrollo igual que en producción.

```bash
cd backend
npm run db:migrate       # crea todo el esquema en pasantias_db
cd ..
```

El rol de conexión necesita permiso para `CREATE EXTENSION` (`pgcrypto`, `pg_trgm`);
el usuario `postgres` local lo tiene. Detalle en
[`backend/migrations/README.md`](backend/migrations/README.md).

### 2.6 Crear el primer administrador

```bash
cd backend
npm run db:seed:admin    # crea admin@pasantias.com / Admin1234!  (si no existe)
cd ..
```

Opcional — datos de demo (empresas, ofertas, alumnos, postulaciones):
`cd backend && npm run db:seed:demo`.

---

## 3. Puesta en marcha

Desde la raíz:

```bash
npm run dev              # levanta backend (:5000) y frontend (:5173) juntos
```

Verificá:

| URL | Debería mostrar |
|---|---|
| http://localhost:5173 | Página de inicio |
| http://localhost:5173/login | Formulario de login |
| http://localhost:5000/api/health | `{"status":"OK", ...}` |

Iniciá sesión con `admin@pasantias.com` / `Admin1234!`.

---

## 4. Usuarios y accesos

**No hay autorregistro público.** Las cuentas se cargan desde el sistema:

| Rol | Cómo se crea |
|---|---|
| `admin` | `npm run db:seed:admin` (el primero) o desde `Admin → Usuarios` |
| `alumno` / `egresado` | Un admin lo da de alta (`Admin → Usuarios → Nuevo`) |
| `empresa` (`admin_empresa`) | Solicitud pública en `/registro-empresa` → un admin la aprueba |
| `empresa` (`reclutador`) | El `admin_empresa` lo solicita desde su panel → un admin lo aprueba |

La **matriz de permisos completa** (qué puede hacer cada rol) está en
[`docs/ROLES-Y-PERMISOS.md`](docs/ROLES-Y-PERMISOS.md).

---

## 5. Scripts

### Raíz (`package.json`)

| Script | Qué hace |
|---|---|
| `npm run dev` | Backend + frontend en paralelo (`concurrently`) |
| `npm run install:all` | Instala dependencias de raíz, backend y frontend |
| `npm run e2e` | Corre los smoke tests E2E de Playwright (levanta back+front, siembra una base dedicada) |
| `npm run e2e:ui` | Playwright en modo UI (debug) |
| `npm run e2e:report` | Abre el último reporte HTML de Playwright |
| `npm run e2e:seed` | Solo re-crea y siembra la base E2E |

### Backend (`backend/package.json`)

| Script | Qué hace |
|---|---|
| `npm start` | Servidor en modo producción (`node src/server.js`) |
| `npm run dev` | Servidor con recarga (`nodemon`) |
| `npm test` | Suite Jest + Supertest (`--runInBand`) |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:migrate:status` | Lista migraciones aplicadas y pendientes |
| `npm run db:migrate:down` | Revierte la última migración |
| `npm run db:migrate:create <nombre>` | Crea `migrations/NNN-<nombre>.js` desde plantilla |
| `npm run db:seed:admin` | Crea el usuario admin inicial |
| `npm run db:seed:demo` | Carga datos de demostración |
| `npm run db:backup` | `pg_dump -Fc` a `backend/backups/` + verificación |
| `npm run db:schema:dump` | Regenera `schema.sql` (raíz) desde la base actual |
| `npm run db:reset:dev` | **Solo dev**: dropea, recrea y migra la base local |
| `npm run logs:archivar` | Archiva `activity_logs` viejos a `.jsonl.gz` (dry-run; `-- --apply` para ejecutar) |

### Frontend (`frontend/package.json`)

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite (`:5173`) |
| `npm run build` | Build de producción a `frontend/dist/` |
| `npm run preview` | Sirve el build para probarlo localmente |
| `npm run lint` | ESLint (`eslint .`) — bloqueante en CI |

---

## 6. Tests

| Suite | Comando | Qué cubre |
|---|---|---|
| **Backend** | `cd backend && npm test` | API a nivel HTTP: auth, roles, multitenancy, uploads, paginación, observabilidad, seguridad… (17 suites). Usa una base de test aislada (`${DB_NAME}_test` o `DB_NAME_TEST`), creada y migrada por el `globalSetup`. |
| **E2E** | `npm run e2e` (raíz) | 13 flujos críticos de 4 roles en un navegador real (Playwright + Chromium). Base **dedicada** `pasantias_db_e2e`, recreada en cada corrida. Ver [`e2e/`](e2e/) y `backend/README.md` §Tests E2E. |
| **Lint / build front** | `cd frontend && npm run lint && npm run build` | ESLint + compilación. |

Los tres corren en CI en cada push a `main` y en cada PR
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), más el chequeo de
reversibilidad de migraciones y el drift de `schema.sql`.

---

## 7. Variables de entorno

Las plantillas con todas las variables y su explicación están en:

- **[`backend/.env.example`](backend/.env.example)** — DB, JWT/cookie, email, CORS,
  rate limiting, observabilidad, seed del admin.
- **[`frontend/.env.example`](frontend/.env.example)** — `VITE_API_URL`.

Mínimo para desarrollo local: en `backend/.env` solo hace falta ajustar
`DB_PASSWORD`. En producción son obligatorias además `JWT_SECRET`,
`ALLOWED_ORIGINS`, `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` y la configuración
de cookie (`COOKIE_SAMESITE` / `COOKIE_SECURE`) — ver los comentarios del
`.env.example` y `backend/README.md` §8 (hardening SEC-02).

`backend/.env` y `frontend/.env` están gitignoreados y **nunca** se suben.

---

## 8. Estructura del proyecto

```
pasantias/
├── backend/                     # API REST — Node + Express + Sequelize
│   ├── src/
│   │   ├── app.js               # Express: helmet, CORS, rate limit, CSRF, rutas, errores
│   │   ├── server.js            # Arranque: conecta a PG y escucha
│   │   ├── config/database.js   # Config de conexión Sequelize
│   │   ├── routes/              # Definición de endpoints por recurso
│   │   ├── controllers/         # Orquestación HTTP (req → service → res)
│   │   ├── services/            # Lógica de negocio
│   │   ├── middleware/          # auth, empresa (roles internos), rateLimit, csrf, validate, error
│   │   ├── models/              # Modelos Sequelize + index.js (asociaciones)
│   │   ├── validators/          # Esquemas de validación de body
│   │   ├── utils/               # logger (pino), auditLog, cookies, seeds, archivos…
│   │   └── data/                # catálogos (carreras, rubros…)
│   ├── migrations/              # Migraciones Umzug 000–012 (+ legacy-sql/ histórico)
│   ├── scripts/                 # migrate.js, seed-e2e.js, db-backup.js, adopt-baseline.js
│   ├── tests/                   # Jest + Supertest (+ helpers/, setup/)
│   ├── uploads/                 # Archivos de usuarios (gitignored). public/ = avatares y logos
│   ├── .env.example
│   └── README.md
│
├── frontend/                    # SPA — React + Vite
│   └── src/
│       ├── main.jsx / App.jsx   # Entrada + rutas + ProtectedRoute
│       ├── pages/               # alumno/ · empresa/ · admin/ · auth/ · (ChatPage, HomePage…)
│       ├── components/          # Navbar, Avatar, Modal, Paginacion, TopBanner…
│       ├── context/             # AuthContext, EmpresaContext (providers)
│       ├── hooks/               # useAuth, useEmpresa, usePaginacion
│       ├── services/api.js      # Cliente axios + *Service por recurso
│       ├── constants/ · utils/  # estados de postulación, fuerza de contraseña…
│       └── styles/              # variables.css, globals.css
│
├── e2e/                         # Smoke tests Playwright + fixtures + seed
├── docs/
│   └── ROLES-Y-PERMISOS.md      # Matriz de permisos canónica
├── .github/workflows/ci.yml     # Pipeline
├── playwright.config.js
├── schema.sql                   # Dump del esquema (artefacto, chequeado por drift en CI)
└── package.json                 # Scripts raíz (dev, e2e…)
```

---

## 9. Documentación adicional

| Documento | Contenido |
|---|---|
| [`backend/README.md`](backend/README.md) | Arquitectura del backend, observabilidad/logs, deploy y rollback, tests E2E |
| [`backend/migrations/README.md`](backend/migrations/README.md) | Cómo funcionan las migraciones, lista 000–012, ENUMs legacy, regla de no editar |
| [`frontend/README.md`](frontend/README.md) | Arquitectura del frontend, routing, cómo consume la API |
| [`docs/ROLES-Y-PERMISOS.md`](docs/ROLES-Y-PERMISOS.md) | Roles de sistema e internos, matriz de permisos por acción |
| [`backend/MULTI_USUARIO_EMPRESA.md`](backend/MULTI_USUARIO_EMPRESA.md) | Equipo de empresa: arquitectura y endpoints |
| `DOCUMENTACION_FUNCIONAL.md`, `Propuesta_Proyecto_Pasantias.md` | Documentos funcionales / de propuesta (contexto, no técnicos) |

---

## 10. Problemas frecuentes

### `password authentication failed for user "postgres"`
`DB_PASSWORD` en `backend/.env` no coincide con la de PostgreSQL. Corregilo.

### `database "pasantias_db" does not exist`
Falta crear la base — ver [§2.2](#22-crear-la-base-de-datos).

### El login funciona pero la app "no entra" / vuelve al login
La sesión va en una cookie `SameSite=Lax`. Front y back tienen que ser *same-site*:
usá **`localhost`** en los dos (no mezclar `localhost` con `127.0.0.1`). En
producción, si están en dominios distintos hace falta `COOKIE_SAMESITE=none` +
`COOKIE_SECURE=true` (HTTPS).

### `relation "usuarios" does not exist` u otros errores de tablas al arrancar
No se aplicaron las migraciones. Corré `cd backend && npm run db:migrate`.

### `permission denied to create extension "pgcrypto"`
El rol de conexión no puede crear extensiones. Ejecutá una vez como superusuario:
`CREATE EXTENSION pgcrypto; CREATE EXTENSION pg_trgm;` en `pasantias_db`.

### Puerto 5000 o 5173 en uso
Backend: cambiá `PORT` en `backend/.env`. Frontend: agregá `server: { port: 5174 }`
en `frontend/vite.config.js`.

### `Cannot find module …`
Faltan dependencias: `npm run install:all` desde la raíz.

### Los tests E2E fallan al arrancar
Necesitan el navegador de Playwright: `npx playwright install chromium`. Y que
PostgreSQL esté corriendo (crean/usan `pasantias_db_e2e`).
