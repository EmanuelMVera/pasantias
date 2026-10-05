'use strict';

/**
 * alumnoCierre.test.js — cierre del perfil Alumno/Egresado y catálogo único.
 *
 * - datos institucionales protegidos (carrera, año de egreso, legajo, nombre…);
 * - completitud sin campos institucionales;
 * - CV: la fuente de verdad es el Archivo (cvArchivoId), no cvPath;
 * - KPI "En proceso" y filtro ?grupo=en_proceso;
 * - catálogo de carreras: endpoint, ofertas, solicitud de empresa y CSV.
 */

const request = require('supertest');
const app = require('../src/app');
const { Perfil } = require('../src/models');
const { CARRERAS } = require('../src/services/catalogo.service');
const { calcularCompletitud, CAMPOS_COMPLETITUD } = require('../src/services/perfil.service');
const { validarFilaCsv } = require('../src/validators/csvImport.validator');
const {
  crearAlumno, crearEmpresaConAdmin, agregarReclutador, crearOferta, crearPostulacion, loginYObtenerToken, cuitValido,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('Cierre del perfil Alumno/Egresado', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    if (idsSolicitudes.length) await limpiarSolicitudesEmpresa(idsSolicitudes);
    await cerrarConexion();
  });

  async function alumnoConToken(overrides) {
    const { usuario, passwordPlana } = await crearAlumno(overrides);
    idsUsuarios.push(usuario.id);
    return { usuario, token: await loginYObtenerToken(usuario.email, passwordPlana) };
  }

  // ── Datos institucionales ────────────────────────────────────────────────
  test.each([
    ['carrera', 'Tecnicatura en Mecánica', /carrera es administrado por el instituto/],
    ['anioEgreso', 2020, /año de egreso es administrado por el instituto/],
    ['legajo', 'X-999', /legajo es administrado por el instituto/],
    ['nombre', 'Otro', /nombre es administrado por el instituto/],
    ['email', 'otro@test.local', /email es administrado por el instituto/],
    ['rol', 'egresado', /condición \(alumno\/egresado\) es administrado/],
  ])('el alumno no puede modificar %s (400) y no se guarda', async (campo, valor, mensaje) => {
    const { usuario, token } = await alumnoConToken({ perfil: { carrera: CARRERAS[0], legajo: `L${String(Date.now()).slice(-8)}${campo.slice(0, 3)}` } });
    const res = await auth(request(app).put('/api/users/perfil'), token).send({ [campo]: valor, descripcion: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(mensaje);
    const perfil = await Perfil.findOne({ where: { usuarioId: usuario.id } });
    expect(perfil.carrera).toBe(CARRERAS[0]);
    expect(perfil.descripcion).toBeNull(); // el request entero se rechaza
  });

  test('el teléfono sí es editable; GET devuelve los institucionales de solo lectura', async () => {
    const { usuario, token } = await alumnoConToken({ perfil: { carrera: CARRERAS[0], legajo: `T${String(Date.now()).slice(-9)}` } });
    const res = await auth(request(app).put('/api/users/perfil'), token).send({ telefono: '+54 11 1234-5678' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      telefono: '+541112345678',
      nombre: usuario.nombre,
      email: usuario.email,
      rol: 'alumno',
      carrera: CARRERAS[0],
      datosInstitucionalesFaltantes: [],
    });
  });

  test('si falta información académica se informa aparte (no es un pendiente del alumno)', async () => {
    const { token } = await alumnoConToken({ perfil: { carrera: null, legajo: null } });
    const res = await auth(request(app).get('/api/users/perfil'), token);
    expect(res.body.data.datosInstitucionalesFaltantes).toEqual(['carrera', 'legajo']);
  });

  // ── Completitud ──────────────────────────────────────────────────────────
  test('la completitud no cuenta campos institucionales: un perfil completo sin carrera ni legajo es 100%', () => {
    const nombres = CAMPOS_COMPLETITUD.map(([n]) => n);
    expect(nombres).not.toEqual(expect.arrayContaining(['carrera']));
    expect(nombres).not.toContain('anioEgreso');
    expect(nombres).not.toContain('legajo');
    const perfil = {
      carrera: null, legajo: null,
      descripcion: 'd', habilidades: ['a'], idiomas: ['b'], linkedin: 'l', github: 'g', cvArchivoId: 'uuid',
      areaInteres: 'a', disponibilidad: 'inmediata', fotoPerfil: 'f', portfolio: 'p',
      experienciaLaboral: 'e', certificaciones: ['c'],
    };
    expect(calcularCompletitud(perfil, { telefono: '1', ubicacion: 'u' })).toBe(100);
  });

  // ── CV: fuente de verdad ─────────────────────────────────────────────────
  test('un cvPath sin Archivo NO cuenta como CV: no suma al %, cvCargado=false y no puede postularse', async () => {
    const { token } = await alumnoConToken({ perfil: { cvArchivoId: null, cvPath: '/uploads/cv_legacy.pdf' } });
    const { empresa } = await crearEmpresaConAdmin();
    const oferta = await crearOferta(empresa);

    const perfil = await auth(request(app).get('/api/users/perfil'), token);
    expect(perfil.body.data.cvCargado).toBe(false);
    const sinCv = perfil.body.data.perfilCompleto;

    const detalle = await auth(request(app).get(`/api/ofertas/${oferta.id}`), token);
    expect(detalle.body.data.cvCargado).toBe(false);

    const post = await auth(request(app).post('/api/postulaciones'), token).send({ ofertaId: oferta.id });
    expect(post.status).toBe(400);
    expect(post.body.code).toBe('CV_REQUERIDO');

    const { token: conCv } = await alumnoConToken();
    const otro = await auth(request(app).get('/api/users/perfil'), conCv);
    expect(otro.body.data.cvCargado).toBe(true);
    expect(otro.body.data.perfilCompleto).toBeGreaterThan(sinCv);
  });

  // ── KPI "En proceso" y ?grupo=en_proceso ─────────────────────────────────
  test('"En proceso" suma en revisión + preseleccionado y el filtro ?grupo=en_proceso trae solo esos', async () => {
    const { usuario, token } = await alumnoConToken();
    const { empresa } = await crearEmpresaConAdmin();
    const estados = ['en_revision', 'preseleccionado', 'entrevista', 'contratado', 'rechazado'];
    for (const estado of estados) {
      const oferta = await crearOferta(empresa);
      await crearPostulacion(usuario, oferta, { estado });
    }

    const dash = await auth(request(app).get('/api/students/dashboard'), token);
    expect(dash.body.data).toMatchObject({ enProceso: 2, entrevistas: 1, contrataciones: 1, totalPostulaciones: 5 });

    const grupo = await auth(request(app).get('/api/postulaciones/mis?grupo=en_proceso'), token);
    expect(grupo.status).toBe(200);
    expect(grupo.body.data.map((p) => p.estado).sort()).toEqual(['en_revision', 'preseleccionado']);

    const invalido = await auth(request(app).get('/api/postulaciones/mis?grupo=todo'), token);
    expect(invalido.status).toBe(400);
  });

  // ── Catálogo de carreras ─────────────────────────────────────────────────
  test('GET /api/catalogos/carreras (público) devuelve el catálogo institucional', async () => {
    const res = await request(app).get('/api/catalogos/carreras');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([...CARRERAS]);
    expect(res.body.data).toContain('Tecnicatura Superior en Programación');
    expect(res.body.data).not.toContain('Enfermería');
  });

  test('ofertas: carrerasDestinatarias del catálogo se aceptan; una inventada se rechaza', async () => {
    const { empresa } = await crearEmpresaConAdmin();
    const { usuarioReclutador, passwordPlana } = await agregarReclutador(empresa);
    idsUsuarios.push(usuarioReclutador.id);
    const token = await loginYObtenerToken(usuarioReclutador.email, passwordPlana);
    const base = { titulo: 'Oferta catálogo', descripcion: 'd', tipoPuesto: 'trainee' };

    const ok = await auth(request(app).post('/api/ofertas'), token).send({ ...base, carrerasDestinatarias: [CARRERAS[0], CARRERAS[1]] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.carrerasDestinatarias).toEqual([CARRERAS[0], CARRERAS[1]]);

    const mal = await auth(request(app).post('/api/ofertas'), token).send({ ...base, carrerasDestinatarias: ['Carrera inventada'] });
    expect(mal.status).toBe(400);
  });

  test('solicitud de empresa: carrerasInteres solo del catálogo', async () => {
    const suf = `${Date.now()}`;
    const base = {
      razonSocial: `Catálogo ${suf} SA`, cuit: cuitValido(), rubro: 'Software',
      email: `c-${suf}@test.local`, responsableNombre: 'A', responsableApellido: 'B', responsableEmail: `r-${suf}@test.local`,
    };
    const mal = await request(app).post('/api/solicitudes-empresa').send({ ...base, carrerasInteres: ['Enfermería'] });
    expect(mal.status).toBe(400);
    expect(mal.body.message).toMatch(/Carreras de interés: valores no válidos/);

    const ok = await request(app).post('/api/solicitudes-empresa').send({ ...base, carrerasInteres: [CARRERAS[2]] });
    expect(ok.status).toBe(201);
    idsSolicitudes.push(ok.body.data.id);
  });

  test.each([
    [CARRERAS[0], true],
    ['', true], // la carrera es opcional en el CSV
    ['Tecnicatura en Programación', false], // typo / nombre viejo: no se crea sola
    ['Enfermería', false],
  ])('CSV: carrera %p → válida=%p', (carrera, esperado) => {
    const { ok, errores } = validarFilaCsv({
      legajo: 'TSP-2025-0001', nombre: 'A', apellido: 'B', email: 'a@b.com', rol: 'alumno', carrera, anioEgreso: '',
    }, /^[A-Z0-9-]+$/);
    expect(ok).toBe(esperado);
    if (!esperado) expect(errores.join(' ')).toMatch(/no pertenece al catálogo institucional/);
  });
});
