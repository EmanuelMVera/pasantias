# Migraciones — Sistema de Pasantías

Esquema de base de datos versionado. Runner: **Umzug v3** (`backend/scripts/migrate.js`),
que corre con la misma instancia `sequelize` y el logger de la app. Reemplazó a
Sequelize CLI en DB-01 (era `devDependency` → no se instalaba en producción con
`npm ci --omit=dev`).

## Cómo funciona

- **Desarrollo y producción usan el mismo runner.** No hay `sync()` en `server.js` —
  el esquema se aplica únicamente vía migraciones.
- Cada archivo `NNN-descripcion.js` de esta carpeta exporta `up()` y `down()`.
- El estado (qué migraciones se aplicaron) vive en la tabla **`SequelizeMeta`**
  (una fila por migración). La creó y la sigue usando el runner.
- **`000-baseline.js`** es el punto de partida: crea el esquema completo tal como
  lo definen hoy los modelos (`backend/src/models/`). Una base vacía + `db:migrate`
  aplica `000` … `NNN`.
- Los `CREATE INDEX CONCURRENTLY` van fuera de transacción (`002`, `010`, `011`).
- El runner toma un **`pg_advisory_lock`**: si el deploy corre `db:migrate` en
  varias instancias, solo una migra y el resto espera.

## Comandos

```bash
cd backend

npm run db:migrate                 # aplica las migraciones pendientes
npm run db:migrate:status          # ejecutadas + pendientes
npm run db:migrate:down            # revierte la última
node scripts/migrate.js down --to 003-archivos.js   # revierte hasta (sin incluir) esa
node scripts/migrate.js down --step 2               # revierte las últimas 2
npm run db:migrate:create nombre-en-kebab-case      # crea migrations/NNN-nombre.js desde plantilla
npm run db:schema:dump             # regenera schema.sql (raíz del repo) desde la base actual
npm run db:backup                  # pg_dump -Fc a backend/backups/ + verifica el dump
npm run db:reset:dev               # SOLO desarrollo: dropea + recrea la base local + migra
```

## Crear una migración nueva

```bash
npm run db:migrate:create agregar-campo-x
```

Genera `migrations/NNN-agregar-campo-x.js` desde `scripts/_migration-template.js`.
La plantilla trae `module.exports.useTransaction = true` (la migración corre dentro
de una transacción y recibe `t`; poné `{ transaction: t }` en cada llamada a
`queryInterface`). **Excepción:** si usás `CREATE INDEX CONCURRENTLY`, poné
`useTransaction = false` (Postgres no permite CONCURRENTLY dentro de una transacción).

Reglas:

- `down()` **probado**, no solo escrito (en CI: `down --to 000-baseline.js` → `up`).
- Cambios destructivos (drop/rename de columnas) → patrón **expand → migrate → contract**
  en releases separados, nunca en un solo paso.
- `NOT NULL` en dos pasos: columna nullable + backfill, y la constraint después.
- Backfills de datos en lotes, no una sola sentencia sobre toda la tabla.
- `CREATE INDEX CONCURRENTLY` en tablas con datos, nunca `CREATE INDEX` a secas.
- Toda migración pendiente debe ser **backward-compatible** con la versión de app
  que está corriendo en producción (se migra ANTES de activar el código nuevo).

## Base de datos nueva (fresh install)

DB vacía → `npm run db:migrate`. El rol de conexión necesita privilegio
`CREATE EXTENSION` (migración `003` crea `pgcrypto`, `010` crea `pg_trgm`). En
Postgres administrado suele venir habilitado; si no, pedirle al proveedor:
`CREATE EXTENSION pgcrypto; CREATE EXTENSION pg_trgm;` una vez.

## Adoptar una base que precede a las migraciones

Si hay una base creada por el viejo `sync({alter:true})` (o una prod anterior a
este runner), **no** correr `db:migrate` directo (`000` fallaría con "la tabla ya
existe"). Usar la operación única y supervisada:

```bash
node scripts/adopt-baseline.js --assume-at 011   # marca 000..011 como aplicadas sin ejecutarlas
node scripts/migrate.js status                   # verificar
```

`adopt-baseline.js` verifica objetos-centinela y aborta si `SequelizeMeta` ya
tiene filas. No borra ni convierte nada.

## Migraciones legacy (pre-baseline)

Los 13 scripts `.sql` que se usaban antes viven en `legacy-sql/` como referencia
histórica. **No se ejecutan más** — ver `legacy-sql/README.md`.
