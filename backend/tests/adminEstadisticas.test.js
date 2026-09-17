'use strict';

/**
 * adminEstadisticas.test.js — estadísticas profesionales (Fase 2, sección
 * 12 del pedido de iteración funcional/visual).
 *
 * Cubre especialmente el embudo de selección: regresión encontrada al
 * verificar la página en el navegador — "Contratado sobre entrevista: 120%"
 * no tiene sentido. La causa era calcular las tasas dividiendo baldes
 * disjuntos de `Postulacion.estado` actual en vez de conteos ACUMULADOS
 * ("¿cuántas postulaciones llegaron alguna vez a esta etapa?", vía
 * PostulacionHistorialEstado) — ver el comentario de calcularEmbudo().
 * Con la fuente correcta, ninguna tasa puede superar el 100%.
 */

const { Op } = require('sequelize');
const request = require('supertest');
const app = require('../src/app');
const { Postulacion, PostulacionHistorialEstado } = require('../src/models');
const { obtenerEstadisticasGenerales, calcularEmbudo, pct } = require('../src/services/adminEstadisticas.service');
const { crearAlumno, crearAdmin, crearEmpresaConAdmin, crearOferta, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('adminEstadisticas — embudo de selección y estadísticas generales', () => {
  const idsUsuarios = [];
  const idsPostulaciones = [];

  afterAll(async () => {
    await PostulacionHistorialEstado.destroy({ where: { postulacionId: { [Op.in]: idsPostulaciones } } });
    await Postulacion.destroy({ where: { id: { [Op.in]: idsPostulaciones } } });
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test('pct() nunca divide por cero — denominador 0 da null, nunca 0% engañoso', () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(0, 0)).toBeNull();
    expect(pct(0, 10)).toBe(0);
    expect(pct(5, 10)).toBe(50);
  });

  test('embudo: ninguna tasa supera el 100% aunque haya más "contratado" que "entrevista" actuales', async () => {
    // Escenario que reproduce el bug: 2 postulaciones que llegaron a
    // "contratado" (pasando por "entrevista" en su cadena) y una tercera
    // que se quedó en "entrevista" sin avanzar. Si se contara por
    // Postulacion.estado ACTUAL: entrevista=1, contratado=2 → 200%.
    // Con el conteo acumulado correcto: entrevista=3 (las 3 pasaron por
    // ahí), contratado=2 → 66.7%, nunca más de 100%.
    const { usuario: alumno1 } = await crearAlumno();
    const { usuario: alumno2 } = await crearAlumno();
    const { usuario: alumno3 } = await crearAlumno();
    idsUsuarios.push(alumno1.id, alumno2.id, alumno3.id);
    const { empresa, usuarioAdmin } = await crearEmpresaConAdmin();
    idsUsuarios.push(usuarioAdmin.id);
    const oferta = await crearOferta(empresa);

    const cadenaHasta = async (usuario, cadena) => {
      const post = await Postulacion.create({
        usuarioId: usuario.id, ofertaId: oferta.id, estado: cadena[cadena.length - 1],
        fechaPostulacion: new Date(),
      });
      idsPostulaciones.push(post.id);
      let anterior = null;
      for (const estado of cadena) {
        await PostulacionHistorialEstado.create({
          postulacionId: post.id, estadoAnterior: anterior, estadoNuevo: estado,
          cambiadoPorUsuarioId: usuario.id,
        });
        anterior = estado;
      }
      return post;
    };

    await cadenaHasta(alumno1, ['en_revision', 'preseleccionado', 'entrevista', 'contratado']);
    await cadenaHasta(alumno2, ['en_revision', 'preseleccionado', 'entrevista', 'contratado']);
    await cadenaHasta(alumno3, ['en_revision', 'preseleccionado', 'entrevista']); // se quedó acá

    const embudo = await calcularEmbudo();

    expect(embudo.contratado).toBeGreaterThanOrEqual(2);
    expect(embudo.entrevista).toBeGreaterThanOrEqual(embudo.contratado); // monótono: nunca menos entrevistas que contrataciones
    expect(embudo.tasaContratadoAEntrevista).not.toBeNull();
    expect(embudo.tasaContratadoAEntrevista).toBeLessThanOrEqual(100);
    expect(embudo.tasaEntrevistaAPreseleccion).toBeLessThanOrEqual(100);
    expect(embudo.tasaPreseleccionARevision).toBeLessThanOrEqual(100);
  });

  test('GET /admin/estadisticas expone el embudo ya corregido end-to-end, sin tasas > 100%', async () => {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    const token = await loginYObtenerToken(usuario.email, passwordPlana);

    const res = await request(app).get('/api/admin/estadisticas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const { embudo } = res.body.data;
    for (const tasa of [embudo.tasaPreseleccionARevision, embudo.tasaEntrevistaAPreseleccion, embudo.tasaContratadoAEntrevista]) {
      if (tasa != null) expect(tasa).toBeLessThanOrEqual(100);
    }
  });

  test('período custom (desde/hasta) se refleja en la respuesta', async () => {
    const desde = '2020-01-01';
    const hasta = '2020-12-31';
    const data = await obtenerEstadisticasGenerales({ desde, hasta });
    expect(new Date(data.periodo.desde).toISOString().slice(0, 10)).toBe(desde);
    expect(new Date(data.periodo.hasta).toISOString().slice(0, 10)).toBe(hasta);
  });
});
