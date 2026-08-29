// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

test('admin_empresa: editar empresa → gestionar equipo', async ({ page }) => {
  await login(page, fx.adminEmpresa.email);
  await expect(page).toHaveURL(/\/empresa$/);

  await test.step('9. editar el perfil de la empresa', async () => {
    await page.goto('/empresa/mi-empresa');
    await expect(page.getByRole('heading', { name: /perfil de empresa/i })).toBeVisible();

    const ciudad = page.locator('input[name="ciudad"]');
    await expect(ciudad).toBeEnabled();
    await ciudad.fill('Lanús ' + Date.now().toString().slice(-4));

    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByText(/datos de empresa actualizados/i)).toBeVisible();
  });

  await test.step('10. gestionar el equipo (solicitar reclutador)', async () => {
    await page.goto('/empresa/equipo');
    await expect(page.getByRole('heading', { name: /gesti[oó]n del equipo/i })).toBeVisible();

    await page.locator('#btn-nuevo-miembro').click();
    await expect(page.getByRole('heading', { name: /solicitar nuevo reclutador/i })).toBeVisible();

    await page.getByPlaceholder('Juan').fill('Nuevo');
    await page.getByPlaceholder('Pérez').fill('Recluta');
    await page.getByPlaceholder('reclutador@empresa.com').fill(`nuevo.recluta.${Date.now()}@itb.test`);
    await page.getByRole('button', { name: /enviar solicitud/i }).click();

    // el modal se cierra al enviar OK
    await expect(page.getByRole('heading', { name: /solicitar nuevo reclutador/i })).toHaveCount(0);
  });
});
