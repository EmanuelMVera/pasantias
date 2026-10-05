'use strict';

/**
 * formatoCanonico.test.js — los datos se guardan en UNA sola representación.
 *
 *   CUIT     → 11 dígitos sin guiones ("30999999979")
 *   Teléfono → "+54" + 10 dígitos nacionales ("+541144445555")
 *   Texto    → trim + espacios colapsados en una línea (sin tocar mayúsculas)
 *
 * Más la detección de CUIT duplicado al crear una solicitud de empresa.
 */

const request = require('supertest');
const app = require('../src/app');
const { SolicitudEmpresa } = require('../src/models');
const {
  normalizarCuit, esCuitValido, normalizarTelefonoAR, normalizarEspacios, validarCampos,
} = require('../src/validators/common.validator');
const {
  crearEmpresaConAdmin, crearSolicitudEmpresaPendiente, cuitValido,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');

const conGuiones = (c) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

describe('Formato canónico — reglas', () => {
  test('CUIT: con y sin guiones es válido y normaliza al mismo valor', () => {
    expect(esCuitValido('30999999979')).toBe(true);
    expect(esCuitValido('30-99999997-9')).toBe(true);
    expect(normalizarCuit('30-99999997-9')).toBe('30999999979');
    expect(normalizarCuit('30 99999997 9')).toBe(normalizarCuit('30999999979'));
  });

  test.each([
    ['30999999978', 'dígito verificador incorrecto'],
    ['309999999790', 'más de 11 dígitos'],
    ['30-9999999A-9', 'letras'],
  ])('CUIT %p (%s) → inválido / 400 por validarCampos', (cuit) => {
    expect(esCuitValido(cuit)).toBe(false);
    expect(validarCampos({ cuit }, { cuit: { tipo: 'cuit', label: 'El CUIT' } }).error).toMatch(/CUIT no es válido/);
  });

  test.each([
    '+541144445555', '11 4444 5555', '11-4444-5555', '(11) 4444-5555', '(011) 4444-5555',
    '1144445555', '+54 11 4444-5555', '+54 9 11 4444-5555',
  ])('teléfono %p → +541144445555', (tel) => {
    expect(normalizarTelefonoAR(tel)).toBe('+541144445555');
    expect(validarCampos({ t: tel }, { t: { tipo: 'telefono', label: 'El teléfono' } }).datos.t).toBe('+541144445555');
  });

  test.each([
    ['11 4444 555O', 'letras'],
    ['11 15 4444 5555', 'con 15 (ambiguo)'],
    ['+1 555 010 9999', 'no argentino'],
    ['4444-5555', 'sin código de área'],
  ])('teléfono %p (%s) → 400', (tel) => {
    expect(normalizarTelefonoAR(tel)).toBeNull();
    expect(validarCampos({ t: tel }, { t: { tipo: 'telefono', label: 'El teléfono' } }).error)
      .toMatch(/no es un teléfono argentino válido/);
  });

  test('texto: trim + espacios colapsados sin cambiar mayúsculas; multilínea conserva saltos', () => {
    expect(normalizarEspacios('  Peter   Parker  ')).toBe('Peter Parker');
    expect(normalizarEspacios(' S.H.I.E.L.D. ')).toBe('S.H.I.E.L.D.');
    expect(normalizarEspacios("McDonald's  iOS")).toBe("McDonald's iOS");
    expect(normalizarEspacios('línea 1\n  línea 2')).toBe('línea 1\n  línea 2');
  });
});

describe('Solicitud de empresa — CUIT canónico y duplicados', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await limpiarSolicitudesEmpresa(idsSolicitudes);
    await cerrarConexion();
  });

  const base = (cuit) => {
    const suf = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
      razonSocial: `  Formato   ${suf}  SA `, cuit, rubro: 'Software',
      email: `Contacto-${suf}@Test.Local`, telefono: '(011) 4444-5555',
      responsableNombre: 'Ana', responsableApellido: 'Prueba', responsableEmail: `resp-${suf}@test.local`,
      responsableTelefono: '+54 9 11 5555-1234',
    };
  };

  test('se guarda en formato canónico: CUIT 11 dígitos, teléfonos +54…, email en minúsculas, espacios colapsados', async () => {
    const cuit = cuitValido();
    const res = await request(app).post('/api/solicitudes-empresa').send(base(conGuiones(cuit)));
    expect(res.status).toBe(201);
    idsSolicitudes.push(res.body.data.id);
    const s = await SolicitudEmpresa.findByPk(res.body.data.id);
    expect(s.cuit).toBe(cuit);
    expect(s.telefono).toBe('+541144445555');
    expect(s.responsableTelefono).toBe('+541155551234');
    expect(s.email).toBe(s.email.toLowerCase());
    expect(s.razonSocial).toMatch(/^Formato \d+ SA$/);
  });

  test('CUIT con solicitud PENDIENTE (aunque se escriba con otra presentación) → 409', async () => {
    const cuit = cuitValido();
    const primera = await request(app).post('/api/solicitudes-empresa').send(base(cuit));
    expect(primera.status).toBe(201);
    idsSolicitudes.push(primera.body.data.id);

    const segunda = await request(app).post('/api/solicitudes-empresa').send(base(conGuiones(cuit)));
    expect(segunda.status).toBe(409);
    expect(segunda.body.message).toBe('Ya existe una solicitud pendiente para este CUIT.');
  });

  test('una solicitud pendiente LEGACY guardada con guiones también bloquea (comparación por dígitos)', async () => {
    const cuit = cuitValido();
    const legacy = await crearSolicitudEmpresaPendiente({ cuit: conGuiones(cuit) });
    idsSolicitudes.push(legacy.id);
    const res = await request(app).post('/api/solicitudes-empresa').send(base(cuit));
    expect(res.status).toBe(409);
  });

  test('CUIT de una empresa ya registrada → 409', async () => {
    const cuit = cuitValido();
    const { usuarioAdmin } = await crearEmpresaConAdmin({ empresa: { cuit } });
    idsUsuarios.push(usuarioAdmin.id);
    const res = await request(app).post('/api/solicitudes-empresa').send(base(conGuiones(cuit)));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Ya hay una empresa registrada con este CUIT/);
  });

  test('con una solicitud RECHAZADA anterior, se puede volver a presentar', async () => {
    const cuit = cuitValido();
    const rechazada = await crearSolicitudEmpresaPendiente({ cuit, estado: 'rechazado' });
    idsSolicitudes.push(rechazada.id);
    const res = await request(app).post('/api/solicitudes-empresa').send(base(cuit));
    expect(res.status).toBe(201);
    idsSolicitudes.push(res.body.data.id);
  });

  test('la máscara del frontend no protege la API: { cuit: "hola" } sigue siendo 400', async () => {
    const res = await request(app).post('/api/solicitudes-empresa').send(base('hola'));
    expect(res.status).toBe(400);
  });
});
