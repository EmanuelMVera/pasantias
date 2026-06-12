'use strict';

const empresaService = require('../services/empresa.service');
const equipoService  = require('../services/empresaEquipo.service');

const CAMPOS_EDITABLES_EMPRESA = [
  'descripcion', 'rubro', 'sitioWeb', 'telefono', 'direccion', 'ciudad', 'logo',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const _resolverEmpresa = empresaService.resolverEmpresaDelRequest;

// Maneja errores de service: reenvía HttpError tal cual; 500 para el resto.
function _handleServiceError(res, error, mensaje500) {
  if (error.statusCode) {
    const resp = { success: false, message: error.message };
    if (error.code) resp.code = error.code;
    return res.status(error.statusCode).json(resp);
  }
  console.error(mensaje500, error);
  return res.status(500).json({ success: false, message: mensaje500 });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const metricas = await empresaService.obtenerMetricasDashboard(empresa.id);

    return res.json({
      success: true,
      data: {
        empresa: { id: empresa.id, razonSocial: empresa.razonSocial, estadoAprobacion: empresa.estadoAprobacion },
        rolEnEquipo: req.miembroEmpresa?.rolInterno || null,
        ...metricas,
      },
    });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al obtener el dashboard.');
  }
};

// ── Ofertas propias ───────────────────────────────────────────────────────────

exports.getMisOfertas = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const data = await empresaService.obtenerOfertasConConteo(empresa.id);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al obtener las ofertas.');
  }
};

// ── Perfil de empresa ─────────────────────────────────────────────────────────

exports.getMiEmpresa = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });
    return res.json({ success: true, data: empresa });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al obtener la empresa.' });
  }
};

exports.updateMiEmpresa = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const updateData = {};
    for (const campo of CAMPOS_EDITABLES_EMPRESA) {
      if (req.body[campo] !== undefined) updateData[campo] = req.body[campo];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No se enviaron campos válidos para actualizar.' });
    }

    await empresa.update(updateData);
    return res.json({ success: true, data: empresa });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al actualizar la empresa.' });
  }
};

// ── Candidatos ────────────────────────────────────────────────────────────────

exports.getAllCandidatos = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const data = await empresaService.obtenerCandidatosConFoto(empresa.id, req.query.estado);
    return res.json({ success: true, total: data.length, data });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al obtener candidatos.');
  }
};

// ── Equipo ────────────────────────────────────────────────────────────────────

exports.getEquipo = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const data = await equipoService.listarEquipo(empresa);
    const rolEnEquipo = req.miembroEmpresa?.rolInterno ?? 'admin_empresa';
    return res.json({ success: true, total: data.length, rolEnEquipo, data });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al obtener el equipo.');
  }
};

exports.addMiembro = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const { email, rolInterno = 'reclutador', password, nombre = 'Invitado', apellido = '' } = req.body;
    const resultado = await equipoService.agregarMiembro(empresa, req.usuario.id, { email, rolInterno, password, nombre, apellido });

    const statusCode = resultado.usuarioCreado ? 201 : 200;
    return res.status(statusCode).json({ success: true, message: resultado.mensaje, data: resultado.data, usuarioCreado: resultado.usuarioCreado });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al agregar el miembro.');
  }
};

exports.resetPasswordMiembro = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const { email } = await equipoService.resetearPasswordMiembro(empresa, req.params.id, req.body.password);
    return res.json({ success: true, message: `Contraseña actualizada para ${email}.` });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al actualizar la contraseña.');
  }
};

exports.updateMiembro = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const miembro = await equipoService.actualizarMiembro(empresa, req.params.id, req.body);
    return res.json({ success: true, message: 'Miembro actualizado.', data: miembro });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al actualizar el miembro.');
  }
};

exports.removeMiembro = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    await equipoService.desactivarMiembro(empresa, req.params.id);
    return res.json({ success: true, message: 'Miembro eliminado del equipo.' });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al eliminar el miembro.');
  }
};

exports.solicitarReclutador = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const solicitud = await equipoService.solicitarReclutador(empresa, req.body);
    return res.status(201).json({
      success: true,
      message: 'Solicitud enviada correctamente. El administrador la revisará pronto.',
      data: solicitud,
    });
  } catch (error) {
    return _handleServiceError(res, error, 'Error al enviar la solicitud.');
  }
};

exports.getMisSolicitudesReclutador = async (req, res) => {
  try {
    const empresa = await _resolverEmpresa(req);
    if (!empresa) return res.status(404).json({ success: false, message: 'No tenés empresa registrada.' });

    const solicitudes = await equipoService.obtenerSolicitudesReclutador(empresa.id);
    return res.json({ success: true, total: solicitudes.length, data: solicitudes });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error al obtener las solicitudes.' });
  }
};
