// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, fx } = require('./helpers');

/**
 * Shell del administrador (sidebar + topbar) — contrato de navegación:
 *  - ≥1280px: sidebar completa (ícono + texto); 1024–1279px: rail compacto
 *    (solo íconos, el texto sigue siendo el nombre accesible del link);
 *    <1024px: sin sidebar fija, drawer (#nav-mobile) desde la hamburguesa.
 *  - 7 secciones, un único nav "Principal", sin scroll horizontal, topbar
 *    de ~64px con campana y menú de usuario.
 *  - Drawer: se abre/cierra con el botón, Escape (devuelve el foco), click
 *    afuera y al navegar; bloquea el scroll del body mientras está abierto.
 *  - Menú de usuario con email y "Cerrar sesión" (que cierra la sesión).
 *  - Las pestañas (Tabs) no generan scroll/barra fantasma.
 */

const ANCHOS_DESKTOP = [1024, 1100, 1279, 1280, 1366, 1440, 1920];
const SECCIONES = ['Panel', 'Solicitudes', 'Empresas', 'Ofertas', 'Usuarios', 'Importar', 'Auditoría'];
const CAPTURAS = path.join(__dirname, '..', 'test-results', 'admin-shell');

async function medirShell(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Principal"]');
    const topbar = document.querySelector('header');
    const links = [...nav.querySelectorAll('a')];
    const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
    const textoVisible = links.some((a) => {
      const span = a.querySelector('span');
      return span && span.getBoundingClientRect().width > 1;
    });
    return {
      cantidadLinks: links.length,
      linksVisibles: links.every(visible),
      altoMaxLink: Math.max(...links.map((a) => Math.round(a.getBoundingClientRect().height))),
      anchoSidebar: Math.round(nav.getBoundingClientRect().width),
      textoVisible,
      altoTopbar: Math.round(topbar.getBoundingClientRect().height),
      scrollDoc: document.documentElement.scrollWidth,
      anchoDoc: document.documentElement.clientWidth,
      navs: document.querySelectorAll('nav[aria-label="Principal"]').length,
    };
  });
}

test.describe('Shell admin — sidebar y topbar (desktop / rail)', () => {
  for (const ancho of ANCHOS_DESKTOP) {
    test(`admin @ ${ancho}px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      await login(page, fx.admin.email);
      await page.goto('/admin');
      const nav = page.getByRole('navigation', { name: 'Principal' });
      await expect(nav).toBeVisible();

      const m = await medirShell(page);
      console.log(`[shell ${ancho}px]`, JSON.stringify(m));
      await page.screenshot({ path: path.join(CAPTURAS, `admin-${ancho}.png`) });

      expect(m.navs).toBe(1);
      expect(m.cantidadLinks).toBe(7);
      expect(m.linksVisibles).toBe(true);
      expect(m.altoMaxLink).toBeLessThanOrEqual(52);
      expect(m.altoTopbar).toBeGreaterThanOrEqual(60);
      expect(m.altoTopbar).toBeLessThanOrEqual(72);
      expect(m.scrollDoc).toBeLessThanOrEqual(m.anchoDoc + 1);

      // Nombre accesible de cada sección, con o sin texto visible (rail).
      for (const nombre of SECCIONES) {
        await expect(nav.getByRole('link', { name: nombre, exact: true })).toBeVisible();
      }

      if (ancho >= 1280) {
        expect(m.textoVisible).toBe(true);        // sidebar completa
        expect(m.anchoSidebar).toBeGreaterThan(180);
      } else {
        expect(m.textoVisible).toBe(false);       // rail: solo íconos
        expect(m.anchoSidebar).toBeLessThan(120);
      }

      // La hamburguesa no se muestra con sidebar fija.
      await expect(page.locator('button[aria-controls="nav-mobile"]')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Notificaciones' })).toBeVisible();
    });
  }

  test('navegar desde la sidebar marca la sección activa', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, fx.admin.email);
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await nav.getByRole('link', { name: 'Empresas', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/empresas$/);
    await expect(nav.locator('a[aria-current="page"]')).toHaveText('Empresas');
    await expect(page.getByRole('heading', { name: /^empresas$/i })).toBeVisible();
  });
});

test.describe('Shell admin — drawer en tablet/móvil', () => {
  for (const { w, h } of [{ w: 375, h: 667 }, { w: 768, h: 1024 }]) {
    test(`drawer @ ${w}px: abrir, Escape, click afuera y navegar`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await login(page, fx.admin.email);
      await page.goto('/admin');

      const nav = page.getByRole('navigation', { name: 'Principal' });
      const toggle = page.locator('button[aria-controls="nav-mobile"]');
      await expect(nav).toBeHidden();
      await expect(toggle).toBeVisible();
      const box = await toggle.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);

      // Abrir: visible, aria-expanded y body sin scroll.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#nav-mobile')).toBeVisible();
      await expect(nav).toBeVisible();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

      // Escape cierra y devuelve el foco al botón.
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(nav).toBeHidden();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

      // Click afuera (sobre el fondo, a la derecha del drawer) cierra.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await page.mouse.click(w - 10, h - 10);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      // Navegar desde el drawer cierra y lleva a la sección.
      await toggle.click();
      await nav.getByRole('link', { name: 'Auditoría', exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/logs$/);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('heading', { name: 'Auditoría del sistema' })).toBeVisible();

      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('Shell admin — menú de usuario y pestañas', () => {
  test('dropdown muestra identidad y "Cerrar sesión" cierra la sesión', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, fx.admin.email);

    const avatarBtn = page.locator('[aria-haspopup="true"]');
    await expect(avatarBtn).toHaveCount(1);
    await avatarBtn.click();
    await expect(avatarBtn).toHaveAttribute('aria-expanded', 'true');
    const dropdown = avatarBtn.locator('xpath=following-sibling::*[1]');
    await expect(dropdown.getByText(fx.admin.email)).toBeVisible();

    // El dropdown entra en el viewport (email largo sin desbordar).
    const caja = await dropdown.boundingBox();
    expect(caja.x + caja.width).toBeLessThanOrEqual(1366);

    await dropdown.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/localhost:5173\/$/);
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Auditoría' })).toHaveCount(0);

    // Sin sesión, el área admin ya no es accesible.
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/);
  });

  test('las pestañas no generan scroll ni barra al costado', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, fx.admin.email);
    for (const ruta of ['/admin/solicitudes', '/admin/ofertas']) {
      await page.goto(ruta);
      const tablist = page.getByRole('tablist');
      await expect(tablist).toBeVisible();
      const overflow = await tablist.evaluate((el) => ({
        vertical: el.scrollHeight - el.clientHeight,
        horizontal: el.scrollWidth - el.clientWidth,
      }));
      expect(overflow.vertical).toBeLessThanOrEqual(0);
      expect(overflow.horizontal).toBeLessThanOrEqual(0);
    }
  });
});
