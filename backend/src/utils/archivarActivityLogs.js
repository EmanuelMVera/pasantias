'use strict';

/**
 * archivarActivityLogs.js — OPS-01.
 *
 * Política de retención de `activity_logs`: las filas más viejas que
 * ACTIVITY_LOG_RETENTION_DAYS (default 365) se EXPORTAN a un .jsonl.gz bajo
 * backend/archive/ y RECIÉN ENTONCES se borran de la tabla, en lotes.
 *
 * "No eliminar logs históricos": el archivo .jsonl.gz ES el histórico. El
 * borrado solo ocurre con --apply y después de verificar que el archivo tiene
 * exactamente la misma cantidad de filas que se van a borrar.
 *
 *   npm run logs:archivar            # dry-run: informa, no toca nada
 *   npm run logs:archivar -- --apply # ejecuta
 *
 * A escala real el siguiente paso es particionar la tabla por rango mensual
 * (PARTITION BY RANGE ("createdAt")) — DROP de particiones viejas es O(1).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Op } = require('sequelize');
const { ActivityLog, sequelize } = require('../models');
const logger = require('./logger');

const ARCHIVE_DIR = path.join(__dirname, '../../archive');
const LOTE = 5000;

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * @param {{ apply?: boolean, retentionDays?: number }} [opts]
 * @returns {Promise<{ archivadas: number, borradas: number, archivo: string|null }>}
 */
async function archivar({ apply = false, retentionDays } = {}) {
  const dias = Number.isFinite(retentionDays)
    ? retentionDays
    : Number(process.env.ACTIVITY_LOG_RETENTION_DAYS) || 365;
  const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const total = await ActivityLog.count({ where: { createdAt: { [Op.lt]: corte } } });
  if (total === 0) {
    logger.info({ corte, dias }, 'archivar_activity_logs: nada para archivar');
    return { archivadas: 0, borradas: 0, archivo: null };
  }

  const rango = await ActivityLog.findOne({
    where: { createdAt: { [Op.lt]: corte } },
    attributes: [
      [sequelize.fn('MIN', sequelize.col('createdAt')), 'min'],
      [sequelize.fn('MAX', sequelize.col('createdAt')), 'max'],
    ],
    raw: true,
  });

  if (!apply) {
    logger.info(
      { total, corte, dias, desde: rango.min, hasta: rango.max },
      `archivar_activity_logs: DRY-RUN — archivaría ${total} filas (usar --apply para ejecutar)`,
    );
    return { archivadas: total, borradas: 0, archivo: null };
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const nombre = `activity_logs_${yyyymmdd(new Date(rango.min))}_${yyyymmdd(new Date(rango.max))}_${Date.now()}.jsonl.gz`;
  const destino = path.join(ARCHIVE_DIR, nombre);

  // 1. Exportar por lotes → NDJSON gzip
  const gzip = zlib.createGzip();
  const ws = fs.createWriteStream(destino);
  gzip.pipe(ws);

  let escritas = 0;
  let ultimoId = 0;
  for (;;) {
    const filas = await ActivityLog.findAll({
      where: { createdAt: { [Op.lt]: corte }, id: { [Op.gt]: ultimoId } },
      order: [['id', 'ASC']],
      limit: LOTE,
      raw: true,
    });
    if (filas.length === 0) break;
    for (const f of filas) {
      if (!gzip.write(JSON.stringify(f) + '\n')) await new Promise((r) => gzip.once('drain', r));
      escritas++;
    }
    ultimoId = filas[filas.length - 1].id;
  }
  await new Promise((resolve, reject) => {
    gzip.end();
    ws.on('finish', resolve);
    ws.on('error', reject);
  });

  // 2. Verificar antes de borrar nada
  if (escritas !== total) {
    logger.error({ escritas, total, destino }, 'archivar_activity_logs: el archivo no coincide, NO se borra nada');
    return { archivadas: escritas, borradas: 0, archivo: destino };
  }

  // 3. Borrar en lotes (Postgres no soporta DELETE ... LIMIT → subquery por id)
  let borradas = 0;
  for (;;) {
    const [, meta] = await sequelize.query(
      `DELETE FROM "activity_logs"
       WHERE id IN (
         SELECT id FROM "activity_logs" WHERE "createdAt" < :corte ORDER BY id LIMIT :lote
       )`,
      { replacements: { corte, lote: LOTE } },
    );
    const n = meta.rowCount || 0;
    borradas += n;
    if (n < LOTE) break;
  }

  logger.info({ archivadas: escritas, borradas, archivo: destino }, 'archivar_activity_logs: OK');
  return { archivadas: escritas, borradas, archivo: destino };
}

module.exports = { archivar, ARCHIVE_DIR };

// CLI
if (require.main === module) {
  const apply = process.argv.includes('--apply');
  archivar({ apply })
    .then(() => sequelize.close())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.fatal({ err }, 'archivar_activity_logs falló');
      process.exit(1);
    });
}
