# Migraciones — Sistema de Pasantías

Esquema de base de datos gestionado con **Sequelize CLI**. Reemplaza al
mecanismo anterior (`sequelize.sync({ alter: true })` en desarrollo +
scripts `.sql` corridos a mano en producción), retirado en EST-08 Fase 0
por no ser reproducible desde una base vacía ni estar versionado.

## Cómo funciona ahora

- **Desarrollo y producción usan exactamente el mismo mecanismo**: correr
  las migraciones con Sequelize CLI. Ya no hay `sync()` en `server.js` —
  el esquema se aplica únicamente vía migraciones.
- Cada archivo de esta carpeta (`NNN-descripcion.js` o timestamp-descripcion.js)
  es una migración de Sequelize CLI, con `up()` y `down()`.
- `000-baseline.js` es el punto de partida: crea el esquema completo tal
  como lo define hoy la aplicación (`backend/src/models/`), probado contra
  una base vacía. A partir de ahí, todo cambio de esquema es una migración
  nueva generada con `npx sequelize-cli migration:generate --name algo`.

## Comandos

```bash
cd backend

npm run db:migrate           # aplica las migraciones pendientes
npm run db:migrate:undo      # revierte la última migración aplicada
npm run db:migrate:status    # ver qué migraciones están aplicadas
npm run db:schema:dump       # regenera schema.sql (raíz del repo) desde la base actual
npm run db:reset:dev         # SOLO desarrollo: recrea la base local desde cero + migra
```

`db:reset:dev` (`backend/src/utils/resetDev.js`) reemplaza al viejo
`cleanup_db.sql`: aborta si `NODE_ENV` no es `development` o si `DB_HOST`
no es local, y en vez de borrar filas selectivamente, dropea y recrea la
base entera — más rápido, determinista, y sin riesgo de tocar por error
una base que no sea la de desarrollo.

## Base de datos de desarrollo existente (`pasantias_db`)

Si ya tenés una base de desarrollo creada por el viejo `sync({ alter: true
})` (con datos de `db:seed:demo` u otros), **esta migración baseline no la
toca ni la reconcilia automáticamente** — `db:migrate` fallaría con "la
tabla ya existe" si se corre contra ella tal cual. Opciones:

1. **Recomendado si no te importa perder los datos actuales**: correr
   `npm run db:reset:dev` (recrea la base vacía y aplica la baseline) y
   volver a sembrar con `db:seed:admin`/`db:seed:demo`.
2. Si necesitás conservar datos reales ya cargados, hace falta una
   migración de reconciliación específica (marcar `000-baseline` como
   aplicada sin recrear tablas, más una migración aparte que convierta las
   5 columnas ENUM→VARCHAR+CHECK sobre la base existente). No está hecha
   todavía — es trabajo de una etapa posterior si se necesita.

## Migraciones anteriores a la baseline

Los 13 scripts `.sql` que se usaban antes viven en `legacy-sql/` como
referencia histórica. **No se ejecutan más** — ver
`legacy-sql/README.md` para el detalle de por qué se retiraron.

## Agregar una migración nueva

```bash
npx sequelize-cli migration:generate --name descripcion-del-cambio
```

Reglas (EST-08 §5.2):

- Todo `down()` debe probarse, no solo escribirse.
- Cambios destructivos (eliminar/renombrar columnas) van en el patrón
  expand → migrate → contract, nunca en un solo paso.
- Backfills de datos en lotes, no en una sola sentencia sobre toda la tabla.
- `NOT NULL` se agrega en dos pasos: columna nullable + backfill primero,
  constraint después.
- Índices sobre tablas con datos: `CREATE INDEX CONCURRENTLY`, nunca
  `CREATE INDEX` a secas contra una base en producción.
