'use strict';
const { operation, message } = require('../helpers');

const T = 'solicitudes';

module.exports = {
  '/api/solicitudes-empresa': {
    post: operation({
      tag: T, id: 'solicitudesEmpresaCrear', summary: 'Enviar una solicitud de registro de empresa',
      description: 'Endpoint **público** (sin auth, CSRF exento). La revisa un admin del instituto.',
      security: [],
      body: 'SolicitudEmpresaCreate',
      responses: {
        201: message(
          {
            data: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                estado: { type: 'string', enum: ['pendiente'] },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          { code: 201 },
        ),
      },
      errors: ['400', '429'],
    }),
  },
};

// Los endpoints admin de solicitudes (listar/aprobar/rechazar) viven en paths/admin.js.
