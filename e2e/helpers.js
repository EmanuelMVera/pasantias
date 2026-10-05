// @ts-check
const { expect } = require('@playwright/test');
const fx = require('./fixtures.json');

/**
 * Login por la UI. Espera a que la app redirija fuera de /login (redirección
 * por rol de AuthContext) antes de devolver.
 */
async function login(page, email, password = fx.password) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.getByRole('button', { name: /ingresar/i }).click(),
  ]);
  await expect(page.getByRole('button', { name: /ingresar/i })).toHaveCount(0);
}

/**
 * CUIT con dígito verificador válido (prefijo 30). POST /api/solicitudes-empresa
 * valida el CUIT completo: un número al azar ya no pasa.
 */
function cuitValido() {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (;;) {
    const base = `30${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}`;
    const resto = 11 - ([...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0) % 11);
    if (resto === 10) continue;
    return `${base}${resto === 11 ? 0 : resto}`;
  }
}

module.exports = { login, fx, cuitValido };
