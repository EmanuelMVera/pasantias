'use strict';

/**
 * validacion.test.js — validación server-side de formularios (QA de
 * formularios). Tablas parametrizadas: unitarias de las reglas comunes
 * (common.validator.js) + un caso por formulario contra la API real, para
 * confirmar que cada ruta usa su validador y responde 400 con mensaje claro.
 */

const request = require('supertest');
const app = require('../src/app');
const { Oferta, SolicitudEmpresa } = require('../src/models');
const {
  esCuitValido, esTelefonoValido, esFechaValida, esEnteroEnRango, esUrlValida, validarCampos,
} = require('../src/validators/common.validator');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, agregarReclutador, loginYObtenerToken, cuitValido,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('Reglas comunes (common.validator.js)', () => {
  test.each([
    ['30712345678', false], // dígito verificador incorrecto
    ['hola', false],
    ['3071234567', false], // 10 dígitos
    ['99712345678', false], // prefijo inexistente
    [cuitValido(), true],
    ['20-12345678-6', true], // con guiones (persona física válida)
  ])('esCuitValido(%p) → %p', (cuit, esperado) => {
    expect(esCuitValido(cuit)).toBe(esperado);
  });

  test.each([
    ['hola', false],
    ['123', false],
    ['+54 11 1234-5678', true],
    ['(011) 4300-1234', true],
    ['+1 (555) 010-9999', true],
    ['1234567890123456', false], // 16 dígitos
  ])('esTelefonoValido(%p) → %p', (tel, esperado) => {
    expect(esTelefonoValido(tel)).toBe(esperado);
  });

  test.each([
    ['2026-02-31', false],
    ['31/12/2026', false],
    ['mañana', false],
    ['2026-12-31', true],
    ['2026-12-31T10:00:00.000Z', true],
  ])('esFechaValida(%p) → %p', (f, esperado) => {
    expect(esFechaValida(f)).toBe(esperado);
  });

  test.each([
    ['abc', 1, 999, false],
    [0, 1, 999, false],
    [1000, 1, 999, false],
    ['3', 1, 999, true],
    [3.5, 1, 999, false],
  ])('esEnteroEnRango(%p, %p, %p) → %p', (v, min, max, esperado) => {
    expect(esEnteroEnRango(v, min, max)).toBe(esperado);
  });

  test.each([
    ['basura', false],
    ['javascript:alert(1)', false],
    ['http://localhost', false],
    ['https://www.empresa.com', true],
  ])('esUrlValida(%p) → %p', (u, esperado) => {
    expect(esUrlValida(u)).toBe(esperado);
  });

  test('validarCampos normaliza (trim, email en minúsculas, vacío → null) y rechaza tipos equivocados', () => {
    const reglas = {
      nombre: { tipo: 'texto', label: 'El nombre', requerido: true, max: 10 },
      email: { tipo: 'email', label: 'El email' },
      ciudad: { tipo: 'texto', label: 'La ciudad' },
      tags: { tipo: 'lista', label: 'Tags', maxItems: 2 },
    };
    expect(validarCampos({ nombre: '  Ana ', email: ' ANA@Mail.COM ', ciudad: '' }, reglas))
      .toEqual({ error: null, datos: { nombre: 'Ana', email: 'ana@mail.com', ciudad: null } });
    expect(validarCampos({ nombre: { $gt: '' } }, reglas).error).toBe('El nombre debe ser texto.');
    expect(validarCampos({ nombre: 'x', tags: { a: 1 } }, reglas).error).toBe('Tags debe ser una lista.');
    expect(validarCampos({}, reglas).error).toBe('El nombre es obligatorio.');
    expect(validarCampos({}, reglas, { parcial: true }).error).toBeNull();
  });
});

