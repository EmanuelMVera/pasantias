// @ts-check
// Recorrido del panel de administración rediseñado: empresas (búsqueda + modal de
// confianza), ofertas (tabs + menú "⋯"), y más pantallas a medida que se agregan.
// Corre con el seed E2E (ver scripts/run-e2e.js); no depende del orden de otras specs
// porque cada test deja el dato como lo encontró.
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

test.describe('admin — dashboard y solicitudes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
  });

  test('dashboard resumen: secciones, sin acciones de aprobar/rechazar, atajos a las pantallas de gestión', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Panel de Administración' })).toBeVisible();
    for (const seccion of ['Estado actual', 'Actividad del período', 'Requieren atención', 'Actividad reciente']) {
      await expect(page.getByRole('heading', { name: seccion })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /indicadores hist[oó]ricos/i })).toBeVisible();

    // El dashboard resume: aprobar/rechazar se hace en Solicitudes y Ofertas.
    await expect(page.getByRole('button', { name: /^(aprobar|rechazar)/i })).toHaveCount(0);

    // El período solo gobierna la actividad: selector agrupado, con aria-pressed.
    const periodo = page.getByRole('group', { name: /per[ií]odo de la actividad/i });
    await expect(periodo.getByRole('button', { pressed: true })).toHaveCount(1);
    await periodo.getByRole('button', { name: /7/ }).click();
    await expect(periodo.getByRole('button', { name: /7/ })).toHaveAttribute('aria-pressed', 'true');

    // Atajos: cada pendiente lleva a su pantalla. El link solo aparece si hay pendientes
    // (con la base recién sembrada los hay; en una re-corrida sobre la misma base, tal vez no).
    const revisarOfertas = page.getByRole('link', { name: 'Revisar ofertas' });
    if (await revisarOfertas.count() > 0) {
      await revisarOfertas.click();
      await expect(page).toHaveURL(/\/admin\/ofertas$/);
      await page.goBack();
    }
    await page.getByRole('link', { name: 'Ver auditoría completa →' }).click();
    await expect(page).toHaveURL(/\/admin\/logs$/);
  });

  test('solicitudes: título, tabs con contador de pendientes y un único "Actualizar"', async ({ page }) => {
    await page.goto('/admin/solicitudes');
    await expect(page.getByRole('heading', { name: /^solicitudes$/i })).toBeVisible();
    await expect(page.getByText('Gestioná solicitudes de empresas y altas de reclutadores.')).toBeVisible();

    const tabEmpresas = page.getByRole('tab', { name: /empresas/i });
    const tabRecl = page.getByRole('tab', { name: /reclutadores/i });
    await expect(tabEmpresas).toHaveAttribute('aria-selected', 'true');
    await expect(tabRecl).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('button', { name: 'Actualizar' })).toHaveCount(1);

    // Solo se renderiza el contenido de la pestaña activa.
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await tabRecl.click();
    await expect(page).toHaveURL(/tab=reclutadores/);
    await expect(tabRecl).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Actualizar' })).toHaveCount(1);

    // Navegación con flechas entre pestañas
    await tabRecl.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(tabEmpresas).toHaveAttribute('aria-selected', 'true');
  });

  test('solicitudes: la fila solo tiene "Revisar" (sin aprobar/rechazar sueltos) y abre el detalle', async ({ page }) => {
    await page.goto('/admin/solicitudes');
    await page.locator('#filtro-todos').click();
    const filas = page.locator('tbody tr');
    test.skip((await filas.count()) === 0, 'no hay solicitudes de empresa en la base');

    const primera = filas.first();
    await expect(primera.getByRole('button', { name: /aprobar|rechazar/i })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'ID', exact: true })).toHaveCount(0);
    await primera.getByRole('button', { name: /revisar/i }).click();
    await expect(page.getByRole('complementary', { name: /detalle de solicitud/i })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar detalle' }).click();
    await expect(page.getByRole('complementary', { name: /detalle de solicitud/i })).toHaveCount(0);
  });

  test('navbar: el link activo es el de la sección, y /notificaciones no marca ninguno', async ({ page }) => {
    const activos = () => page.locator('nav[aria-label="Principal"] a[aria-current="page"]');

    await page.goto('/admin');
    await expect(activos()).toHaveText(['Panel']);
    await page.goto('/admin/usuarios');
    await expect(activos()).toHaveText(['Usuarios']);
    await page.goto('/admin/logs');
    await expect(activos()).toHaveText(['Auditoría']);

    await page.goto('/notificaciones');
    await expect(activos()).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Notificaciones' })).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('admin — empresas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
    await page.goto('/admin/empresas');
    await expect(page.getByRole('heading', { name: /^empresas$/i })).toBeVisible();
  });

  test('buscador server-side por razón social, CUIT y responsable', async ({ page }) => {
    const buscador = page.getByLabel('Buscar empresas');
    await expect(buscador).toHaveAttribute('placeholder', 'Buscar por empresa, CUIT o responsable…');

    const fila = page.locator('tbody tr').filter({ hasText: fx.empresa.razonSocial });
    await expect(fila).toBeVisible();

    // Razón social
    await buscador.fill('e2e talent');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(fila).toBeVisible();

    // CUIT (con guiones, como lo escribiría una persona)
    await buscador.fill('30-11111111-8');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(fila).toBeVisible();

    // Responsable (admin de la empresa)
    await buscador.fill(fx.adminEmpresa.apellido);
    await expect(fila).toBeVisible();

    // Sin resultados → estado vacío con salida
    await buscador.fill('zzz-no-existe-zzz');
    await expect(page.getByText(/no se encontraron empresas/i)).toBeVisible();
    await page.getByRole('button', { name: /limpiar filtros/i }).click();
    await expect(buscador).toHaveValue('');
    await expect(fila).toBeVisible();
  });

  test('filtros rotulados con aria-pressed', async ({ page }) => {
    const grupoEstado = page.getByRole('group', { name: /filtrar por estado/i });
    const grupoConfianza = page.getByRole('group', { name: /filtrar por confianza/i });

    await expect(grupoEstado.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true');
    await grupoEstado.getByRole('button', { name: 'Rechazada' }).click();
    await expect(grupoEstado.getByRole('button', { name: 'Rechazada' })).toHaveAttribute('aria-pressed', 'true');
    await expect(grupoEstado.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('tbody tr').filter({ hasText: fx.empresa.razonSocial })).toHaveCount(0);

    await grupoEstado.getByRole('button', { name: 'Todas' }).click();
    await grupoConfianza.getByRole('button', { name: 'Confiable' }).click();
    await expect(grupoConfianza.getByRole('button', { name: 'Confiable' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('marcar y revocar confianza pide confirmación y explica el alcance', async ({ page }) => {
    const fila = page.locator('tbody tr').filter({ hasText: fx.empresa.razonSocial });
    await expect(fila).toBeVisible();

    // Estado inicial (seed): estándar. Cancelar no cambia nada.
    await fila.getByRole('button', { name: /marcar como confiable/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(/nuevas ofertas de esta empresa podrán publicarse automáticamente/i);
    await expect(modal).toContainText(/altas de\s+reclutadores no requerirán aprobación previa/i);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(fila.getByText('Estándar')).toBeVisible();

    // Confirmar
    await fila.getByRole('button', { name: /marcar como confiable/i }).click();
    await page.locator('#btn-confirmar-confianza').click();
    await expect(page.locator('[role="status"]').filter({ hasText: /ahora es una empresa de confianza/i })).toBeVisible();
    await expect(fila.getByText('Confiable')).toBeVisible();

    // Revocar (deja el dato como estaba)
    await fila.getByRole('button', { name: /revocar confianza/i }).click();
    await expect(page.getByRole('dialog')).toContainText(/ya aprobados no se modifican/i);
    await page.locator('#btn-confirmar-confianza').click();
    await expect(page.locator('[role="status"]').filter({ hasText: /se revocó la confianza/i })).toBeVisible();
    await expect(fila.getByText('Estándar')).toBeVisible();
  });
});

test.describe('admin — usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
    await page.goto('/admin/usuarios');
    await expect(page.getByRole('heading', { name: /gesti[oó]n de usuarios/i })).toBeVisible();
  });

  test('tabla compacta: sin columna ID y con el estado como badge informativo', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'ID', exact: true })).toHaveCount(0);
    for (const col of ['Usuario', 'Rol', 'Estado', 'Último acceso', 'Acciones']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }
    // El estado NO es un botón: no hay ningún control "Activo"/"Inactivo".
    await expect(page.getByRole('button', { name: /^[●○] (Activo|Inactivo)$/ })).toHaveCount(0);
  });

  test('hacer click en el badge de estado no cambia la cuenta', async ({ page }) => {
    const toggles = [];
    page.on('request', (r) => { if (/\/toggle$/.test(r.url())) toggles.push(r.url()); });

    const fila = page.locator('tbody tr').filter({ hasText: fx.alumno2.email });
    await page.getByLabel('Buscar usuarios').fill(fx.alumno2.email);
    await expect(fila).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    await fila.getByText('● Activo').click();
    await page.waitForTimeout(500);
    expect(toggles).toHaveLength(0);
    await expect(fila.getByText('● Activo')).toBeVisible();
  });

  test('suspender y reactivar pasan por un modal de confirmación', async ({ page }) => {
    await page.getByLabel('Buscar usuarios').fill(fx.alumno2.email);
    const fila = page.locator('tbody tr').filter({ hasText: fx.alumno2.email });
    await expect(fila).toBeVisible();

    // Cancelar no cambia nada
    await fila.getByRole('button', { name: /suspender la cuenta de/i }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(/quedará\s+inactiva/i);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(fila.getByText('● Activo')).toBeVisible();

    // Suspender
    await fila.getByRole('button', { name: /suspender la cuenta de/i }).click();
    await page.locator('#btn-confirmar-suspender').click();
    await expect(page.locator('[role="status"]').filter({ hasText: /cuenta suspendida/i })).toBeVisible();
    await expect(fila.getByText('○ Inactivo')).toBeVisible();

    // Reactivar (deja el dato como estaba)
    await fila.getByRole('button', { name: /reactivar la cuenta de/i }).click();
    await expect(page.getByRole('dialog')).toContainText(/podrá iniciar sesión/i);
    await page.locator('#btn-confirmar-suspender').click();
    await expect(page.locator('[role="status"]').filter({ hasText: /cuenta reactivada/i })).toBeVisible();
    await expect(fila.getByText('● Activo')).toBeVisible();
  });

  test('el admin no puede suspender su propia cuenta', async ({ page }) => {
    await page.getByLabel('Buscar usuarios').fill(fx.admin.email);
    const fila = page.locator('tbody tr').filter({ hasText: fx.admin.email });
    await expect(fila).toBeVisible();
    await expect(fila.getByRole('button', { name: /no podés suspender tu propia cuenta/i })).toBeDisabled();
  });
});

