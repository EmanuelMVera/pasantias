'use strict';

/**
 * pagination.js — SCALE-03.
 *
 * Contrato único de paginación para los endpoints de listado que crecen con
 * el volumen de datos (ofertas, candidatos, usuarios admin, logs, etc.).
 *
 *   Request:  ?page=<n>&limit=<m>   (+ los filtros propios de cada endpoint)
 *   Response: { success: true, data: [...], pagination: { page, limit, total, totalPages } }
 *
 * `limit` se clampea SIEMPRE a [1, maxLimit] — así `?limit=100000` devuelve
 * como mucho `maxLimit` filas, nunca un error ni la tabla entera.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Lee y sanea page/limit de req.query.
 * @param {object} query - req.query
 * @param {{ defaultLimit?: number, maxLimit?: number }} [opts]
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) {
  const rawPage = parseInt(query.page, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = parseInt(query.limit, 10);
  const wantLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(Math.max(1, wantLimit), maxLimit);

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Arma el objeto `pagination` a partir del count total.
 * `totalPages` nunca es 0 (un set vacío tiene 1 página vacía).
 * `page` se reporta clampeada a [1, totalPages] para que la UI no muestre
 * "página 5 de 3".
 * @param {number} total
 * @param {{ page: number, limit: number }} param1
 */
function buildPagination(total, { page, limit }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page: Math.min(page, totalPages), limit, total, totalPages };
}

/**
 * Sidecar `conteoPorEstado` (y similares): { valorColumna: cantidad } agrupando
 * por una columna sobre TODO el scope filtrado (no la página).
 * Un solo GROUP BY, barato con los índices de SCALE-02.
 * @param {import('sequelize').ModelStatic<any>} Model
 * @param {string} column - columna a agrupar (ej. 'estado')
 * @param {object} where - mismo filtro que el listado (sin page/limit)
 * @returns {Promise<Record<string, number>>}
 */
async function groupCount(Model, column, where) {
  const sequelize = Model.sequelize;
  const filas = await Model.findAll({
    where,
    attributes: [column, [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: [column],
    raw: true,
  });
  return filas.reduce((acc, f) => {
    if (f[column] != null) acc[f[column]] = Number(f.n);
    return acc;
  }, {});
}

module.exports = { parsePagination, buildPagination, groupCount, DEFAULT_LIMIT, MAX_LIMIT };
