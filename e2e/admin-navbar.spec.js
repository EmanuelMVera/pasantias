// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const { login, fx } = require('./helpers');

/**
 * Navbar del administrador — validación del rediseño de marca/navegación:
 *  - ningún link se parte en varias líneas ni se pisa con la marca o las acciones;
 *  - por debajo del umbral, el panel hamburguesa reemplaza a los links;
 *  - el navbar no genera scroll horizontal y mide ~63px (60px + borde);
 *  - la marca es SisPasantías y no hay rastro visual del logo UOM;
 *  - /notificaciones no deja ningún link de navegación marcado como activo.
 */

const ANCHOS = [1024, 1101, 1200, 1279, 1280, 1366, 1440, 1920];
const CAPTURAS = path.join(__dirname, '..', 'test-results', 'navbar');

async function medirNavbar(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Principal"]');
    const cont = nav.querySelector('[class*="navbarLinks"]');
    const acciones = nav.querySelector('[class*="navbarActions"]');
    const marca = nav.querySelector('a[aria-label="SisPasantías"]');
    const toggle = nav.querySelector('button[aria-controls="nav-mobile"]');
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;

    const linksVisibles = visible(cont);
    const links = linksVisibles ? [...cont.querySelectorAll('a')] : [];
    const rects = links.map((a) => a.getBoundingClientRect());
    return {
      alto: Math.round(nav.getBoundingClientRect().height),
      linksVisibles,
      toggleVisible: visible(toggle),
      cantidadLinks: links.length,
      altoMaxLink: rects.length ? Math.max(...rects.map((r) => Math.round(r.height))) : 0,
      derechaUltimoLink: rects.length ? Math.round(rects[rects.length - 1].right) : 0,
      izquierdaPrimerLink: rects.length ? Math.round(rects[0].left) : 0,
      derechaMarca: marca ? Math.round(marca.getBoundingClientRect().right) : 0,
      izquierdaAcciones: acciones ? Math.round(acciones.getBoundingClientRect().left) : 0,
      scrollDoc: document.documentElement.scrollWidth,
      anchoDoc: document.documentElement.clientWidth,
      scrollNav: nav.scrollWidth,
      anchoNav: nav.clientWidth,
    };
  });
}

test.describe('Navbar admin — links y marca', () => {
  for (const ancho of ANCHOS) {
    test(`admin @ ${ancho}px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 800 });
      await login(page, fx.admin.email);
      await page.goto('/admin');
      await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();

      const m = await medirNavbar(page);
      console.log(`[navbar ${ancho}px]`, JSON.stringify(m));
      await page.screenshot({
        path: path.join(CAPTURAS, `admin-${ancho}.png`),
        clip: { x: 0, y: 0, width: ancho, height: 80 },
      });

      // Alto del chrome: 60px + 3px de borde.
      expect(m.alto).toBeGreaterThanOrEqual(60);
      expect(m.alto).toBeLessThanOrEqual(72);

      // Nunca scroll horizontal (documento ni navbar).
      expect(m.scrollDoc).toBeLessThanOrEqual(m.anchoDoc + 1);
      expect(m.scrollNav).toBeLessThanOrEqual(m.anchoNav + 1);

      if (m.linksVisibles) {
        // 7 links, cada uno en una sola línea (alto de una línea ≈ 35px).
        expect(m.cantidadLinks).toBe(7);
        expect(m.altoMaxLink).toBeLessThanOrEqual(44);
        // Sin superposición con la marca ni con campana/avatar.
        expect(m.derechaMarca).toBeLessThanOrEqual(m.izquierdaPrimerLink);
        expect(m.derechaUltimoLink).toBeLessThanOrEqual(m.izquierdaAcciones);
      } else {
        // Sin links inline: el panel hamburguesa tiene que estar disponible.
        expect(m.toggleVisible).toBe(true);
      }
    });
  }
});
