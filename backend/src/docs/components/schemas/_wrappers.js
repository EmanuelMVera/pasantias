'use strict';

// Envelope de éxito: todas las respuestas 2xx tienen `success: true`.
// Los schemas concretos hacen `allOf: [ Envelope, { ...campos } ]`.
const Envelope = {
  type: 'object',
  required: ['success'],
  properties: { success: { const: true } },
};

const ErrorResponse = {
  type: 'object',
  required: ['success', 'message'],
  properties: {
    success: { const: false },
    message: { type: 'string', description: 'Mensaje legible en español.' },
    code: {
      type: 'string',
      description:
        'Código tipificado (no siempre presente). Middleware: `CSRF`, `RATE_LIMITED`, ' +
        '`SIN_EMPRESA`, `SIN_ROL`, `ROL_INSUFICIENTE`. Negocio: `CV_REQUERIDO`, ' +
        '`POSTULACION_DUPLICADA`, `OFERTA_NO_ACTIVA`, `OFERTA_VENCIDA`, `EMAIL_DUPLICADO`, ' +
        '`YA_ES_MIEMBRO`, `EMAIL_REGISTRADO`, `EMAIL_SOLICITUD_PENDIENTE`, `PERFIL_PRIVADO`.',
    },
    rolesPermitidos: {
      type: 'array',
      items: { type: 'string' },
      description: 'Solo en 403 `ROL_INSUFICIENTE`: roles internos que sí pueden.',
    },
    requestId: { type: 'string', description: 'Solo en 500 — correlaciona con los logs técnicos.' },
  },
};

const Pagination = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  properties: {
    page: { type: 'integer', description: 'Página actual (recortada a [1, totalPages]).' },
    limit: { type: 'integer' },
    total: { type: 'integer', description: 'Total de filas del scope filtrado.' },
    totalPages: { type: 'integer', description: 'Siempre ≥ 1.' },
  },
};

module.exports = { Envelope, ErrorResponse, Pagination };
