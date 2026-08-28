# Backend

## 1. ¿Qué es el backend de este proyecto?
- El backend es la parte que corre en el servidor (no en el navegador).
- Maneja la lógica de la aplicación, los datos y la conexión con la base de datos.
- Su rol es recibir las solicitudes del frontend, trabajar con la base de datos y enviar respuestas.

## 2. Objetivo del backend
- Resuelve el problema de guardar y recuperar información segura (usuarios, ofertas, postulaciones).
- Sin backend, el frontend no podría validar usuarios ni consultar datos reales.
- Diferencia simple:
  - Backend = 'motor' o cerebro que procesa datos.
  - Frontend = cara visible donde el usuario hace clic.

## 3. Tecnologías y lenguajes usados
- Node.js: permite ejecutar JavaScript fuera del navegador, en el servidor.
- Express: framework que organiza rutas y responde peticiones HTTP (GET, POST, etc.).
- PostgreSQL: base de datos donde se guardan usuarios, ofertas, postulaciones, etc.
- Sequelize: librería llamada ORM que ayuda a usar la base de datos con código en lugar de escribir SQL directo.
- JWT (`jsonwebtoken`): usa tokens (fichas seguras) para saber si un usuario está logueado.
- Bcryptjs: guarda contraseñas de forma segura encriptada.
- Multer: maneja archivos subidos (por ejemplo, currículums).
- dotenv: lee variables secretas desde `.env`, como la URL de la DB y la clave JWT.

## 4. Estructura de carpetas
Árbol principal:
- backend/
  - .env
  - package.json
  - src/
    - app.js
    - server.js
    - config/
      - database.js
    - controllers/
      - auth.controller.js
      - oferta.controller.js
      - postulacion.controller.js
    - middleware/
      - auth.middleware.js
    - models/
      - index.js
      - empresa.model.js
      - notificacion.model.js
      - oferta.model.js
      - perfil.model.js
      - postulacion.model.js
      - usuario.model.js
    - routes/
      - auth.routes.js
      - user.routes.js
      - empresa.routes.js
      - oferta.routes.js
      - postulacion.routes.js
      - admin.routes.js
      - notificacion.routes.js
    - utils/
      - seed.js

Explicación simple:
- `src/app.js`: configura el servidor, CORS, rutas y errores.
- `src/server.js`: arranca el servidor y la conexión a la base de datos.
- `src/config/database.js`: datos de conexión a PostgreSQL.
- `src/routes/`: define qué URL existe y qué controlador responde.
- `src/controllers/`: lógica de cada acción (login, crear oferta, postular).
- `src/middleware/`: funciones que se ejecutan antes de los controladores (por ejemplo, verifica el token).
- `src/models/`: descripción de tablas y relaciones entre ellas.
- `src/utils/seed.js`: datos de ejemplo para iniciar la DB (semillas).

## 5. Archivos más importantes y función de cada uno
- `src/server.js`: inicia el servicio y asegura la conexión a PostgreSQL.
- `src/app.js`: configura rutas y seguridad básica del servidor.
- `src/config/database.js`: dice a Sequelize cómo llegar a la base de datos.
- `src/routes/auth.routes.js`: rutas de autenticación (`/api/auth/login`). No hay registro público: los usuarios se cargan desde `/api/admin/usuarios` (alumno/egresado) o vía solicitud de empresa aprobada por el admin.
- `src/controllers/auth.controller.js`: maneja login, recuperar contraseña.
- `src/middleware/auth.middleware.js`: comprueba el token JWT y roles de usuario.
- `src/models/index.js`: une modelos y define relaciones entre tablas.
- `src/models/*.model.js`: cada archivo define una tabla específica (Usuario, Oferta, etc.).
- `src/services` no existe en backend: la comunicación con frontend se hace con rutas API.

## 6. Cómo funciona el backend paso a paso
1. El frontend hace una solicitud al servidor (por ejemplo, `POST /api/auth/login`).
2. En `app.js`, Express recibe el pedido y lo manda a la ruta `auth.routes.js`.
3. El route llama a la función adecuada en `auth.controller.js`.
4. El controlador verifica datos y usa los modelos (Sequelize) para buscar/guardar en DB.
5. Si la ruta necesita seguridad, `auth.middleware.verifyToken` comprueba el JWT primero.
6. El backend responde con JSON, por ejemplo con `success: true` y datos del usuario.

## 7. Base de datos
- Usa PostgreSQL (conf en `src/config/database.js`).
- Sequelize mapea tablas a objetos JS.
- Tablas importantes:
  - `Usuario`: personas (alumno, empresa, admin).
  - `Perfil`: información personal del alumno.
  - `Empresa`: datos de empresas.
  - `Oferta`: ofertas de pasantía.
  - `Postulacion`: cada postulación a oferta.
  - `Notificacion`: avisos para usuarios.
- Relación ejemplo: una `Empresa` tiene muchas `Oferta`; una `Oferta` tiene muchas `Postulacion`.

## 8. Seguridad y autenticación
- El proyecto tiene login con email/contraseña.
- Se usa JWT (token) en `src/middleware/auth.middleware.js`.
- Con token válido, el backend permite rutas protegidas; si no, devuelve error 401.
- Roles (admin, empresa, alumno, egresado) se controlan en `authorizeRoles`.
- Ejemplo: `/api/auth/me` es ruta protegida y devuelve usuario si el token es válido.

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

## 9. Cómo explicarlo en una exposición
- "El backend es la parte que corre en el servidor: recibe pedidos del frontend, consulta la base de datos y devuelve respuestas.
- Tiene rutas en `src/routes`, lógica en `src/controllers`, y datos en `src/models`.
- Usa PostgreSQL para guardar información, y JWT para proteger que solo usuarios logueados accedan.
- Si el frontend pide ofertas, el backend usa `oferta.controller` y `Oferta` (Sequelize) para entregarlas."
- Añadir: "arranca con `npm run dev`, se conecta a la DB, y está en `http://localhost:5000`." 

## 10. Resumen rápido
- Backend = servidor que procesa información y guarda en PostgreSQL.
- Organización clara: rutas, controladores, modelos, middleware y config.
- Seguridad con JWT y roles para que cada tipo de usuario vea solo su parte.
- Está diseñado así para separar responsabilidades y poder mantener el código ordenado.

