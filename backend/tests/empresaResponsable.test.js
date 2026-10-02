'use strict';

/**
 * empresaResponsable.test.js — cierre del perfil Administrador de Empresa.
 *
 * - PATCH /api/empresas/ofertas/:id/responsable: el admin_empresa asigna o
 *   cambia el reclutador responsable de una oferta (solo reclutadores activos
 *   de su empresa), sin tocar el contenido ni las postulaciones. Notifica al
 *   nuevo responsable (y al anterior si sigue activo) y deja auditoría.
 * - GET /api/empresas/reclutadores/:id/perfil: ficha de contacto de un
 *   reclutador, visible solo para quien tiene relación con él.
 */

const request = require('supertest');
const app = require('../src/app');
const { Notificacion, ActivityLog, Oferta, Postulacion } = require('../src/models');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, agregarReclutador,
  crearOferta, crearPostulacion, loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

// Notificaciones y auditoría pueden escribirse fire-and-forget: se reintenta la lectura.
async function esperar(buscar, intentos = 30, delayMs = 50) {
  for (let i = 0; i < intentos; i++) {
    const fila = await buscar();
    if (fila) return fila;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

describe('RESPONSABLE DE OFERTA Y PERFIL DE RECLUTADOR', () => {
  const idsUsuarios = [];
  const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
  const asignar = (token, ofertaId, body) => auth(
    request(app).patch(`/api/empresas/ofertas/${ofertaId}/responsable`), token,
  ).send(body);
  const perfil = (token, usuarioId) => auth(request(app).get(`/api/empresas/reclutadores/${usuarioId}/perfil`), token);

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  /** Empresa con admin + 2 reclutadores activos + 1 suspendido, y una oferta legacy sin responsable. */
  async function escenario() {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin();
    const { usuarioReclutador: rec1 } = await agregarReclutador(empresa, { telefono: '11-4555-2201', ubicacion: 'Lanús, Buenos Aires' });
    const { usuarioReclutador: rec2 } = await agregarReclutador(empresa);
    const { usuarioReclutador: recSusp, membresia: memSusp } = await agregarReclutador(empresa);
    await memSusp.update({ activo: false });
    idsUsuarios.push(usuarioAdmin.id, rec1.id, rec2.id, recSusp.id);

    const legacy = await crearOferta(empresa, { titulo: 'Oferta legacy sin responsable' });
    const tokenAdmin = await loginYObtenerToken(usuarioAdmin.email, passwordPlana);
    return { usuarioAdmin, empresa, rec1, rec2, recSusp, legacy, tokenAdmin, passwordPlana };
  }

  // ── Asignar / reasignar responsable ─────────────────────────────────────────

  test('admin_empresa asigna un reclutador de su empresa a una oferta sin responsable', async () => {
    const { usuarioAdmin, rec1, legacy, tokenAdmin } = await escenario();
    const antes = legacy.toJSON();

    const res = await asignar(tokenAdmin, legacy.id, { responsableId: rec1.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: legacy.id,
      creadaPorUsuarioId: rec1.id,
      creadaPor: { id: rec1.id, nombre: rec1.nombre, apellido: rec1.apellido },
      responsableAnterior: null,
    });

    // Solo cambió el responsable: el contenido y el estado de la oferta quedan igual.
    const despues = (await Oferta.findByPk(legacy.id)).toJSON();
    expect(despues.creadaPorUsuarioId).toBe(rec1.id);
    for (const campo of ['titulo', 'descripcion', 'estado', 'estadoModeracion', 'cantidadVacantes', 'empresaId']) {
      expect(despues[campo]).toEqual(antes[campo]);
    }

    // Notificación al nuevo responsable, con enlace a la vista operativa de la oferta.
    const notif = await esperar(() => Notificacion.findOne({ where: { usuarioId: rec1.id, titulo: 'Se te asignó una oferta' } }));
    expect(notif).not.toBeNull();
    expect(notif.mensaje).toContain(legacy.titulo);
    expect(notif.accionURL).toBe(`/empresa/postulantes/${legacy.id}`);
    // El admin_empresa que hizo la acción no se notifica a sí mismo.
    expect(await Notificacion.count({ where: { usuarioId: usuarioAdmin.id } })).toBe(0);

    // Auditoría con trazabilidad (quién, qué oferta, anterior y nuevo).
    const log = await esperar(() => ActivityLog.findOne({ where: { accion: 'asignar_responsable_oferta', entidadId: legacy.id } }));
    expect(log).not.toBeNull();
    expect(log.usuarioId).toBe(usuarioAdmin.id);
    expect(log.entidad).toBe('oferta');
    expect(log.detalle).toMatchObject({ responsableAnteriorId: null, responsableNuevoId: rec1.id });
  });

  test('admin_empresa reasigna: conserva las postulaciones y avisa al nuevo y al anterior', async () => {
    const { empresa, rec1, rec2, tokenAdmin } = await escenario();
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: rec1.id });
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const postulacion = await crearPostulacion(alumno, oferta, { estado: 'entrevista' });

    const res = await asignar(tokenAdmin, oferta.id, { responsableId: rec2.id });
    expect(res.status).toBe(200);
    expect(res.body.data.creadaPor.id).toBe(rec2.id);
    expect(res.body.data.responsableAnterior.id).toBe(rec1.id);

    const pDespues = await Postulacion.findByPk(postulacion.id);
    expect(pDespues.estado).toBe('entrevista');
    expect(pDespues.ofertaId).toBe(oferta.id);

    expect(await esperar(() => Notificacion.findOne({ where: { usuarioId: rec2.id, titulo: 'Se te asignó una oferta' } }))).not.toBeNull();
    const aviso = await esperar(() => Notificacion.findOne({ where: { usuarioId: rec1.id, titulo: 'Dejaste de ser responsable de una oferta' } }));
    expect(aviso).not.toBeNull();
    expect(aviso.mensaje).toContain(oferta.titulo);

    const log = await esperar(() => ActivityLog.findOne({ where: { accion: 'reasignar_responsable_oferta', entidadId: oferta.id } }));
    expect(log.detalle).toMatchObject({ responsableAnteriorId: rec1.id, responsableNuevoId: rec2.id });

    // Las vistas de supervisión reflejan al nuevo responsable.
    const ofertas = await auth(request(app).get(`/api/empresas/mis-ofertas?responsable=${rec2.id}`), tokenAdmin);
    expect(ofertas.body.data.map((o) => o.id)).toContain(oferta.id);
    const candidatos = await auth(request(app).get(`/api/empresas/candidatos?ofertaId=${oferta.id}`), tokenAdmin);
    expect(candidatos.body.data[0].oferta.creadaPor.id).toBe(rec2.id);
  });

  test('oferta con responsable suspendido: se puede reasignar y no se le avisa al suspendido', async () => {
    const { empresa, rec1, recSusp, tokenAdmin } = await escenario();
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: recSusp.id });

    const res = await asignar(tokenAdmin, oferta.id, { responsableId: rec1.id });
    expect(res.status).toBe(200);
    expect(res.body.data.responsableAnterior.id).toBe(recSusp.id);

    await esperar(() => Notificacion.findOne({ where: { usuarioId: rec1.id } }));
    expect(await Notificacion.count({ where: { usuarioId: recSusp.id } })).toBe(0);
  });

  test('un reclutador NO puede asignar ni reasignar responsables', async () => {
    const { rec1, rec2, legacy, passwordPlana } = await escenario();
    const tokenRec = await loginYObtenerToken(rec1.email, passwordPlana);

    const res = await asignar(tokenRec, legacy.id, { responsableId: rec2.id });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROL_INSUFICIENTE');
    expect((await Oferta.findByPk(legacy.id)).creadaPorUsuarioId).toBeNull();
  });

  test('rechaza responsables inválidos: otra empresa, suspendido, admin_empresa, alumno, admin del sistema, deshabilitado', async () => {
    const { usuarioAdmin, empresa, recSusp, legacy, tokenAdmin } = await escenario();
    const otra = await crearEmpresaConAdmin();
    const { usuarioReclutador: recOtra } = await agregarReclutador(otra.empresa);
    const { usuarioReclutador: recDeshab } = await agregarReclutador(empresa, { habilitado: false });
    const { usuario: alumno } = await crearAlumno();
    const { usuario: adminSistema } = await crearAdmin();
    idsUsuarios.push(otra.usuarioAdmin.id, recOtra.id, recDeshab.id, alumno.id, adminSistema.id);

    for (const invalido of [recOtra, recSusp, usuarioAdmin, alumno, adminSistema, recDeshab]) {
      const res = await asignar(tokenAdmin, legacy.id, { responsableId: invalido.id });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/reclutador activo de tu empresa/i);
    }
    for (const body of [{}, { responsableId: 'abc' }, { responsableId: null }, { responsableId: 999999999 }]) {
      expect((await asignar(tokenAdmin, legacy.id, body)).status).toBe(400);
    }
    expect((await Oferta.findByPk(legacy.id)).creadaPorUsuarioId).toBeNull();
    expect(await ActivityLog.count({ where: { entidad: 'oferta', entidadId: legacy.id } })).toBe(0);
  });

  test('rechaza asignar al reclutador que ya es responsable', async () => {
    const { empresa, rec1, tokenAdmin } = await escenario();
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: rec1.id });
    const res = await asignar(tokenAdmin, oferta.id, { responsableId: rec1.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ya es el responsable/i);
  });

  test('oferta de otra empresa u oferta inexistente → 404', async () => {
    const { rec1, tokenAdmin } = await escenario();
    const otra = await crearEmpresaConAdmin();
    idsUsuarios.push(otra.usuarioAdmin.id);
    const ofertaAjena = await crearOferta(otra.empresa);

    expect((await asignar(tokenAdmin, ofertaAjena.id, { responsableId: rec1.id })).status).toBe(404);
    expect((await Oferta.findByPk(ofertaAjena.id)).creadaPorUsuarioId).toBeNull();
    expect((await asignar(tokenAdmin, 999999999, { responsableId: rec1.id })).status).toBe(404);
    expect((await asignar(tokenAdmin, 'abc', { responsableId: rec1.id })).status).toBe(404);
  });

  test('el body no puede alterar otros campos de la oferta', async () => {
    const { rec1, legacy, tokenAdmin } = await escenario();
    const res = await asignar(tokenAdmin, legacy.id, {
      responsableId: rec1.id, titulo: 'Hackeada', estado: 'cerrada', descripcion: 'x', empresaId: 1,
    });
    expect(res.status).toBe(200);
    const despues = await Oferta.findByPk(legacy.id);
    expect(despues.titulo).toBe(legacy.titulo);
    expect(despues.estado).toBe(legacy.estado);
    expect(despues.empresaId).toBe(legacy.empresaId);
  });

  // ── Perfil de reclutador ────────────────────────────────────────────────────

  test('perfil: el admin_empresa y un compañero ven la ficha del reclutador (solo datos básicos)', async () => {
    const { empresa, rec1, rec2, tokenAdmin, passwordPlana } = await escenario();

    const res = await perfil(tokenAdmin, rec1.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: rec1.id,
      nombre: rec1.nombre,
      apellido: rec1.apellido,
      email: rec1.email,
      telefono: '11-4555-2201',
      ubicacion: 'Lanús, Buenos Aires',
      fotoPerfil: null,
      empresa: { id: empresa.id, razonSocial: empresa.razonSocial, logo: null },
    });

    const tokenRec2 = await loginYObtenerToken(rec2.email, passwordPlana);
    expect((await perfil(tokenRec2, rec1.id)).status).toBe(200);
    const tokenRec1 = await loginYObtenerToken(rec1.email, passwordPlana);
    expect((await perfil(tokenRec1, rec1.id)).status).toBe(200); // el propio
  });

  test('perfil: un admin_empresa no tiene ficha de reclutador; inexistente y suspendido → 404', async () => {
    const { usuarioAdmin, recSusp, tokenAdmin } = await escenario();
    const { usuario: alumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);

    for (const id of [usuarioAdmin.id, recSusp.id, alumno.id, 999999999, 'abc']) {
      const res = await perfil(tokenAdmin, id);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Perfil no disponible.');
    }
  });

  test('perfil: sin sesión 401; miembros de otra empresa y alumnos sin relación → 404', async () => {
    const { rec1 } = await escenario();
    expect((await request(app).get(`/api/empresas/reclutadores/${rec1.id}/perfil`)).status).toBe(401);

    const otra = await crearEmpresaConAdmin();
    const { usuario: alumno, passwordPlana: passAlumno } = await crearAlumno();
    idsUsuarios.push(otra.usuarioAdmin.id, alumno.id);

    const tokenOtra = await loginYObtenerToken(otra.usuarioAdmin.email, otra.passwordPlana);
    expect((await perfil(tokenOtra, rec1.id)).status).toBe(404);
    const tokenAlumno = await loginYObtenerToken(alumno.email, passAlumno);
    expect((await perfil(tokenAlumno, rec1.id)).status).toBe(404);
  });

  test('perfil: un candidato lo ve cuando su postulación avanzó con ese reclutador (regla del chat)', async () => {
    const { empresa, rec1, rec2 } = await escenario();
    const oferta = await crearOferta(empresa, { creadaPorUsuarioId: rec1.id });
    const { usuario: alumno, passwordPlana: passAlumno } = await crearAlumno();
    idsUsuarios.push(alumno.id);
    const postulacion = await crearPostulacion(alumno, oferta, { estado: 'en_revision' });
    const tokenAlumno = await loginYObtenerToken(alumno.email, passAlumno);

    // En revisión todavía no hay relación (igual que el chat).
    expect((await perfil(tokenAlumno, rec1.id)).status).toBe(404);

    await postulacion.update({ estado: 'preseleccionado' });
    const res = await perfil(tokenAlumno, rec1.id);
    expect(res.status).toBe(200);
    expect(res.body.data.empresa.id).toBe(empresa.id);
    // Otro reclutador de la misma empresa, sin relación con el candidato: no.
    expect((await perfil(tokenAlumno, rec2.id)).status).toBe(404);
  });

  test('perfil: el admin del sistema puede consultarlo', async () => {
    const { rec1 } = await escenario();
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const token = await loginYObtenerToken(admin.email, passwordPlana);
    expect((await perfil(token, rec1.id)).status).toBe(200);
  });
});
