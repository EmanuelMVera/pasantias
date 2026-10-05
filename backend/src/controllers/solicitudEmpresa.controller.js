'use strict';

const { SolicitudEmpresa } = require('../models');
const { notificarAdminsSistema } = require('../utils/notificador');
const solicitudEmpresaService = require('../services/solicitudEmpresa.service');

/**
 * POST /api/solicitudes-empresa
 *
 * validate(validateCrearSolicitud) ya dejó el body NORMALIZADO (formato
 * canónico): CUIT de 11 dígitos, emails en minúsculas, teléfonos +54…, textos
 * con trim, vacíos como null, carreras del catálogo y reclutadores limpios. Acá
 * no se vuelve a normalizar: se controla que el CUIT no esté ya en uso y se
 * persiste. Va envuelto en asyncHandler (los errores van a error.middleware).
 */
async function crearSolicitud(req, res) {
    const {
      razonSocial, cuit, rubro, sitioWeb, direccion, ciudad, email, telefono,
      responsableNombre, responsableApellido, responsableEmail, responsableTelefono, responsableCargo,
      carrerasInteres, descripcion, puestos,
      reclutadores,
    } = req.body;

    // La identidad de una empresa es su CUIT (no la razón social): 409 si ya
    // hay una empresa con ese CUIT o una solicitud pendiente.
    await solicitudEmpresaService.verificarCuitDisponible(cuit);

    const solicitud = await SolicitudEmpresa.create({
      razonSocial,
      cuit,
      rubro,
      sitioWeb: sitioWeb ?? null,
      direccion: direccion ?? null,
      ciudad: ciudad ?? null,
      email,
      telefono: telefono ?? null,
      responsableNombre,
      responsableApellido,
      responsableEmail,
      responsableTelefono: responsableTelefono ?? null,
      responsableCargo: responsableCargo ?? null,
      carrerasInteres: carrerasInteres ?? [],
      descripcion: descripcion ?? null,
      puestos: puestos ?? null,
      reclutadores: reclutadores ?? [],
      estado: 'pendiente',
    });

    // Aviso in-app a los admins del sistema: hay algo nuevo para revisar.
    // Fire-and-forget: un fallo al notificar no impide registrar la solicitud.
    notificarAdminsSistema({
      titulo: 'Nueva solicitud de empresa',
      mensaje: `"${solicitud.razonSocial}" solicitó registrarse en SisPasantías.`,
      accionURL: '/admin/solicitudes',
      logKey: 'notif_admin_solicitud_empresa_fallo',
    });

    // Confirmación de recepción al responsable (sin credenciales: la cuenta se
    // crea recién al aprobar). Fire-and-forget: el mailer registra el
    // resultado; un fallo de SMTP no invalida la solicitud ya guardada.
    void solicitudEmpresaService.enviarConfirmacionSolicitud(solicitud, { log: req.log });

    return res.status(201).json({
      success: true,
      message: 'Tu solicitud fue enviada. Será evaluada por el instituto.',
      data: { id: solicitud.id, estado: solicitud.estado, createdAt: solicitud.createdAt },
    });
}

module.exports = { crearSolicitud };
