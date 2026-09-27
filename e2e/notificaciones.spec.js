// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

/**
 * Notificaciones del admin del sistema:
 *  - una solicitud de empresa nueva (formulario público) le llega como aviso
 *    y lleva a /admin/solicitudes;
 *  - "Eliminar leídas" pide confirmación y borra solo las ya leídas.
 */

const API = 'http://localhost:5000/api';

async function crearSolicitudEmpresa(request, razonSocial) {
  const suf = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const res = await request.post(`${API}/solicitudes-empresa`, {
    data: {
      razonSocial,
      cuit: suf.slice(-11).padStart(11, '3'),
      rubro: 'Software',
      email: `contacto-${suf}@e2e.test`,
      responsableNombre: 'Responsable',
      responsableApellido: 'E2E',
      responsableEmail: `responsable-${suf}@e2e.test`,
    },
  });
  expect(res.status()).toBe(201);
}

function tarjeta(page, razonSocial) {
  return page.locator('[role="button"][aria-label^="Nueva solicitud de empresa"]').filter({ hasText: razonSocial });
}

test.describe('Notificaciones del admin', () => {
  test('una nueva solicitud de empresa notifica al admin y lleva a Solicitudes', async ({ page, request }) => {
    const razon = `Aviso Nav E2E ${Date.now()}`;
    await crearSolicitudEmpresa(request, razon);

    await login(page, fx.admin.email);
    await page.goto('/notificaciones');
    const card = tarjeta(page, razon);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('aria-label', /\(sin leer\)/);

    await card.click();
    await expect(page).toHaveURL(/\/admin\/solicitudes$/);
  });

  test('Eliminar leídas: confirma y borra solo las leídas', async ({ page, request }) => {
    const leida = `Aviso Leida E2E ${Date.now()}`;
    const pendiente = `Aviso Pendiente E2E ${Date.now()}`;
    await crearSolicitudEmpresa(request, leida);
    await crearSolicitudEmpresa(request, pendiente);

    await login(page, fx.admin.email);
    await page.goto('/notificaciones');
    await expect(tarjeta(page, leida)).toBeVisible();
    await expect(tarjeta(page, pendiente)).toBeVisible();

    // Marcar una como leída.
    await tarjeta(page, leida).getByRole('button', { name: 'Marcar como leída' }).click();
    await expect(tarjeta(page, leida)).not.toHaveAttribute('aria-label', /\(sin leer\)/);

    // En "Leídas" aparece la acción, con confirmación.
    const filtros = page.getByRole('group', { name: 'Filtrar notificaciones' });
    await filtros.getByRole('button', { name: 'Leídas', exact: true }).click();
    await expect(tarjeta(page, leida)).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar leídas' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Eliminar notificaciones leídas');
    await expect(modal).toContainText('Las notificaciones pendientes se conservarán');

    // Cancelar no borra nada.
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(tarjeta(page, leida)).toBeVisible();

    await page.getByRole('button', { name: 'Eliminar leídas' }).click();
    await page.locator('#btn-confirmar-eliminar-leidas').click();
    await expect(page.getByRole('status').filter({ hasText: /Se eliminaron \d+ notificaci/ })).toBeVisible();
    await expect(tarjeta(page, leida)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar leídas' })).toHaveCount(0);

    // La pendiente sigue ahí.
    await filtros.getByRole('button', { name: 'Sin leer' }).click();
    await expect(tarjeta(page, pendiente)).toBeVisible();
  });
});
