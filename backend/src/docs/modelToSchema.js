/**
 * modelToSchema.js — Deriva un JSON Schema (OpenAPI 3.1) a partir de los
 * atributos de un modelo Sequelize.
 *
 * Es una BASE: cada entidad en `components/schemas/` la compone con un `allOf`
 * a mano para agregar asociaciones (`empresa`, `usuario`, ...) y ajustes. No
 * intenta cubrir VIRTUAL, getters ni asociaciones — eso se agrega arriba.
 *
 * No necesita conexión a la base: `Model.getAttributes()` es metadata pura.
 */
'use strict';

// Mapea un DataType de Sequelize a un fragmento de JSON Schema.
function mapType(type) {
  // `type` es una instancia de DataTypes; `type.key` es 'STRING' | 'INTEGER' | ...
  const key = type && type.key;

  switch (key) {
    case 'INTEGER':
    case 'BIGINT':
    case 'SMALLINT':
      return { type: 'integer' };
    case 'FLOAT':
    case 'DOUBLE':
    case 'DECIMAL':
    case 'REAL':
      return { type: 'number' };
    case 'BOOLEAN':
      return { type: 'boolean' };
    case 'DATE':
    case 'DATEONLY':
      return { type: 'string', format: key === 'DATEONLY' ? 'date' : 'date-time' };
    case 'JSON':
    case 'JSONB':
      return {}; // cualquier forma
    case 'ARRAY':
      return { type: 'array', items: type.type ? mapType(type.type) : {} };
    case 'ENUM':
      return { type: 'string', enum: Array.isArray(type.values) ? [...type.values] : undefined };
    case 'UUID':
      return { type: 'string', format: 'uuid' };
    case 'TEXT':
    case 'CITEXT':
    case 'STRING':
    case 'CHAR':
    default: {
      const s = { type: 'string' };
      if (key === 'STRING' && typeof type.options?.length === 'number') {
        s.maxLength = type.options.length;
      }
      return s;
    }
  }
}

/**
 * @param {import('sequelize').ModelStatic<any>} model
 * @param {object} [opts]
 * @param {string[]} [opts.exclude]  atributos a omitir
 * @param {object}   [opts.extra]    propiedades extra (asociaciones, campos calculados)
 * @param {string[]} [opts.required] lista `required` explícita
 * @param {boolean}  [opts.nullableFromModel] si true, marca nullable los `allowNull`
 */
function modelToSchema(model, opts = {}) {
  const { exclude = [], extra = {}, required = [], nullableFromModel = false } = opts;
  const attrs = model.getAttributes();
  const properties = {};

  for (const [name, attr] of Object.entries(attrs)) {
    if (exclude.includes(name)) continue;
    let frag = mapType(attr.type);

    // ENUM sin values resueltos → dejar solo string
    if (frag.enum === undefined && frag.type === 'string' && attr.type?.key === 'ENUM') {
      frag = { type: 'string' };
    }

    if (nullableFromModel && attr.allowNull) {
      frag = { ...frag, type: Array.isArray(frag.type) ? frag.type : [frag.type, 'null'] };
    }

    if (attr.comment) frag.description = attr.comment;
    properties[name] = frag;
  }

  const schema = { type: 'object', properties: { ...properties, ...extra } };
  if (required.length) schema.required = required;
  return schema;
}

module.exports = modelToSchema;
module.exports.mapType = mapType;
