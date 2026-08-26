'use strict';

const { esUrlValida } = require('./common.validator');

const CAMPOS_EDITABLES = ['descripcion', 'rubro', 'sitioWeb', 'telefono', 'direccion', 'ciudad', 'logo'];

/**
 * Valida el body de PUT /api/empresas/mi-empresa.
 * @returns {string|null}
 */
function validateUpdateEmpresa(body) {
  const camposValidos = CAMPOS_EDITABLES.filter((c) => body[c] !== undefined);
  if (camposValidos.length === 0) return 'No se enviaron campos válidos para actualizar.';
  if (body.sitioWeb && !esUrlValida(body.sitioWeb)) return 'El sitio web no tiene un formato de URL válido.';
  return null;
}

module.exports = { validateUpdateEmpresa };
