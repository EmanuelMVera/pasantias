# Migraciones legacy (pre-baseline) — referencia histórica, NO ejecutar

Esta carpeta contiene los 13 scripts `.sql` que se usaron para evolucionar el
esquema manualmente entre abril y junio de 2026, antes de adoptar Sequelize
CLI como mecanismo formal de migraciones (ver `../000-baseline.js` y
`../README.md`).

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

## Qué reemplaza a esto

`../000-baseline.js` (migración de Sequelize CLI) representa el esquema
**actual** de la aplicación tal como lo definen los modelos en
`backend/src/models/`, incluyendo la limpieza de los residuos mencionados
arriba. A partir de esa migración, todo cambio de esquema se hace con
`npx sequelize-cli migration:generate` + `npm run db:migrate`, no con
scripts `.sql` sueltos.

## Uso de este contenido

Es referencia histórica para entender cómo evolucionó el esquema. **No
ejecutar estos scripts** contra ninguna base — ni de desarrollo ni de
producción. `README-original.md` se conserva sin editar como registro de lo
que decía en su momento.
