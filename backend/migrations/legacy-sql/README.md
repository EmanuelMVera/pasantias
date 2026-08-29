# Migraciones legacy (pre-baseline) — referencia histórica, NO ejecutar

Esta carpeta contiene los 13 scripts `.sql` (numerados 001–013) que se usaron
para evolucionar el esquema manualmente entre abril y junio de 2026, antes de
adoptar un runner formal de migraciones (ver `../000-baseline.js` y
`../README.md`). El runner actual es **Umzug** (`../../scripts/migrate.js`);
originalmente se adoptó Sequelize CLI y luego se reemplazó en DB-01.

## Por qué se movieron acá

- Nunca se ejecutaron de punta a punta contra una base vacía: son `ALTER
  TABLE` sobre tablas que asumen preexistentes (creadas por
  `sequelize.sync({ alter: true })` en desarrollo). No sirven para crear el
  esquema desde cero.
- El índice de `README-original.md` documentaba solo los scripts 001 y 002 de
  los 13 — quedó desactualizado desde hace tiempo.
- El esquema resultante de aplicarlos todos ya diverge del esquema real de la
  aplicación: agregan valores a ENUMs de Postgres (`profesor`, `propietario`,
  `gerente`, `viewer`) que los modelos Sequelize actuales ya no usan, y crean
  una tabla (`avales`, script 006) que no tiene modelo ni código de
  aplicación asociado.
  - **DB-02** (migración `../012-limpiar-residuos-legacy.js`): si una base fue
    adoptada del viejo `sync` y arrastra la tabla `avales` **vacía**, la 012 la
    dropea; si tiene filas, aborta (hay que archivarla a mano). Los valores
    muertos de ENUM **no** se tocan (Postgres no permite quitar un valor de un
    ENUM sin recrear el tipo).

## Qué reemplaza a esto

`../000-baseline.js` representa el esquema **actual** de la aplicación tal como
lo definen los modelos en `backend/src/models/`, incluyendo la limpieza de los
residuos mencionados arriba. A partir de esa migración, todo cambio de esquema
se hace con `npm run db:migrate:create <nombre>` + `npm run db:migrate`, no con
scripts `.sql` sueltos.

## Uso de este contenido

Es referencia histórica para entender cómo evolucionó el esquema. **No
ejecutar estos scripts** contra ninguna base — ni de desarrollo ni de
producción. `README-original.md` se conserva sin editar como registro de lo
que decía en su momento.