test.describe('admin — importar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
    await page.goto('/admin/importaciones');
    await expect(page.getByRole('heading', { name: /importar alumnos/i })).toBeVisible();
  });

  test('zona de archivo: hint de límites, selección, previsualización y quitar', async ({ page }) => {
    await expect(page.getByText('CSV UTF-8 · máx. 2 MB · hasta 2000 filas')).toBeVisible();
    const previsualizar = page.getByRole('button', { name: 'Previsualizar' });
    await expect(previsualizar).toBeDisabled();

    const csv = [
      'legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion',
      'E2E-001,Prueba,Uno,importar.uno.e2e@itb.test,alumno,,,,',
      'E2E-002,Sin,Email,no-es-un-email,alumno,,,,',
    ].join('\n');
    await page.getByLabel('Archivo CSV de alumnos y egresados').setInputFiles({
      name: 'alumnos-e2e.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
    });

    await expect(page.getByText('alumnos-e2e.csv')).toBeVisible();
    await expect(previsualizar).toBeEnabled();
    await previsualizar.click();

    // Dry-run: solo analiza, no crea usuarios.
    await expect(page.getByRole('heading', { name: /2\. previsualización/i })).toBeVisible();
    await expect(page.getByText(/Total filas:/)).toContainText('2');
    await expect(page.getByText(/Inválidas:/)).toContainText('1');

    await page.getByRole('button', { name: /quitar archivo/i }).click();
    await expect(page.getByText('alumnos-e2e.csv')).toHaveCount(0);
    await expect(previsualizar).toBeDisabled();
  });

  test('un archivo que no es .csv se rechaza con un aviso', async ({ page }) => {
    await page.getByLabel('Archivo CSV de alumnos y egresados').setInputFiles({
      name: 'no-es-csv.txt', mimeType: 'text/plain', buffer: Buffer.from('hola', 'utf8'),
    });
    await expect(page.getByRole('alert').filter({ hasText: /solo se aceptan archivos \.csv/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previsualizar' })).toBeDisabled();
  });
});

test.describe('admin — auditoría', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
    await page.goto('/admin/logs');
    await expect(page.getByRole('heading', { name: 'Auditoría del sistema' })).toBeVisible();
  });

  test('título, contador y tabla sin columna ID', async ({ page }) => {
    await expect(page.getByText(/\d+ registros? encontrados?/i)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'ID', exact: true })).toHaveCount(0);
    for (const col of ['Fecha / Hora', 'Acción', 'Entidad', 'Usuario', 'IP']) {
      await expect(page.getByRole('columnheader', { name: col })).toBeVisible();
    }
    await expect(page.getByText('Historial de Accesos')).toHaveCount(0);
  });

  test('los filtros editados no se aplican hasta "Aplicar filtros"; "Limpiar" los quita', async ({ page }) => {
    const consultas = [];
    page.on('request', (r) => { if (/\/api\/admin\/logs\?/.test(r.url())) consultas.push(new URL(r.url()).searchParams); });

    await page.getByLabel('Acción').selectOption('login');
    await expect(page.getByText(/cambiaste los filtros/i)).toBeVisible();
    await page.waitForTimeout(400);
    expect(consultas.filter((p) => p.get('accion') === 'login')).toHaveLength(0);

    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect.poll(() => consultas.filter((p) => p.get('accion') === 'login').length).toBeGreaterThan(0);
    await expect(page.getByText(/cambiaste los filtros/i)).toHaveCount(0);
    const filas = page.locator('tbody tr');
    await expect(filas.first()).toBeVisible();
    for (const fila of await filas.all()) await expect(fila).toContainText('Inicio de sesión');

    await page.getByRole('button', { name: 'Limpiar' }).click();
    await expect(page.getByLabel('Acción')).toHaveValue('');
    await expect.poll(() => consultas.at(-1)?.get('accion') ?? null).toBeNull();
  });

  test('valida que "Desde" no sea posterior a "Hasta"', async ({ page }) => {
    await page.getByLabel('Desde').fill('2026-03-20');
    // min/max del input ya lo previenen en el picker; el fill directo lo fuerza igual.
    await page.getByLabel('Hasta').fill('2026-03-10');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /no puede ser posterior/i })).toBeVisible();
  });

  test('la exportación usa los filtros APLICADOS, no los que se están editando', async ({ page }) => {
    await page.getByLabel('Acción').selectOption('login');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    // Se edita otro filtro SIN aplicarlo
    await page.getByLabel('Entidad').selectOption('oferta');

    const [respuesta] = await Promise.all([
      page.waitForResponse((r) => /\/api\/admin\/logs\/export/.test(r.url())),
      page.getByRole('button', { name: /exportar/i }).click().then(() => page.getByRole('menuitem', { name: 'CSV' }).click()),
    ]);
    const params = new URL(respuesta.url()).searchParams;
    expect(params.get('accion')).toBe('login');
    expect(params.get('entidad')).toBeNull();
    expect(params.get('format')).toBe('csv');
    expect(respuesta.status()).toBe(200);
  });
});