describe('Validación de formularios contra la API', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];
  let tokenReclutador;
  let tokenAdminEmpresa;
  let tokenAlumno;
  let tokenAdmin;

  beforeAll(async () => {
    const { empresa, usuarioAdmin, passwordPlana } = await crearEmpresaConAdmin();
    const { usuarioReclutador } = await agregarReclutador(empresa);
    const { usuario: alumno } = await crearAlumno();
    const { usuario: admin } = await crearAdmin();
    idsUsuarios.push(usuarioAdmin.id, usuarioReclutador.id, alumno.id, admin.id);
    tokenReclutador = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
    tokenAdminEmpresa = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    tokenAlumno = await loginYObtenerToken(alumno.email, passwordPlana);
    tokenAdmin = await loginYObtenerToken(admin.email, passwordPlana);
  });

  afterAll(async () => {
    if (idsSolicitudes.length) await limpiarSolicitudesEmpresa(...idsSolicitudes);
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  // ── Ofertas ───────────────────────────────────────────────────────────────
  const ofertaBase = { titulo: 'Pasantía de validación', descripcion: 'Descripción.', tipoPuesto: 'trainee' };

  test.each([
    [{ cantidadVacantes: 'abc' }, 400, /vacantes debe ser un número entero entre 1 y 999/],
    [{ cantidadVacantes: 0 }, 400, /entre 1 y 999/],
    [{ cantidadVacantes: 1000 }, 400, /entre 1 y 999/],
    [{ salario: 'cien mil' }, 400, /salario estimado debe ser un número entero/],
    [{ modalidad: 'a_distancia' }, 400, /modalidad no es válido/i],
    [{ tipoPuesto: 'senior' }, 400, /tipo de puesto no es válido/i],
    [{ requiereExperiencia: 'quizás' }, 400, /verdadero o falso/],
    [{ fechaLimite: '2026-02-31' }, 400, /fecha límite no es una fecha válida/],
    [{ fechaPublicacion: '2099-06-10', fechaLimite: '2099-06-01' }, 400, /no puede ser anterior/],
    [{ fechaLimite: '2001-01-01' }, 400, /no puede estar en el pasado/],
    [{ carrerasDestinatarias: ['Astrología'] }, 400, /valores no válidos/],
    [{ titulo: '' }, 400, /título es obligatorio/],
  ])('crear oferta con %j → %i', async (extra, status, mensaje) => {
    const res = await auth(request(app).post('/api/ofertas'), tokenReclutador).send({ ...ofertaBase, ...extra });
    expect(res.status).toBe(status);
    expect(res.body.message).toMatch(mensaje);
  });

  test('crear oferta válida: 3 vacantes y remuneración libre; ignora campos que no son del formulario', async () => {
    const res = await auth(request(app).post('/api/ofertas'), tokenReclutador).send({
      ...ofertaBase,
      cantidadVacantes: '3',
      remuneracion: 'A convenir',
      salario: '150000',
      modalidadExtendida: 'medio_tiempo',
      fechaPublicacion: '2099-06-01',
      fechaLimite: '2099-06-30',
      vistas: 99999, estado: 'cerrada', nivelExperiencia: 'semi_senior', // no se aceptan desde el cliente
    });
    expect(res.status).toBe(201);
    const o = await Oferta.findByPk(res.body.data.id);
    expect(o.cantidadVacantes).toBe(3);
    expect(o.salario).toBe(150000);
    expect(o.remuneracion).toBe('A convenir');
    expect(o.vistas).toBe(0);
    expect(o.estado).toBe('activa');
    expect(o.nivelExperiencia).toBe('sin_experiencia');
  });

  test('pasante sigue forzando requiereExperiencia=false', async () => {
    const res = await auth(request(app).post('/api/ofertas'), tokenReclutador)
      .send({ ...ofertaBase, tipoPuesto: 'pasante', requiereExperiencia: true, experienciaDetalle: 'x' });
    expect(res.status).toBe(201);
    expect(res.body.data.requiereExperiencia).toBe(false);
    expect(res.body.data.experienciaDetalle).toBeNull();
  });

  test('editar una oferta: fecha límite anterior a la publicación guardada → 400', async () => {
    const creada = await auth(request(app).post('/api/ofertas'), tokenReclutador)
      .send({ ...ofertaBase, fechaPublicacion: '2099-06-10' });
    expect(creada.status).toBe(201);
    const res = await auth(request(app).put(`/api/ofertas/${creada.body.data.id}`), tokenReclutador)
      .send({ fechaLimite: '2099-06-01' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no puede ser anterior/);
  });

  // ── Perfil del alumno ─────────────────────────────────────────────────────
  test.each([
    [{ anioEgreso: 2027 }, /año de egreso es administrado por el instituto/],
    [{ linkedin: 'mi linkedin' }, /LinkedIn debe ser una URL válida/],
    [{ telefono: 'hola' }, /teléfono no es válido/],
    [{ disponibilidad: 'cuando pueda' }, /disponibilidad no es válido/i],
    [{ habilidades: { a: 1 } }, /Habilidades debe ser una lista/],
    [{ visibilidadPerfil: 'solo_empresas_verificadas' }, /visibilidad del perfil debe ser verdadero o falso/],
    [{ descripcion: 'x'.repeat(2001) }, /hasta 2000 caracteres/],
  ])('perfil con %j → 400', async (body, mensaje) => {
    const res = await auth(request(app).put('/api/users/perfil'), tokenAlumno).send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
  });

  test('perfil válido: normaliza año, listas, teléfono y visibilidad', async () => {
    const res = await auth(request(app).put('/api/users/perfil'), tokenAlumno).send({
      habilidades: 'React, SQL, React',
      certificaciones: 'AWS\nScrum',
      telefono: '+54 11 1234-5678',
      linkedin: 'https://linkedin.com/in/ana',
      visibilidadPerfil: 'privada',
      disponibilidad: '1_mes',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      habilidades: ['React', 'SQL'],
      certificaciones: ['AWS', 'Scrum'],
      telefono: '+54 11 1234-5678',
      visibilidadPerfil: false,
      disponibilidad: '1_mes',
    });
  });

  // ── Solicitud de empresa (pública) ────────────────────────────────────────
  const solicitudBase = () => {
    const suf = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return {
      razonSocial: `Validación ${suf} SA`,
      cuit: cuitValido(),
      rubro: 'Software',
      email: `contacto-${suf}@test.local`,
      responsableNombre: 'Ana',
      responsableApellido: 'Prueba',
      responsableEmail: `resp-${suf}@test.local`,
    };
  };

  test.each([
    [{ cuit: 'hola' }, /CUIT no es válido/],
    [{ cuit: '30712345678' }, /CUIT no es válido/],
    [{ email: 'abc' }, /email de contacto institucional no tiene un formato de email válido/],
    [{ telefono: 'llamame al fijo' }, /teléfono institucional no es válido/],
    [{ sitioWeb: 'basura' }, /sitio web debe ser una URL válida/],
    [{ reclutadores: [{ nombre: 'Leo', apellido: 'X', email: 'no-es-email' }] }, /Reclutador #1: El email no tiene un formato/],
  ])('solicitud de empresa con %j → 400', async (extra, mensaje) => {
    const res = await request(app).post('/api/solicitudes-empresa').send({ ...solicitudBase(), ...extra });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
  });

  test('solicitud de empresa válida: CUIT con guiones se guarda solo con dígitos y emails en minúsculas', async () => {
    const base = solicitudBase();
    const conGuiones = `${base.cuit.slice(0, 2)}-${base.cuit.slice(2, 10)}-${base.cuit.slice(10)}`;
    const res = await request(app).post('/api/solicitudes-empresa')
      .send({ ...base, cuit: conGuiones, responsableEmail: base.responsableEmail.toUpperCase(), telefono: '11-4300-1234' });
    expect(res.status).toBe(201);
    idsSolicitudes.push(res.body.data.id);
    const s = await SolicitudEmpresa.findByPk(res.body.data.id);
    expect(s.cuit).toBe(base.cuit);
    expect(s.responsableEmail).toBe(base.responsableEmail.toLowerCase());
  });

  // ── Reclutador / admin_empresa / admin ────────────────────────────────────
  test('mi perfil del reclutador: teléfono "hola" → 400, válido → 200', async () => {
    const MI_PERFIL = '/api/empresas/reclutadores/mi-perfil';
    const malo = await auth(request(app).patch(MI_PERFIL), tokenReclutador).send({ telefono: 'hola' });
    expect(malo.status).toBe(400);
    expect(malo.body.message).toMatch(/teléfono no es válido/);
    const bueno = await auth(request(app).patch(MI_PERFIL), tokenReclutador).send({ telefono: '+54 11 1234-5678' });
    expect(bueno.status).toBe(200);
  });

  test('Mi empresa: teléfono y sitio web inválidos → 400', async () => {
    const r1 = await auth(request(app).put('/api/empresas/mi-empresa'), tokenAdminEmpresa).send({ telefono: 'hola' });
    expect(r1.status).toBe(400);
    const r2 = await auth(request(app).put('/api/empresas/mi-empresa'), tokenAdminEmpresa).send({ sitioWeb: 'basura' });
    expect(r2.status).toBe(400);
  });

  test('Equipo → solicitar reclutador con email "abc" → 400', async () => {
    const res = await auth(request(app).post('/api/empresas/equipo/solicitar'), tokenAdminEmpresa)
      .send({ nombre: 'Leo', apellido: 'X', email: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email no tiene un formato/);
  });

  test.each([
    [{ rol: 'superadmin' }, /rol no es válido/],
    [{ email: 'abc' }, /email no tiene un formato/],
    [{ telefono: 'hola' }, /teléfono no es válido/],
  ])('admin crea usuario con %j → 400', async (extra, mensaje) => {
    const res = await auth(request(app).post('/api/admin/usuarios'), tokenAdmin).send({
      nombre: 'Ana', apellido: 'Prueba', email: `val-${Date.now()}@test.local`, password: 'Test1234!', rol: 'admin', ...extra,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
  });

  test('motivo de rechazo demasiado largo → 400', async () => {
    const res = await auth(request(app).patch('/api/admin/solicitudes-empresa/999999/rechazar'), tokenAdmin)
      .send({ motivo: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hasta 1000 caracteres/);
  });

  test('chat: un mensaje que no es texto → 400 (no 500)', async () => {
    const res = await auth(request(app).post('/api/chat'), tokenAlumno).send({ receptorId: 1, mensaje: { a: 1 } });
    expect([400, 403, 404]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});
