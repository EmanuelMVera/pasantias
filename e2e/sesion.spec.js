// @ts-check
const { test, expect } = require('@playwright/test');
const { fx } = require('./helpers');

/**
 * "Recordarme" controla la persistencia real de la sesión:
 *  - sin marcar → cookie `token` de sesión del navegador (sin Expires) y el
 *    email no queda recordado;
 *  - marcado   → cookie persistente (~7 días) y el email queda recordado.
 * Logout borra la cookie en ambos casos. (No se prueba cerrar el navegador.)
 */

async function loginConForm(page, email, { recordarme }) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(fx.password);
  const check = page.getByRole('checkbox', { name: 'Recordarme' });
  if (recordarme) await check.check(); else await check.uncheck();
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.getByRole('button', { name: /ingresar/i }).click(),
  ]);
}

async function cookieToken(page) {
  return (await page.context().cookies()).find((c) => c.name === 'token');
}

async function cerrarSesion(page) {
  await page.locator('[aria-haspopup="true"]').click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/localhost:5173\/$/);
}

test.describe('Sesión — Recordarme', () => {
  test('sin Recordarme: cookie de sesión; logout la borra y no recuerda el email', async ({ page }) => {
    await loginConForm(page, fx.alumno.email, { recordarme: false });

    const token = await cookieToken(page);
    expect(token).toBeDefined();
    expect(token.httpOnly).toBe(true);
    expect(token.expires).toBe(-1); // cookie de sesión del navegador

    await cerrarSesion(page);
    expect(await cookieToken(page)).toBeUndefined();

    // Sin sesión, una ruta protegida vuelve al inicio.
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/dashboard$/);

    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: 'Recordarme' })).not.toBeChecked();
  });

  test('con Recordarme: cookie persistente (~7 días) y email recordado', async ({ page }) => {
    await loginConForm(page, fx.alumno.email, { recordarme: true });

    const token = await cookieToken(page);
    expect(token).toBeDefined();
    const dias = (token.expires - Date.now() / 1000) / 86400;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThanOrEqual(7.01);

    // La sesión sigue válida tras recargar.
    await page.reload();
    await expect(page.getByRole('button', { name: /ingresar/i })).toHaveCount(0);

    await cerrarSesion(page);
    expect(await cookieToken(page)).toBeUndefined();

    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toHaveValue(fx.alumno.email);
    await expect(page.getByRole('checkbox', { name: 'Recordarme' })).toBeChecked();

    // Desmarcar y volver a entrar: vuelve a ser sesión corta y se olvida el email.
    await loginConForm(page, fx.alumno.email, { recordarme: false });
    expect((await cookieToken(page)).expires).toBe(-1);
    expect(await page.evaluate(() => localStorage.getItem('rememberedEmail'))).toBeNull();
  });
});