test.describe('admin — ofertas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, fx.admin.email);
  });

  test('tabs Pendientes / Todas, sin listados duplicados', async ({ page }) => {
    // No depende de que haya ofertas pendientes (admin.spec.js aprueba la del seed):
    // "Pendientes" muestra su tabla o el estado vacío, nunca las dos listas apiladas.
    await page.goto('/admin/ofertas');
    const tabPend = page.getByRole('tab', { name: /pendientes/i });
    const tabTodas = page.getByRole('tab', { name: /^todas$/i });

    await expect(tabPend).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('table').or(page.getByText(/no hay ofertas pendientes/i))).toBeVisible();
    expect(await page.locator('table').count()).toBeLessThanOrEqual(1);

    await tabTodas.click();
    await expect(tabTodas).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=todas/);
    await expect(page.locator('table')).toHaveCount(1);
    await expect(page.getByRole('columnheader', { name: 'Moderación' })).toBeVisible();
    const activa = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    await expect(activa).toBeVisible();

    // Filtros rotulados solo en "Todas": la oferta activa (ya moderada) no es "Pendiente" ni "Rechazada".
    const grupoMod = page.getByRole('group', { name: /filtrar por moderaci[oó]n/i });
    await grupoMod.getByRole('button', { name: 'Pendiente de revisión' }).click();
    await expect(grupoMod.getByRole('button', { name: 'Pendiente de revisión' })).toHaveAttribute('aria-pressed', 'true');
    await expect(activa).toHaveCount(0);
    await grupoMod.getByRole('button', { name: 'Rechazada' }).click();
    await expect(activa).toHaveCount(0);
    await grupoMod.getByRole('button', { name: 'Todas', exact: true }).click();
    await expect(activa).toBeVisible();
  });

  test('Rechazar y Cerrar piden confirmación (cancelar no cambia nada)', async ({ page }) => {
    await page.goto('/admin/ofertas?tab=todas');
    const fila = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    await expect(fila).toBeVisible();

    // Rechazar (irreversible): modal con el alcance
    await fila.getByRole('button', { name: /^rechazar oferta/i }).click();
    let modal = page.getByRole('dialog');
    await expect(modal).toContainText(/no se puede volver a aprobar/i);
    await expect(modal).toContainText(fx.ofertaActiva.titulo);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);

    // Cerrar (irreversible), desde el menú "⋯"
    await fila.getByRole('button', { name: /más acciones/i }).click();
    await page.getByRole('menuitem', { name: /cerrar/i }).click();
    modal = page.getByRole('dialog');
    await expect(modal).toContainText(/no se puede reabrir/i);
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);

    // Nada cambió: la oferta sigue activa
    await expect(fila.getByText('Activa', { exact: true })).toBeVisible();
  });

  test('Pausar y Cerrar están en el menú "⋯", accesible por teclado', async ({ page }) => {
    await page.goto('/admin/ofertas?tab=todas');
    const fila = page.locator('tbody tr').filter({ hasText: fx.ofertaActiva.titulo });
    await expect(fila).toBeVisible();

    // No hay botones Pausar/Cerrar sueltos en la fila
    await expect(fila.getByRole('button', { name: /^pausar$/i })).toHaveCount(0);

    const disparador = fila.getByRole('button', { name: /más acciones/i });
    await expect(disparador).toHaveAttribute('aria-haspopup', 'menu');
    await expect(disparador).toHaveAttribute('aria-expanded', 'false');
    await disparador.click();
    await expect(disparador).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /pausar/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /cerrar/i })).toBeVisible();

    // El menú queda dentro del viewport
    const caja = await menu.boundingBox();
    const vp = page.viewportSize();
    expect(caja).not.toBeNull();
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(vp.width);

    // Escape cierra y devuelve el foco al disparador
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(disparador).toBeFocused();
  });
});
