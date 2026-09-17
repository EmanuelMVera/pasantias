// @ts-check
/**
 * responsive.spec.js — TEST-03 (Fase 3 de la iteración funcional/visual).
 *
 * Barrido responsive real: recorre las páginas obligatorias en los 8
 * viewports obligatorios (320x568 → 1366x768), para cada combinación:
 *   - falla si document.documentElement.scrollWidth > clientWidth (scroll
 *     horizontal a nivel documento — nunca debería pasar);
 *   - guarda un screenshot en test-results/responsive/ (gitignored, ver
 *     .gitignore "/test-results/" — nunca se commitea);
 * y además ejercita: menú móvil (abrir/cerrar, click afuera, Escape),
 * dropdown del navbar autenticado, y un formulario básico (login) en el
 * viewport más angosto.
 *
 * No reemplaza los specs funcionales existentes (alumno/reclutador/admin-
 * empresa/admin.spec.js) — es puramente de layout, sobre las mismas 5
 * cuentas de e2e/fixtures.json ya sembradas por scripts/seed-e2e.js.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { login, fx } = require('./helpers');

const SCREEN_DIR = path.join(__dirname, '..', 'test-results', 'responsive');
fs.mkdirSync(SCREEN_DIR, { recursive: true });

// Cada test visita varias páginas completas (hasta 6) — el timeout default
// de 30s (playwright.config.js) alcanza casi siempre, pero el primer test de
// toda la corrida además paga el cold-start de Vite compilando esa ruta por
// primera vez (falló una vez con exactamente ese patrón). 60s da margen real
// sin esconder una regresión genuina (una página colgada igual tardaría
// minutos, no segundos, de más).
test.setTimeout(60_000);

/** Los 8 viewports obligatorios (sección 11 del pedido). */
const VIEWPORTS = [
  { w: 320,  h: 568,  name: '320x568' },
  { w: 360,  h: 640,  name: '360x640' },
  { w: 375,  h: 667,  name: '375x667' },
  { w: 390,  h: 844,  name: '390x844' },
  { w: 425,  h: 800,  name: '425x800' },
  { w: 768,  h: 1024, name: '768x1024' },
  { w: 1024, h: 768,  name: '1024x768' },
  { w: 1366, h: 768,  name: '1366x768' },
];

const PAGINAS = {
  publicas:   ['/', '/login', '/registro-empresa', '/forgot-password', '/reset-password/test'],
  alumno:     ['/dashboard', '/ofertas', '/mis-postulaciones', '/perfil', '/chat', '/notificaciones'],
  adminEmpresa: ['/empresa', '/empresa/equipo', '/empresa/mi-empresa', '/empresa/candidatos', '/chat', '/notificaciones'],
  reclutador: ['/empresa', '/empresa/nueva-oferta', '/empresa/candidatos', '/chat', '/empresa/mi-empresa'],
  admin:      ['/admin', '/admin/usuarios', '/admin/importaciones', '/admin/solicitudes', '/admin/ofertas', '/admin/logs'],
};

