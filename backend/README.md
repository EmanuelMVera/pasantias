# Backend — API REST

API del Sistema de Gestión de Pasantías. Recibe pedidos del frontend, aplica la
lógica de negocio, habla con PostgreSQL y responde JSON.

> Instalación y puesta en marcha: ver el [`README.md`](../README.md) de la raíz.
> Este documento describe la **arquitectura** del backend.

---

## 1. Stack

| Pieza | Para qué |
|---|---|
| **Node.js + Express 5** | Servidor HTTP y routing |
| **PostgreSQL** | Base de datos relacional |
| **Sequelize 6** | ORM (modelos, asociaciones, queries) |
| **Umzug 3** | Runner de migraciones (`scripts/migrate.js`) |
| **jsonwebtoken** | JWT de sesión (viaja en cookie HttpOnly, SEC-02) |
| **bcryptjs** | Hash de contraseñas |
| **multer** | Subida de archivos (CV, cartas, fotos, logos) |
| **helmet** + **express-rate-limit** | Hardening HTTP (SEC-02) |
| **pino** + **pino-http** | Logging técnico estructurado + request-id (OPS-01) |
| **nodemailer** | Emails (recuperación de acceso, notificaciones) |
| **dotenv** | Variables de entorno desde `.env` |

Tests: **Jest** + **Supertest**.

---

## 2. Estructura de `src/`

```
src/
├── app.js              Express: pino-http, helmet, CORS, body limit, rate limit,
│                       CSRF, estáticos de /uploads/public, montaje de rutas, health, error handler
├── server.js           Arranque: sequelize.authenticate() + app.listen()  (NO sincroniza esquema)
├── config/
│   └── database.js     Instancia de Sequelize (lee DB_* del entorno)
├── routes/             Un archivo por recurso. Define método + path + cadena de middlewares + handler
├── controllers/        Capa HTTP: valida entrada, llama al service, arma la respuesta
├── services/           Lógica de negocio (no conoce req/res). Aquí viven las reglas del dominio
├── middleware/
│   ├── auth.middleware.js      verifyToken, authorizeRoles
│   ├── empresa.middleware.js   verifyEmpresaMember, authorizeEmpresaRoles (rol interno de empresa)
│   ├── rateLimit.js            limiters por riesgo (auth, reset, uploads, público, write, global)
│   ├── csrf.js                 doble submit cookie (se saltea en NODE_ENV=test)
│   ├── validate.middleware.js  corre un validador antes del controller
│   └── error.middleware.js     handler global: loguea y responde JSON uniforme
├── models/
│   ├── index.js        Carga los modelos y define TODAS las asociaciones
│   └── *.model.js      Un archivo por tabla
├── validators/         Validación de body por endpoint
├── utils/              logger (pino), auditLog (registrarAuditoria), cookies, asyncHandler,
│                       archivoImagen (validación por magic bytes), seeds, scripts de mantenimiento
└── data/               Catálogos estáticos (carreras, rubros) en JSON
```

`migrations/`, `scripts/` y `tests/` están fuera de `src/`.

---

## 3. Recorrido de un request

`POST /api/ofertas` (crear una oferta), por ejemplo:

1. `app.js` → `pino-http` asigna `req.id` y setea `X-Request-Id`.
2. helmet, CORS, `express.json({ limit: '100kb' })`, `apiLimiter`, `csrfProtection`.
3. Router `/api/ofertas` → cadena de la ruta:
   `verifyToken` (cookie `token` → `req.usuario`) →
   `authorizeRoles('empresa')` →
   `verifyEmpresaMember` (resuelve `req.empresa` y `req.miembroEmpresa`) →
   `authorizeEmpresaRoles('admin_empresa', 'reclutador')`.
4. `oferta.controller.createOferta` → normaliza el body → `oferta.service` valida
   reglas → `Oferta.create(...)`.
5. Efecto colateral: notifica a los admins (fire-and-forget).
6. Respuesta `201 { success, message, data }`. Eventos sensibles → `registrarAuditoria`.
7. Cualquier throw cae en `error.middleware`, que loguea con `req.log` y responde
   un JSON uniforme (sin stack al cliente).

