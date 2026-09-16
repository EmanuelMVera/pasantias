'use strict';
const { operation, okRaw } = require('../helpers');

const T = 'demo';

module.exports = {
  '/api/demo/status': {
    get: operation({
      tag: T, id: 'demoStatus', summary: 'Estado público del escenario de presentación',
      description:
        'Público, sin autenticación. Refleja el estado real de la base (vía `escenarioExiste()`) — ' +
        'nunca afirma que las cuentas demo existen si el seed de presentación no corrió.',
      security: [],
      responses: {
        200: okRaw({
          enabled: { type: 'boolean' },
          accounts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { rol: { type: 'string' }, email: { type: 'string', format: 'email' } },
            },
          },
        }, ['enabled', 'accounts']),
      },
    }),
  },
};
