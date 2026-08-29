// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

test('reclutador: login → crear oferta → candidatos → sin acciones de admin_empresa', async ({ page }) => {
  await test.step('5. login', async () => {
    await login(page, fx.reclutador.email);
    await expect(page).toHaveURL(/\/empresa$/);
  });

  await test.step('6. crear oferta', async () => {
    await page.goto('/empresa/nueva-oferta');
    await expect(page.getByRole('heading', { name: /publicar nueva oferta/i })).toBeVisible();

    await page.locator('input[name="titulo"]').fill('Pasantía QA E2E');
    await page.locator('textarea[name="descripcion"]').fill('Oferta creada por el smoke test E2E del reclutador.');
    const tipoPuesto = page.locator('input[name="tipoPuesto"]').first();
    if (await tipoPuesto.count()) await tipoPuesto.check();

    await page.getByRole('button', { name: /publicar oferta/i }).click();
    await expect(page).toHaveURL(/\/empresa$/);
  });

  await test.step('7. ver candidatos', async () => {
    await page.goto('/empresa/candidatos');
    await expect(page.getByRole('heading', { name: /^candidatos$/i })).toBeVisible();
    // hay al menos un candidato (postulación pre-sembrada en "Pasantía Backend E2E")
    await expect(page.getByText(/no hay candidatos/i)).toHaveCount(0);
    await expect(page.getByText(fx.alumno2.apellido, { exact: false })).toBeVisible();
  });

  await test.step('8. sin acciones de admin_empresa', async () => {
    await page.goto('/empresa/equipo');
    await expect(page.getByRole('heading', { name: /gesti[oó]n del equipo/i })).toBeVisible();
    await expect(page.locator('#btn-nuevo-miembro')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /solicitar reclutador/i })).toHaveCount(0);

    await page.goto('/empresa/mi-empresa');
    await expect(page.getByRole('button', { name: /guardar cambios/i })).toHaveCount(0);
    await expect(page.locator('input[name="ciudad"]')).toBeDisabled();
  });
});
