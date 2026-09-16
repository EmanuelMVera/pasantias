# Despliegue de SisPasantías

Guía para poner SisPasantías en producción. Arquitectura objetivo:

```
   Navegador
      │  https://<frontend>.vercel.app
      ▼
  ┌─────────────┐   /api/*  (rewrite same-origin, vercel.json)
  │   Vercel    │ ───────────────────────────────►  ┌──────────────┐
  │  (frontend  │                                   │    Render    │
  │   Vite SPA) │   /uploads/public/*  (transición) │  (backend    │
  └─────────────┘ ─────────────────────────────────►│   Express)   │
                                                    └──────┬───────┘
                                          DATABASE_URL     │      S3 API
                                          (pooled, SSL)    │
                                                    ┌──────▼───────┐   ┌───────────────────────┐
                                                    │     Neon     │   │  Cloudflare R2        │
                                                    │  PostgreSQL  │   │  bucket privado (CV)  │
                                                    └──────────────┘   │  bucket público (img) │
                                                                       └───────────────────────┘
```

**Por qué el proxy de Vercel:** la sesión va en una cookie `HttpOnly` y el CSRF es
double-submit (el frontend lee la cookie `csrf_token` con `document.cookie`). Si el
navegador llamara directo de `*.vercel.app` a `*.onrender.com`, ese JS no podría leer
la cookie de otro dominio y **todo POST/PUT/PATCH daría 403**; además varios navegadores
bloquean cookies de terceros. Con el rewrite `/api/*` → Render, el navegador ve la API
como **same-origin**: `SameSite=Lax` alcanza y el CSRF funciona sin cambios.

---

## 1. Requisitos previos

- Cuenta en Neon, Render, Vercel y Cloudflare (R2 activado).
- Node 22 local (`.nvmrc` → `22`) para correr comandos y tests.
- El repo en GitHub (Render y Vercel se conectan al repo).

---

## 2. Orden exacto de despliegue

### (a) Cloudflare R2 — dos buckets

1. R2 → **Create bucket** → `sispasantias-privado` (CV, cartas). **NO** habilitar acceso
   público.
2. R2 → **Create bucket** → `sispasantias-publico` (fotos de perfil, logos).
   → *Settings* → **Public access** → habilitar el dominio `r2.dev` **o** conectar un
   dominio propio (`cdn.tudominio.edu`). Esa URL es `S3_PUBLIC_BASE_URL` (sin barra final).
3. R2 → **Manage R2 API Tokens** → **Create API token** → permiso *Object Read & Write*
   sobre **ambos** buckets. Anotar *Access Key ID* y *Secret Access Key*.
4. El endpoint es `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (aparece en la pantalla
   del token). Ese es `S3_ENDPOINT`.
5. **Versionado / retención:** configurarlo en cada bucket por separado (R2 → *Settings*).
   Un backup de PostgreSQL **no** incluye los objetos de R2.

### (b) Neon — PostgreSQL

1. Crear proyecto + base (`sispasantias`).
2. Copiar la **connection string _pooled_** (la que dice `-pooler` en el host y termina
   en `?sslmode=require`). Esa es `DATABASE_URL`.
   ```
   postgresql://usuario:password@ep-xxxx-pooler.<region>.aws.neon.tech/sispasantias?sslmode=require
   ```
3. Extensiones: las crean las migraciones (`003` → `pgcrypto`, `010` → `pg_trgm`). El rol
   por defecto de Neon tiene permiso `CREATE EXTENSION`. Si por algún motivo no, correr
   una vez en el SQL Editor de Neon:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
4. **No** importar `schema.sql` a mano — la base arranca vacía y las migraciones la
   construyen (paso d).

### (c) Render — backend

1. Render → **New** → **Blueprint** → conectar el repo. Render lee `render.yaml`.
2. Render pide los valores de las variables `sync: false` — cargarlas (ver
   [tabla de variables](#4-tabla-de-variables)). Para `CLIENT_URL` / `ALLOWED_ORIGINS`
   se puede poner un placeholder temporal (`https://example.vercel.app`) y corregirlo en
   el paso (g).
