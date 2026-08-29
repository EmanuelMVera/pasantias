/**
 * helpers.js — El "motor DRY" de la spec (DOC-02).
 *
 * `operation()` arma una operación OpenAPI completa a partir de un objeto chico;
 * `ok()` / `paginated()` / `message()` / `okRaw()` arman los `responses` 2xx sin
 * repetir el envelope; `errors()` arma el bloque de errores por `$ref`.
 */
'use strict';

const REF = {
  schema: (n) => ({ $ref: `#/components/schemas/${n}` }),
  resp: (n) => ({ $ref: `#/components/responses/${n}` }),
  param: (n) => ({ $ref: `#/components/parameters/${n}` }),
};

const json = (schema, example) => ({
  'application/json': example === undefined ? { schema } : { schema, example },
});

// 200 { success:true, data: <Schema> }
const ok = (name, { description = 'OK' } = {}) => ({
  description,
  content: json({
    allOf: [
      REF.schema('Envelope'),
      { type: 'object', required: ['data'], properties: { data: REF.schema(name) } },
    ],
  }),
});

// 200 { success:true, data: [<item>], pagination, total(legacy), ...extraProps }
const paginated = (item, { description = 'Lista paginada', extraProps = {} } = {}) => ({
  description,
  content: json({
    allOf: [
      REF.schema('Envelope'),
      {
        type: 'object',
        required: ['data', 'pagination'],
        properties: {
          data: { type: 'array', items: REF.schema(item) },
          pagination: REF.schema('Pagination'),
          total: { type: 'integer', description: 'Redundante con pagination.total (legacy).' },
          ...extraProps,
        },
      },
    ],
  }),
});

// 200/201 { success:true, message, ...extraProps }
const message = (extraProps = {}, { code = 200, description = 'OK' } = {}) => ({
  _status: code,
  description,
  content: json({
    allOf: [
      REF.schema('Envelope'),
      { type: 'object', required: ['message'], properties: { message: { type: 'string' }, ...extraProps } },
    ],
  }),
});

// { success:true, ...props } — para envelopes que NO usan `data` (login, /me, uploads)
const okRaw = (props, required = [], { code = 200, description = 'OK' } = {}) => ({
  _status: code,
  description,
  content: json({
    allOf: [REF.schema('Envelope'), { type: 'object', required, properties: props }],
  }),
});

// Descarga de archivo binario / csv
const file = (contentType, description = 'Archivo') => ({
  description,
  content: { [contentType]: { schema: { type: 'string', format: 'binary' } } },
});

// ── Catálogo de respuestas de error reutilizables ────────────────────────────
const ERRMAP = {
  400: 'ValidationError400',
  401: 'Error401',
  403: 'Error403',
  '403csrf': 'Error403Csrf',
  404: 'Error404',
  '404empresa': 'Error404Empresa',
  429: 'Error429',
  500: 'Error500',
};
const STATUS = { 400: 400, 401: 401, 403: 403, '403csrf': 403, 404: 404, '404empresa': 404, 429: 429, 500: 500 };

// errors(['401','403','403csrf']) → { 401: {$ref}, 403: {$ref} }
// Si aparecen '403' y '403csrf' juntos, gana el genérico (mismo status).
const errors = (keys = []) => {
  const out = {};
  for (const k of keys) {
    const status = STATUS[k];
    if (!status) throw new Error(`errors(): clave desconocida "${k}"`);
    if (out[status]) continue; // no pisar un 403 ya puesto
    out[status] = REF.resp(ERRMAP[k]);
  }
  return out;
};

/**
 * operation({ tag, id, summary, description?, security?, roles?, deprecated?,
 *             params?, query?, body?, bodyDescription?, responses, errors?, csrf? })
 */
function operation(cfg) {
  const {
    tag,
    id,
    summary,
    description,
    security,
    roles,
    deprecated,
    params = [],
    query = [],
    body,
    bodyRequired = true,
    bodyDescription,
    bodyContentType = 'application/json',
    responses = {},
    errors: errKeys = [],
    csrf = false,
  } = cfg;

  if (!tag || !id || !summary) throw new Error(`operation(): faltan tag/id/summary (${id || summary})`);

  const parameters = [
    ...params.map((p) => (typeof p === 'string' ? REF.param(p) : p)),
    ...query.map((p) => (typeof p === 'string' ? REF.param(p) : p)),
    ...(csrf ? [REF.param('csrfHeader')] : []),
  ];

  // Normaliza los responses: soporta que message()/okRaw() traigan `_status`.
  const normResponses = {};
  for (const [k, v] of Object.entries(responses)) {
    if (v && v._status) {
      const { _status, ...rest } = v;
      normResponses[_status] = rest;
    } else {
      normResponses[k] = v;
    }
  }

  const descParts = [];
  if (description) descParts.push(description);
  if (roles && roles.length) descParts.push(`**Roles:** ${roles.join(' · ')}`);

  // 429 (rate limiter global 1000/15min) y 500 aplican a TODA operación.
  const allErrKeys = [...errKeys, '429', '500'];

  const op = {
    tags: [tag],
    operationId: id,
    summary,
    responses: { ...normResponses, ...errors(allErrKeys) },
  };
  if (descParts.length) op.description = descParts.join('\n\n');
  if (deprecated) op.deprecated = true;
  if (parameters.length) op.parameters = parameters;
  if (security !== undefined) op.security = security;
  if (body) {
    const schema = typeof body === 'string' ? REF.schema(body) : body;
    op.requestBody = {
      required: bodyRequired,
      content: { [bodyContentType]: { schema } },
    };
    if (bodyDescription) op.requestBody.description = bodyDescription;
  }
  return op;
}

module.exports = { REF, ok, paginated, message, okRaw, file, errors, operation };
