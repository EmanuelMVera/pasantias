'use strict';

const archivoService = require('../services/archivo.service');
const storage = require('../services/storage');
const { contentDisposition } = require('../utils/archivoNombre');
const logger = require('../utils/logger');

// Tipos que es seguro mostrar embebidos (inline). El resto se fuerza a descarga.
const INLINE_OK = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * GET /api/archivos/:id
 * Sirve un archivo privado (CV, carta de recomendación) solo si el
 * solicitante es el propietario, un admin del sistema, o una empresa que
 * recibió una postulación real de ese candidato (SEC-01).
 *
 * DEPLOY-01: el archivo se stremea desde el backend que corresponda según
 * `Archivo.backend` (`local` = disco, `s3` = R2/S3). Nunca se redirige a una
 * URL pública ni se firma una URL — la autorización de arriba se respeta 100%.
 */
exports.descargar = async (req, res) => {
  try {
    const archivo = await archivoService.autorizarYObtenerArchivo(req.params.id, req.usuario);

    const adapter = storage.get(archivo.backend);
    const { stream, contentType } = await adapter.getObjectStream(archivo.claveAlmacenamiento, { area: 'private' });

    const mime = archivo.mimeType || contentType || 'application/octet-stream';
    const disposition = INLINE_OK.has(mime) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDisposition(archivo.nombreOriginal, disposition));
    // SEC-02: el navegador no debe adivinar el tipo ni ejecutar nada de este archivo.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    stream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo.' });
      else res.destroy(err);
    });
    stream.pipe(res);
  } catch (error) {
    if (error.notFound) {
      return res.status(404).json({ success: false, message: 'El archivo ya no existe en el almacenamiento.' });
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    (req.log || logger).error({ err: error }, 'descarga_archivo_fallo');
    return res.status(500).json({ success: false, message: 'Error al obtener el archivo.' });
  }
};
