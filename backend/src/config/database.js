const { Sequelize } = require('sequelize');
require('dotenv').config();
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    // OPS-01: el SQL solo se logea con LOG_LEVEL=debug (evita construir el
    // string en prod). Va por el logger técnico, no a console.
    logging: process.env.LOG_LEVEL === 'debug'
      ? (sql) => logger.debug({ sql }, 'sequelize')
      : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

module.exports = sequelize;
