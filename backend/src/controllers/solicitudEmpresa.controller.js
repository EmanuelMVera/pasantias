'use strict';

const { SolicitudEmpresa } = require('../models');
const { notificarAdminsSistema } = require('../utils/notificador');
const solicitudEmpresaService = require('../services/solicitudEmpresa.service');

/**
 * POST /api/solicitudes-empresa
 * La validación de inputs se realiza en validate.middleware + solicitudEmpresa.validator.
 * Este controller solo normaliza y persiste. Va envuelto en asyncHandler en la
 * ruta: cualquier error propaga a error.middleware (SEC-02), no se traga con un
 * 500 a mano.
 */
async function crearSolicitud(req, res) {
    const {
      razonSocial, cuit, rubro, sitioWeb, direccion, ciudad, email, telefono,
      responsableNombre, responsableApellido, responsableEmail, responsableTelefono, responsableCargo,
      carrerasInteres, descripcion, puestos,
      reclutadores,
    } = req.body;

    // Normalizar reclutadores: el validator ya garantizó que cada entrada es válida
    const reclutadoresLimpios = (Array.isArray(reclutadores) ? reclutadores : [])
      .filter((r) => r?.nombre?.trim() && r?.apellido?.trim() && r?.email?.trim())
      .map((r) => ({
        nombre:   r.nombre.trim(),
        apellido: r.apellido.trim(),
        email:    r.email.trim().toLowerCase(),
      }));

    // Normalizar carrerasInteres (puede venir como JSON string desde multipart)
    let carrerasArr = [];
    if (Array.isArray(carrerasInteres)) {
      carrerasArr = carrerasInteres;
    } else if (carrerasInteres) {
      try { carrerasArr = JSON.parse(carrerasInteres); } catch { carrerasArr = []; }
    }

    const solicitud = await SolicitudEmpresa.create({
      razonSocial:   razonSocial.trim(),
      cuit:          cuit.trim(),
      rubro:         rubro.trim(),
      sitioWeb:      sitioWeb?.trim()      || null,
      direccion:     direccion?.trim()     || null,
      ciudad:        ciudad?.trim()        || null,
      email:         email.trim().toLowerCase(),
      telefono:      telefono?.trim()      || null,
      responsableNombre:   responsableNombre.trim(),
      responsableApellido: responsableApellido.trim(),
      responsableEmail:    responsableEmail.trim().toLowerCase(),
      responsableTelefono: responsableTelefono?.trim() || null,
      responsableCargo:    responsableCargo?.trim()    || null,
      carrerasInteres: carrerasArr,
      descripcion: descripcion?.trim() || null,
      puestos:     puestos?.trim()     || null,
      reclutadores: reclutadoresLimpios,
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
