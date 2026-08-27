'use strict';

const { EmpresaUsuario, Usuario, SolicitudReclutador } = require('../models');
const HttpError = require('../utils/httpError');
const authService = require('./auth.service');

async function listarEquipo(empresa) {
  const equipo = await EmpresaUsuario.findAll({
    where: { empresaId: empresa.id },
    include: [{
      model: Usuario,
      as: 'usuario',
      attributes: ['id', 'nombre', 'apellido', 'email', 'fotoPerfil', 'ultimoAcceso'],
    }],
    order: [
      ['rolInterno', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  const adminPresenteEnTabla = equipo.some((m) => m.usuarioId === empresa.usuarioId);
  let data = equipo.map((m) => m.toJSON());

  // Cuentas creadas antes de la feature multi-usuario pueden no tener registro
  // en empresa_usuarios; se inserta al admin virtualmente para que el frontend
  // detecte correctamente su rol.
  if (!adminPresenteEnTabla) {
    const usuarioAdmin = await Usuario.findByPk(empresa.usuarioId, {
      attributes: ['id', 'nombre', 'apellido', 'email', 'fotoPerfil', 'ultimoAcceso'],
    });
    if (usuarioAdmin) {
      data.unshift({
        id: null,
        empresaId: empresa.id,
        usuarioId: empresa.usuarioId,
        rolInterno: 'admin_empresa',
        activo: true,
        esAdminVirtual: true,
        usuario: usuarioAdmin.toJSON(),
        createdAt: empresa.createdAt,
        updatedAt: empresa.updatedAt,
      });
    }
  }

  return data;
}

/**
 * Dispara un email de recuperación de acceso para un miembro del equipo,
 * reutilizando el mismo mecanismo de token que el flujo público de
 * "olvidé mi contraseña" (auth.service.js). El admin_empresa NUNCA elige
 * ni conoce la contraseña — solo el reclutador la establece, siguiendo el
 * link del email hasta /reset-password/:token (EST-10).
 */
async function solicitarRecuperacionAcceso(empresa, miembroId) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
    include: [{ model: Usuario, as: 'usuario' }],
  });

  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No podés enviarte una recuperación de acceso a vos mismo desde el panel de equipo. Usá la opción "Olvidé mi contraseña" del login.');
  }

  const token = authService.generarTokenReset();
  const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora, igual que el flujo público
  await miembro.usuario.update({
    tokenReset: authService.hashTokenReset(token),
    tokenResetExpira: expira,
    tokenResetUsadoEn: null,
  });

  await authService.enviarEmailReset(miembro.usuario.email, token);

  return { email: miembro.usuario.email, usuarioId: miembro.usuario.id };
}

async function actualizarMiembro(empresa, miembroId, { rolInterno, activo }) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
  });
  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No se puede modificar al administrador de empresa desde el panel de equipo.');
  }

  const updateData = {};

  if (rolInterno !== undefined) {
    if (rolInterno === 'admin_empresa') {
      throw new HttpError(400, 'No se puede asignar el rol admin_empresa a otro miembro.');
    }
    const rolesValidos = ['reclutador'];
    if (!rolesValidos.includes(rolInterno)) {
      throw new HttpError(400, `Rol inválido. Solo se puede asignar 'reclutador'.`);
    }
    updateData.rolInterno = rolInterno;
  }

  if (activo !== undefined) updateData.activo = activo;

  await miembro.update(updateData);
  return miembro;
}

async function desactivarMiembro(empresa, miembroId) {
  const miembro = await EmpresaUsuario.findOne({
    where: { id: miembroId, empresaId: empresa.id },
  });
  if (!miembro) throw new HttpError(404, 'Miembro no encontrado.');

  if (miembro.rolInterno === 'admin_empresa') {
    throw new HttpError(403, 'No se puede eliminar al administrador de empresa.');
  }

  await miembro.update({ activo: false });
}

async function solicitarReclutador(empresa, { nombre, apellido, email }) {
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim()) {
    throw new HttpError(400, 'Nombre, apellido y email son requeridos.');
  }

  const usuarioRegistrado = await Usuario.findOne({ where: { email: email.trim() } });
  if (usuarioRegistrado) {
    const esMiembro = await EmpresaUsuario.findOne({
      where: { empresaId: empresa.id, usuarioId: usuarioRegistrado.id, activo: true },
    });
    if (esMiembro) {
      const err = new HttpError(400, 'Ese email ya corresponde a un miembro activo del equipo.');
      err.code = 'YA_ES_MIEMBRO';
      throw err;
    }
    const err = new HttpError(400, 'Ese email ya tiene una cuenta registrada en el sistema. Contactate con el administrador si necesitás vincularlo a tu empresa.');
    err.code = 'EMAIL_REGISTRADO';
    throw err;
  }

  const solicitudPendiente = await SolicitudReclutador.findOne({
    where: { empresaId: empresa.id, email: email.trim().toLowerCase(), estado: 'pendiente' },
  });
  if (solicitudPendiente) {
    const err = new HttpError(400, 'Ya hay una solicitud pendiente para ese email en tu empresa.');
    err.code = 'EMAIL_SOLICITUD_PENDIENTE';
    throw err;
  }

  return SolicitudReclutador.create({
    empresaId: empresa.id,
    nombre:    nombre.trim(),
    apellido:  apellido.trim(),
    email:     email.trim().toLowerCase(),
    estado:    'pendiente',
  });
}

async function obtenerSolicitudesReclutador(empresaId) {
  return SolicitudReclutador.findAll({
    where: { empresaId },
    order: [['createdAt', 'DESC']],
  });
}

module.exports = {
  listarEquipo,
  solicitarRecuperacionAcceso,
  actualizarMiembro,
  desactivarMiembro,
  solicitarReclutador,
  obtenerSolicitudesReclutador,
};
