// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

test('alumno: login → ver oferta → postularse → Mis Postulaciones', async ({ page }) => {
  await test.step('1. login', async () => {
    await login(page, fx.alumno.email);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  await test.step('2. ver la oferta', async () => {
    await page.goto('/ofertas');
    await expect(page.getByRole('heading', { name: /ofertas disponibles/i })).toBeVisible();

    const card = page.locator('[class*="card"]').filter({ hasText: fx.ofertaActiva.titulo }).first();
    await expect(card).toBeVisible();
    await card.getByRole('link', { name: /ver detalle/i }).click();

    await expect(page).toHaveURL(/\/ofertas\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: fx.ofertaActiva.titulo })).toBeVisible();
  });

  await test.step('3. postularse', async () => {
    await page.getByRole('button', { name: /enviar postulación/i }).click();
    await expect(page.getByText(/postulaci[oó]n enviada|te postulaste|correctamente/i)).toBeVisible();
    // la sección de postulación desaparece tras postularse
    await expect(page.getByRole('button', { name: /enviar postulación/i })).toHaveCount(0);
  });

  await test.step('4. Mis Postulaciones', async () => {
    await page.goto('/mis-postulaciones');
    await expect(page.getByRole('heading', { name: /mis postulaciones/i })).toBeVisible();
    const fila = page.locator('[class*="postulacion"]').filter({ hasText: fx.ofertaActiva.titulo }).first();
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(/en revisi[oó]n/i);
  });
});