---

## 4. Autenticación y autorización

- **Sesión**: al hacer login, el backend firma un JWT y lo manda en una **cookie
  `token` HttpOnly** (SEC-02). El navegador la reenvía sola; el JS del frontend
  nunca la ve. Fallback: header `Authorization: Bearer <token>` (clientes API, tests).
- **`verifyToken`**: valida firma y `tokenVersion` (permite invalidar todas las
  sesiones de un usuario al cambiar la contraseña), carga `req.usuario`.
- **Roles de sistema** (`usuarios.rol`): `admin`, `alumno`, `egresado`, `empresa`.
  Se chequean con `authorizeRoles(...)`.
- **Roles internos de empresa** (`empresa_usuarios.rolInterno`): `admin_empresa`,
  `reclutador`. Se chequean con `authorizeEmpresaRoles(...)` después de
  `verifyEmpresaMember`.
- **CSRF**: patrón double-submit cookie para requests con cookie de sesión
  (`csrf.js`). Se saltea en `NODE_ENV=test`.
- **Rate limiting** por riesgo (`rateLimit.js`): login `10/15min`, reset/solicitud
  pública `5/h`, uploads `20/h`, writes `60/min`, techo global `API_RATE_MAX/15min`.
  Se saltean en test (salvo `seguridad.test.js`, que setea `SEC_TESTS=1`).

Matriz de permisos completa: [`../docs/ROLES-Y-PERMISOS.md`](../docs/ROLES-Y-PERMISOS.md).
Equipo de empresa en detalle: [`MULTI_USUARIO_EMPRESA.md`](MULTI_USUARIO_EMPRESA.md).

---

## 5. Modelo de datos

Tablas principales (`src/models/*.model.js`, asociaciones en `models/index.js`):

| Tabla | Contenido |
|---|---|
| `usuarios` | Personas del sistema. `rol`, `activo`, `habilitado`, `tokenVersion`, soft delete. |
| `perfiles` | Datos académicos/profesionales de un alumno/egresado (1–1 con `usuarios`). CV y carta. |
| `empresas` | Datos de empresa. `estadoAprobacion`, `cuit` UNIQUE, auditoría de aprobación. |
| `empresa_usuarios` | Membresía usuario↔empresa con `rolInterno` y `activo`. Fuente de verdad de permisos internos. |
| `ofertas` | Publicaciones de pasantía. `estado`, `moderada`, `tipoPuesto`, fechas. Soft delete. |
| `postulaciones` | Postulación de un alumno a una oferta. `estado` (embudo de selección). |
| `postulacion_historial_estados` | Auditoría de cada cambio de estado de una postulación. |
| `solicitudes_empresa` | Solicitud pública de alta de empresa. La aprueba un admin. |
| `solicitudes_reclutador` | Solicitud de un `admin_empresa` para sumar un reclutador. La aprueba un admin. |
| `archivos` | Metadata de archivos subidos (CV, carta, foto, logo) + control de acceso. |
| `mensajes` | Chat directo entre usuarios. |
| `notificaciones` | Avisos in-app. |
| `activity_logs` | Log de auditoría inmutable (ver §Observabilidad). |

Relaciones típicas: una `empresa` tiene muchas `ofertas`; una `oferta` tiene
muchas `postulaciones`; un `usuario` puede pertenecer a varias `empresas` vía
`empresa_usuarios`.

El esquema se versiona con **migraciones** — nunca con `sync()`. Ver §7.

---

## 6. Endpoints (prefijos)

| Prefijo | Recurso |
|---|---|
| `/api/auth` | Login, logout, `me`, forgot/reset/cambiar password |
| `/api/users` | Perfil propio, subida de CV/carta/foto, perfil público |
| `/api/students` | Dashboard del alumno |
| `/api/ofertas` | Listado y detalle (**públicos**), recomendadas, CRUD de empresa |
| `/api/postulaciones` | Postularse, "mis postulaciones", candidatos y embudo (empresa) |
| `/api/empresas` | Panel corporativo, perfil de empresa, equipo, perfil público |
| `/api/admin` | Todo el panel de administración (solo rol `admin`) |
| `/api/solicitudes-empresa` | Alta pública de empresa |
| `/api/notificaciones` | Notificaciones propias |
| `/api/chat` | Mensajería directa |
| `/api/archivos/:id` | Descarga autenticada de CV/cartas (autorización fina en el controller) |
| `/api/health` | Health check |

