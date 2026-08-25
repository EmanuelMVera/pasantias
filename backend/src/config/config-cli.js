/**
 * config-cli.js — Configuración de conexión para Sequelize CLI.
 *
 * Sequelize CLI necesita su propio archivo de configuración (no puede leer
 * directamente una instancia de Sequelize como la de config/database.js).
 * Este archivo reexpone las mismas variables de entorno en el formato que
 * espera el CLI (una clave por entorno), usado por `sequelize-cli db:migrate`
 * y comandos relacionados. La conexión que usa la aplicación en runtime sigue
 * siendo config/database.js — este archivo es solo para el CLI de migraciones.
 */

'use strict';
require('dotenv').config();

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
};

module.exports = {
  development: base,
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
  },
  production: base,
};
