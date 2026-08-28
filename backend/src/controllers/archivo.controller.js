'use strict';

const fs = require('fs');
const archivoService = require('../services/archivo.service');
const { contentDisposition } = require('../utils/archivoNombre');

// Tipos que es seguro mostrar embebidos (inline). El resto se fuerza a descarga.
const INLINE_OK = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

/**
 * GET /api/archivos/:id
 * Sirve un archivo privado (CV, carta de recomendación) solo si el
 * solicitante es el propietario, un admin del sistema, o una empresa que
 * recibió una postulación real de ese candidato (SEC-01).
 */
exports.descargar = async (req, res) => {
  try {
    const archivo = await archivoService.autorizarYObtenerArchivo(req.params.id, req.usuario);
    const rutaAbsoluta = archivoService.resolverRutaSegura(archivo.claveAlmacenamiento);

    const mime = archivo.mimeType || 'application/octet-stream';
    const disposition = INLINE_OK.has(mime) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDisposition(archivo.nombreOriginal, disposition));
    // SEC-02: el navegador no debe adivinar el tipo ni ejecutar nada de este archivo.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    const stream = fs.createReadStream(rutaAbsoluta);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error al leer el archivo.' });
    });
    stream.pipe(res);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('[GET /archivos/:id]', error);
    return res.status(500).json({ success: false, message: 'Error al obtener el archivo.' });
  }
};