/** Nombre de archivo seguro a partir de una ruta ("/empresa/mi-empresa" → "empresa_mi-empresa"). */
function slug(rutaPagina) {
  return rutaPagina.replace(/^\//, '').replace(/\//g, '_') || 'home';
}

/**
 * Visita una página en un viewport dado, falla si hay scroll horizontal a
 * nivel documento, y guarda un screenshot. `grupo` solo se usa para el
 * nombre del archivo (no cambia el chequeo).
 */
async function chequearPagina(page, grupo, rutaPagina, viewport) {
  await page.setViewportSize({ width: viewport.w, height: viewport.h });
  await page.goto(rutaPagina);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Deja asentar una animación/transición de layout (fuentes, fade-ins).
  await page.waitForTimeout(150);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  const archivo = path.join(SCREEN_DIR, `${grupo}__${slug(rutaPagina)}__${viewport.name}.png`);
  await page.screenshot({ path: archivo, fullPage: true }).catch(() => {});

  expect(
    overflow.scrollWidth,
    `Scroll horizontal en ${rutaPagina} a ${viewport.name}: ` +
    `scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth} ` +
    `(screenshot: ${archivo})`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1); // +1px de tolerancia por redondeo subpixel
}

// ── Páginas públicas (sin login) ────────────────────────────────────────────

test.describe('Responsive — páginas públicas', () => {
  for (const viewport of VIEWPORTS) {
    test(`públicas @ ${viewport.name}`, async ({ page }) => {
      for (const ruta of PAGINAS.publicas) {
        await test.step(ruta, async () => chequearPagina(page, 'publicas', ruta, viewport));
      }
    });
  }
});

// ── Alumno ───────────────────────────────────────────────────────────────────

test.describe('Responsive — alumno', () => {
  for (const viewport of VIEWPORTS) {
    test(`alumno @ ${viewport.name}`, async ({ page }) => {
      await login(page, fx.alumno.email);
      for (const ruta of PAGINAS.alumno) {
        await test.step(ruta, async () => chequearPagina(page, 'alumno', ruta, viewport));
      }
    });
  }
});

// ── Empresa (admin_empresa) ──────────────────────────────────────────────────

test.describe('Responsive — empresa (admin_empresa)', () => {
  for (const viewport of VIEWPORTS) {
    test(`admin_empresa @ ${viewport.name}`, async ({ page }) => {
      await login(page, fx.adminEmpresa.email);
      for (const ruta of PAGINAS.adminEmpresa) {
        await test.step(ruta, async () => chequearPagina(page, 'admin_empresa', ruta, viewport));
      }
    });
  }
});

// ── Reclutador ────────────────────────────────────────────────────────────────

test.describe('Responsive — reclutador', () => {
  for (const viewport of VIEWPORTS) {
    test(`reclutador @ ${viewport.name}`, async ({ page }) => {
      await login(page, fx.reclutador.email);
      for (const ruta of PAGINAS.reclutador) {
        await test.step(ruta, async () => chequearPagina(page, 'reclutador', ruta, viewport));
      }
    });
  }
});

// ── Admin del sistema ────────────────────────────────────────────────────────

test.describe('Responsive — admin', () => {
  for (const viewport of VIEWPORTS) {
    test(`admin @ ${viewport.name}`, async ({ page }) => {
      await login(page, fx.admin.email);
      for (const ruta of PAGINAS.admin) {
        await test.step(ruta, async () => chequearPagina(page, 'admin', ruta, viewport));
      }
    });
  }
});

// ── Interacciones: menú móvil, dropdown, formulario básico ──────────────────

test.describe('Responsive — interacciones', () => {
  test('menú móvil autenticado: abrir, click afuera cierra, Escape cierra', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, fx.alumno.email);

    const toggle = page.locator('[aria-controls="nav-mobile"]');
    await expect(toggle).toBeVisible();
    // Tap target >= 44px (sección 11.3).
    const box = await toggle.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#nav-mobile');
    await expect(panel).toBeVisible();

    // Click afuera del panel cierra.
    await page.mouse.click(10, 10);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Escape cierra.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('dropdown del navbar: abre y muestra datos del usuario', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, fx.alumno.email);

    const avatarBtn = page.locator('[aria-haspopup="true"]');
    await avatarBtn.click();
    await expect(avatarBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(fx.alumno.email)).toBeVisible();

    await page.mouse.click(10, 10);
    await expect(avatarBtn).toHaveAttribute('aria-expanded', 'false');
  });

  test('formulario de login usable en el viewport más angosto (320x568)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/login');

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');
    const submit = page.getByRole('button', { name: /ingresar/i });

    for (const loc of [email, password, submit]) {
      await expect(loc).toBeVisible();
      const box = await loc.boundingBox();
      // El control entra dentro del viewport (no queda cortado a la derecha).
      expect(box.x + box.width).toBeLessThanOrEqual(320 + 1);
    }

    await email.fill(fx.alumno.email);
    await password.fill(fx.password);
    await expect(email).toHaveValue(fx.alumno.email);
  });
});
