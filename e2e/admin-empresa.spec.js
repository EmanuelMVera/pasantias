// @ts-check
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

/**
 * Administrador de EMPRESA (usuario `empresa` con rolInterno admin_empresa).
 * No confundir con el Administrador del Sistema (admin-*.spec.js).
 *
 * Experiencia de supervisión/gobierno de la empresa:
 *  - shell propio (sidebar + topbar) con Resumen, Ofertas, Candidatos, Equipo y
 *    Mi empresa; Chat y Notificaciones en la topbar; Seguridad en el menú de usuario;
 *  - la cuenta se identifica como la EMPRESA (razón social) y la persona como responsable;
 *  - supervisa ofertas y candidatos, pero no edita ofertas ni mueve candidatos.
 *
 * Datos: los del seed E2E (empresa estándar "E2E Talent SA", responsable Carla
 * Cerda, reclutadora Rita Reclu). Nada se hardcodea en la UI.
 */

const RESPONSABLE = `${fx.adminEmpresa.nombre} ${fx.adminEmpresa.apellido}`;
const RECLUTADORA = `${fx.reclutador.nombre} ${fx.reclutador.apellido}`;
const SECCIONES = ['Resumen', 'Ofertas', 'Candidatos', 'Equipo', 'Mi empresa'];

// PNG 1×1 válido (el backend valida los magic bytes del logo).
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const sinScrollHorizontal = async (page) => {
  const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(d).toBeLessThanOrEqual(1);
};

test.describe('Administrador de empresa — shell e identidad', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.adminEmpresa.email);
  });

  test('entra al shell corporativo: sidebar, topbar e identidad de la empresa', async ({ page }) => {
    await expect(page).toHaveURL(/\/empresa$/);
    await expect(page.getByRole('heading', { name: 'Resumen de empresa' })).toBeVisible();

    // Un único nav principal con las 5 secciones de gobierno; nada operativo.
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole('link')).toHaveText(SECCIONES);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Resumen');
    await expect(page.getByRole('link', { name: /nueva oferta/i })).toHaveCount(0);

    // La cuenta representa a la empresa.
    const sidebar = page.locator('#nav-mobile');
    await expect(sidebar).toContainText(fx.empresa.razonSocial);
    await expect(sidebar).toContainText('Administrador de empresa');
    // El nivel de confianza no se muestra en la sidebar (vive en Mi empresa).
    await expect(sidebar).not.toContainText(/empresa estándar|empresa de confianza/i);

    // Topbar: Chat y Notificaciones son acciones globales.
    await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
    await expect(page.locator('button[aria-controls="nav-mobile"]')).toBeHidden();

    // Menú de usuario: empresa + responsable + email + Seguridad.
    const avatarBtn = page.locator('[aria-haspopup="true"]');
    await expect(avatarBtn).toHaveCount(1);
    await expect(avatarBtn).toContainText(fx.empresa.razonSocial);
    await avatarBtn.click();
    const dropdown = avatarBtn.locator('xpath=following-sibling::*[1]');
    await expect(dropdown).toContainText(fx.empresa.razonSocial);
    await expect(dropdown).toContainText(`Responsable: ${RESPONSABLE}`);
    await expect(dropdown).toContainText(fx.adminEmpresa.email);
    await expect(dropdown).toContainText('Administrador de empresa');

    await dropdown.getByRole('link', { name: 'Seguridad de mi cuenta' }).click();
    await expect(page).toHaveURL(/\/empresa\/seguridad$/);
    await expect(page.getByRole('heading', { name: 'Seguridad de mi cuenta' })).toBeVisible();
    await expect(page.getByText(/al menos 8 caracteres/i)).toBeVisible();
    await expect(page.locator('#nuevaPassword')).toHaveAttribute('placeholder', 'Mínimo 8 caracteres');
  });

  test('navegación por la sidebar, chat y notificaciones', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Principal' });
    const destinos = [
      ['Ofertas', /\/empresa\/ofertas$/, /^ofertas$/i],
      ['Candidatos', /\/empresa\/candidatos$/, /^candidatos$/i],
      ['Equipo', /\/empresa\/equipo$/, /^equipo$/i],
      ['Mi empresa', /\/empresa\/mi-empresa$/, /^mi empresa$/i],
    ];
    for (const [link, url, heading] of destinos) {
      await nav.getByRole('link', { name: link, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(nav.locator('a[aria-current="page"]')).toHaveText(link);
    }

    await page.getByRole('link', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('heading', { name: 'Mensajes del equipo' })).toBeVisible();
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Notificaciones' }).click();
    await expect(page).toHaveURL(/\/notificaciones$/);
    await expect(page.getByRole('button', { name: 'Notificaciones' })).toHaveAttribute('aria-current', 'page');
  });

  test('mobile: drawer con hamburguesa, sin scroll horizontal, y cerrar sesión', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/empresa');

    const nav = page.getByRole('navigation', { name: 'Principal' });
    const toggle = page.locator('button[aria-controls="nav-mobile"]');
    await expect(nav).toBeHidden();
    await expect(toggle).toBeVisible();
    await sinScrollHorizontal(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    await toggle.click();
    await nav.getByRole('link', { name: 'Equipo', exact: true }).click();
    await expect(page).toHaveURL(/\/empresa\/equipo$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await sinScrollHorizontal(page);

    // El menú de usuario entra en el viewport y cierra la sesión.
    const avatarBtn = page.locator('[aria-haspopup="true"]');
    await avatarBtn.click();
    const dropdown = avatarBtn.locator('xpath=following-sibling::*[1]');
    const caja = await dropdown.boundingBox();
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(375 + 1);
    await dropdown.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/localhost:5173\/$/);
    await page.goto('/empresa');
    await expect(page).not.toHaveURL(/\/empresa$/);
  });
});

