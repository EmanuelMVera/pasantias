'use strict';

const fs = require('fs');
const archivoService = require('../services/archivo.service');

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

    res.setHeader('Content-Type', archivo.mimeType || 'application/octet-stream');
    const nombreDescarga = (archivo.nombreOriginal || 'archivo').replace(/"/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${nombreDescarga}"`);

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
