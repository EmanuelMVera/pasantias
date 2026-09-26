// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

test('admin: login → moderar oferta → gestionar solicitud', async ({ page }) => {
  await test.step('11. login', async () => {
    await login(page, fx.admin.email);
    await expect(page).toHaveURL(/\/admin$/);
  });

  await test.step('12. moderar (aprobar) una oferta pendiente', async () => {
    await page.goto('/admin/ofertas');
    await expect(page.getByRole('heading', { name: /moderaci[oó]n de ofertas/i })).toBeVisible();

    // La pestaña "Pendientes" es la que abre por defecto.
    await expect(page.getByRole('tab', { name: /pendientes/i })).toHaveAttribute('aria-selected', 'true');

    const fila = page.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: /aprobar/i }).click();

    await expect(page.getByText(/oferta aprobada correctamente/i)).toBeVisible();
    // ya no está en la cola de pendientes
    await expect(page.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo })).toHaveCount(0);
  });

  await test.step('13. gestionar (aprobar) una solicitud de empresa', async () => {
    await page.goto('/admin/solicitudes');
    await expect(page.getByRole('heading', { name: /^solicitudes$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /empresas/i })).toHaveAttribute('aria-selected', 'true');

    // La fila solo lleva "Revisar": la decisión se toma en el detalle.
    const fila = page.locator('tbody tr').filter({ hasText: fx.solicitud.razonSocial });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: /revisar/i }).click();

    await page.locator('#btn-panel-aprobar').click();
    await page.locator('#btn-confirmar-aprobar').click();

    // El toast (role=status) es el único que menciona la razón social + "aprobada".
    await expect(
      page.locator('[role="status"]').filter({ hasText: new RegExp(`${fx.solicitud.razonSocial}.*aprobada`, 'i') }),
    ).toBeVisible();
  });
});
