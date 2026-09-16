/**
 * openapi.test.js — Guardia anti-drift de la spec OpenAPI (DOC-02).
 *
 * No usa la base de datos.
 *
 * Asunción sobre internals de Express 5: cada `router.stack` expone
 * `layer.route.path` y `layer.route.methods`. `app.router.stack` NO expone el
 * prefijo de montaje de los sub-routers → se usa el mapa MOUNTS explícito, que
 * espeja backend/src/app.js. El chequeo `routersMontados === MOUNTS.size` evita
 * que ese mapa se pudra en silencio.
 */
'use strict';

const request = require('supertest');

// ── Mapa de prefijos (espejo de src/app.js) ─────────────────────────────────
const MOUNTS = {
  '/api/auth': require('../src/routes/auth.routes'),
  '/api/users': require('../src/routes/user.routes'),
  '/api/students': require('../src/routes/student.routes'),
  '/api/chat': require('../src/routes/chat.routes'),
  '/api/empresas': require('../src/routes/empresa.routes'),
  '/api/ofertas': require('../src/routes/oferta.routes'),
  '/api/postulaciones': require('../src/routes/postulacion.routes'),
  '/api/admin': require('../src/routes/admin.routes'),
  '/api/notificaciones': require('../src/routes/notificacion.routes'),
  '/api/solicitudes-empresa': require('../src/routes/solicitudEmpresa.routes'),
  '/api/archivos': require('../src/routes/archivo.routes'),
  '/api/demo': require('../src/routes/demo.routes'),
};

// Endpoints reales que a propósito NO se documentan.
const SIN_DOCUMENTAR = new Set(['GET /api/health']);

const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

const toOpenApiPath = (p) =>
  p.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/+$/, '') || '/';

function rutasReales() {
  const set = new Set();
  for (const [prefijo, router] of Object.entries(MOUNTS)) {
    for (const layer of router.stack) {
      if (!layer.route) continue; // salta router.use(verifyToken) y middlewares
      const sub = toOpenApiPath(layer.route.path);
      const full = prefijo + (sub === '/' ? '' : sub);
      for (const m of METODOS) {
        if (layer.route.methods && layer.route.methods[m]) set.add(`${m.toUpperCase()} ${full}`);
      }
    }
  }
  return set;
}

function operacionesSpec(spec) {
  const set = new Set();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const m of Object.keys(methods)) {
      if (METODOS.includes(m)) set.add(`${m.toUpperCase()} ${path}`);
    }
  }
  return set;
}

// Recolecta todos los $ref internos y verifica que resuelvan.
function refsRotas(spec) {
  const rotas = [];
  const visitar = (node) => {
    if (Array.isArray(node)) return node.forEach(visitar);
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        if (!v.startsWith('#/')) continue;
        const partes = v.slice(2).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
        let cur = spec;
        for (const p of partes) {
          cur = cur && cur[p];
        }
        if (cur === undefined) rotas.push(v);
      } else {
        visitar(v);
      }
    }
  };
  visitar(spec);
  return rotas;
}

describe('OpenAPI spec (DOC-02)', () => {
  const spec = require('../src/docs').buildSpec();

  test('el nº de sub-routers montados coincide con el mapa MOUNTS', () => {
    const app = require('../src/app');
    const stack = (app.router && app.router.stack) || (app._router && app._router.stack) || [];
    const routers = stack.filter((l) => l.name === 'router');
    expect(routers.length).toBe(Object.keys(MOUNTS).length);
  });

  test('toda ruta real está documentada', () => {
    const reales = rutasReales();
    const documentadas = operacionesSpec(spec);
    const faltantes = [...reales].filter(
      (op) => !documentadas.has(op) && !SIN_DOCUMENTAR.has(op),
    );
    expect(faltantes).toEqual([]);
  });

  test('toda operación documentada existe como ruta real', () => {
    const reales = rutasReales();
    const documentadas = operacionesSpec(spec);
    const inexistentes = [...documentadas].filter((op) => !reales.has(op));
    expect(inexistentes).toEqual([]);
  });

  test('los operationId son únicos y no vacíos', () => {
    const ids = [];
    for (const methods of Object.values(spec.paths)) {
      for (const op of Object.values(methods)) {
        expect(typeof op.operationId).toBe('string');
        expect(op.operationId.length).toBeGreaterThan(0);
        ids.push(op.operationId);
      }
    }
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dups).toEqual([]);
  });

  test('cada operación tiene tags, summary y al menos una respuesta 2xx', () => {
    const malas = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(methods)) {
        const tiene2xx = Object.keys(op.responses || {}).some((c) => /^2\d\d$/.test(c));
        if (!op.tags || !op.tags.length || !op.summary || !tiene2xx) {
          malas.push(`${m.toUpperCase()} ${path}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });

  test('todos los $ref internos resuelven', () => {
    expect(refsRotas(spec)).toEqual([]);
  });

  test('metadata básica', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBeTruthy();
    expect(spec.components.securitySchemes.cookieAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  });

  test('el schema Usuario NO expone campos sensibles', () => {
    const props = spec.components.schemas.Usuario.properties || {};
    for (const campo of ['password', 'tokenReset', 'tokenResetExpira', 'tokenResetUsadoEn', 'tokenVersion']) {
      expect(props[campo]).toBeUndefined();
    }
  });

  test('GET /api/docs responde 200 con el CSP relajado', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("style-src 'self' 'unsafe-inline'");
  });

  test('GET /api/openapi.json devuelve la spec', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(50);
  });

  test('el gate de producción apaga la doc', () => {
    jest.resetModules();
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.ENABLE_API_DOCS;
    process.env.NODE_ENV = 'production';
    delete process.env.ENABLE_API_DOCS;
    try {
      const mountDocs = require('../src/docs/serve');
      expect(mountDocs.docsEnabled()).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
      if (prevFlag === undefined) delete process.env.ENABLE_API_DOCS;
      else process.env.ENABLE_API_DOCS = prevFlag;
      jest.resetModules();
    }
  });
});
