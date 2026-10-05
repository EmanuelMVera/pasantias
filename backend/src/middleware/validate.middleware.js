'use strict';

/**
 * Fábrica de middleware de validación.
 *
 * Recibe una función validadora que acepta req.body y devuelve:
 *   null / undefined        → válido, continúa al siguiente handler
 *   string                  → mensaje de error; responde 400 y corta la cadena
 *   { error, datos }        → (validarCampos) si hay error, 400; si no, los
 *                             valores NORMALIZADOS de `datos` (trim, email en
 *                             minúsculas, enteros, fechas, listas…) pisan los
 *                             de req.body. Los campos que el validador no
 *                             declara quedan como estaban: cada controller
 *                             sigue aplicando su propia whitelist.
 *
 * Uso en rutas:
 *   router.post('/', validate(miValidator), miController);
 */
const validate = (validatorFn) => (req, res, next) => {
  const resultado = validatorFn(req.body ?? {});
  const error = typeof resultado === 'string' ? resultado : resultado?.error;
  if (error) return res.status(400).json({ success: false, message: error });
  if (resultado && typeof resultado === 'object' && resultado.datos) {
    req.body = { ...(req.body ?? {}), ...resultado.datos };
  }
  next();
};

module.exports = validate;