test.describe('Administrador de empresa — supervisión', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.adminEmpresa.email);
  });

  test('Resumen: métricas reales, embudo, top, recientes y atención (sin tabla de ofertas)', async ({ page }) => {
    for (const nombre of ['Estado actual', 'Embudo de selección', 'Ofertas con más postulaciones', 'Ofertas recientes', 'Requieren atención']) {
      await expect(page.getByRole('heading', { name: nombre })).toBeVisible();
    }
    await expect(page.locator('table')).toHaveCount(0);

    // KPIs que salen del backend: 1 reclutadora activa en el seed.
    const kpi = (nombre) => page.getByRole('button', { name: new RegExp(nombre, 'i') });
    await expect(kpi('Reclutadores activos')).toContainText('1');
    for (const nombre of ['Ofertas activas', 'Postulaciones', 'Entrevistas', 'Contrataciones']) {
      await expect(kpi(nombre)).toBeVisible();
    }
    await expect(page.getByText('Tasa de contratación')).toBeVisible();
    await expect(page.getByText(/sobre el total de postulaciones de la empresa/i)).toBeVisible();

    // Top y recientes: la oferta con postulaciones del seed, con su responsable.
    const top = page.getByRole('region', { name: 'Ofertas con más postulaciones' });
    await expect(top).toContainText(fx.ofertaActiva.titulo);
    await expect(top).toContainText(RECLUTADORA);
    const recientes = page.getByRole('region', { name: 'Ofertas recientes' });
    await expect(recientes).toContainText(fx.ofertaPendiente.titulo);
    await expect(recientes).toContainText('Pendiente de revisión');

    // Requieren atención: solo lo accionable, con su destino.
    const atencion = page.getByRole('region', { name: 'Requieren atención' });
    await expect(atencion).toContainText(/pendientes? de moderación/i);
    await atencion.getByRole('link', { name: 'Ver ofertas' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas\?moderacion=pendiente$/);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText(fx.ofertaPendiente.titulo);

    await page.goto('/empresa');
    await page.getByRole('link', { name: 'Ver todas las ofertas →' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas$/);
  });

  test('Ofertas: filtros server-side, responsable, sin "Editar", pausar/reactivar y cerrar con confirmación', async ({ page }) => {
    // Viewport alto: el menú ⋯ se cierra al hacer scroll (por diseño), y con
    // 720px de alto Playwright scrollea para alcanzar el botón de la última fila.
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.goto('/empresa/ofertas');
    await expect(page.getByRole('heading', { level: 1, name: /^ofertas$/i })).toBeVisible();
    for (const col of ['Oferta', 'Responsable', 'Estado', 'Moderación', 'Vacantes / Postulados', 'Publicada', 'Acciones']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }

    const activa = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    const pendiente = page.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo });
    await expect(activa).toContainText(RECLUTADORA);
    await expect(pendiente).toContainText('Sin responsable asignado');

    // El admin de empresa no edita contenido ni crea ofertas.
    await expect(page.getByRole('link', { name: /editar|nueva oferta/i })).toHaveCount(0);
    await activa.getByRole('button', { name: /más acciones/i }).click();
    await expect(page.getByRole('menuitem', { name: /editar/i })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Pausar publicación' })).toBeVisible();
    await page.keyboard.press('Escape');

    // Filtros en el servidor, reflejados en la URL.
    const grupoMod = page.getByRole('group', { name: /filtrar por moderaci[oó]n/i });
    await grupoMod.getByRole('button', { name: 'Pendiente de revisión' }).click();
    await expect(page).toHaveURL(/moderacion=pendiente/);
    await expect(activa).toHaveCount(0);
    await expect(pendiente).toBeVisible();
    await grupoMod.getByRole('button', { name: 'Todas', exact: true }).click();

    await page.getByLabel('Responsable').selectOption({ label: RECLUTADORA });
    await expect(page).toHaveURL(/responsable=\d+/);
    await expect(activa).toBeVisible();
    await expect(pendiente).toHaveCount(0);
    await page.getByLabel('Responsable').selectOption('');

    await page.getByRole('searchbox', { name: 'Buscar ofertas' }).fill('zzz-no-existe');
    await expect(page.getByText(/no hay ofertas con esos criterios/i)).toBeVisible();
    await page.getByRole('button', { name: /limpiar filtros/i }).click();
    await expect(activa).toBeVisible();

    // Pausar y reactivar (sobre la oferta sin responsable: gobierno de la empresa).
    await pendiente.getByRole('button', { name: /más acciones/i }).click();
    await page.getByRole('menuitem', { name: 'Pausar publicación' }).click();
    await expect(page.getByRole('status').filter({ hasText: /oferta pausada/i })).toBeVisible();
    await expect(pendiente.getByText('Pausada', { exact: true })).toBeVisible();

    await pendiente.getByRole('button', { name: /más acciones/i }).click();
    await page.getByRole('menuitem', { name: 'Reactivar publicación' }).click();
    await expect(pendiente.getByText('Activa', { exact: true })).toBeVisible();

    // Cerrar es irreversible: pide confirmación (y cancelar no cambia nada).
    await pendiente.getByRole('button', { name: /más acciones/i }).click();
    await page.getByRole('menuitem', { name: 'Cerrar publicación' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(/no\s+se puede reabrir/i);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(pendiente.getByText('Activa', { exact: true })).toBeVisible();

    // Mobile: cards, sin scroll horizontal.
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 3, name: fx.ofertaActiva.titulo })).toBeVisible();
    await sinScrollHorizontal(page);
  });

  test('Candidatos: responsable, filtros y "Ver proceso" en modo supervisión', async ({ page }) => {
    await page.goto('/empresa/candidatos');
    await expect(page.getByRole('heading', { level: 1, name: /^candidatos$/i })).toBeVisible();
    for (const col of ['Candidato', 'Oferta', 'Responsable', 'Estado', 'Actualizado', 'Acción']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(0);

    const fila = page.locator('tbody tr').filter({ hasText: fx.alumno2.apellido });
    await expect(fila).toContainText(fx.ofertaActiva.titulo);
    await expect(fila).toContainText(RECLUTADORA);

    // Filtro por responsable en el servidor + URL compartible.
    await page.getByLabel('Responsable').selectOption('sin');
    await expect(page).toHaveURL(/responsable=sin/);
    await expect(page.getByText(/no hay candidatos con esos criterios/i)).toBeVisible();
    await page.getByLabel('Responsable').selectOption({ label: RECLUTADORA });
    await expect(page).toHaveURL(/responsable=\d+/);
    await expect(fila).toBeVisible();

    const grupoEstado = page.getByRole('group', { name: /filtrar por estado/i });
    await grupoEstado.getByRole('button', { name: /^Contratados/ }).click();
    await expect(page).toHaveURL(/estado=contratado/);
    await expect(fila).toHaveCount(0);
    await grupoEstado.getByRole('button', { name: /^Todos/ }).click();

    // Detalle del proceso: el admin de empresa observa, no opera.
    await fila.getByRole('link', { name: /ver proceso/i }).click();
    await expect(page).toHaveURL(/\/empresa\/postulantes\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: fx.ofertaActiva.titulo })).toBeVisible();
    await expect(page.getByText(`Responsable: ${RECLUTADORA}`)).toBeVisible();
    await expect(page.getByText(/vista de supervisión/i)).toBeVisible();
    await expect(page.getByText(fx.alumno2.apellido).first()).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(0);            // no puede cambiar estados
    await expect(page.getByRole('button', { name: /contactar/i })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Principal' }).locator('a[aria-current="page"]')).toHaveText('Candidatos');
  });

  test('Equipo: cuenta administradora separada, acciones con confirmación y solicitud (empresa estándar)', async ({ page }) => {
    // Viewport alto: el menú ⋯ se cierra si la página scrollea (por diseño), y
    // Playwright scrollea para alcanzar un botón que quede al borde.
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.goto('/empresa/equipo');
    await expect(page.getByRole('heading', { level: 1, name: /^equipo$/i })).toBeVisible();

    const cuenta = page.getByRole('region', { name: 'Cuenta administradora' });
    await expect(cuenta).toContainText(fx.empresa.razonSocial);
    await expect(cuenta).toContainText('Administrador de empresa');
    await expect(cuenta).toContainText(`Responsable: ${RESPONSABLE}`);
    await expect(cuenta).toContainText(fx.adminEmpresa.email);

    const reclutadores = page.getByRole('region', { name: 'Reclutadores' });
    await expect(reclutadores).toContainText(RECLUTADORA);
    await expect(reclutadores).not.toContainText(RESPONSABLE); // el admin no aparece como un reclutador más

    // Acciones en el menú ⋯, con confirmación.
    await reclutadores.getByRole('button', { name: `Acciones para ${RECLUTADORA}` }).click();
    await expect(page.getByRole('menuitem', { name: 'Enviar recuperación de acceso' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Quitar del equipo' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Suspender cuenta' }).click();
    let modal = page.getByRole('dialog');
    await expect(modal).toContainText(RECLUTADORA);
    await expect(modal).toContainText(/no va a poder iniciar sesión/i);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(reclutadores.getByText('Activo', { exact: true })).toBeVisible();

    // Empresa estándar: se SOLICITA el reclutador.
    const boton = page.locator('#btn-nuevo-miembro');
    await expect(boton).toHaveText('Solicitar reclutador');
    await boton.click();
    modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Solicitar reclutador' })).toBeVisible();
    await expect(modal).toContainText('será revisada por el administrador del instituto');

    const email = `nuevo.reclutador.${Date.now()}@itb.test`;
    await modal.getByLabel('Nombre *').fill('Nuevo');
    await modal.getByLabel('Apellido *').fill('Reclutador');
    await modal.getByLabel('Email *').fill(email);
    await modal.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /solicitud enviada/i })).toBeVisible();

    // Queda en la pestaña Solicitudes, como pendiente (badge en la pestaña).
    const tabSolicitudes = page.getByRole('tab', { name: /solicitudes/i });
    await expect(tabSolicitudes).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=solicitudes/);
    const filaSol = page.locator('tbody tr').filter({ hasText: email });
    await expect(filaSol).toContainText('Nuevo Reclutador');
    await expect(filaSol).toContainText('Pendiente');
    await expect(tabSolicitudes).toContainText(/\d/);
    // Sin alerta amarilla duplicada: el aviso es el badge.
    await expect(page.getByText(/pendientes? de aprobación por el administrador/i)).toHaveCount(0);
  });

  test('Equipo: una empresa de confianza AGREGA reclutadores (wording según nivelConfianza)', async ({ page }) => {
    // Solo presentación: se simula el nivel de confianza que devuelve el backend.
    await page.route('**/api/empresas/mi-empresa', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      const json = await res.json();
      json.data.nivelConfianza = 'confiable';
      return route.fulfill({ response: res, json });
    });
    await page.goto('/empresa/equipo');

    const boton = page.locator('#btn-nuevo-miembro');
    await expect(boton).toHaveText('Agregar reclutador');
    await boton.click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Agregar reclutador' })).toBeVisible();
    await expect(modal).toContainText('La cuenta se creará inmediatamente');
    await expect(modal.getByRole('button', { name: 'Agregar reclutador' })).toBeVisible();
    await modal.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('Mi empresa: editar datos, cambiar logo y ver el perfil público', async ({ page }) => {
    await page.goto('/empresa/mi-empresa');
    await expect(page.getByRole('heading', { level: 1, name: /^mi empresa$/i })).toBeVisible();
    for (const seccion of ['Datos institucionales', 'Perfil público', 'Contacto y ubicación']) {
      await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
    }
    await expect(page.getByText(`Responsable: ${RESPONSABLE}`)).toBeVisible();
    await expect(page.getByText(/contactate con el administrador del sistema/i)).toBeVisible();

    // Editar un dato de contacto.
    const ciudad = page.locator('input[name="ciudad"]');
    await expect(ciudad).toBeEnabled();
    await ciudad.fill('Quilmes');
    await page.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /datos de empresa actualizados/i })).toBeVisible();

    // Logo: sin input nativo a la vista; vista previa antes de guardar.
    await expect(page.getByText('Cambiar logo')).toBeVisible();
    await expect(page.getByText('PNG, JPG o WEBP · Máximo 2 MB')).toBeVisible();
    await page.locator('#logo-empresa').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
    await expect(page.getByRole('alert').filter({ hasText: /solo se aceptan imágenes/i })).toBeVisible();

    await page.locator('#logo-empresa').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByText('Vista previa')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar logo' }).click();
    await expect(page.getByRole('status').filter({ hasText: /logo actualizado/i })).toBeVisible();
    // El logo nuevo llega también a la identidad de la sidebar.
    await expect(page.locator('#nav-mobile img')).toBeVisible();

    // Perfil público: la misma página que ven alumnos y egresados.
    await page.getByRole('link', { name: /ver perfil público/i }).click();
    await expect(page).toHaveURL(/\/empresa\/\d+$/);
    await expect(page.getByRole('heading', { name: fx.empresa.razonSocial })).toBeVisible();
    // Solo ofertas visibles para alumnos: la pendiente de moderación no aparece.
    await expect(page.getByText(fx.ofertaActiva.titulo)).toBeVisible();
    await expect(page.getByText(fx.ofertaPendiente.titulo)).toHaveCount(0);
  });
});

