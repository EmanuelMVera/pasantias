'use strict';
const { operation, ok, paginated, message, REF } = require('../helpers');

const T = 'ofertas';
// RBAC-01: la empresa es una entidad institucional — solo el reclutador crea y
// edita contenido. admin_empresa solo cambia el estado (control institucional).
const R_CREA_EDITA = ['empresa/reclutador'];
const R_CAMBIA_ESTADO = ['empresa/admin_empresa', 'empresa/reclutador'];

const filtros = [
  REF.param('estadoQuery'),
  { name: 'area', in: 'query', schema: { type: 'string' } },
  { name: 'modalidad', in: 'query', schema: { type: 'string', enum: ['presencial', 'remoto', 'hibrido'] } },
  { name: 'ciudad', in: 'query', schema: { type: 'string' } },
  { name: 'experiencia', in: 'query', schema: { type: 'string' } },
  { name: 'tipoPuesto', in: 'query', schema: { type: 'string', enum: ['pasante', 'trainee', 'junior'] } },
  { name: 'q', in: 'query', schema: { type: 'string' } },
];

module.exports = {
  '/api/ofertas': {
    get: operation({
      tag: T, id: 'ofertasList', summary: 'Listar ofertas activas y aprobadas',
      description: 'Público. Solo devuelve ofertas `estado=activa` y `moderada=true`.',
      security: [],
      query: ['pageParam', 'limitParam', ...filtros],
      responses: { 200: paginated('Oferta') },
    }),
    post: operation({
      tag: T, id: 'ofertasCreate', summary: 'Publicar una oferta',
      description: 'La oferta queda `moderada=false` hasta que un admin la aprueba. Solo reclutador.',
      roles: R_CREA_EDITA, csrf: true, body: 'OfertaCreate',
      responses: { 201: message({ data: REF.schema('Oferta') }, { code: 201 }) },
      errors: ['400', '401', '403', '403csrf', '404empresa', '500'],
    }),
  },

  '/api/ofertas/{id}': {
    get: operation({
      tag: T, id: 'ofertasGet', summary: 'Detalle de una oferta',
      description: 'Público. Incrementa el contador de vistas. 404 si no está `activa`+`moderada`.',
      security: [], params: ['id'],
      responses: { 200: ok('Oferta') },
      errors: ['404'],
    }),
    put: operation({
      tag: T, id: 'ofertasUpdate', summary: 'Editar el contenido de una oferta de mi empresa',
      description: 'Solo el reclutador responsable (`creadaPorUsuarioId`) — o cualquier reclutador si la oferta es histórica sin responsable registrado. No acepta `estado`; usar `PATCH /{id}/estado`.',
      roles: R_CREA_EDITA, csrf: true, params: ['id'], body: 'OfertaUpdate',
      responses: { 200: ok('Oferta') },
      errors: ['400', '401', '403', '403csrf', '404', '500'],
    }),
  },

  '/api/ofertas/{id}/estado': {
    patch: operation({
      tag: T, id: 'ofertasCambiarEstado', summary: 'Pausar / reactivar / cerrar una oferta',
      description: 'Único endpoint que cambia `estado`. El reclutador solo sobre su propia oferta; admin_empresa sobre cualquier oferta de su empresa (control institucional, queda auditado). Transiciones permitidas: activa↔pausada, activa\\|pausada→cerrada. `cerrada` es terminal.',
      roles: R_CAMBIA_ESTADO, csrf: true, params: ['id'],
      body: {
        type: 'object',
        required: ['estado'],
        properties: { estado: { type: 'string', enum: ['activa', 'pausada', 'cerrada'] } },
      },
      responses: { 200: ok('Oferta') },
      errors: ['400', '401', '403', '403csrf', '404', '500'],
    }),
  },
};
