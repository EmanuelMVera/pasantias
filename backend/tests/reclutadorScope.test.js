'use strict';

/**
 * reclutadorScope.test.js — workspace del Reclutador.
 *
 * El reclutador trabaja SOLO con las ofertas a su cargo (creadaPorUsuarioId) y
 * sus candidatos; el admin_empresa sigue viendo toda la empresa. La separación
 * la impone el backend:
 *   - GET /empresas/dashboard, /mis-ofertas, /candidatos y
 *     /postulaciones/oferta/:id respetan el alcance del actor;
 *   - una oferta sin responsable no la gestiona ningún reclutador;
 *   - cambios de estado con flujo guiado (transiciones permitidas);
 *   - nota interna: la escribe el responsable, la lee el admin_empresa, nunca
 *     la ve el candidato;
 *   - historial de estados;
 *   - una oferta rechazada editada vuelve a revisión, también en empresas de
 *     confianza.
 */

const request = require('supertest');
const app = require('../src/app');
const { Notificacion, Oferta, Postulacion } = require('../src/models');
const {
  crearAlumno, crearAdmin, crearEmpresaConAdmin, agregarReclutador,
  crearOferta, crearPostulacion, loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('RECLUTADOR — alcance personal', () => {
  const idsUsuarios = [];
  const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`);
  const patch = (url, token, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body);
  const put = (url, token, body) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body);

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  /**
   * Empresa con admin (Carolina) y dos reclutadores (Diego y Lucía).
   *   Diego: frontend (2 en revisión, 1 entrevista) y datos (pendiente de moderación, sin candidatos)
   *   Lucía: qa (1 preseleccionado, 1 contratado)
   *   Sin responsable: legacy (1 en revisión)
   */
  async function escenario(overridesEmpresa = {}) {
    const { usuarioAdmin, empresa, passwordPlana } = await crearEmpresaConAdmin(overridesEmpresa);
    const { usuarioReclutador: diego } = await agregarReclutador(empresa, { nombre: 'Diego', apellido: 'Herrera' });
    const { usuarioReclutador: lucia } = await agregarReclutador(empresa, { nombre: 'Lucía', apellido: 'Ferrari' });
    idsUsuarios.push(usuarioAdmin.id, diego.id, lucia.id);

    const frontend = await crearOferta(empresa, { titulo: 'Frontend de Diego', creadaPorUsuarioId: diego.id });
    const datos = await crearOferta(empresa, { titulo: 'Datos de Diego', creadaPorUsuarioId: diego.id, estadoModeracion: 'pendiente' });
    const qa = await crearOferta(empresa, { titulo: 'QA de Lucía', creadaPorUsuarioId: lucia.id });
    const legacy = await crearOferta(empresa, { titulo: 'Legacy sin responsable' });

    const alumnos = [];
    const nombres = [['Martín', 'Gómez'], ['Sofía', 'Ramírez'], ['Tomás', 'Benítez'], ['Agustín', 'Molina'], ['Camila', 'Ortiz'], ['Bruno', 'Suárez']];
    for (const [nombre, apellido] of nombres) {
      const { usuario, passwordPlana: pass } = await crearAlumno({ usuario: { nombre, apellido } });
      idsUsuarios.push(usuario.id);
      alumnos.push({ usuario, pass });
    }
    const [martin, sofia, tomas, agustin, camila, bruno] = alumnos.map((a) => a.usuario);

    const pMartin = await crearPostulacion(martin, frontend, { estado: 'en_revision' });
    await crearPostulacion(sofia, frontend, { estado: 'en_revision' });
    await crearPostulacion(tomas, frontend, { estado: 'entrevista' });
    const pAgustin = await crearPostulacion(agustin, qa, { estado: 'preseleccionado' });
    await crearPostulacion(camila, qa, { estado: 'contratado' });
    await crearPostulacion(bruno, legacy, { estado: 'en_revision' });

    const [tokenAdmin, tokenDiego, tokenLucia] = await Promise.all([
      loginYObtenerToken(usuarioAdmin.email, passwordPlana),
      loginYObtenerToken(diego.email, passwordPlana),
      loginYObtenerToken(lucia.email, passwordPlana),
    ]);

    return {
      empresa, usuarioAdmin, diego, lucia, frontend, datos, qa, legacy,
      martin, sofia, agustin, alumnos, pMartin, pAgustin, tokenAdmin, tokenDiego, tokenLucia,
    };
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  test('dashboard: cada reclutador recibe solo las métricas de sus ofertas; el admin_empresa, las de toda la empresa', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, frontend, datos, qa } = await escenario();

    const dDiego = (await get('/api/empresas/dashboard', tokenDiego)).body.data;
    expect(dDiego.alcance).toBe('reclutador');
    expect(dDiego.ofertas).toMatchObject({ total: 2, activas: 2, pendienteModeracion: 1, rechazadas: 0 });
    expect(dDiego.postulaciones).toEqual({ total: 3, enRevision: 2, preseleccionados: 0, entrevistas: 1, contrataciones: 0 });
    // Nada corporativo en el panel personal.
    expect(dDiego.equipo).toBeUndefined();
    expect(dDiego.topOfertasPostulaciones).toBeUndefined();
    expect(dDiego.ofertasRecientes).toBeUndefined();

    const idsProcesos = dDiego.procesosActivos.map((p) => p.oferta.id);
    expect(idsProcesos.sort()).toEqual([frontend.id, datos.id].sort());
    expect(idsProcesos).not.toContain(qa.id);
    const procFrontend = dDiego.procesosActivos.find((p) => p.oferta.id === frontend.id);
    expect(procFrontend.totalCandidatos).toBe(3);
    expect(procFrontend.porEstado).toEqual({ enRevision: 2, preseleccionados: 0, entrevistas: 1, contratados: 0, rechazados: 0 });
    expect(dDiego.procesosActivos[0].oferta.id).toBe(frontend.id); // primero el que tiene candidatos esperando

    const dLucia = (await get('/api/empresas/dashboard', tokenLucia)).body.data;
    expect(dLucia.ofertas.total).toBe(1);
    expect(dLucia.postulaciones).toEqual({ total: 2, enRevision: 0, preseleccionados: 1, entrevistas: 0, contrataciones: 1 });
    expect(dLucia.procesosActivos.map((p) => p.oferta.id)).toEqual([qa.id]);

    const dAdmin = (await get('/api/empresas/dashboard', tokenAdmin)).body.data;
    expect(dAdmin.alcance).toBe('empresa');
    expect(dAdmin.ofertas.total).toBe(4);
    expect(dAdmin.postulaciones.total).toBe(6);
    expect(dAdmin.equipo.reclutadoresActivos).toBe(2);
    expect(dAdmin.paraAtender).toBeUndefined();
  });

  test('dashboard — "Para atender": solo pendientes reales del reclutador, sin ítems en cero', async () => {
    const { empresa, diego, tokenDiego, tokenLucia, frontend, datos } = await escenario();
    const rechazada = await crearOferta(empresa, { titulo: 'Rechazada de Diego', creadaPorUsuarioId: diego.id, estadoModeracion: 'rechazada' });
    const cierra = await crearOferta(empresa, {
      titulo: 'Cierra pronto', creadaPorUsuarioId: diego.id, fechaLimite: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    await crearOferta(empresa, {
      titulo: 'Cierra lejos', creadaPorUsuarioId: diego.id, fechaLimite: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
    });
    await crearOferta(empresa, {
      titulo: 'Cerrada con fecha cercana', creadaPorUsuarioId: diego.id, estado: 'cerrada',
      fechaLimite: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    const items = (await get('/api/empresas/dashboard', tokenDiego)).body.data.paraAtender;
    const de = (tipo) => items.filter((i) => i.tipo === tipo);

    expect(de('candidatos_en_revision')).toEqual([{ tipo: 'candidatos_en_revision', ofertaId: frontend.id, titulo: frontend.titulo, cantidad: 2 }]);
    expect(de('candidatos_en_entrevista')).toEqual([{ tipo: 'candidatos_en_entrevista', ofertaId: frontend.id, titulo: frontend.titulo, cantidad: 1 }]);
    expect(de('oferta_pendiente_moderacion').map((i) => i.ofertaId)).toEqual([datos.id]);
    expect(de('oferta_rechazada').map((i) => i.ofertaId)).toEqual([rechazada.id]);
    const cierres = de('cierre_proximo');
    expect(cierres.map((i) => i.ofertaId)).toEqual([cierra.id]); // ni la lejana ni la cerrada
    expect(cierres[0].dias).toBeGreaterThanOrEqual(2);
    expect(cierres[0].dias).toBeLessThanOrEqual(3);
    expect(items.some((i) => i.cantidad === 0)).toBe(false);
    // Los contratados no son una tarea.
    expect(items.some((i) => /contrat/.test(i.tipo))).toBe(false);

    // Lucía: un preseleccionado y un contratado → nada que atender.
    expect((await get('/api/empresas/dashboard', tokenLucia)).body.data.paraAtender).toEqual([]);
  });

  // ── Mis ofertas ─────────────────────────────────────────────────────────────

  test('mis-ofertas: el reclutador solo recibe las suyas y ningún filtro le permite ampliar el alcance', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, diego, lucia, frontend, datos, qa, legacy } = await escenario();
    const ids = async (token, query = '') => (await get(`/api/empresas/mis-ofertas${query}`, token)).body.data.map((o) => o.id).sort();

    expect(await ids(tokenDiego)).toEqual([frontend.id, datos.id].sort());
    expect(await ids(tokenLucia)).toEqual([qa.id]);
    expect(await ids(tokenAdmin)).toEqual([frontend.id, datos.id, qa.id, legacy.id].sort());

    // Intentos de escapar del alcance: se ignoran.
    expect(await ids(tokenDiego, `?responsable=${lucia.id}`)).toEqual([frontend.id, datos.id].sort());
    expect(await ids(tokenDiego, '?responsable=sin')).toEqual([frontend.id, datos.id].sort());
    expect(await ids(tokenDiego, '?q=Luc')).toEqual([]);
    expect(await ids(tokenDiego, '?q=QA')).toEqual([]);
    // Los filtros legítimos se aplican dentro del alcance.
    expect(await ids(tokenDiego, '?estadoModeracion=pendiente')).toEqual([datos.id]);
    expect(await ids(tokenDiego, '?q=Frontend')).toEqual([frontend.id]);
    // El admin_empresa sí puede filtrar por responsable.
    expect(await ids(tokenAdmin, `?responsable=${diego.id}`)).toEqual([frontend.id, datos.id].sort());
    expect(await ids(tokenAdmin, '?responsable=sin')).toEqual([legacy.id]);
  });

  test('detalle de oferta de la empresa: el reclutador abre las suyas en cualquier estado; no las ajenas ni las sin responsable', async () => {
    const { tokenAdmin, tokenDiego, datos, qa, legacy } = await escenario();

    const propia = await get(`/api/empresas/ofertas/${datos.id}`, tokenDiego); // pendiente de moderación
    expect(propia.status).toBe(200);
    expect(propia.body.data).toMatchObject({ id: datos.id, estadoModeracion: 'pendiente' });
    expect(propia.body.data.descripcion).toBeTruthy();

    expect((await get(`/api/empresas/ofertas/${qa.id}`, tokenDiego)).status).toBe(404);
    expect((await get(`/api/empresas/ofertas/${legacy.id}`, tokenDiego)).status).toBe(404);
    expect((await get(`/api/empresas/ofertas/${qa.id}`, tokenAdmin)).status).toBe(200);
    expect((await get('/api/empresas/ofertas/999999999', tokenAdmin)).status).toBe(404);
  });

  // ── Candidatos ──────────────────────────────────────────────────────────────

  test('candidatos: el reclutador solo recibe los de sus ofertas; búsqueda y conteos respetan el alcance', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, lucia, frontend, qa, martin, agustin } = await escenario();
    const pedir = async (token, query = '') => (await get(`/api/empresas/candidatos${query}`, token)).body;

    const deDiego = await pedir(tokenDiego);
    expect(deDiego.pagination.total).toBe(3);
    expect(deDiego.data.every((p) => p.oferta.id === frontend.id)).toBe(true);
    expect(deDiego.conteoPorEstado).toEqual({ en_revision: 2, entrevista: 1 });

    const deLucia = await pedir(tokenLucia);
    expect(deLucia.pagination.total).toBe(2);
    expect(deLucia.conteoPorEstado).toEqual({ preseleccionado: 1, contratado: 1 });

    const deAdmin = await pedir(tokenAdmin);
    expect(deAdmin.pagination.total).toBe(6);

    // Escapes: filtrar por otro responsable u otra oferta no abre nada ajeno.
    expect((await pedir(tokenDiego, `?responsable=${lucia.id}`)).pagination.total).toBe(3);
    expect((await pedir(tokenDiego, `?ofertaId=${qa.id}`)).pagination.total).toBe(0);
    expect((await pedir(tokenDiego, '?responsable=sin')).data.every((p) => p.oferta.id === frontend.id)).toBe(true);

    // Búsqueda server-side por nombre / apellido / email, dentro del alcance.
    const porNombre = await pedir(tokenDiego, '?q=mart');
    expect(porNombre.data.map((p) => p.usuario.id)).toEqual([martin.id]);
    expect(porNombre.conteoPorEstado).toEqual({ en_revision: 1 });
    expect((await pedir(tokenDiego, '?q=ram%C3%ADrez')).pagination.total).toBe(1);
    expect((await pedir(tokenDiego, `?q=${encodeURIComponent(martin.email)}`)).pagination.total).toBe(1);
    // Agustín es candidato de Lucía: Diego no lo encuentra, el admin sí.
    expect((await pedir(tokenDiego, '?q=Agust')).pagination.total).toBe(0);
    expect((await pedir(tokenAdmin, '?q=Agust')).data.map((p) => p.usuario.id)).toEqual([agustin.id]);
    // Combinado con estado y oferta.
    expect((await pedir(tokenDiego, `?q=mart&estado=entrevista&ofertaId=${frontend.id}`)).pagination.total).toBe(0);
    expect((await pedir(tokenDiego, `?estado=entrevista&ofertaId=${frontend.id}`)).pagination.total).toBe(1);
  });

  test('proceso de una oferta: el responsable lo opera, otro reclutador recibe 403, el admin_empresa supervisa', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, frontend, qa, legacy } = await escenario();

    const propio = await get(`/api/postulaciones/oferta/${frontend.id}`, tokenDiego);
    expect(propio.status).toBe(200);
    expect(propio.body.puedeGestionar).toBe(true);
    expect(propio.body.oferta).toMatchObject({ id: frontend.id, estado: 'activa', estadoModeracion: 'aprobada' });
    const enRevision = propio.body.data.find((p) => p.estado === 'en_revision');
    expect(enRevision.transicionesPermitidas).toEqual(['preseleccionado', 'rechazado']);

    for (const [token, oferta] of [[tokenDiego, qa], [tokenLucia, frontend], [tokenDiego, legacy], [tokenLucia, legacy]]) {
      const res = await get(`/api/postulaciones/oferta/${oferta.id}`, token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NO_ES_RESPONSABLE');
      expect(res.body.data).toBeUndefined();
    }

    for (const oferta of [frontend, qa, legacy]) {
      const res = await get(`/api/postulaciones/oferta/${oferta.id}`, tokenAdmin);
      expect(res.status).toBe(200);
      expect(res.body.puedeGestionar).toBe(false);
      expect(res.body.data.every((p) => p.transicionesPermitidas.length === 0)).toBe(true);
    }
  });

  // ── Ofertas: edición y estado ───────────────────────────────────────────────

  test('oferta: el reclutador edita y pausa las suyas; no las de otro ni las que no tienen responsable; el admin_empresa no edita contenido', async () => {
    const { tokenAdmin, tokenDiego, frontend, qa, legacy } = await escenario();
    const cuerpo = { titulo: 'Título editado', descripcion: 'Descripción editada.', tipoPuesto: 'pasante' };

    const propia = await put(`/api/ofertas/${frontend.id}`, tokenDiego, cuerpo);
    expect(propia.status).toBe(200);
    expect(propia.body.data.titulo).toBe('Título editado');
    expect((await patch(`/api/ofertas/${frontend.id}/estado`, tokenDiego, { estado: 'pausada' })).status).toBe(200);

    for (const oferta of [qa, legacy]) {
      const editar = await put(`/api/ofertas/${oferta.id}`, tokenDiego, cuerpo);
      expect(editar.status).toBe(403);
      expect(editar.body.code).toBe('NO_ES_RESPONSABLE');
      const pausar = await patch(`/api/ofertas/${oferta.id}/estado`, tokenDiego, { estado: 'pausada' });
      expect(pausar.status).toBe(403);
      expect((await Oferta.findByPk(oferta.id)).titulo).toBe(oferta.titulo);
      expect((await Oferta.findByPk(oferta.id)).estado).toBe('activa');
    }

    expect((await put(`/api/ofertas/${frontend.id}`, tokenAdmin, cuerpo)).status).toBe(403);
    // Gobierno: el admin_empresa sí pausa una oferta sin responsable.
    expect((await patch(`/api/ofertas/${legacy.id}/estado`, tokenAdmin, { estado: 'pausada' })).status).toBe(200);
  });

  test('editar no permite cambiar moderación, responsable ni empresa desde el body', async () => {
    const { tokenDiego, lucia, datos } = await escenario();
    const res = await put(`/api/ofertas/${datos.id}`, tokenDiego, {
      titulo: 'Datos v2', descripcion: 'x', tipoPuesto: 'pasante',
      estadoModeracion: 'aprobada', creadaPorUsuarioId: lucia.id, empresaId: 1, estado: 'cerrada',
    });
    expect(res.status).toBe(200);
    const despues = await Oferta.findByPk(datos.id);
    expect(despues.titulo).toBe('Datos v2');
    expect(despues.estadoModeracion).toBe('pendiente');
    expect(despues.creadaPorUsuarioId).toBe(datos.creadaPorUsuarioId);
    expect(despues.empresaId).toBe(datos.empresaId);
    expect(despues.estado).toBe('activa');
  });

  test('oferta rechazada editada: vuelve a "pendiente" y avisa al instituto — también en una empresa de confianza', async () => {
    const { usuario: adminSistema } = await crearAdmin();
    idsUsuarios.push(adminSistema.id);

    for (const nivelConfianza of ['estandar', 'confiable']) {
      const { empresa, diego, tokenDiego } = await escenario();
      await empresa.update({ nivelConfianza });
      const rechazada = await crearOferta(empresa, { titulo: `Rechazada ${nivelConfianza}`, creadaPorUsuarioId: diego.id, estadoModeracion: 'rechazada' });
      await Notificacion.destroy({ where: { usuarioId: adminSistema.id } });

      const res = await put(`/api/ofertas/${rechazada.id}`, tokenDiego, {
        titulo: `Rechazada ${nivelConfianza} corregida`, descripcion: 'Con más detalle de tareas.', tipoPuesto: 'pasante',
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/volvió a revisión/i);
      expect((await Oferta.findByPk(rechazada.id)).estadoModeracion).toBe('pendiente'); // nunca auto_aprobada

      let aviso = null;
      for (let i = 0; i < 30 && !aviso; i++) {
        aviso = await Notificacion.findOne({ where: { usuarioId: adminSistema.id, accionURL: '/admin/ofertas' } });
        if (!aviso) await new Promise((r) => setTimeout(r, 50));
      }
      expect(aviso).not.toBeNull();
      expect(aviso.mensaje).toContain(`Rechazada ${nivelConfianza} corregida`);
    }

    // Una oferta aprobada editada NO vuelve a revisión.
    const { tokenDiego, frontend } = await escenario();
    await put(`/api/ofertas/${frontend.id}`, tokenDiego, { titulo: 'Frontend v2', descripcion: 'x', tipoPuesto: 'pasante' });
    expect((await Oferta.findByPk(frontend.id)).estadoModeracion).toBe('aprobada');
  });

  // ── Estados de postulación ──────────────────────────────────────────────────

  test('cambio de estado: solo el responsable, y solo por transiciones del flujo guiado', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, pMartin, pAgustin } = await escenario();
    const mover = (token, id, estado) => patch(`/api/postulaciones/${id}/estado`, token, { estado });

    // Ajenos.
    expect((await mover(tokenLucia, pMartin.id, 'preseleccionado')).status).toBe(403);
    expect((await mover(tokenDiego, pAgustin.id, 'entrevista')).status).toBe(403);
    expect((await mover(tokenAdmin, pMartin.id, 'preseleccionado')).status).toBe(403);
    expect((await Postulacion.findByPk(pMartin.id)).estado).toBe('en_revision');

    // Saltos no permitidos desde en_revision.
    for (const estado of ['entrevista', 'contratado']) {
      const res = await mover(tokenDiego, pMartin.id, estado);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TRANSICION_NO_PERMITIDA');
      expect(res.body.transicionesPermitidas).toEqual(['preseleccionado', 'rechazado']);
    }

    // Camino completo, con un retroceso de un paso.
    const pasos = ['preseleccionado', 'entrevista', 'preseleccionado', 'entrevista', 'contratado'];
    for (const estado of pasos) {
      const res = await mover(tokenDiego, pMartin.id, estado);
      expect(res.status).toBe(200);
      expect(res.body.data.estado).toBe(estado);
    }
    // Contratado es final.
    const final = await mover(tokenDiego, pMartin.id, 'rechazado');
    expect(final.status).toBe(400);
    expect(final.body.transicionesPermitidas).toEqual([]);

    // Un "no seleccionado" se puede reabrir a revisión, y nada más.
    expect((await mover(tokenLucia, pAgustin.id, 'rechazado')).status).toBe(200);
    expect((await mover(tokenLucia, pAgustin.id, 'entrevista')).status).toBe(400);
    expect((await mover(tokenLucia, pAgustin.id, 'en_revision')).status).toBe(200);
  });

  test('oferta sin responsable: ningún reclutador gestiona sus candidatos; tras asignarla, solo el asignado', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, diego, legacy } = await escenario();
    const postulacion = await Postulacion.findOne({ where: { ofertaId: legacy.id } });
    const mover = (token) => patch(`/api/postulaciones/${postulacion.id}/estado`, token, { estado: 'preseleccionado' });

    expect((await mover(tokenDiego)).status).toBe(403);
    expect((await mover(tokenLucia)).status).toBe(403);

    // El admin_empresa la asigna a Diego: el alcance cambia de inmediato.
    expect((await patch(`/api/empresas/ofertas/${legacy.id}/responsable`, tokenAdmin, { responsableId: diego.id })).status).toBe(200);
    expect((await get('/api/empresas/mis-ofertas', tokenDiego)).body.data.map((o) => o.id)).toContain(legacy.id);
    expect((await get(`/api/postulaciones/oferta/${legacy.id}`, tokenDiego)).status).toBe(200);
    expect((await mover(tokenLucia)).status).toBe(403);
    expect((await mover(tokenDiego)).status).toBe(200);
  });

  test('reasignación: el reclutador anterior pierde la oferta y sus candidatos; el nuevo los adquiere', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, lucia, frontend, pMartin } = await escenario();

    expect((await patch(`/api/empresas/ofertas/${frontend.id}/responsable`, tokenAdmin, { responsableId: lucia.id })).status).toBe(200);

    expect((await get('/api/empresas/mis-ofertas', tokenDiego)).body.data.map((o) => o.id)).not.toContain(frontend.id);
    expect((await get('/api/empresas/candidatos', tokenDiego)).body.pagination.total).toBe(0);
    expect((await get(`/api/postulaciones/oferta/${frontend.id}`, tokenDiego)).status).toBe(403);
    expect((await patch(`/api/postulaciones/${pMartin.id}/estado`, tokenDiego, { estado: 'preseleccionado' })).status).toBe(403);
    expect((await get('/api/empresas/dashboard', tokenDiego)).body.data.postulaciones.total).toBe(0);

    expect((await get('/api/empresas/mis-ofertas', tokenLucia)).body.data.map((o) => o.id)).toContain(frontend.id);
    expect((await get('/api/empresas/candidatos', tokenLucia)).body.pagination.total).toBe(5);
    expect((await patch(`/api/postulaciones/${pMartin.id}/estado`, tokenLucia, { estado: 'preseleccionado' })).status).toBe(200);
  });

  // ── Nota interna ────────────────────────────────────────────────────────────

  test('nota interna: la escribe el responsable, la lee el admin_empresa, y el candidato nunca la ve ni es notificado', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, frontend, pMartin, martin, alumnos } = await escenario();
    const guardar = (token, notasEmpresa) => patch(`/api/postulaciones/${pMartin.id}/estado`, token, { notasEmpresa });
    const NOTA = 'Buen dominio de React. Revisar disponibilidad horaria en entrevista.';

    expect((await guardar(tokenLucia, NOTA)).status).toBe(403); // reclutador ajeno
    expect((await guardar(tokenAdmin, NOTA)).status).toBe(403); // admin_empresa no edita

    const ok = await guardar(tokenDiego, `  ${NOTA}  `);
    expect(ok.status).toBe(200);
    expect(ok.body.data.notasEmpresa).toBe(NOTA); // trim
    expect(ok.body.data.estado).toBe('en_revision'); // guardar la nota no cambia el estado
    expect(await Notificacion.count({ where: { usuarioId: martin.id } })).toBe(0);

    // Validaciones.
    expect((await guardar(tokenDiego, 'x'.repeat(2001))).status).toBe(400);
    expect((await guardar(tokenDiego, 123)).status).toBe(400);
    expect((await patch(`/api/postulaciones/${pMartin.id}/estado`, tokenDiego, {})).status).toBe(400);
    expect((await Postulacion.findByPk(pMartin.id)).notasEmpresa).toBe(NOTA);

    // El responsable y el admin_empresa la leen en el proceso.
    for (const token of [tokenDiego, tokenAdmin]) {
      const proceso = await get(`/api/postulaciones/oferta/${frontend.id}`, token);
      expect(proceso.body.data.find((p) => p.id === pMartin.id).notasEmpresa).toBe(NOTA);
    }

    // El candidato no la recibe por ningún endpoint suyo.
    const tokenMartin = await loginYObtenerToken(martin.email, alumnos[0].pass);
    const mias = await get('/api/postulaciones/mis', tokenMartin);
    expect(mias.status).toBe(200);
    expect(mias.body.data).toHaveLength(1);
    expect(JSON.stringify(mias.body)).not.toContain('Buen dominio de React');
    expect(mias.body.data[0]).not.toHaveProperty('notasEmpresa');
    expect(mias.body.data[0]).not.toHaveProperty('observacionesEmpresa');

    // Se puede borrar.
    expect((await guardar(tokenDiego, '')).status).toBe(200);
    expect((await Postulacion.findByPk(pMartin.id)).notasEmpresa).toBeNull();
  });

  test('al postularse, la respuesta al alumno tampoco incluye campos internos', async () => {
    const { frontend } = await escenario();
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);
    const res = await request(app).post('/api/postulaciones').set('Authorization', `Bearer ${token}`).send({ ofertaId: frontend.id });
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('notasEmpresa');
    expect(res.body.data).not.toHaveProperty('observacionesEmpresa');
  });

  // ── Historial ───────────────────────────────────────────────────────────────

  test('historial: línea de tiempo real para el responsable y el admin_empresa; no para otro reclutador ni para el alumno', async () => {
    const { tokenAdmin, tokenDiego, tokenLucia, frontend, diego, alumnos } = await escenario();
    // Postulación real (crea la entrada inicial del historial).
    const { usuario, passwordPlana } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const tokenAlumno = await loginYObtenerToken(usuario.email, passwordPlana);
    const post = await request(app).post('/api/postulaciones').set('Authorization', `Bearer ${tokenAlumno}`).send({ ofertaId: frontend.id });
    const id = post.body.data.id;

    await patch(`/api/postulaciones/${id}/estado`, tokenDiego, { estado: 'preseleccionado' });
    await patch(`/api/postulaciones/${id}/estado`, tokenDiego, { estado: 'entrevista', notasEmpresa: 'nota privada' });

    const res = await get(`/api/postulaciones/${id}/historial`, tokenDiego);
    expect(res.status).toBe(200);
    expect(res.body.estadoActual).toBe('entrevista');
    expect(res.body.data.map((h) => [h.estadoAnterior, h.estadoNuevo])).toEqual([
      [null, 'en_revision'], ['en_revision', 'preseleccionado'], ['preseleccionado', 'entrevista'],
    ]);
    expect(res.body.data[0].cambiadoPor.id).toBe(usuario.id);
    expect(res.body.data[2].cambiadoPor).toMatchObject({ id: diego.id, nombre: 'Diego' });
    expect(JSON.stringify(res.body)).not.toContain('nota privada'); // el historial no expone notas

    expect((await get(`/api/postulaciones/${id}/historial`, tokenAdmin)).status).toBe(200);
    expect((await get(`/api/postulaciones/${id}/historial`, tokenLucia)).status).toBe(403);
    expect((await get(`/api/postulaciones/${id}/historial`, tokenAlumno)).status).toBe(403);
    expect((await get('/api/postulaciones/999999999/historial', tokenDiego)).status).toBe(404);

    // Empresa ajena: no existe para ella.
    const otra = await crearEmpresaConAdmin();
    idsUsuarios.push(otra.usuarioAdmin.id);
    const tokenOtra = await loginYObtenerToken(otra.usuarioAdmin.email, otra.passwordPlana);
    expect((await get(`/api/postulaciones/${id}/historial`, tokenOtra)).status).toBe(404);
    expect(alumnos.length).toBe(6);
  });

  // ── Lo que el reclutador sigue sin poder hacer ──────────────────────────────

  test('gobierno de la empresa: el reclutador no asigna responsables, ni gestiona el equipo, ni edita la empresa', async () => {
    const { tokenDiego, lucia, legacy } = await escenario();
    expect((await patch(`/api/empresas/ofertas/${legacy.id}/responsable`, tokenDiego, { responsableId: lucia.id })).status).toBe(403);
    expect((await get('/api/empresas/equipo/solicitudes', tokenDiego)).status).toBe(403);
    expect((await put('/api/empresas/mi-empresa', tokenDiego, { ciudad: 'Otra' })).status).toBe(403);
    // Sí consulta lo compartido.
    expect((await get('/api/empresas/equipo', tokenDiego)).status).toBe(200);
    expect((await get('/api/empresas/mi-empresa', tokenDiego)).status).toBe(200);
  });

  test('nueva oferta: queda a cargo de quien la crea y no se puede elegir otro responsable', async () => {
    const { tokenDiego, diego, lucia } = await escenario();
    const res = await request(app).post('/api/ofertas').set('Authorization', `Bearer ${tokenDiego}`).send({
      titulo: 'Nueva de Diego', descripcion: 'Descripción.', tipoPuesto: 'pasante', creadaPorUsuarioId: lucia.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.creadaPorUsuarioId).toBe(diego.id);
    expect((await get('/api/empresas/mis-ofertas?q=Nueva', tokenDiego)).body.data).toHaveLength(1);
  });
});
