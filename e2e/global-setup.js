// @ts-check
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * global-setup.js — TEST-02.
 *
 * Corre UNA vez antes de todo (y antes de arrancar los webServer): recrea +
 * migra + siembra `pasantias_db_e2e`. Así cada `npx playwright test` parte de
 * un estado idéntico y los flujos que mutan datos (postularse, moderar,
 * aprobar solicitud) no chocan entre corridas.
 */
module.exports = async () => {
  // Credenciales de DB: localmente de backend/.env (dotenv dentro del script);
  // en CI ya están en process.env (bloque env: del job).
  execFileSync('node', ['scripts/seed-e2e.js'], {
    cwd: path.join(__dirname, '..', 'backend'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'pasantias_db_e2e' },
  });
};
