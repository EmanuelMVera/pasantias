// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * playwright.config.js — TEST-02 / CI-03.
 *
 * Smoke E2E sobre back(:5000, NODE_ENV=test) + front(:5173) con una base
 * dedicada `pasantias_db_e2e`. No apunta a producción.
 *
 * ⚠️ Orden de arranque: Playwright levanta los `webServer` de acá ANTES de
 * correr `globalSetup` — por eso la preparación real de `pasantias_db_e2e`
 * (recrear/migrar/sembrar) NO puede depender solo de `globalSetup`; la hace
 * `scripts/run-e2e.js` (invocado por `npm run e2e` / `npm run e2e:ui`) antes
 * de arrancar este proceso de Playwright. Ver `e2e/global-setup.js` para el
 * detalle completo. Ejecutar `npx playwright test` directo (sin pasar por
 * `npm run e2e`) sigue requiriendo que la base ya exista de antes.
 *
 * Todo usa `localhost` (no `127.0.0.1`): así el front (`localhost:5173`) y la
 * API (`localhost:5000`) son "same-site" y la cookie de sesión (SameSite=Lax)
 * viaja — igual que en dev. Mezclar `127.0.0.1` con `localhost` rompe el login.
 *
 * Las credenciales de DB NO se setean acá: localmente las carga `backend/.env`
 * (dotenv); en CI vienen del bloque `env:` del job (Playwright mergea
 * process.env con el `env` de cada webServer). `STORAGE_BACKEND`/`DB_SSL` se
 * fijan explícitos abajo para que el backend del e2e nunca dependa de un
 * default (CI-03): siempre disco local, nunca R2/S3, nunca SSL contra el
 * Postgres local del job.
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // una sola base mutable + flujos con dependencia de datos
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./e2e/global-setup.js'),

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run start',
      cwd: 'backend',
      url: 'http://localhost:5000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        PORT: '5000',
        DB_NAME: 'pasantias_db_e2e',
        // CI-03: explícitos, nunca heredados de un default — el e2e jamás
        // debe tocar R2/S3 ni pedir SSL al Postgres local del job/host.
        STORAGE_BACKEND: 'local',
        DB_SSL: 'false',
        // Por si el shell del dev tuviera DATABASE_URL exportada para otra
        // cosa: acá se pisa vacía para que config/database.js use siempre
        // DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (nunca Neon).
        DATABASE_URL: '',
        JWT_SECRET: process.env.JWT_SECRET || 'e2e-secret',
        CLIENT_URL: 'http://localhost:5173',
      },
    },
    {
      command: 'npm run dev',
      cwd: 'frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
