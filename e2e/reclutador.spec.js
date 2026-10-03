// @ts-check
const { test, expect, request: apiRequest } = require('@playwright/test');
const { login, fx } = require('./helpers');

/**
 * Reclutador: workspace OPERATIVO personal.
 *
 * Trabaja solo con las ofertas a su cargo y sus candidatos (el backend impone
 * ese alcance). Navegación horizontal propia (sin sidebar), identidad de
 * persona, y nada de gobierno de la empresa.
 *
 * Datos del seed E2E: la reclutadora (Rita Reclu) es responsable de
 * "Pasantía Backend E2E" (con Beto Becario en revisión). "Pasantía Data E2E"
 * (pendiente de moderación) e "Pasantía Soporte E2E (histórica)" (cerrada) no
 * tienen responsable: no son de su workspace.
 */

const API = 'http://localhost:5000/api';
const RECLUTADORA = `${fx.reclutador.nombre} ${fx.reclutador.apellido}`;
const CANDIDATO = `${fx.alumno2.nombre} ${fx.alumno2.apellido}`;

/** Contexto de API logueado (sesión por cookie) para preparar o verificar datos. */
async function apiComo(email) {
  const ctx = await apiRequest.newContext();
  const res = await ctx.post(`${API}/auth/login`, { data: { email, password: fx.password } });
  expect(res.ok()).toBe(true);
  return ctx;
}

