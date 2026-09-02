const HttpError = require('../utils/httpError');
const multer = require('multer');
const logger = require('../utils/logger');

/**
 * error.middleware.js — REF-ERR-01.
 *
 * Única respuesta para errores no manejados por ningún controller/service.
 * - HttpError (lanzado deliberadamente): status + message exactos, más
 *   `code` si el error lo trae (varios services lo usan: POSTULACION_DUPLICADA,
 *   EMAIL_DUPLICADO, PERFIL_PRIVADO, etc. — antes cada controller lo reenviaba
 *   con su propio helper local, ahora lo hace este middleware una sola vez).
 * - MulterError (rechazo de archivo por tamaño — el rechazo por tipo ya se
 *   lanza como HttpError desde el fileFilter): 400 con mensaje claro, nunca
 *   500 — un archivo demasiado grande es un error esperable, no interno.
 * - Errores de `express.json()` (body no parseable / demasiado grande): 400 /
 *   413 — son entrada inválida del cliente, no una falla del servidor.
 * - Cualquier otro error: nunca se reenvía `err.message` ni el stack al
 *   cliente — solo un mensaje genérico fijo + el `requestId` para que el
 *   usuario pueda citarlo a soporte. El detalle real (con stack) se loguea
 *   server-side vía el logger técnico (OPS-01), correlacionado por requestId.
 */
const errorMiddleware = (err, req, res, next) => {
  if (err instanceof HttpError) {
    const resp = { success: false, message: err.message };
    if (err.code) resp.code = err.code;
    return res.status(err.statusCode).json(resp);
  }

  // body-parser (express.json): JSON malformado o cuerpo sobre el límite.
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud no es JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'El cuerpo de la solicitud es demasiado grande.' });
  }

  if (err instanceof multer.MulterError) {
    const mensajes = {
      LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido.',
      LIMIT_FILE_COUNT: 'Se subieron demasiados archivos.',
      LIMIT_PART_COUNT: 'La solicitud tiene demasiadas partes.',
      LIMIT_FIELD_COUNT: 'La solicitud tiene demasiados campos.',
      LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado.',
    };
    return res.status(400).json({ success: false, message: mensajes[err.code] || 'Error al procesar el archivo subido.' });
  }

  (req.log || logger).error({ err, reqId: req.id }, 'unhandled_error');
  return res.status(500).json({ success: false, message: 'Error interno del servidor.', requestId: req.id });
};

module.exports = errorMiddleware;
