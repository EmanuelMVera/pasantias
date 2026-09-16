'use strict';

/**
 * demo.controller.js — estado público del escenario de presentación.
 *
 * Endpoint público (sin auth) que le permite al LoginPage saber si el
 * escenario demo (3 cuentas) está realmente cargado en esta base antes de
 * mostrar los botones de autocompletado — nunca afirma que las cuentas
 * existen si el seed no corrió. La fuente de verdad de los emails demo es
 * seedPresentacion.js (EMP_ADMIN/RECLUTA/ALUMNO): no se duplica la lista acá.
 */

const { escenarioExiste, EMP_ADMIN, RECLUTA, ALUMNO } = require('../utils/seedPresentacion');

const CUENTAS_DEMO = [
  { rol: 'Admin de empresa', email: EMP_ADMIN.email },
  { rol: 'Reclutador', email: RECLUTA.email },
  { rol: 'Alumno / Egresado', email: ALUMNO.email },
];

exports.getStatus = async (req, res) => {
  const enabled = await escenarioExiste();
  return res.json({ success: true, enabled, accounts: enabled ? CUENTAS_DEMO : [] });
};
