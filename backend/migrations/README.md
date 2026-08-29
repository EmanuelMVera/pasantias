# Migraciones — Sistema de Pasantías

Esquema de base de datos versionado. Runner: **Umzug v3** (`backend/scripts/migrate.js`),
que corre con la misma instancia `sequelize` y el logger de la app. Reemplazó a
Sequelize CLI en DB-01 (era `devDependency` → no se instalaba en producción con
`npm ci --omit=dev`).

> **Regla de oro:** una migración ya aplicada **no se edita nunca**. Si algo salió
> mal o falta un cambio, se crea una migración nueva. Editar un archivo que ya
> corrió en otra base (la de un compañero, la de CI, producción) deja los esquemas
> divergentes sin que `SequelizeMeta` lo note. Ver
> [No editar migraciones ya aplicadas](#no-editar-migraciones-ya-aplicadas).

---

## Cómo funciona

- **Desarrollo y producción usan el mismo runner.** No hay `sync()` en `server.js` —
  el esquema se aplica únicamente vía migraciones.
- Cada archivo `NNN-descripcion.js` de esta carpeta exporta `up()` y `down()`.
- El estado (qué migraciones se aplicaron) vive en la tabla **`SequelizeMeta`**
  (una fila por migración). La creó y la sigue usando el runner.
- **`000-baseline.js`** es el punto de partida: crea el esquema completo tal como
  lo definen hoy los modelos (`backend/src/models/`). Una base vacía + `db:migrate`
  aplica `000` … `NNN` en orden.
- Los `CREATE INDEX CONCURRENTLY` van fuera de transacción (`002`, `010`, `011`).
- El runner toma un **`pg_advisory_lock`**: si el deploy corre `db:migrate` en
  varias instancias, solo una migra y el resto espera.

---

## Ejecutar las migraciones

```bash
cd backend

npm run db:migrate                 # aplica las migraciones pendientes (equivale a: node scripts/migrate.js up)
npm run db:migrate:status          # lista ejecutadas + pendientes
npm run db:migrate:down            # revierte la última (node scripts/migrate.js down)

# Formas avanzadas del runner:
node scripts/migrate.js down --to 003-archivos.js   # revierte hasta (sin incluir) esa
node scripts/migrate.js down --step 2               # revierte las últimas 2
node scripts/migrate.js pending                     # solo las pendientes
```

Comandos relacionados (definidos en `backend/package.json`):

```bash
npm run db:migrate:create nombre-en-kebab-case   # crea migrations/NNN-nombre.js desde la plantilla
npm run db:schema:dump                            # regenera ../schema.sql desde la base actual
npm run db:backup                                 # pg_dump -Fc a backend/backups/ + verifica el dump
npm run db:reset:dev                              # SOLO desarrollo: dropea + recrea la base local + migra
```

### Base de datos nueva (fresh install)

DB vacía → `npm run db:migrate`. El rol de conexión necesita privilegio
`CREATE EXTENSION` (migración `003` crea `pgcrypto`, `010` crea `pg_trgm`). En
Postgres administrado suele venir habilitado; si no, pedirle al proveedor que
ejecute una vez: `CREATE EXTENSION pgcrypto; CREATE EXTENSION pg_trgm;`.

---

## Las migraciones actuales (000 → 012)

13 archivos. `000` es el baseline; `001`–`012` son incrementales. Todas ya están
aplicadas en las bases de desarrollo/CI y **son históricas** — no se tocan.

| # | Archivo | Origen | Qué hace |
|---|---|---|---|
| **000** | `000-baseline.js` | EST-08 Fase 0 | **Baseline.** Crea desde cero el esquema completo tal como lo definen hoy los modelos Sequelize (no el estado acumulado de los 13 `.sql` legacy). No crea `avales` ni valores muertos de ENUM. |
| 001 | `001-fase1-seguridad-identidad.js` | EST-08 Fase 1 | `usuarios`: `tokenResetUsadoEn`, `tokenVersion`, `deletedAt`, UNIQUE case-insensitive sobre `email`. `perfiles`: `legajo` UNIQUE, UNIQUE(`usuarioId`). `empresas`: `cuit` VARCHAR(11) UNIQUE + CHECK, UNIQUE(`usuarioId`), columnas de auditoría de aprobación, `deletedAt`. |
| 002 | `002-indices.js` | EST-08 Fase 2 | Índices sobre FKs y columnas de filtro que no tenían ninguno (`ofertas`, `notificaciones`, `activity_logs`, `solicitudes_*`). `CREATE INDEX CONCURRENTLY`. |
| 003 | `003-archivos.js` | EST-08 Fase 4 | Crea `CREATE EXTENSION pgcrypto` y la tabla `archivos` (metadata de CV / cartas / fotos / logos). Las columnas string previas (`cvPath`, `fotoPerfil`, …) se conservan (patrón *expand*). |
| 004 | `004-postulacion-historial-y-consolidacion.js` | EST-08 Fase 3 | Crea `postulacion_historial_estados` (+ fila inicial por postulación). Consolida alias legacy en `postulaciones.estado` (`entrevista_programada`→`entrevista`, `no_seleccionado`→`rechazado`). |
| 005 | `005-recuperacion-acceso-miembro.js` | EST-10 | Agrega `'solicitar_recuperacion_miembro'` al ENUM `activity_logs.accion`. `ALTER TYPE … ADD VALUE` (aditivo, no reversible). |
| 006 | `006-cv-carta-archivo-fk.js` | SEC-01 | `perfiles.cvArchivoId` / `cartaArchivoId` (FK nullable a `archivos.id`). Las columnas de ruta cruda no se eliminan (*expand*). |
| 007 | `007-solicitud-empresa-auditoria.js` | TEST-01 | Agrega a `solicitudes_empresa` las columnas de auditoría de revisión que el modelo ya declaraba pero ninguna migración había creado (drift heredado del viejo `sync`). |
| 008 | `008-empresas-aprobador-set-null.js` | TEST-01 | `empresas.aprobadaPorUsuarioId` pasa a `ON DELETE SET NULL` (antes NO ACTION bloqueaba borrar un admin que hubiera aprobado empresas). |
| 009 | `009-archivos-fk-set-null.js` | BUG-01 | Mismo arreglo `ON DELETE SET NULL` para `postulaciones.cvArchivoId`, `perfiles.cvArchivoId`, `perfiles.cartaArchivoId`. |
| 010 | `010-indices-escala.js` | SCALE-02 | Índices aprobados en la auditoría SCALE-01 (cada uno responde a una query concreta del código). `CREATE INDEX CONCURRENTLY`, incluye `pg_trgm` para búsqueda por texto. |
| 011 | `011-activity-log-observabilidad.js` | OPS-01 | `activity_logs.requestId` (VARCHAR(36) NULL, sin backfill) + `idx_activity_logs_accion_created`. Correlaciona auditoría ↔ logs técnicos vía `X-Request-Id`. |
| 012 | `012-limpiar-residuos-legacy.js` | DB-02 | Saca `'aval'` del CHECK `chk_notificaciones_tipo` (feature "Avales" desmontada; aborta si hay filas con ese tipo). `DROP TABLE IF EXISTS avales` (guardado: solo si está vacía). |

`db:migrate:status` es la fuente de verdad de qué se aplicó en *esta* base.

---

## No editar migraciones ya aplicadas

Una vez que una migración corrió en cualquier base que no sea la tuya de desarrollo
descartable, **quedó congelada**:

- `SequelizeMeta` solo guarda el **nombre** del archivo, no un hash de su contenido.
  Si editás `005-*.js` y en otra base ya figura como aplicada, esa base **no** va a
  re-ejecutarla — los dos esquemas quedan distintos y nada lo avisa.
- CI corre `down --to 000-baseline.js` → `up` para probar `down()` y `up()` de cada
  migración. Cambiar una migración vieja puede romper esa cadena para todos.

Qué hacer en cambio:

| Necesito… | Hago… |
|---|---|
| Agregar/cambiar una columna, índice, constraint | `npm run db:migrate:create` → escribo la migración nueva |
| "Deshacer" algo de una migración vieja | Migración nueva que revierte ese cambio puntual |
| Corregir un `down()` que no probé | Si nunca se aplicó fuera de mi máquina: editar y re-probar. Si ya salió: migración nueva |

Reglas de estilo para migraciones nuevas:

- `down()` **probado**, no solo escrito (CI lo verifica).
- Cambios destructivos (drop/rename de columnas) → patrón **expand → migrate → contract**
  en releases separados, nunca en un solo paso.
- `NOT NULL` en dos pasos: columna nullable + backfill, y la constraint después.
- Backfills de datos en lotes, no una sola sentencia sobre toda la tabla.
- `CREATE INDEX CONCURRENTLY` en tablas con datos (requiere `useTransaction = false`).
- Toda migración pendiente debe ser **backward-compatible** con la versión de app
  que corre en producción (se migra ANTES de activar el código nuevo).

### Crear una migración

```bash
npm run db:migrate:create agregar-campo-x
```

Genera `migrations/NNN-agregar-campo-x.js` desde `scripts/_migration-template.js`.
La plantilla trae `module.exports.useTransaction = true` (la migración corre dentro
de una transacción y recibe `t`; poné `{ transaction: t }` en cada llamada a
`queryInterface`). **Excepción:** con `CREATE INDEX CONCURRENTLY`, poné
`useTransaction = false` (Postgres no permite `CONCURRENTLY` dentro de una transacción).

---

## Por qué los ENUMs viejos siguen físicamente en la base

PostgreSQL **no permite quitar un valor de un tipo `ENUM`** (`ALTER TYPE … DROP
VALUE` no existe). La única forma de sacar un valor es recrear el tipo entero:
crear un `ENUM` nuevo, migrar todas las columnas que lo usan, dropear el viejo —
una operación cara y riesgosa sobre tablas con datos.

Por eso, en la base adoptada del viejo `sync({alter:true})` conviven valores de
ENUM que **ningún modelo ni código usa hoy**:

| Tipo ENUM | Valores muertos | Historia |
|---|---|---|
| `enum_usuarios_rol` | `profesor` | Existió un rol "profesor" (feature de avales académicos). Se eliminó del producto; el valor quedó atascado en el tipo. |
| `enum_empresa_usuarios_rolInterno` | `propietario`, `gerente`, `viewer` | El rol interno de empresa pasó por `propietario / gerente / reclutador / viewer` (v1.5) antes de simplificarse a **`admin_empresa` / `reclutador`** (v2.0, migración 010 de la serie legacy). |

Decisiones tomadas (DB-02):

- **Se dejan como están.** Son inertes: los modelos declaran el conjunto real con
  `validate: { isIn: [...] }`, así que la app nunca escribe ni acepta un valor muerto.
- Para que esto **no vuelva a pasar**, `usuarios.rol` y `empresa_usuarios.rolInterno`
  en los modelos actuales son **`STRING(20)` + CHECK**, no `ENUM` de Postgres. Un
  `CHECK` se cambia con un `ALTER TABLE` simple y reversible.
- El `000-baseline` de una base **nueva** ya nace limpio: crea esas columnas como
  `STRING + CHECK` con solo los valores vigentes. Los valores muertos solo existen
  en bases que vienen del historial.
- `profesor` como rol y la tabla `avales` se sacaron del baseline y del frontend;
  la 012 limpia los últimos rastros (CHECK de `notificaciones`, tabla `avales`
  vacía) en bases heredadas.

---

## Adoptar una base que precede a las migraciones

Si hay una base creada por el viejo `sync({alter:true})` (o una prod anterior a
este runner), **no** correr `db:migrate` directo (`000` fallaría con "la tabla ya
existe"). Usar la operación única y supervisada:

```bash
node scripts/adopt-baseline.js --assume-at 011   # marca 000..011 como aplicadas SIN ejecutarlas
node scripts/migrate.js status                   # verificar
node scripts/migrate.js up                        # aplica solo lo que falte (012 en adelante)
```

`adopt-baseline.js` verifica objetos-centinela y aborta si `SequelizeMeta` ya
tiene filas. No borra ni convierte nada.

---

## Migraciones legacy (pre-baseline)

Los 13 scripts `.sql` que se usaban antes (numerados `001`–`013`, de abril a junio
de 2026) viven en **`legacy-sql/`** como referencia histórica. **No se ejecutan
más** — son `ALTER TABLE` que asumen tablas ya creadas por `sync`, no sirven para
levantar el esquema desde cero, y su resultado ya diverge del esquema real
(agregan los valores de ENUM muertos y la tabla `avales`). El baseline `000-*.js`
los reemplaza a todos. Detalle en `legacy-sql/README.md`; `legacy-sql/README-original.md`
se conserva sin editar como registro de lo que decía en su momento.

> La numeración no coincide entre las dos series: los `.sql` legacy iban `001`–`013`;
> las migraciones Umzug van `000`–`012`. Son universos separados — la única que
> importa para operar hoy es la serie Umzug.

---

## Deploy y rollback

Ver `backend/README.md` §"Migraciones y deploy (DB-01)" para el runbook completo
(pre-check → backup + restore-test → migrar en release phase → health check →
deploy de la app → smoke test) y la tabla de rollback.