---

## 7. Migraciones

Runner **Umzug** (`scripts/migrate.js`). Estado en la tabla `SequelizeMeta`.
`000-baseline.js` crea el esquema completo; `001`–`012` son incrementales.

```bash
npm run db:migrate            # aplica pendientes
npm run db:migrate:status     # aplicadas + pendientes
npm run db:migrate:down       # revierte la última
npm run db:migrate:create x   # nueva migración desde plantilla
```

**Una migración ya aplicada no se edita nunca** — se crea una nueva. Detalle,
lista completa 000–012, el tema de los ENUMs legacy (`profesor`, `propietario`,
`gerente`, `viewer`) y las reglas de estilo: [`migrations/README.md`](migrations/README.md).

---

## 8. Seguridad y hardening (SEC-02 / SEC-03)

- **helmet** con CSP mínima (API JSON, nada se renderiza como documento), HSTS en producción.
- **CORS** con allowlist (`ALLOWED_ORIGINS`), `credentials: true` para la cookie.
- **Body** solo JSON, límite 100 kB. Sin `urlencoded` (refuerzo anti-CSRF).
- **Rate limiting** por riesgo + techo global.
- **CSRF** double-submit cookie.
- **Uploads** (SEC-03): tipo validado por *magic bytes*, no por extensión declarada;
  tamaño máximo; nombre generado en el servidor; CV/cartas fuera de rutas servidas
  estáticamente (solo `GET /api/archivos/:id` autenticado); avatares/logos en
  `/uploads/public`.
- **`trust proxy`** configurable (`TRUST_PROXY`) para tomar la IP real detrás de
  un reverse proxy sin permitir spoofing.

Variables asociadas: ver [`.env.example`](.env.example).

## 8b. Observabilidad y logs (OPS-01)

El sistema tiene **dos tipos de log distintos, con propósitos distintos**:

| | **Log de auditoría** (`activity_logs`) | **Log técnico** (stdout, JSON — `pino`) |
|---|---|---|
| Para qué | "quién hizo qué a qué" — negocio + seguridad | ciclo de vida de requests, errores, warnings de operación |
| Quién lo lee | admins (panel `/admin/logs`), compliance | desarrolladores / ops |
| Inmutable | sí (solo INSERT vía `utils/auditLog.js::registrarAuditoria`) | no (efímero; lo rota la plataforma/pm2) |
| Datos personales | sí, por diseño (email/nombre — hace falta para auditar) | minimizados |
| Secretos | **nunca** (`redactar()` scrub-ea `detalle`) | **nunca** (`redact` de pino) |
| Retención | 12 meses → `npm run logs:archivar` → `backend/archive/*.jsonl.gz` | la de la plataforma (rotación de stdout) |
| Correlación | columna `requestId` ↔ los logs técnicos del mismo request | `req.id` en cada línea; header `X-Request-Id` en request y respuesta |
| Se escribe desde | `registrarAuditoria` (punto único) | `logger` / `req.log` en cualquier archivo |

**Regla:** eventos de negocio/seguridad → `registrarAuditoria`. Todo lo demás → `logger`
(`src/utils/logger.js`). Nunca meter ruido técnico en `activity_logs`, nunca auditar con `console`.

- **Nivel de log**: env `LOG_LEVEL` (`debug|info|warn|error|fatal|silent`). Default: `debug` en
  desarrollo (incluye el SQL de Sequelize), `info` en producción, `silent` en tests.
- **Retención**: `npm run logs:archivar` (dry-run) / `npm run logs:archivar -- --apply`.
  Archiva a `.jsonl.gz` y verifica antes de borrar. Env `ACTIVITY_LOG_RETENTION_DAYS` (default 365).
  A escala real, el siguiente paso es particionar `activity_logs` por mes.