test.describe('Administrador de empresa — cierre: perfiles del chat y responsable de oferta', () => {
  test.beforeEach(async ({ page }) => {
    // Viewport alto: el menú ⋯ se cierra al hacer scroll (por diseño).
    await page.setViewportSize({ width: 1366, height: 1000 });
    await login(page, fx.adminEmpresa.email);
  });

  test('Chat: "Ver perfil" de un reclutador abre SU ficha (no la empresa) y desde ahí se llega a la empresa', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('button', { name: 'Iniciar nueva conversación' }).click();
    const buscador = page.getByRole('dialog');
    await buscador.getByRole('textbox').fill(fx.reclutador.nombre);
    await buscador.getByRole('button').filter({ hasText: RECLUTADORA }).click();

    // Identidad: el reclutador es una persona de la empresa.
    const cabecera = page.getByRole('button', { name: 'Ver perfil', exact: true }).locator('..');
    await expect(cabecera).toContainText(RECLUTADORA);
    await expect(cabecera).toContainText(`Reclutador · ${fx.empresa.razonSocial}`);
    await expect(page.getByRole('button', { name: 'Ver empresa' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
    await expect(page).toHaveURL(/\/reclutador\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: RECLUTADORA })).toBeVisible();
    const ficha = page.getByRole('region', { name: RECLUTADORA });
    await expect(ficha.getByText('Reclutador', { exact: true })).toBeVisible();
    await expect(ficha).toContainText(fx.empresa.razonSocial);
    await expect(ficha.getByRole('link', { name: fx.reclutador.email })).toBeVisible();
    await sinScrollHorizontal(page);

    // Desde la ficha se llega al perfil público de la empresa (la misma página de siempre).
    await ficha.getByRole('link', { name: 'Ver empresa' }).click();
    await expect(page).toHaveURL(/\/empresa\/\d+$/);
    await expect(page.getByRole('heading', { name: fx.empresa.razonSocial })).toBeVisible();
  });

  test('Perfil de reclutador: responsive en móvil y perfil inexistente', async ({ page }) => {
    // Un id que no es de un reclutador (o sin relación) responde "no disponible".
    await page.goto('/reclutador/999999');
    await expect(page.getByText('Este perfil no está disponible.')).toBeVisible();

    const equipo = await (await page.request.get('http://localhost:5000/api/empresas/equipo')).json();
    const reclutadora = equipo.data.find((m) => m.rolInterno === 'reclutador');
    // La cuenta administradora no tiene ficha de reclutador.
    const admin = equipo.data.find((m) => m.rolInterno === 'admin_empresa');
    await page.goto(`/reclutador/${admin.usuario.id}`);
    await expect(page.getByText('Este perfil no está disponible.')).toBeVisible();

    for (const ancho of [320, 375, 768]) {
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.goto(`/reclutador/${reclutadora.usuario.id}`);
      await expect(page.getByRole('heading', { level: 1, name: RECLUTADORA })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ver empresa' })).toBeVisible();
      await sinScrollHorizontal(page);
    }
  });

  test('Sidebar sin etiqueta de nivel de confianza; Mi empresa lo muestra una sola vez y lo explica', async ({ page }) => {
    await expect(page.locator('#nav-mobile')).not.toContainText(/empresa estándar|empresa de confianza/i);

    await page.goto('/empresa/mi-empresa');
    const institucional = page.getByRole('region', { name: 'Datos institucionales' });
    await expect(institucional).toContainText('Nivel de confianza');
    await expect(institucional.getByText('Estándar', { exact: true })).toBeVisible();
    await expect(institucional).toContainText('pueden requerir revisión institucional');
    // No se repite en la cabecera ni en la sidebar.
    await expect(page.getByText('Estándar', { exact: true })).toHaveCount(1);
    await expect(page.getByText(/empresa estándar/i)).toHaveCount(0);
    await expect(page.locator('#nav-mobile')).not.toContainText(/estándar/i);
  });

  test('Ofertas: asignar responsable a una oferta sin responsable', async ({ page }) => {
    await page.goto('/empresa/ofertas');
    const pendiente = page.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo });
    await expect(pendiente).toContainText('Sin responsable asignado');

    await pendiente.getByRole('button', { name: /más acciones/i }).click();
    await expect(page.getByRole('menuitem', { name: 'Cambiar responsable' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Asignar responsable' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Asignar responsable' })).toBeVisible();
    await expect(modal).toContainText(fx.ofertaPendiente.titulo);
    await expect(modal).toContainText('Sin responsable asignado');
    await expect(modal).toContainText(`Solo se muestran reclutadores activos de ${fx.empresa.razonSocial}`);

    // Solo reclutadores activos: la cuenta administradora no es una opción.
    const select = modal.getByLabel('Responsable', { exact: true });
    await expect(select.locator('option')).toHaveText(['Elegí un reclutador…', RECLUTADORA]);
    const confirmar = modal.getByRole('button', { name: 'Asignar responsable' });
    await expect(confirmar).toBeDisabled();
    await select.selectOption({ label: RECLUTADORA });
    await confirmar.click();

    await expect(page.getByRole('status').filter({ hasText: /quedó como responsable/i })).toBeVisible();
    await expect(pendiente).toContainText(RECLUTADORA);
    await expect(pendiente).not.toContainText('Sin responsable asignado');

    // Ya no quedan ofertas sin responsable: el filtro y el resumen lo reflejan.
    await page.getByLabel('Responsable', { exact: true }).selectOption('sin');
    await expect(page.getByText(/no hay ofertas con esos criterios/i)).toBeVisible();
    await page.goto('/empresa');
    const recientes = page.getByRole('region', { name: 'Ofertas recientes' });
    await expect(recientes).toContainText(fx.ofertaPendiente.titulo);
    await expect(recientes).not.toContainText('Sin responsable asignado');
  });

  test('Ofertas: cambiar responsable pide confirmación explícita con el traspaso', async ({ page }) => {
    // El seed tiene un solo reclutador: se simula un segundo en el equipo y la
    // respuesta del cambio (las reglas reales se cubren en los tests de backend).
    await page.route('**/api/empresas/equipo', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.data.push({
        id: 999001, rolInterno: 'reclutador', activo: true,
        usuario: { id: 999001, nombre: 'Lucía', apellido: 'Ferrari', email: 'lucia@e2e.test' },
      });
      return route.fulfill({ response: res, json });
    });
    let cuerpo = null;
    await page.route('**/api/empresas/ofertas/*/responsable', async (route) => {
      cuerpo = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, message: 'Responsable de la oferta actualizado.', data: {} } });
    });

    await page.goto('/empresa/ofertas');
    const activa = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    await expect(activa).toContainText(RECLUTADORA);
    await activa.getByRole('button', { name: /más acciones/i }).click();
    await expect(page.getByRole('menuitem', { name: 'Asignar responsable' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Cambiar responsable' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Cambiar responsable' })).toBeVisible();
    await expect(modal).toContainText('Responsable actual');
    await expect(modal).toContainText(RECLUTADORA);
    // El responsable actual no se ofrece como destino.
    const select = modal.getByLabel('Nuevo responsable');
    await expect(select.locator('option')).toHaveText(['Elegí un reclutador…', 'Lucía Ferrari']);
    await select.selectOption({ label: 'Lucía Ferrari' });
    await modal.getByRole('button', { name: 'Cambiar responsable' }).click();

    await expect(modal).toContainText('¿Cambiar el responsable de esta oferta?');
    await expect(modal).toContainText(`pasará de ${RECLUTADORA} a Lucía Ferrari`);
    await expect(modal).toContainText('Los candidatos y el historial del proceso se conservarán');
    expect(cuerpo).toBeNull(); // todavía no se envió nada

    // "Volver" no cambia nada; confirmar envía el cambio.
    await modal.getByRole('button', { name: 'Volver' }).click();
    await expect(modal.getByLabel('Nuevo responsable')).toHaveValue('999001');
    await modal.getByRole('button', { name: 'Cambiar responsable' }).click();
    await modal.getByRole('button', { name: 'Sí, cambiar responsable' }).click();
    await expect(page.getByRole('status').filter({ hasText: /nuevo responsable/i })).toBeVisible();
    expect(cuerpo).toEqual({ responsableId: 999001 });
  });
});
