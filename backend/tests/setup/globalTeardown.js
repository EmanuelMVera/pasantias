/**
 * tests/setup/globalTeardown.js — TEST-01.
 *
 * No borra la base de test (se reusa entre corridas para no pagar el costo
 * de migrar desde cero cada vez) — solo existe como punto de extensión si
 * en el futuro hiciera falta cerrar algo global. Cada archivo de test ya
 * cierra su propia conexión Sequelize en su `afterAll`.
 */
'use strict';
module.exports = async function globalTeardown() {};