## 8c. Migraciones y deploy (DB-01)

El esquema se versiona con migraciones (`backend/migrations/NNN-*.js`), runner
**Umzug** (`scripts/migrate.js`). Estado en la tabla `SequelizeMeta`. Detalle en
`backend/migrations/README.md`.

### Runbook de deploy sin pérdida de datos (Postgres administrado)

1. **Pre-check**: `npm run db:migrate:status` — ver qué se aplicaría; confirmar que
   cada migración pendiente es *backward-compatible* con la versión de app en prod.
2. **Backup**: snapshot del proveedor + `npm run db:backup`, y **restore-test** del
   `.dump` en una base scratch (`pg_restore -d <db>_restore_test …` + `db:migrate:status`).
   Un backup que no se restauró no cuenta.
3. **Migrar** (release phase / job one-shot, **antes** de activar el código nuevo):
   `npm run db:migrate`. El `pg_advisory_lock` garantiza que solo una instancia migra.
4. **Health check**: `GET /api/health` + una consulta a cada tabla tocada.
5. **Deploy de la app** (nueva versión; rolling: instancia por instancia).
6. **Smoke test**: login, listar ofertas, subir archivo, `/admin/logs`.

### Rollback

| Situación | Acción |
|---|---|
| Migración OK, código nuevo falla | Rollback del **deploy de la app** (versión anterior). La DB queda adelante — funciona por expand/contract. |
| La migración es mala (recién aplicada, no destructiva) | `npm run db:migrate:down` + redeploy versión anterior. |
| `down()` no puede deshacer sin pérdida (fase *contract*) | **Restore desde el backup / PITR**. Por eso el *contract* solo se despliega tras 1 release estable de expand+migrate. |

### Backups

- **Primario**: snapshots + PITR del proveedor (retención ≥ 7 días PITR, ≥ 30 días snapshots; alertas de fallo).
- **`npm run db:backup`**: `pg_dump -Fc` a `backend/backups/` (gitignored) + verificación. Es lo que se restore-testea antes de migrar y la copia portable fuera del server.
- **Trimestral**: ejercicio de disaster-recovery (restore completo end-to-end).

## 8d. Tests

### Suite Jest + Supertest — `npm test`

API a nivel HTTP: 17 suites (`tests/*.test.js`) — auth, admin, roles/multitenancy,
ofertas, postulaciones, uploads, paginación, observabilidad, seguridad (rate limit +
CSRF con `SEC_TESTS=1`), solicitudes de empresa, residuos legacy, chat, notificaciones…

- `tests/setup/` crea y **migra** una base de test aislada (`DB_NAME_TEST` o
  `${DB_NAME}_test`) antes de correr.
- `tests/helpers/factories.js` arma usuarios/empresas/ofertas; `cleanup.js` los borra.
- `--runInBand`: una sola conexión, sin condiciones de carrera entre suites.

### Smoke tests E2E — `npm run e2e` (desde la raíz)

Además de la suite de Jest, hay **smoke tests E2E con Playwright** que ejercitan
los flujos críticos de punta a punta en un navegador real (login + cookie de
sesión, guards de rol, front consumiendo la API).

- **Ubicación**: `e2e/` y `playwright.config.js` en la **raíz** del repo (no en `backend/`).
- **13 flujos / 4 roles**: alumno (ver oferta → postularse → Mis Postulaciones),
  reclutador (crear oferta → candidatos → sin acciones de admin_empresa),
  admin_empresa (editar empresa → gestionar equipo), admin (moderar oferta →
  aprobar solicitud).
- **Datos reproducibles**: `backend/scripts/seed-e2e.js` (`npm run e2e:seed`) recrea
  y siembra una base **dedicada** `pasantias_db_e2e` (aborta si `DB_NAME` no
  termina en `_e2e` — nunca toca dev/prod). Corre solo en `globalSetup`, antes de
  levantar los servidores, así cada corrida parte de un estado idéntico.
