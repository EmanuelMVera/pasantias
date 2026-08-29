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

module.exports = { login, fx };