test.describe('Reclutador — workspace operativo', () => {
  test.beforeEach(async ({ page }) => {
    // Viewport alto: el menú ⋯ se cierra si la página scrollea (por diseño).
    await page.setViewportSize({ width: 1366, height: 1000 });
    await login(page, fx.reclutador.email);
  });

  test('navegación horizontal propia, identidad de persona e Inicio personal', async ({ page }) => {
    await expect(page).toHaveURL(/\/empresa$/);

    // Navegación: solo el trabajo diario, sin sidebar ni secciones de gobierno.
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole('link')).toHaveText(['Inicio', 'Mis ofertas', 'Candidatos']);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Inicio');
    await expect(page.getByRole('link', { name: 'Nueva oferta' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
    for (const secundaria of ['Equipo', 'Mi empresa', 'Seguridad', 'Ver empresa']) {
      await expect(nav.getByRole('link', { name: secundaria })).toHaveCount(0);
    }

    // Se identifica como persona, con la empresa como contexto.
    const usuario = page.locator('[aria-haspopup="true"]');
    await expect(usuario).toContainText(RECLUTADORA);

    // Inicio personal: KPIs propios, sin métricas corporativas ni embudo.
    await expect(page.getByRole('heading', { level: 1, name: 'Mi espacio de reclutamiento' })).toBeVisible();
    await expect(page.getByText(`Gestioná tus ofertas y candidatos de ${fx.empresa.razonSocial}.`)).toBeVisible();
    const kpi = (nombre) => page.getByRole('button', { name: new RegExp(`^${nombre}`, 'i') });
    await expect(kpi('Ofertas activas')).toContainText('1');
    await expect(kpi('En revisión')).toContainText('1');
    await expect(kpi('Entrevistas')).toContainText('0');
    await expect(kpi('Contratados')).toContainText('0');
    await expect(page.getByText(/reclutadores activos|tasa de contratación|embudo/i)).toHaveCount(0);
    // Sin los botones redundantes del panel viejo.
    await expect(page.getByRole('main').getByRole('link', { name: /ver equipo|seguridad|ver empresa/i })).toHaveCount(0);

    // Procesos activos: solo los suyos.
    const procesos = page.getByRole('region', { name: 'Mis procesos activos' });
    await expect(procesos).toContainText(fx.ofertaActiva.titulo);
    await expect(procesos).not.toContainText(fx.ofertaPendiente.titulo);
    await expect(procesos).not.toContainText(fx.ofertaHistorica.titulo);

    // Para atender: un pendiente real, con su acción directa.
    const atender = page.getByRole('region', { name: 'Para atender' });
    await expect(atender).toContainText('1 candidato espera revisión');
    await expect(atender).toContainText(fx.ofertaActiva.titulo);
    await atender.getByRole('link', { name: /revisar candidatos/i }).click();
    await expect(page).toHaveURL(/\/empresa\/postulantes\/\d+\?estado=en_revision$/);
    await expect(page.getByRole('heading', { level: 1, name: fx.ofertaActiva.titulo })).toBeVisible();
  });

  test('Mis ofertas: solo las suyas, sin responsable, con acciones en el menú', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Mis ofertas' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Mis ofertas' })).toBeVisible();
    await expect(page.getByText('Gestioná las publicaciones que tenés asignadas.')).toBeVisible();

    for (const col of ['Oferta', 'Estado', 'Moderación', 'Candidatos', 'Vacantes', 'Cierre', 'Acciones']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('columnheader', { name: 'Responsable' })).toHaveCount(0);
    await expect(page.getByLabel('Responsable')).toHaveCount(0);

    // Ninguna oferta ajena ni sin responsable aparece en su workspace.
    await expect(page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo })).toHaveCount(1);
    await expect(page.locator('tbody tr').filter({ hasText: fx.ofertaPendiente.titulo })).toHaveCount(0);
    await expect(page.locator('tbody tr').filter({ hasText: fx.ofertaHistorica.titulo })).toHaveCount(0);

    // Filtros dentro de su alcance.
    await page.getByRole('group', { name: /filtrar por moderación/i }).getByRole('button', { name: 'Publicación automática' }).click();
    await expect(page.getByText(/no tenés ofertas con esos criterios/i)).toBeVisible();
    await page.getByRole('button', { name: /limpiar filtros/i }).click();

    // Acción principal visible + menú con solo lo posible.
    const fila = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    await expect(fila.getByRole('link', { name: /gestionar candidatos/i })).toBeVisible();
    await fila.getByRole('button', { name: /más acciones/i }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Editar oferta', 'Pausar oferta', 'Cerrar oferta']);
    await expect(page.getByRole('menuitem', { name: /responsable/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('crear una oferta y editar la propia', async ({ page }) => {
    await page.getByRole('link', { name: 'Nueva oferta' }).first().click();
    await expect(page).toHaveURL(/\/empresa\/nueva-oferta$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Nueva oferta' })).toBeVisible();
    for (const seccion of ['Información del puesto', 'Condiciones', 'Perfil buscado', 'Publicación']) {
      await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
    }
    // No se elige responsable desde el formulario.
    await expect(page.getByLabel(/responsable/i)).toHaveCount(0);

    await page.locator('input[name="titulo"]').fill('Pasantía QA E2E');
    await page.locator('textarea[name="descripcion"]').fill('Oferta creada por el test E2E del reclutador.');
    await page.getByRole('button', { name: 'Publicar oferta' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas$/);

    // Empresa estándar: queda pendiente de revisión institucional.
    const nueva = page.locator('tbody tr').filter({ hasText: 'Pasantía QA E2E' });
    await expect(nueva).toContainText('Pendiente de revisión');

    // Editar la propia (aunque todavía no sea visible para los alumnos).
    await nueva.getByRole('button', { name: /más acciones/i }).click();
    await page.getByRole('menuitem', { name: 'Editar oferta' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas\/\d+\/editar$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Editar oferta' })).toBeVisible();
    await page.locator('input[name="titulo"]').fill('Pasantía QA E2E (editada)');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas$/);
    await expect(page.locator('tbody tr').filter({ hasText: 'Pasantía QA E2E (editada)' })).toHaveCount(1);
  });

  test('Candidatos: solo los suyos, buscador y sin filtro de responsable', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Candidatos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /^candidatos$/i })).toBeVisible();
    await expect(page.getByText('Personas postuladas a tus ofertas.')).toBeVisible();
    await expect(page.locator('#filtro-responsable')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Responsable' })).toHaveCount(0);
    await expect(page.locator('#filtro-oferta option').first()).toHaveText('Todas mis ofertas');

    const fila = page.locator('tbody tr').filter({ hasText: fx.alumno2.apellido });
    await expect(fila).toContainText(fx.ofertaActiva.titulo);

    // Búsqueda server-side.
    await page.getByLabel('Buscar candidato').fill('zzz-nadie');
    await expect(page.getByText(/no hay candidatos con esos criterios/i)).toBeVisible();
    await page.getByLabel('Buscar candidato').fill(fx.alumno2.nombre);
    await expect(page).toHaveURL(/q=/);
    await expect(fila).toBeVisible();

    await fila.getByRole('link', { name: /ver proceso/i }).click();
    await expect(page).toHaveURL(/\/empresa\/postulantes\/\d+$/);
  });

  test('proceso: cambiar estado, nota interna, historial y mensaje habilitado', async ({ page }) => {
    await page.goto('/empresa/ofertas');
    await page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo }).getByRole('link', { name: /gestionar candidatos/i }).click();

    await expect(page.getByRole('heading', { level: 1, name: fx.ofertaActiva.titulo })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar oferta' })).toBeVisible();
    await expect(page.getByText(/vista de supervisión/i)).toHaveCount(0);

    const candidato = page.getByRole('listitem').filter({ hasText: CANDIDATO });
    await expect(candidato).toContainText('En revisión');
    // En revisión el chat todavía no está habilitado.
    await expect(candidato.getByRole('link', { name: /enviar mensaje/i })).toHaveCount(0);

    // Solo las transiciones permitidas.
    await candidato.getByRole('button', { name: `Cambiar estado de ${CANDIDATO}` }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Preseleccionar', 'No seleccionar']);
    await page.getByRole('menuitem', { name: 'Preseleccionar' }).click();
    await expect(candidato).toContainText('Preseleccionado');

    // Nota interna.
    await candidato.getByRole('button', { name: `Más acciones para ${CANDIDATO}` }).click();
    await page.getByRole('menuitem', { name: 'Agregar nota interna' }).click();
    const modalNota = page.getByRole('dialog');
    await expect(modalNota).toContainText('El candidato no la ve');
    await modalNota.getByLabel('Nota').fill('Buen perfil backend. Revisar disponibilidad horaria.');
    await modalNota.getByRole('button', { name: 'Guardar nota' }).click();
    await expect(candidato).toContainText('Nota interna');
    await expect(candidato).toContainText('Buen perfil backend. Revisar disponibilidad horaria.');

    // Historial real del proceso.
    await candidato.getByRole('button', { name: `Más acciones para ${CANDIDATO}` }).click();
    await page.getByRole('menuitem', { name: 'Ver historial' }).click();
    const historial = page.getByRole('dialog');
    await expect(historial.getByRole('heading', { name: 'Historial del proceso' })).toBeVisible();
    await expect(historial.getByRole('listitem')).toHaveCount(2);
    await expect(historial.getByRole('listitem').first()).toContainText('Postulación recibida');
    await expect(historial.getByRole('listitem').last()).toContainText('Preseleccionado');
    await expect(historial.getByRole('listitem').last()).toContainText(RECLUTADORA);
    await historial.getByRole('button', { name: 'Cerrar' }).click();

    // Preseleccionado habilita el chat con el candidato.
    await candidato.getByRole('link', { name: `Enviar mensaje a ${CANDIDATO}` }).click();
    await expect(page).toHaveURL(/\/chat\/\d+$/);

    // El candidato no ve la nota interna.
    const alumno = await apiComo(fx.alumno2.email);
    const mias = await (await alumno.get(`${API}/postulaciones/mis`)).json();
    expect(JSON.stringify(mias)).not.toContain('Revisar disponibilidad horaria');
    await alumno.dispose();
  });

  test('menú de usuario: ver empresa (perfil público), equipo de solo lectura y seguridad', async ({ page }) => {
    const abrirMenu = async () => page.locator('[aria-haspopup="true"]').click();

    await abrirMenu();
    const menu = page.locator('[aria-haspopup="true"]').locator('xpath=following-sibling::*[1]');
    await expect(menu).toContainText(RECLUTADORA);
    await expect(menu).toContainText(fx.reclutador.email);
    await expect(menu).toContainText(fx.empresa.razonSocial);
    await expect(menu).toContainText('Reclutador');

    await menu.getByRole('link', { name: 'Ver empresa' }).click();
    await expect(page).toHaveURL(/\/empresa\/\d+$/);
    await expect(page.getByRole('heading', { name: fx.empresa.razonSocial })).toBeVisible();

    await abrirMenu();
    await page.getByRole('link', { name: 'Ver equipo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `Equipo de ${fx.empresa.razonSocial}` })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cuenta administradora' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Reclutadores' })).toContainText(RECLUTADORA);
    await expect(page.locator('#btn-nuevo-miembro')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^acciones para/i })).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByText(/reclutadores activos|suspendidos|solicitudes pendientes/i)).toHaveCount(0);

    // Mi empresa no es su pantalla: va al perfil público.
    await page.goto('/empresa/mi-empresa');
    await expect(page).toHaveURL(/\/empresa\/\d+$/);

    await abrirMenu();
    await page.getByRole('link', { name: 'Seguridad de mi cuenta' }).click();
    await expect(page).toHaveURL(/\/empresa\/seguridad$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Seguridad de mi cuenta' })).toBeVisible();
  });

  test('sin gobierno de la empresa: no asigna responsables ni accede a ofertas sin responsable', async ({ page }) => {
    // Oferta histórica sin responsable: la ve el administrador de empresa, no el reclutador.
    const admin = await apiComo(fx.adminEmpresa.email);
    const sin = await (await admin.get(`${API}/empresas/mis-ofertas?responsable=sin&limit=100`)).json();
    const historica = sin.data.find((o) => o.titulo === fx.ofertaHistorica.titulo);
    expect(historica).toBeTruthy();
    await admin.dispose();

    await page.goto(`/empresa/postulantes/${historica.id}`);
    await expect(page.getByText('No podés gestionar este proceso.')).toBeVisible();
    await expect(page.getByText(/no tiene un responsable asignado/i)).toBeVisible();

    await page.goto(`/empresa/ofertas/${historica.id}/editar`);
    await expect(page.getByText('No podés editar esta oferta.')).toBeVisible();
    await expect(page.locator('input[name="titulo"]')).toHaveCount(0);

    // Y el backend rechaza asignar responsables o editarla aunque se intente por API.
    const yo = await apiComo(fx.reclutador.email);
    const equipo = await (await yo.get(`${API}/empresas/equipo`)).json();
    const miId = equipo.data.find((m) => m.rolInterno === 'reclutador').usuario.id;
    const asignar = await yo.patch(`${API}/empresas/ofertas/${historica.id}/responsable`, { data: { responsableId: miId } });
    expect(asignar.status()).toBe(403);
    expect((await asignar.json()).code).toBe('ROL_INSUFICIENTE');
    const editar = await yo.put(`${API}/ofertas/${historica.id}`, { data: { titulo: 'x', descripcion: 'x', tipoPuesto: 'pasante' } });
    expect(editar.status()).toBe(403);
    await yo.dispose();
  });

  test('mobile: hamburguesa con la navegación del workspace, sin scroll horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto('/empresa');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav).toHaveCount(0); // los links viven en el panel

    const toggle = page.locator('[aria-controls="nav-mobile"]');
    const box = await toggle.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    const panel = page.locator('#nav-mobile');
    await expect(panel.getByRole('link')).toHaveText(['Inicio', 'Mis ofertas', 'Candidatos', 'Nueva oferta']);
    await panel.getByRole('link', { name: 'Mis ofertas' }).click();
    await expect(page).toHaveURL(/\/empresa\/ofertas$/);
    await expect(panel).toHaveCount(0);

    for (const ruta of ['/empresa', '/empresa/ofertas', '/empresa/candidatos']) {
      await page.goto(ruta);
      const d = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

test('una nueva postulación le llega al reclutador responsable, no al administrador de empresa', async ({ page }) => {
  // El alumno se postula por API a la oferta cuyo responsable es el reclutador.
  // (Si otro spec ya lo postuló, el backend responde 400 "duplicada": la
  // notificación ya existe de esa vez.)
  const alumno = await apiComo(fx.alumno.email);
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
  const adminEmpresa = await apiComo(fx.adminEmpresa.email);
  const notifs = await (await adminEmpresa.get(`${API}/notificaciones?limit=50`)).json();
  expect(notifs.data.filter((n) => n.tipo === 'postulacion')).toEqual([]);
  await adminEmpresa.dispose();
});

test('chat del reclutador: "Ver empresa" para la cuenta administradora y "Ver perfil" para un candidato habilitado', async ({ page }) => {
  await login(page, fx.reclutador.email);

  // La cuenta administradora representa a la entidad → perfil de la empresa.
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'Mensajes' })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar nueva conversación' }).click();
  let buscador = page.getByRole('dialog');
  await buscador.getByRole('textbox').fill(fx.adminEmpresa.nombre);
  await buscador.getByRole('button').filter({ hasText: fx.empresa.razonSocial }).click();
  await expect(page.getByRole('button', { name: 'Ver perfil', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver empresa' }).click();
  await expect(page).toHaveURL(/\/empresa\/\d+$/);
  await expect(page.getByRole('heading', { name: fx.empresa.razonSocial })).toBeVisible();

  // Candidato: el chat se habilita cuando su postulación avanza (en el test
  // del proceso ya quedó preseleccionado; si este test corre solo, se avanza acá).
  const reclutador = await apiComo(fx.reclutador.email);
  const candidatos = await (await reclutador.get(`${API}/empresas/candidatos`)).json();
  const postulacion = candidatos.data.find((p) => p.usuario.apellido === fx.alumno2.apellido);
  if (postulacion.estado === 'en_revision') {
    const avance = await reclutador.patch(`${API}/postulaciones/${postulacion.id}/estado`, { data: { estado: 'preseleccionado' } });
    expect(avance.ok()).toBe(true);
  }
  await reclutador.dispose();

  await page.goto('/chat');
  await page.getByRole('button', { name: 'Iniciar nueva conversación' }).click();
  buscador = page.getByRole('dialog');
  await buscador.getByRole('textbox').fill(fx.alumno2.nombre);
  await buscador.getByRole('button').filter({ hasText: fx.alumno2.apellido }).click();
  await expect(page.getByRole('button', { name: 'Ver empresa' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver perfil', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/\d+$/);
});
