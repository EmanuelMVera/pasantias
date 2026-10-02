// @ts-check
const { test, expect, request: apiRequest } = require('@playwright/test');
const { login, fx } = require('./helpers');

/**
 * Reclutador: experiencia OPERATIVA (crea ofertas, gestiona sus candidatos).
 * No recibe el shell corporativo del administrador de empresa ni sus acciones
 * de gobierno (equipo, datos de la empresa).
 */

const API = 'http://localhost:5000/api';

test('reclutador: login → crear oferta → candidatos → sin acciones de admin_empresa', async ({ page }) => {
  await test.step('5. login: panel operativo con navbar (no el shell de empresa)', async () => {
    await login(page, fx.reclutador.email);
    await expect(page).toHaveURL(/\/empresa$/);
    await expect(page.getByRole('heading', { name: 'Panel de Reclutamiento' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Resumen de empresa' })).toHaveCount(0);

    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: '+ Nueva Oferta' })).toBeVisible();
    // Las secciones de gobierno de la sidebar corporativa no existen para él.
    await expect(nav.getByRole('link', { name: 'Mi empresa', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Resumen', exact: true })).toHaveCount(0);
    // Se identifica como persona, no como la empresa.
    await expect(page.locator('[aria-haspopup="true"]')).toContainText(fx.reclutador.nombre);
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

  await test.step('7. ver candidatos y gestionar los de su oferta', async () => {
    await page.goto('/empresa/candidatos');
    await expect(page.getByRole('heading', { name: /^candidatos$/i })).toBeVisible();
    // hay al menos un candidato (postulación pre-sembrada en "Pasantía Backend E2E")
    await expect(page.getByText(/no hay candidatos/i)).toHaveCount(0);
    const fila = page.locator('tbody tr').filter({ hasText: fx.alumno2.apellido });
    await expect(fila).toBeVisible();

    // Es el responsable de esa oferta: en el proceso SÍ puede cambiar estados.
    await fila.getByRole('link', { name: /ver proceso/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: fx.ofertaActiva.titulo })).toBeVisible();
    await expect(page.getByText(/vista de supervisión/i)).toHaveCount(0);
    await expect(page.getByRole('combobox').first()).toBeEnabled();
  });

  await test.step('8. sin acciones de admin_empresa', async () => {
    await page.goto('/empresa/equipo');
    await expect(page.getByRole('heading', { level: 1, name: /^equipo$/i })).toBeVisible();
    await expect(page.locator('#btn-nuevo-miembro')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /(solicitar|agregar) reclutador/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^acciones para/i })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0); // sin pestaña de Solicitudes

    await page.goto('/empresa/mi-empresa');
    await expect(page.getByRole('heading', { level: 1, name: /^mi empresa$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /guardar cambios/i })).toHaveCount(0);
    await expect(page.locator('input[name="ciudad"]')).toBeDisabled();
    await expect(page.getByText('Cambiar logo')).toHaveCount(0);
  });
});

test('una nueva postulación le llega al reclutador responsable, no al administrador de empresa', async ({ page }) => {
  // El alumno se postula por API a la oferta cuyo responsable es el reclutador.
  // (Si otro spec ya lo postuló, el backend responde 400 "duplicada": la
  // notificación ya existe de esa vez.)
  const alumno = await apiRequest.newContext();
  const loginAlumno = await alumno.post(`${API}/auth/login`, { data: { email: fx.alumno.email, password: fx.password } });
  expect(loginAlumno.ok()).toBe(true);
  const ofertas = await (await alumno.get(`${API}/ofertas`)).json();
  const oferta = ofertas.data.find((o) => o.titulo === fx.ofertaActiva.titulo);
  expect(oferta).toBeTruthy();
  const postular = await alumno.post(`${API}/postulaciones`, { data: { ofertaId: oferta.id } });
  expect([201, 400]).toContain(postular.status());
  await alumno.dispose();

  // Reclutador: ve el aviso y lo lleva al proceso de esa oferta.
  await login(page, fx.reclutador.email);
  await page.goto('/notificaciones');
  const aviso = page.locator('[role="button"][aria-label^="Nueva postulación recibida"]').first();
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText(fx.ofertaActiva.titulo);
  await aviso.click();
  await expect(page).toHaveURL(new RegExp(`/empresa/postulantes/${oferta.id}$`));

  // Administrador de empresa: no recibe el ruido operativo de cada postulación.
  const adminEmpresa = await apiRequest.newContext();
  await adminEmpresa.post(`${API}/auth/login`, { data: { email: fx.adminEmpresa.email, password: fx.password } });
  const notifs = await (await adminEmpresa.get(`${API}/notificaciones?limit=50`)).json();
  expect(notifs.data.filter((n) => n.tipo === 'postulacion')).toEqual([]);
  await adminEmpresa.dispose();
});

test('reclutador: no puede asignar ni cambiar el responsable de una oferta', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 }); // el menú ⋯ se cierra al hacer scroll
  await login(page, fx.reclutador.email);
  await page.goto('/empresa/ofertas');
  const fila = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
  await fila.getByRole('button', { name: /más acciones/i }).click();
  await expect(page.getByRole('menuitem', { name: 'Editar contenido' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /responsable/i })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Y el backend lo rechaza aunque se intente por API.
  const equipo = await (await page.request.get(`${API}/empresas/equipo`)).json();
  const yo = equipo.data.find((m) => m.rolInterno === 'reclutador');
  const ofertas = await (await page.request.get(`${API}/empresas/mis-ofertas`)).json();
  const res = await page.request.patch(`${API}/empresas/ofertas/${ofertas.data[0].id}/responsable`, {
    data: { responsableId: yo.usuario.id },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe('ROL_INSUFICIENTE');
});

test('chat del reclutador: "Ver empresa" para la cuenta administradora y "Ver perfil" para un candidato', async ({ page }) => {
  await login(page, fx.reclutador.email);

  // La cuenta administradora representa a la entidad → perfil de la empresa.
  await page.goto('/chat');
  await page.getByRole('button', { name: 'Iniciar nueva conversación' }).click();
  let buscador = page.getByRole('dialog');
  await buscador.getByRole('textbox').fill(fx.adminEmpresa.nombre);
  await buscador.getByRole('button').filter({ hasText: fx.empresa.razonSocial }).click();
  await expect(page.getByRole('button', { name: 'Ver perfil', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver empresa' }).click();
  await expect(page).toHaveURL(/\/empresa\/\d+$/);
  await expect(page.getByRole('heading', { name: fx.empresa.razonSocial })).toBeVisible();

  // Candidato: el chat se habilita cuando su postulación avanza (regla existente).
  const candidatos = await (await page.request.get(`${API}/empresas/candidatos`)).json();
  const postulacion = candidatos.data.find((p) => p.usuario.apellido === fx.alumno2.apellido);
  const avance = await page.request.patch(`${API}/postulaciones/${postulacion.id}/estado`, {
    data: { estado: 'preseleccionado' },
  });
  expect(avance.ok()).toBe(true);

  await page.goto('/chat');
  await page.getByRole('button', { name: 'Iniciar nueva conversación' }).click();
  buscador = page.getByRole('dialog');
  await buscador.getByRole('textbox').fill(fx.alumno2.nombre);
  await buscador.getByRole('button').filter({ hasText: fx.alumno2.apellido }).click();
  await expect(page.getByRole('button', { name: 'Ver empresa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/\d+$/);
});
