'use strict';

/**
 * empresaAdmin.test.js — perfil Administrador de Empresa (supervisión).
 *
 * - Dashboard: reclutadores activos, solicitudes pendientes, top global de
 *   ofertas por postulaciones y ofertas recientes con responsable.
 * - /mis-ofertas y /candidatos: filtros server-side (antes de paginar) y
 *   responsable de la oferta.
 * - Perfil público: solo ofertas visibles (activa + moderación resuelta).
 * - Notificaciones: la nueva postulación va al reclutador responsable (no al
 *   admin_empresa); fallback al admin_empresa si la oferta no tiene un
 *   responsable válido. La moderación de una oferta avisa a ambos.
 * - Contraseña: mínimo 8 en cambiar, restablecer y alta/edición por el admin.
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const { Notificacion, SolicitudReclutador, Usuario } = require('../src/models');
const authService = require('../src/services/auth.service');
const { PASSWORD_MIN_LENGTH } = require('../src/utils/password');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, agregarReclutador,
  crearOferta, crearPostulacion, loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

// Las notificaciones a veces se crean fire-and-forget: se reintenta la lectura.
async function esperarNotificacion(where, intentos = 30, delayMs = 50) {
  for (let i = 0; i < intentos; i++) {
    const notif = await Notificacion.findOne({ where, order: [['id', 'DESC']] });
    if (notif) return notif;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

describe('ADMIN DE EMPRESA — supervisión', () => {
  const idsUsuarios = [];
  const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`);

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  /** Empresa con admin + 2 reclutadores (uno suspendido aparte) + ofertas y postulaciones. */
  async function escenario() {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    const { usuarioReclutador: rec1 } = await agregarReclutador(empresa);
    const { usuarioReclutador: rec2 } = await agregarReclutador(empresa);
    const { usuarioReclutador: recSusp, membresia: memSusp } = await agregarReclutador(empresa);
    await memSusp.update({ activo: false });
    idsUsuarios.push(usuarioAdmin.id, rec1.id, rec2.id, recSusp.id);

    const suf = crypto.randomUUID().slice(0, 6);
    const backend = await crearOferta(empresa, { titulo: `Backend Zeta ${suf}`, area: 'Programación', creadaPorUsuarioId: rec1.id });
    const datos = await crearOferta(empresa, { titulo: `Datos Omega ${suf}`, area: 'Datos', creadaPorUsuarioId: rec2.id, estado: 'pausada' });
    const pendiente = await crearOferta(empresa, { titulo: `QA Pendiente ${suf}`, area: 'Testing', creadaPorUsuarioId: rec1.id, estadoModeracion: 'pendiente' });
    const legacy = await crearOferta(empresa, { titulo: `Legacy Sigma ${suf}`, area: 'Soporte', estado: 'cerrada' });

    const alumnos = [];
    for (let i = 0; i < 4; i++) {
      const { usuario } = await crearAlumno();
      idsUsuarios.push(usuario.id);
      alumnos.push(usuario);
    }
    // backend: 3 postulaciones · datos: 1 · pendiente: 0 · legacy: 1
    await crearPostulacion(alumnos[0], backend, { estado: 'en_revision' });
    await crearPostulacion(alumnos[1], backend, { estado: 'entrevista' });
    await crearPostulacion(alumnos[2], backend, { estado: 'contratado' });
    await crearPostulacion(alumnos[0], datos, { estado: 'preseleccionado' });
    await crearPostulacion(alumnos[3], legacy, { estado: 'rechazado' });

    await SolicitudReclutador.create({
      empresaId: empresa.id, nombre: 'Pend', apellido: 'Iente', email: `pend-${suf}@test.local`, estado: 'pendiente',
    });

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    return { usuarioAdmin, empresa, rec1, rec2, recSusp, backend, datos, pendiente, legacy, alumnos, token, suf };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  test('dashboard: reclutadores activos, solicitudes pendientes, top global y recientes con responsable', async () => {
    const e = await escenario();
    const res = await get('/api/empresas/dashboard', e.token);
    expect(res.status).toBe(200);
    const d = res.body.data;

    // totalMiembros conserva su significado (admin + 2 reclutadores activos).
    expect(d.equipo.totalMiembros).toBe(3);
    expect(d.equipo.reclutadoresActivos).toBe(2); // el suspendido y el admin no cuentan
    expect(d.equipo.solicitudesPendientes).toBe(1);

    expect(d.ofertas).toMatchObject({ activas: 2, pausadas: 1, cerradas: 1, pendienteModeracion: 1, total: 4 });
    expect(d.postulaciones).toMatchObject({ total: 5, enRevision: 1, preseleccionados: 1, entrevistas: 1, contrataciones: 1 });

    // Top: solo ofertas con postulaciones, ordenadas por cantidad.
    expect(d.topOfertasPostulaciones[0]).toMatchObject({ id: e.backend.id, totalPostulaciones: 3 });
    expect(d.topOfertasPostulaciones[0].creadaPor).toMatchObject({ id: e.rec1.id });
    expect(d.topOfertasPostulaciones.map((o) => o.id)).not.toContain(e.pendiente.id);
    expect(d.topOfertasPostulaciones).toHaveLength(3);

    expect(d.ofertasRecientes.length).toBeLessThanOrEqual(5);
    const reciente = d.ofertasRecientes.find((o) => o.id === e.backend.id);
    expect(reciente.totalPostulaciones).toBe(3);
    expect(reciente.creadaPor).toMatchObject({ id: e.rec1.id });
    expect(d.ofertasRecientes.find((o) => o.id === e.legacy.id).creadaPor).toBeNull();
  });

  test('dashboard: el top de ofertas es global, no depende de la paginación de mis-ofertas', async () => {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    // La oferta más antigua es la única con postulaciones: queda fuera de la página 1 (limit 2).
    const vieja = await crearOferta(empresa, { titulo: 'La más antigua' });
    await crearPostulacion(alumno, vieja);
    for (let i = 0; i < 3; i++) await crearOferta(empresa, { titulo: `Nueva ${i}` });

    const token = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    const pagina1 = await get('/api/empresas/mis-ofertas?limit=2', token);
    expect(pagina1.body.data.map((o) => o.id)).not.toContain(vieja.id);

    const dash = await get('/api/empresas/dashboard', token);
    expect(dash.body.data.topOfertasPostulaciones).toEqual([
      expect.objectContaining({ id: vieja.id, totalPostulaciones: 1 }),
    ]);
  });

  // ── Ofertas: filtros server-side ───────────────────────────────────────────
  test('mis-ofertas: filtra por estado, moderación, responsable y texto antes de paginar', async () => {
    const e = await escenario();
    const ids = async (qs) => {
      const res = await get(`/api/empresas/mis-ofertas?${qs}`, e.token);
      expect(res.status).toBe(200);
      return { ids: res.body.data.map((o) => o.id), total: res.body.pagination.total, data: res.body.data };
    };

    expect((await ids('estado=pausada')).ids).toEqual([e.datos.id]);
    expect((await ids('estadoModeracion=pendiente')).ids).toEqual([e.pendiente.id]);

    const deRec1 = await ids(`responsable=${e.rec1.id}`);
    expect(deRec1.ids.sort()).toEqual([e.backend.id, e.pendiente.id].sort());
    expect(deRec1.total).toBe(2);

    expect((await ids('responsable=sin')).ids).toEqual([e.legacy.id]);
    expect((await ids(`q=${encodeURIComponent('zeta')}`)).ids).toEqual([e.backend.id]);          // título
    expect((await ids(`q=${encodeURIComponent('Soporte')}`)).ids).toEqual([e.legacy.id]);        // área
    expect((await ids(`q=${encodeURIComponent(e.rec2.apellido)}`)).ids).toEqual([e.datos.id]);   // responsable

    // Combinados + el total refleja el filtro (no la empresa entera).
    const combinado = await ids(`responsable=${e.rec1.id}&estadoModeracion=aprobada&limit=1`);
    expect(combinado.ids).toEqual([e.backend.id]);
    expect(combinado.total).toBe(1);
    expect(combinado.data[0]).toMatchObject({ totalPostulaciones: 3 });
    expect(combinado.data[0].creadaPor).toMatchObject({ id: e.rec1.id });

    // Valores inválidos no filtran ni rompen; el comodín % no se interpreta.
    expect((await ids('estado=cualquiera&estadoModeracion=x&responsable=abc')).total).toBe(4);
    expect((await ids(`q=${encodeURIComponent('%')}`)).total).toBe(0);
  });

  test('mis-ofertas: otra empresa no ve estas ofertas aunque filtre por ese responsable', async () => {
    const e = await escenario();
    const otra = await crearEmpresaConAdmin();
    idsUsuarios.push(otra.usuarioAdmin.id);
    const tokenOtra = await loginYObtenerToken(otra.usuarioAdmin.email, otra.passwordPlana);
    const res = await get(`/api/empresas/mis-ofertas?responsable=${e.rec1.id}`, tokenOtra);
    expect(res.body.data).toEqual([]);
  });

  // ── Candidatos ─────────────────────────────────────────────────────────────
  test('candidatos: incluye el responsable de la oferta y filtra por responsable, oferta y estado', async () => {
    const e = await escenario();

    const todos = await get('/api/empresas/candidatos', e.token);
    expect(todos.status).toBe(200);
    expect(todos.body.pagination.total).toBe(5);
    const deBackend = todos.body.data.find((p) => p.oferta.id === e.backend.id);
    expect(deBackend.oferta.creadaPorUsuarioId).toBe(e.rec1.id);
    expect(deBackend.oferta.creadaPor).toMatchObject({ id: e.rec1.id, nombre: e.rec1.nombre });
    expect(todos.body.data.find((p) => p.oferta.id === e.legacy.id).oferta.creadaPor).toBeNull();

    const porResp = await get(`/api/empresas/candidatos?responsable=${e.rec1.id}`, e.token);
    expect(porResp.body.pagination.total).toBe(3);
    expect(porResp.body.data.every((p) => p.oferta.id === e.backend.id)).toBe(true);
    // conteoPorEstado sigue el alcance filtrado (no la empresa entera).
    expect(porResp.body.conteoPorEstado).toEqual({ en_revision: 1, entrevista: 1, contratado: 1 });

    const porRespYEstado = await get(`/api/empresas/candidatos?responsable=${e.rec1.id}&estado=entrevista`, e.token);
    expect(porRespYEstado.body.pagination.total).toBe(1);
    expect(porRespYEstado.body.conteoPorEstado).toEqual({ en_revision: 1, entrevista: 1, contratado: 1 });

    const porOferta = await get(`/api/empresas/candidatos?ofertaId=${e.datos.id}`, e.token);
    expect(porOferta.body.pagination.total).toBe(1);
    expect(porOferta.body.data[0].estado).toBe('preseleccionado');

    const sinResp = await get('/api/empresas/candidatos?responsable=sin', e.token);
    expect(sinResp.body.data.map((p) => p.oferta.id)).toEqual([e.legacy.id]);
  });

  test('candidatos: filtrar por una oferta de otra empresa no devuelve nada', async () => {
    const e = await escenario();
    const otra = await crearEmpresaConAdmin();
    idsUsuarios.push(otra.usuarioAdmin.id);
    const tokenOtra = await loginYObtenerToken(otra.usuarioAdmin.email, otra.passwordPlana);
    const res = await get(`/api/empresas/candidatos?ofertaId=${e.backend.id}`, tokenOtra);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  // ── RBAC: el admin_empresa supervisa, no opera ─────────────────────────────
  test('admin_empresa no edita ofertas ni gestiona candidatos; el reclutador responsable sí', async () => {
    const e = await escenario();
    const postulacion = (await get(`/api/empresas/candidatos?ofertaId=${e.backend.id}&estado=en_revision`, e.token)).body.data[0];

    const editar = await request(app).put(`/api/ofertas/${e.backend.id}`)
      .set('Authorization', `Bearer ${e.token}`).send({ titulo: 'Cambiado por el admin' });
    expect(editar.status).toBe(403);
    expect(editar.body.code).toBe('ROL_INSUFICIENTE');

    const crear = await request(app).post('/api/ofertas')
      .set('Authorization', `Bearer ${e.token}`).send({ titulo: 'Nueva', descripcion: 'x', tipoPuesto: 'pasante' });
    expect(crear.status).toBe(403);

    const mover = await request(app).patch(`/api/postulaciones/${postulacion.id}/estado`)
      .set('Authorization', `Bearer ${e.token}`).send({ estado: 'preseleccionado' });
    expect(mover.status).toBe(403);
    expect(mover.body.code).toBe('ROL_INSUFICIENTE');

    // Sí puede pausar una oferta que no creó (gobierno).
    const pausar = await request(app).patch(`/api/ofertas/${e.backend.id}/estado`)
      .set('Authorization', `Bearer ${e.token}`).send({ estado: 'pausada' });
    expect(pausar.status).toBe(200);

    const tokenRec1 = await loginYObtenerToken(e.rec1.email);
    const moverRec = await request(app).patch(`/api/postulaciones/${postulacion.id}/estado`)
      .set('Authorization', `Bearer ${tokenRec1}`).send({ estado: 'preseleccionado' });
    expect(moverRec.status).toBe(200);
  });

  // ── Perfil público ─────────────────────────────────────────────────────────
  test('perfil público: solo lista ofertas activas con moderación resuelta', async () => {
    const e = await escenario();
    const rechazada = await crearOferta(e.empresa, { titulo: `Rechazada ${e.suf}`, estadoModeracion: 'rechazada' });
    const auto = await crearOferta(e.empresa, { titulo: `Auto ${e.suf}`, estadoModeracion: 'auto_aprobada' });

    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const tokenAlumno = await loginYObtenerToken(alumno.email, passwordPlana);

    const res = await get(`/api/empresas/${e.empresa.id}`, tokenAlumno);
    expect(res.status).toBe(200);
    const ids = res.body.data.ofertas.map((o) => o.id);
    expect(ids).toContain(e.backend.id);      // activa + aprobada
    expect(ids).toContain(auto.id);           // activa + publicación automática
    expect(ids).not.toContain(e.pendiente.id); // pendiente de moderación
    expect(ids).not.toContain(rechazada.id);
    expect(ids).not.toContain(e.datos.id);     // pausada
    expect(ids).not.toContain(e.legacy.id);    // cerrada
  });

  // ── Notificaciones: operación vs. gobierno ─────────────────────────────────
  async function postular(oferta) {
    const { usuario: alumno, passwordPlana } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const token = await loginYObtenerToken(alumno.email, passwordPlana);
    const res = await request(app).post('/api/postulaciones')
      .set('Authorization', `Bearer ${token}`).send({ ofertaId: oferta.id });
    expect(res.status).toBe(201);
    return alumno;
  }
  const notifsPostulacion = (usuarioId) => Notificacion.count({ where: { usuarioId, tipo: 'postulacion' } });

  test('nueva postulación: notifica al reclutador responsable y NO al admin_empresa', async () => {
    const e = await escenario();
    const alumno = await postular(e.backend);

    const notif = await esperarNotificacion({ usuarioId: e.rec1.id, tipo: 'postulacion' });
    expect(notif).not.toBeNull();
    expect(notif.titulo).toBe('Nueva postulación recibida');
    expect(notif.mensaje).toContain(alumno.apellido);
    expect(notif.accionURL).toBe(`/empresa/postulantes/${e.backend.id}`);

    expect(await notifsPostulacion(e.usuarioAdmin.id)).toBe(0);
    expect(await notifsPostulacion(e.rec2.id)).toBe(0); // otro reclutador: tampoco
  });

  test('nueva postulación en oferta legacy (sin responsable): fallback al admin_empresa', async () => {
    const e = await escenario();
    const legacyActiva = await crearOferta(e.empresa, { titulo: `Legacy activa ${e.suf}` });
    await postular(legacyActiva);

    expect(await esperarNotificacion({ usuarioId: e.usuarioAdmin.id, tipo: 'postulacion' })).not.toBeNull();
    expect(await notifsPostulacion(e.rec1.id)).toBe(0);
    expect(await notifsPostulacion(e.rec2.id)).toBe(0);
  });

  test('nueva postulación: si el responsable fue suspendido o no es reclutador, va al admin_empresa', async () => {
    const e = await escenario();
    const deSuspendido = await crearOferta(e.empresa, { titulo: `De suspendido ${e.suf}`, creadaPorUsuarioId: e.recSusp.id });
    await postular(deSuspendido);
    expect(await esperarNotificacion({ usuarioId: e.usuarioAdmin.id, tipo: 'postulacion' })).not.toBeNull();
    expect(await notifsPostulacion(e.recSusp.id)).toBe(0);

    // Oferta cuyo "creador" es el propio admin_empresa (datos históricos/demo).
    await Notificacion.destroy({ where: { usuarioId: e.usuarioAdmin.id } });
    const deAdmin = await crearOferta(e.empresa, { titulo: `De admin ${e.suf}`, creadaPorUsuarioId: e.usuarioAdmin.id });
    await postular(deAdmin);
    expect(await esperarNotificacion({ usuarioId: e.usuarioAdmin.id, tipo: 'postulacion' })).not.toBeNull();
    expect(await notifsPostulacion(e.usuarioAdmin.id)).toBe(1); // una sola, sin duplicar
  });

  test('moderación de una oferta: avisa al admin_empresa y al reclutador responsable', async () => {
    const e = await escenario();
    const { usuario: adminSistema, passwordPlana } = await crearAdmin();
    idsUsuarios.push(adminSistema.id);
    const tokenSistema = await loginYObtenerToken(adminSistema.email, passwordPlana);

    const res = await request(app).patch(`/api/admin/ofertas/${e.pendiente.id}/moderar`)
      .set('Authorization', `Bearer ${tokenSistema}`).send({ accion: 'aprobar' });
    expect(res.status).toBe(200);

    const alAdmin = await esperarNotificacion({ usuarioId: e.usuarioAdmin.id, tipo: 'oferta' });
    const alReclutador = await esperarNotificacion({ usuarioId: e.rec1.id, tipo: 'oferta' });
    expect(alAdmin).not.toBeNull();
    expect(alAdmin.accionURL).toBe('/empresa/ofertas');
    expect(alReclutador).not.toBeNull();
    expect(alReclutador.titulo).toContain('aprobada');
    expect(await Notificacion.count({ where: { usuarioId: e.rec2.id, tipo: 'oferta' } })).toBe(0);
  });

  // ── Contraseña: mínimo 8 ───────────────────────────────────────────────────
  test('la regla única es 8 caracteres', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  test('cambiar contraseña rechaza menos de 8 caracteres y acepta 8', async () => {
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);
    const cambiar = (nuevaPassword) => request(app).put('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${token}`).send({ passwordActual: passwordPlana, nuevaPassword });

    const corta = await cambiar('Abc123!'); // 7
    expect(corta.status).toBe(400);
    expect(corta.body.message).toMatch(/al menos 8 caracteres/);

    expect((await cambiar('Abc1234!')).status).toBe(200); // 8
  });

  test('restablecer contraseña rechaza menos de 8 caracteres', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const tokenPlano = crypto.randomBytes(32).toString('hex');
    await Usuario.update({
      tokenReset: authService.hashTokenReset(tokenPlano),
      tokenResetExpira: new Date(Date.now() + 3600_000),
      tokenResetUsadoEn: null,
    }, { where: { id: usuario.id } });

    const corta = await request(app).post(`/api/auth/reset-password/${tokenPlano}`).send({ password: '1234567' });
    expect(corta.status).toBe(400);
    expect(corta.body.message).toMatch(/al menos 8 caracteres/);

    // El token no se consumió con el intento inválido.
    const ok = await request(app).post(`/api/auth/reset-password/${tokenPlano}`).send({ password: '12345678' });
    expect(ok.status).toBe(200);
  });

  test('alta y edición de usuarios desde el admin exigen contraseña de 8+', async () => {
    const { usuario: adminSistema, passwordPlana } = await crearAdmin();
    idsUsuarios.push(adminSistema.id);
    const token = await loginYObtenerToken(adminSistema.email, passwordPlana);
    const suf = crypto.randomUUID().slice(0, 8);
    const base = { nombre: 'Nuevo', apellido: 'Usuario', email: `nuevo-${suf}@test.local`, rol: 'empresa' };

    const corta = await request(app).post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${token}`).send({ ...base, password: 'corta12' });
    expect(corta.status).toBe(400);
    expect(corta.body.message).toMatch(/al menos 8 caracteres/);
    expect(await Usuario.findOne({ where: { email: base.email } })).toBeNull();

    const ok = await request(app).post('/api/admin/usuarios')
      .set('Authorization', `Bearer ${token}`).send({ ...base, password: 'Larga123' });
    expect(ok.status).toBe(201);
    const creado = await Usuario.findOne({ where: { email: base.email } });
    idsUsuarios.push(creado.id);

    const editarCorta = await request(app).put(`/api/admin/usuarios/${creado.id}`)
      .set('Authorization', `Bearer ${token}`).send({ password: '1234567' });
    expect(editarCorta.status).toBe(400);

    // Editar sin tocar la contraseña sigue funcionando.
    const editarSinPass = await request(app).put(`/api/admin/usuarios/${creado.id}`)
      .set('Authorization', `Bearer ${token}`).send({ telefono: '11-5555-0000' });
    expect(editarSinPass.status).toBe(200);
  });

});