3. **Primer deploy — cargar el admin:** cambiar temporalmente el *Build Command* del
   servicio a:
   ```
   npm ci && npm run db:migrate && npm run db:seed:admin
   ```
   Requiere `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` seteadas (el seed aborta si
   faltan). Es **idempotente** (no duplica el admin).
4. Deploy. Verificar en los logs: "Conexión a PostgreSQL establecida" y
   "Servidor escuchando".
5. **Volver el Build Command a:**
   ```
   npm ci && npm run db:migrate
   ```
   (así los deploys siguientes solo migran).
6. Anotar la URL pública del servicio: `https://sispasantias-api.onrender.com`. Setear
   `PUBLIC_URL` con ese valor.

> **Shell de Render:** si el plan no da acceso a Shell, la única forma de correr
> comandos one-off es a través del Build Command (como arriba). **No** crear un endpoint
> HTTP de seed ni rutas administrativas ocultas.

### (d) Migraciones

Corren solas en el Build Command (`npm run db:migrate` → runner Umzug con
`pg_advisory_lock`). Para verificar el estado desde tu máquina apuntando a Neon:

```bash
cd backend
DATABASE_URL='postgresql://...-pooler...?sslmode=require' DB_SSL=true \
  npm run db:migrate:status
```

### (e) Admin

Ya cargado en el paso (c.3). Para verificar: intentar login en el frontend (paso h) con
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### (f) Vercel — frontend

1. Vercel → **Add New Project** → importar el repo.
2. **Root Directory:** `frontend`.
3. Framework preset: **Vite** (Install `npm ci`, Build `npm run build`, Output `dist` —
   ya está en `frontend/vercel.json`).
4. **Environment Variables → Production:** `VITE_API_URL` = `/api`.
   (En Preview/Development podés dejarlo sin setear o `/api`.)
5. **No** poner secretos en variables `VITE_*` — quedan embebidas en el bundle y son
   públicas.
6. Deploy. Anotar la URL: `https://<proyecto>.vercel.app`.

### (g) URL definitiva del backend en `vercel.json`

1. Editar `frontend/vercel.json` y reemplazar **las dos** ocurrencias de
   `https://REEMPLAZAR-URL-DE-RENDER.onrender.com` por la URL real de Render del
   paso (c.6). **Sin barra final.**
2. Commit + push.
3. En Render, corregir `CLIENT_URL` y `ALLOWED_ORIGINS` con la URL real de Vercel del
   paso (f.6) (sin barra final).

### (h) Redeploy final

1. Vercel redeploya solo con el push del paso (g). Si no, **Redeploy** manual.
2. En Render, **Manual Deploy** → *Deploy latest commit* (para tomar `CLIENT_URL` /
   `ALLOWED_ORIGINS` nuevas).

### (i) Smoke tests

