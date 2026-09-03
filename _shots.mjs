/**
 * Screenshots de verificación UI/UX en varios anchos y roles.
 * Uso: node shots.mjs [outDir]
 * Requiere back (:5000) y front (:5173) corriendo (npm run dev en la raíz).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || './shots';
const BASE = 'http://localhost:5173';
const API = 'http://localhost:5000';

const PW = 'Test1234!';
const USERS = {
  alumno: 'alumno.e2e@itb.test',
  empresa: 'admin-empresa.e2e@itb.test',
  admin: 'admin.e2e@itb.test',
};

const WIDTHS = [
  { name: '375', w: 375, h: 812 },
  { name: '768', w: 768, h: 1024 },
  { name: '1440', w: 1440, h: 900 },
];

const PAGES = {
  public: ['/', '/login', '/registro-empresa'],
  alumno: ['/dashboard', '/ofertas', '/mis-postulaciones', '/perfil', '/chat'],
  empresa: ['/empresa', '/empresa/nueva-oferta', '/empresa/equipo', '/empresa/mi-empresa', '/empresa/candidatos'],
  admin: ['/admin', '/admin/solicitudes', '/admin/ofertas', '/admin/usuarios', '/admin/logs'],
};

async function login(context, email) {
  const res = await context.request.post(`${API}/api/auth/login`, {
    data: { email, password: PW },
  });
  if (!res.ok()) throw new Error(`login ${email}: ${res.status()}`);
}

async function shoot(browser, role, routes) {
  for (const bp of WIDTHS) {
    const context = await browser.newContext({ viewport: { width: bp.w, height: bp.h } });
    if (role !== 'public') await login(context, USERS[role]);
    const page = await context.newPage();
    for (const route of routes) {
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(600);
        const slug = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
        const dir = path.join(OUT, bp.name);
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${role}__${slug}.png`), fullPage: true });
        // chequeo de scroll horizontal
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
            ? document.documentElement.scrollWidth - document.documentElement.clientWidth
            : 0,
        );
        if (overflow) console.log(`  ⚠ OVERFLOW ${overflow}px @ ${bp.name} ${role} ${route}`);
        else console.log(`  ok ${bp.name} ${role} ${route}`);
      } catch (e) {
        console.log(`  ✗ ${bp.name} ${role} ${route}: ${e.message.split('\n')[0]}`);
      }
    }
    await context.close();
  }
}

const browser = await chromium.launch();
for (const [role, routes] of Object.entries(PAGES)) {
  console.log(`# ${role}`);
  await shoot(browser, role, routes);
}
await browser.close();
console.log('done ->', OUT);
