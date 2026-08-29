'use strict';

module.exports = {
  cookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: 'token',
    description:
      'JWT de sesión en cookie **HttpOnly `token`** (SEC-02). Se setea al hacer ' +
      '`POST /auth/login` y el navegador la reenvía sola. El JS del cliente no la ve.',
  },
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Alternativa para clientes de API y esta consola: `Authorization: Bearer <token>`. ' +
      'El body de `POST /auth/login` devuelve el `token` a usar acá.',
  },
};
