#!/usr/bin/env node
'use strict';

/**
 * scripts/run-e2e.js — CI-03.
 *
 * Orquesta la suite E2E en el orden correcto: prepara la base `pasantias_db_e2e`
 * ANTES de arrancar Playwright.
 *
 * Por qué hace falta (no alcanza con `globalSetup`):
 * Playwright arranca los `config.webServer` configurados ANTES de correr
 * `globalSetup`. Confirmado leyendo el runner de @playwright/test 1.62
 * (`packages/playwright/src/runner/*` → `createGlobalSetupTasks()`): la lista de
 * tasks es `[removeOutputDirs, ...pluginSetupTasks, ...globalTeardowns,
 * ...globalSetups]` — `pluginSetupTasks` es lo que arranca los `webServer`
 * (el `webServer` de `playwright.config.js` se registra como un plugin más), y
 * corre ANTES que `globalSetups`. Reproducido también en la práctica: con
 * `pasantias_db_e2e` inexistente (CI limpio, o local tras un
 * `DROP DATABASE`), el backend del webServer sale con
 * `SequelizeConnectionError: no existe la base de datos "pasantias_db_e2e"`
 * (exit code 1) — y `globalSetup` nunca llega a crearla, porque para entonces
 * Playwright ya reportó el webServer como caído.
 *
 * Este script rompe esa dependencia: prepara la base ANTES de que Playwright
 * exista siquiera como proceso, así el webServer se conecta a una base que ya
 * existe. Le pasa `E2E_DB_PREPARED=true` para que `e2e/global-setup.js` no la
 * vuelva a recrear mientras el webServer ya está arrancando (ver ese archivo).
 *
 * Multiplataforma (Windows/Git Bash + Linux CI): todo vía `child_process`, sin
 * shell, invocando directamente los .js de los binarios (nada de sintaxis de
 * shell, nada de `cross-env`).
 *
 * Uso:
 *   node scripts/run-e2e.js              (equivalente a `npm run e2e`)
 *   node scripts/run-e2e.js --ui         (equivalente a `npm run e2e:ui`)
 *   node scripts/run-e2e.js -- --grep @x (argumentos extra → `playwright test`)
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

function run(args, options) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.error) throw result.error; // no se pudo ni lanzar el proceso (ENOENT, etc.)
  // Señal (Ctrl+C, kill) en vez de exit code normal: reportar como fallo.
  return result.status ?? 1;
}

function main() {
  // 1) Preparar la base E2E — recrea + migra + siembra `pasantias_db_e2e`.
  //    Debe terminar ANTES de que exista el proceso de Playwright.
  console.log('[run-e2e] Preparando la base pasantias_db_e2e antes de arrancar Playwright...');
  const seedStatus = run([path.join(BACKEND_DIR, 'scripts', 'seed-e2e.js')], {
    cwd: BACKEND_DIR,
    env: { ...process.env, NODE_ENV: 'test', DB_NAME: 'pasantias_db_e2e' },
  });
  if (seedStatus !== 0) {
    console.error(`[run-e2e] seed-e2e.js falló (exit ${seedStatus}) — no se ejecuta Playwright.`);
    process.exit(seedStatus);
  }

  // 2) Correr Playwright. `@playwright/test` expone su CLI en el subpath
  //    "./cli" (ver package.json → exports); resolverlo así funciona igual en
  //    Windows y Linux sin depender del shim .cmd/.ps1 de node_modules/.bin.
  const playwrightCli = require.resolve('@playwright/test/cli');
  const extraArgs = process.argv.slice(2); // ej: ['--ui'] o ['--grep', '@smoke']
  console.log('[run-e2e] Base lista. Arrancando Playwright (E2E_DB_PREPARED=true)...');
  const testStatus = run([playwrightCli, 'test', ...extraArgs], {
    cwd: ROOT_DIR,
    env: { ...process.env, E2E_DB_PREPARED: 'true' },
  });

  process.exit(testStatus);
}

main();
