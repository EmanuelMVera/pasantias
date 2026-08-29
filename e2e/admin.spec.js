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

    // La oferta aparece en dos tablas (Pendientes / Historial). Acotamos a la
    // sección "Pendientes de revisión", cuyo botón es "✅ Aprobar".
    const seccionPendientes = page.locator('section').filter({
      has: page.getByRole('heading', { name: /pendientes de revisi[oó]n/i }),
    });
    const fila = seccionPendientes.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: /aprobar/i }).click();

    await expect(page.getByText(/oferta aprobada correctamente/i)).toBeVisible();
    // ya no está en "Pendientes de revisión"
    await expect(
      seccionPendientes.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo }),
    ).toHaveCount(0);
  });

  await test.step('13. gestionar (aprobar) una solicitud de empresa', async () => {
    await page.goto('/admin/solicitudes');
    await expect(page.getByRole('heading', { name: /solicitudes de empresa/i })).toBeVisible();

    const fila = page.locator('tr').filter({ hasText: fx.solicitud.razonSocial });
    await expect(fila).toBeVisible();
    await fila.locator('[id^="btn-aprobar-"]').click();
    await fila.getByRole('button', { name: /s[ií], aprobar/i }).click();

    await expect(page.getByText(new RegExp(`${fx.solicitud.razonSocial}.*aprobada`, 'i'))).toBeVisible();
  });
});
