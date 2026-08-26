/**
 * tests/setup/env.js — TEST-01.
 *
 * Se ejecuta antes de cada archivo de test (Jest `setupFiles`). Reusa el
 * `.env` real del desarrollador (mismo host/usuario/contraseña de Postgres,
 * no se commitea ningún secreto nuevo) y solo redirige la base de datos y
 * desactiva el envío real de emails para el proceso de test.
 *
 * IMPORTANTE: esto tiene que correr ANTES de que cualquier archivo requiera
 * `../src/app` (o `../src/models`), porque `config/database.js` es un
 * singleton que lee `process.env.DB_NAME` una sola vez, al cargarse.
 */

'use strict';
require('dotenv').config();

process.env.NODE_ENV = 'test';

// Nunca la base de desarrollo — mismo fallback que ya usa config-cli.js
// para el entorno `test` de Sequelize CLI.
process.env.DB_NAME = process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`;

// mailer.js solo manda un email real si EMAIL_USER está seteado — lo
// vaciamos para que cualquier flujo que notifique por email (login,
// aprobar solicitud, postularse) caiga siempre en el modo "solo console.log".
process.env.EMAIL_USER = '';
process.env.EMAIL_PASS = '';