Ver [checklist](#10-checklist-de-smoke-tests).

---

## 3. Flujo de instalación resumido

**Primera instalación (una vez):**
```
npm ci
npm run db:migrate
npm run db:seed:admin      # requiere SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD en prod
```

**Deploys siguientes:**
```
npm ci
npm run db:migrate
```

**Carga opcional del escenario de presentación** (solo staging/demo, **nunca** en la
producción real):
```
ALLOW_PRODUCTION_DEMO_SEED=true npm run db:seed:presentacion
```
Sin `ALLOW_PRODUCTION_DEMO_SEED=true`, el script **aborta** si `NODE_ENV=production`.
Crea **exactamente 3** usuarios ficticios — `empresa@demo.com`, `reclutador@demo.com`,
`alumno@demo.com` (password `Demo1234!`) — más una empresa/ofertas/postulaciones/chats
coherentes. No borra usuarios reales. **El admin real nunca forma parte de este escenario**:
no lo crea, no usa `Demo1234!`, no aparece en `LoginPage` ni en `GET /api/demo/status`. Después
de usarlo una vez, **eliminá `ALLOW_PRODUCTION_DEMO_SEED`** de las variables de entorno del
servicio — no debe quedar seteada de forma permanente.

---

## 4. Tabla de variables

Leyenda: **S** = secreta · **R** = requerida en producción · **O** = opcional.

| Variable | Servicio | R/O | Ejemplo seguro | Descripción | S |
|---|---|---|---|---|---|
| `NODE_ENV` | Render | R | `production` | Activa validación de config, HSTS, cookies Secure. | |
| `PORT` | — | — | *(lo inyecta Render)* | No setear en Render. Local: `5000`. | |
| `DATABASE_URL` | Render | R | `postgresql://u:p@ep-x-pooler.../db?sslmode=require` | Connection string **pooled** de Neon. | S |
| `DB_SSL` | Render | R | `true` | Fuerza TLS. Neon lo exige. | |
| `DB_SSL_NO_VERIFY` | Render | O | *(sin setear)* | `true` = no verificar el cert del server. Neon tiene cert válido → dejar sin setear. | |
| `DB_POOL_MAX` | Render | O | `5` | Máx. conexiones del pool. Default 5. | |
| `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` | local | — | `localhost` / `5432` / `pasantias_db` / `postgres` / … | Solo desarrollo local (si no hay `DATABASE_URL`). | S (password) |
| `JWT_SECRET` | Render | R | *(48 bytes hex aleatorios, ≥32 chars)* | Firma del JWT de sesión. **Nuevo, distinto del de dev.** | S |
| `JWT_EXPIRES_IN` | Render | O | `7d` | Vencimiento del JWT. | |
| `CLIENT_URL` | Render | R | `https://sispasantias.vercel.app` | URL del frontend. Links de emails + fallback CORS. HTTPS. Sin barra final. | |
| `ALLOWED_ORIGINS` | Render | R | `https://sispasantias.vercel.app` | Orígenes CORS (coma-separados, sin `*`, sin barra final). | |
| `PUBLIC_URL` | Render | R si `STORAGE_BACKEND=local` | `https://sispasantias-api.onrender.com` | URL pública del backend. Con `s3` no es obligatoria. | |
| `COOKIE_SECURE` | Render | R | `true` | Flag Secure en las cookies. | |
| `COOKIE_SAMESITE` | Render | R | `lax` | `lax` con el proxy same-origin. | |
| `COOKIE_DOMAIN` | Render | R | *(vacío)* | Vacío con el proxy. | |
| `TRUST_PROXY` | Render | R | `1` | 1 proxy delante (Render). Necesario para `req.ip` / rate limit / auditoría / `req.protocol`. | |
| `STORAGE_BACKEND` | Render | R | `s3` | `local` (disco) o `s3` (R2/S3). | |
| `S3_ENDPOINT` | Render | R si `s3` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Endpoint S3 de R2. | S (contiene el account id) |
| `S3_REGION` | Render | O | `auto` | R2: `auto`. | |
| `S3_BUCKET` | Render | R si `s3` | `sispasantias-privado` | Bucket privado (CV, cartas). | |
| `S3_PUBLIC_BUCKET` | Render | R si `s3` | `sispasantias-publico` | Bucket público (fotos, logos). | |
| `S3_ACCESS_KEY_ID` | Render | R si `s3` | *(del token R2)* | Credencial con acceso a ambos buckets. | S |
| `S3_SECRET_ACCESS_KEY` | Render | R si `s3` | *(del token R2)* | | S |
| `S3_FORCE_PATH_STYLE` | Render | O | `false` | `true` solo si el proveedor lo requiere. | |
| `S3_PUBLIC_BASE_URL` | Render | R si `s3` | `https://cdn.tudominio.edu` o `https://pub-xxxx.r2.dev` | Dominio público del bucket público. Sin barra final. | |
| `S3_KEY_PREFIX` | Render | O | `sispasantias` | Namespace de las keys. | |
| `EMAIL_HOST` | Render | O | `smtp.gmail.com` | Servidor SMTP. | |
| `EMAIL_PORT` | Render | O | `587` | 587 = STARTTLS, 465 = TLS implícito. | |
| `EMAIL_SECURE` | Render | O | `false` | `true` para el puerto 465. | |
| `EMAIL_USER` | Render | O | `noreply@tudominio.edu` | Usuario SMTP. Sin esto, la API arranca igual (no manda emails). | S |
| `EMAIL_PASS` | Render | O | *(App Password de Gmail)* | Con Gmail: **contraseña de aplicación**, no la del correo. | S |
| `EMAIL_FROM` | Render | O | `"SisPasantías" <noreply@tudominio.edu>` | Remitente. Default: `"SisPasantías" <EMAIL_USER>`. | |
| `EMAIL_REQUIRED` | Render | O | `false` | `true` = la API aborta si falta el SMTP. | |
| `SEED_ADMIN_EMAIL` | Render | R (solo primer deploy) | `admin@tudominio.edu` | Email del admin. | |
| `SEED_ADMIN_PASSWORD` | Render | R (solo primer deploy) | *(fuerte)* | Contraseña del admin. Cambiarla tras el primer login. | S |
| `SEED_PRESENTACION_ON_BOOT` | Render | R | `false` | Nunca `true` en producción. | |
| `ALLOW_PRODUCTION_DEMO_SEED` | Render | O | *(sin setear)* | `true` habilita `db:seed:presentacion` en prod (datos ficticios). | |
| `ENABLE_API_DOCS` | Render | O | `false` | `true` expone Swagger UI en `/api/docs`. | |
| `LOG_LEVEL` | Render | O | `info` | `debug` también logea el SQL. | |
| `NODE_VERSION` | Render | O | `22` | Versión de Node en Render. | |
| `CSV_IMPORT_MAX_BYTES` | Render | O | `2097152` | Tamaño máx. del CSV de importación de alumnos/egresados (bytes). Default 2 MB. | |
| `CSV_IMPORT_MAX_ROWS` | Render | O | `2000` | Filas máx. por archivo CSV de importación. | |
| `VITE_API_URL` | Vercel | R | `/api` | Con el proxy same-origin. Dev: `http://localhost:5000/api`. | |

---

## 5. Migraciones y seeds

```bash
cd backend

npm run db:migrate            # aplica las pendientes (Umzug, pg_advisory_lock)
npm run db:migrate:status     # ejecutadas + pendientes
npm run db:seed:admin         # crea el admin — SOLO si no existe; si el email ya existe,
                               # NO actualiza la contraseña (correr de nuevo con otra
                               # SEED_ADMIN_PASSWORD no la cambia). Para resetearla, usá
                               # "Olvidé mi contraseña" en /login.
npm run db:admin:status -- --email=admin@tudominio.edu   # diagnóstico de solo lectura:
                               # existe/no existe, rol, activo, habilitado, deletedAt.
                               # Nunca muestra el hash. No modifica nada.

# Solo staging/demo — nunca en la producción real:
ALLOW_PRODUCTION_DEMO_SEED=true npm run db:seed:presentacion
```

Contra Neon desde tu máquina: exportar `DATABASE_URL` (pooled) y `DB_SSL=true` antes del
comando.

Detalle del runner y reglas de migraciones nuevas: `backend/migrations/README.md`.

---

## 6. Advertencias

- **No** correr `npm run db:reset:dev` contra Neon (dropea y recrea la base — tiene doble
  guard: `NODE_ENV=development` + `DB_HOST` localhost).
- **No** usar `npm run db:seed:demo` en producción — **está bloqueado** (borra usuarios
  con email `@itbeltran.com.ar` y hace `destroy({ force: true })`).
- **No** poner `SEED_PRESENTACION_ON_BOOT=true` en producción. Aunque se ponga, el seed
  de demo no corre sin `ALLOW_PRODUCTION_DEMO_SEED=true`.
- El **admin real nunca forma parte** del seed de presentación — se crea exclusivamente
  con `db:seed:admin`, nunca usa la contraseña `Demo1234!`, y no aparece en `LoginPage` ni
  en `GET /api/demo/status` (que solo refleja las 3 cuentas demo, nunca un admin).
- Después de correr `db:seed:presentacion` en un entorno con `ALLOW_PRODUCTION_DEMO_SEED=true`,
  **eliminá esa variable** de inmediato — no debe quedar seteada de forma permanente.
- **No** guardar uploads en el filesystem de Render (efímero) → usar `STORAGE_BACKEND=s3`.
- **No** poner secretos en variables `VITE_*` (van al bundle público).
- **No** subir `.env` al repo (está gitignored).
- **No** importar `schema.sql` además de correr migraciones — la base nueva arranca vacía
  y las migraciones la construyen.

---

## 7. Rotación de secretos

| Secreto | Cómo rotar | Efecto |
|---|---|---|
| `JWT_SECRET` | Generar uno nuevo, actualizar en Render, redeploy. | Invalida **todas** las sesiones activas (todos re-login). |
| `SEED_ADMIN_PASSWORD` | Cambiar la contraseña del admin desde la app (`/cambiar-password`). La variable solo se usa en el primer seed. | La sesión del admin se cierra (`tokenVersion++`). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Crear un token R2 nuevo, actualizar en Render, redeploy, revocar el viejo. | Sin downtime si se hace en ese orden. |
| SMTP (`EMAIL_PASS`) | Generar una App Password nueva, actualizar, redeploy, revocar la vieja. | — |
| `DATABASE_URL` | Rotar la contraseña del rol en Neon, actualizar en Render, redeploy. | Breve corte de conexiones durante el redeploy. |

> El `.env` local de desarrollo tiene secretos reales (incluida una App Password de
> Gmail y un `JWT_SECRET`). **Producción debe usar valores nuevos y distintos** — nunca
> reutilizar el `JWT_SECRET` de dev.

---

## 8. Backups

- **PostgreSQL (Neon):** el backup primario son los **snapshots + PITR de Neon**
  (configurar retención en el proyecto; PITR ≥ 7 días recomendado). `npm run db:backup`
  (`pg_dump -Fc`) es una copia portable adicional — **requiere `pg_dump` en el PATH**, que
  puede no estar disponible en Render; correrlo desde una máquina con el cliente de
  PostgreSQL instalado.
- **Objetos de R2:** un backup de PostgreSQL **no** incluye los archivos (CV, fotos,
  logos). Configurar **versionado y retención en cada bucket de R2 por separado**. Para
  una copia externa, `rclone` o `aws s3 sync` contra el endpoint de R2.
- **Ejercicio de restore:** trimestralmente, restaurar un snapshot de Neon en una base
  scratch y correr `npm run db:migrate:status` para confirmar que el dump es válido.

---

## 9. Rollback

- **Nunca** correr `npm run db:migrate:down` automáticamente en producción.
- **App y migración son rollbacks separados:**
  | Situación | Acción |
  |---|---|
  | Migración OK, código nuevo falla | Rollback del **deploy de la app** en Render (*Rollback* al deploy anterior). La DB queda adelante — funciona por expand/contract. |
  | Migración recién aplicada, no destructiva, es mala | `npm run db:migrate:down` (una) + redeploy de la versión anterior. |
  | Cambio destructivo ya aplicado | **Restore desde snapshot / PITR de Neon.** |
- Toda migración nueva debe ser **backward-compatible** con la versión de app en
  producción (se migra **antes** de activar el código nuevo).

---

## 10. Checklist de smoke tests

Después del deploy final, contra la URL de Vercel:

- [ ] `GET https://<backend>/api/health` → `{ "status": "OK" }`.
- [ ] Login con el admin → entra al panel.
- [ ] Recargar la página estando logueado → la sesión persiste (cookie).
- [ ] Crear/editar algo (POST/PATCH) → funciona (CSRF OK). Sin el header
      `X-CSRF-Token` → 403.
- [ ] Logout → vuelve al login; recargar → sigue deslogueado (cookie borrada).
- [ ] Recuperación de contraseña → llega el email (o, sin SMTP, mensaje genérico
      **sin** token en la respuesta).
- [ ] Registrar una empresa (solicitud) → aprobarla como admin → crear una oferta →
      postularse como alumno.
- [ ] Subir un CV (PDF) como alumno → descargarlo desde el propio perfil.
- [ ] Subir foto de perfil y logo de empresa → se ven (URL de `S3_PUBLIC_BASE_URL`).
- [ ] Reemplazar la foto → la anterior deja de existir.
- [ ] Como alumno B, pedir `GET /api/archivos/<id-del-CV-de-A>` → **404** (sin autorización).
- [ ] Abrir directo `https://<frontend>/reset-password/xxx` (recarga de ruta React) →
      carga la SPA, no 404.
- [ ] En Render: **Manual Deploy** (o reiniciar el servicio) → volver a probar login y
      **descargar un CV subido antes** → la DB y los archivos de R2 **persisten**.
- [ ] `GET /api/demo/status` → `enabled:false` si no se cargó el escenario de presentación
      (o `true` con exactamente 3 cuentas, ninguna admin, si se cargó a propósito).
- [ ] Como admin, `GET /admin/importaciones` → descargar plantilla, previsualizar un CSV
      de prueba (dry-run) y confirmar → el usuario creado recibe el email de activación
      (o, sin SMTP, aparece en `devTokens` — nunca en producción).

---

## Limitaciones conocidas

- **`vercel.json` lleva la URL de Render hardcodeada** (paso g). Vercel no permite
  variables de entorno en `destination` de un rewrite. Un valor sin reemplazar da **502
  ruidoso**, nunca falla en silencio.
- **Sin transacción distribuida DB + S3:** al subir una imagen se sube el objeto y luego
  se registra la fila; si la fila falla, se borra el objeto (compensación). Un crash
  entre ambos pasos puede dejar un objeto huérfano. El borrado del objeto **anterior** al
  reemplazar una imagen es best-effort (si falla, se logea, no rompe el request).
- **Rate limiting en memoria:** correcto para una instancia de Render. Escalar a varias
  instancias requiere un store compartido (Redis).
- **Plan free de Render:** el servicio hace *spin-down* tras inactividad → la primera
  request luego de dormir tarda unos segundos.
- **Gmail SMTP** tiene límites de envío bajos. Para volumen real, migrar a un proveedor
  transaccional (solo cambian `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_SECURE` / credenciales
  / `EMAIL_FROM`).
- El backend `s3` se probó contra el AWS SDK **mockeado** (`backend/tests/storage.test.js`),
  no contra un bucket R2 real.
- **Frontend sin suite de tests automatizada** (solo Playwright E2E, con su propio seed
  independiente en `e2e/`). Los cambios de UI (Navbar, LoginPage, panel de importación CSV)
  se verifican manualmente — ver checklist de la sección 10.
- **Identidad visual del admin_empresa en el Navbar:** mientras `EmpresaContext` resuelve su
  único fetch por sesión, hay un instante en que se muestran los datos personales del usuario
  en vez del logo/razón social de la empresa. Imperceptible en la práctica; no tiene skeleton
  dedicado.
- **Reporte de errores de la importación CSV** se genera en el cliente a partir del resultado
  del dry-run ya en memoria (no hay un endpoint dedicado para descargarlo aparte).