- **Cómo correr** (desde la raíz): `npm run e2e` (levanta back `:5000` con
  `NODE_ENV=test` + front `:5173`, siembra y corre Chromium). `npm run e2e:ui`
  para depurar; `npm run e2e:report` abre el HTML.
- **CI**: job `e2e` en `.github/workflows/ci.yml` (sube `playwright-report/` como
  artifact si falla).
- **No** apunta a producción ni pretende cubrir toda la UI.

### CI

`.github/workflows/ci.yml` corre en cada push a `main` y cada PR: job **backend**
(migrate up → down→up de reversibilidad → drift check de `schema.sql` → `npm test`
→ drift check de `openapi.json`), job **frontend** (`npm run lint` → `npm run build`),
job **e2e** (Playwright).

## 8e. Documentación de la API — OpenAPI (DOC-02)

Spec **OpenAPI 3.1** construida como código en `src/docs/`, servida con Swagger UI.

- **`GET /api/docs`** — Swagger UI interactiva (assets locales, offline).
- **`GET /api/openapi.json`** — la spec cruda (para Postman, codegen, Redocly…).
- **`backend/openapi.json`** — copia versionada; `npm run docs:openapi` la regenera.
- **Gate**: env `ENABLE_API_DOCS` — vacío + `NODE_ENV=production` = **OFF**;
  vacío + no-prod = ON; `true`/`false` fuerzan. En producción, si hace falta
  exponerla, ponerla detrás de auth (fuera del alcance de DOC-02).

### Cómo está armada

```
src/docs/
  openapi.base.js   info, servers, tags, security por defecto
  helpers.js        operation(), ok(), paginated(), message(), errors() — el "motor DRY"
  modelToSchema.js  atributos Sequelize → JSON Schema (base de las entidades)
  components/        securitySchemes, parameters, responses y schemas reutilizables
  paths/            un archivo por grupo; cada operación es ~10 líneas
  serve.js          monta /api/docs y /api/openapi.json con su propio CSP
```

Los contratos transversales (envelope, errores, paginación, seguridad, header
CSRF) se definen **una sola vez** en `components/` y se referencian con `$ref`.

### Agregar / cambiar un endpoint

1. Tocás la ruta en `src/routes/*.routes.js` (como siempre).
2. Agregás/editás la operación en el `src/docs/paths/*.js` que corresponda.
3. `npm run docs:openapi` y comiteás `openapi.json`.

`tests/openapi.test.js` (dentro de `npm test`) falla si la spec y las rutas
divergen en cualquier dirección, si un `$ref` no resuelve, o si el schema
`Usuario` filtra un campo sensible. El CI además corre `npm run docs:check`
(byte-diff de `openapi.json`, igual que con `schema.sql`).

### Limitaciones

El test cruza `MÉTODO /path`, no valida que la **forma de la respuesta** siga
coincidiendo con la spec. Validación completa (`jest-openapi`) queda como mejora
futura.

---

## 9. Convenciones

- **Controller** = HTTP; **service** = negocio. Un controller no arma queries
  complejas; un service no toca `req`/`res`.
- Respuesta uniforme: `{ success: boolean, message?, data?, pagination? }`.
- Errores: `throw` (o `next(err)`) → `error.middleware`. No responder errores a mano
  salvo validaciones de negocio esperables (400/403/404 con mensaje claro).
- Paginación: `?page=&limit=` → `{ data, pagination: { page, limit, total, totalPages } }`
  (`utils/pagination.js`).
- Auditoría: toda acción sensible pasa por `registrarAuditoria`.
- Variables de entorno: solo se leen vía `process.env` en `config/`, `app.js`,
  middlewares y utils — no dispersas por los controllers.

---

## 10. Resumen

Backend Express en capas (routes → controllers → services → models). PostgreSQL vía
Sequelize, esquema por migraciones Umzug. Sesión en cookie HttpOnly + CSRF + rate
limiting + helmet. Logging técnico (pino) separado del log de auditoría inmutable.
Cubierto por Jest/Supertest y por smoke tests E2E de Playwright, todo en CI.
