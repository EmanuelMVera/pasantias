// @ts-check
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * global-setup.js — TEST-02 / CI-03.
 *
 * ⚠️ ORDEN: Playwright arranca los `config.webServer` ANTES de correr este
 * `globalSetup` (confirmado en el runner de @playwright/test: los tasks de
 * arranque de webServer están antes que los de `globalSetups` en la lista que
 * arma `createGlobalSetupTasks()`). Por eso, si la preparación de la base
 * dependiera SOLO de este archivo, un Postgres limpio (CI recién levantado, o
 * local sin una corrida previa) haría que el backend del webServer intentara
 * conectarse a `pasantias_db_e2e` ANTES de que exista — y muriera con
 * `SequelizeConnectionError` (exit code 1) sin que este código llegara a
 * crearla. Es justamente lo que reprodujo el fallo de CI-03.
 *
 * La preparación real pasa por `scripts/run-e2e.js` (invocado por
 * `npm run e2e` / `npm run e2e:ui`): corre `backend/scripts/seed-e2e.js` de
 * forma síncrona ANTES de arrancar Playwright, y le pasa `E2E_DB_PREPARED=true`.
 * Con esa variable, este `globalSetup` NO vuelve a recrear la base — ya está
 * lista, y el webServer para entonces ya se está conectando a ella.
 *
 * Si Playwright se invoca directamente (`npx playwright test`, sin pasar por
 * `npm run e2e`), este `globalSetup` sigue siendo el fallback que recrea +
 * migra + siembra la base — igual que antes de CI-03. Ese modo directo sigue
 * teniendo la misma limitación de siempre (necesita que la base ya exista de
 * una corrida previa para que el webServer no falle); `npm run e2e` es la
 * forma soportada de correr la suite completa desde un Postgres vacío.
 */
module.exports = async () => {
  if (process.env.E2E_DB_PREPARED === 'true') {
    console.log('[global-setup] pasantias_db_e2e ya fue preparada por scripts/run-e2e.js — se omite la recreación.');
    return;
  }

  // Credenciales de DB: localmente de backend/.env (dotenv dentro del script);
  // en CI ya están en process.env (bloque env: del job).
  execFileSync('node', ['scripts/seed-e2e.js'], {
    cwd: path.join(__dirname, '..', 'backend'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'pasantias_db_e2e' },
  });
};
