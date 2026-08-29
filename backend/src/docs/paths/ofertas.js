'use strict';
const { operation, ok, paginated, message, REF } = require('../helpers');

const T = 'ofertas';
const R_ESCRIBE = ['empresa/admin_empresa', 'empresa/reclutador'];

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
      description: 'La oferta queda `moderada=false` hasta que un admin la aprueba.',
      roles: R_ESCRIBE, csrf: true, body: 'OfertaCreate',
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
      tag: T, id: 'ofertasUpdate', summary: 'Editar una oferta de mi empresa',
      roles: R_ESCRIBE, csrf: true, params: ['id'], body: 'OfertaUpdate',
      responses: { 200: ok('Oferta') },
      errors: ['400', '401', '403', '403csrf', '404', '500'],
    }),
    delete: operation({
      tag: T, id: 'ofertasDelete', summary: 'Cerrar una oferta de mi empresa',
      description: 'Soft close — pasa a `estado=cerrada`.',
      roles: R_ESCRIBE, csrf: true, params: ['id'],
      responses: { 200: message() },
      errors: ['401', '403', '403csrf', '404'],
    }),
  },
};
