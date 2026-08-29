'use strict';
const { operation, message, REF } = require('../helpers');

const T = 'chat';

const listaResp = (itemRef, extra = {}) => ({
  description: 'OK',
  content: {
    'application/json': {
      schema: {
        allOf: [
          REF.schema('Envelope'),
          {
            type: 'object',
            required: ['data'],
            properties: {
              total: { type: 'integer' },
              data: { type: 'array', items: itemRef },
              ...extra,
            },
          },
        ],
      },
    },
  },
});

module.exports = {
  '/api/chat/usuarios': {
    get: operation({
      tag: T, id: 'chatBuscarUsuarios', summary: 'Buscar usuarios para chatear',
      description: 'Requiere `q` de ≥ 2 caracteres. Los admin no participan del chat (devuelve lista vacía).',
      query: [REF.param('qQuery')],
      responses: { 200: listaResp(REF.schema('UsuarioResumen')) },
      errors: ['401'],
    }),
  },

  '/api/chat': {
    get: operation({
      tag: T, id: 'chatConversaciones', summary: 'Mis conversaciones',
      responses: { 200: listaResp(REF.schema('Conversacion')) },
      errors: ['401'],
    }),
    post: operation({
      tag: T, id: 'chatEnviarMensaje', summary: 'Enviar un mensaje',
      description: 'Las reglas de con quién se puede chatear las aplica `chatPermission.service` (403 con el motivo).',
      csrf: true, body: 'MensajeCreate',
      responses: { 201: message({ data: REF.schema('Mensaje') }, { code: 201 }) },
      errors: ['400', '401', '403', '403csrf', '404', '429'],
    }),
  },

  '/api/chat/{usuarioId}': {
    get: operation({
      tag: T, id: 'chatHistorial', summary: 'Historial de mensajes con un usuario',
      params: [{ name: 'usuarioId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      query: ['pageParam', 'limitParam'],
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  REF.schema('Envelope'),
                  {
                    type: 'object',
                    required: ['data', 'pagination'],
                    properties: {
                      usuario: { $ref: '#/components/schemas/UsuarioResumen' },
                      data: { type: 'array', items: REF.schema('Mensaje') },
                      pagination: REF.schema('Pagination'),
                    },
                  },
                ],
              },
            },
          },
        },
      },
      errors: ['400', '401', '403', '404'],
    }),
  },

  '/api/chat/{usuarioId}/leer': {
    patch: operation({
      tag: T, id: 'chatMarcarLeida', summary: 'Marcar como leídos los mensajes de un usuario',
      csrf: true,
      params: [{ name: 'usuarioId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      responses: { 200: { description: 'OK', content: { 'application/json': { schema: REF.schema('MarcarLeidaResponse') } } } },
      errors: ['401', '403csrf'],
    }),
  },
};
