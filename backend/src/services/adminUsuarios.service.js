'use strict';

/**
 * adminUsuarios.service.js — REF-ADMIN-01.
 *
 * CRUD de usuarios del panel de administración. Extraído literal de
 * admin.routes.js — sin cambios de comportamiento. La validación de legajo
 * (regex + duplicado) queda duplicada entre crearUsuario/actualizarUsuario
 * tal como estaba antes del refactor (deliberado, ver plan REF-ADMIN-01).
 */

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Usuario, Perfil, Empresa, EmpresaUsuario, ActivityLog, ConfiguracionInstitucional } = require('../models');
const HttpError = require('../utils/httpError');

async function logAction({ usuarioId, accion, entidad, entidadId, detalle, ip }) {
  try {
    await ActivityLog.create({ usuarioId, accion, entidad, entidadId, detalle, ip });
  } catch (e) {
    console.warn('[ActivityLog] Error al registrar acción:', e.message);
  }
}

async function listarUsuarios({ rol, activo, q }) {
  const where = {};
  if (rol) where.rol = rol;
  if (activo !== undefined) where.activo = activo === 'true';
  if (q) {
    where[Op.or] = [
      { nombre:   { [Op.iLike]: `%${q}%` } },
      { apellido: { [Op.iLike]: `%${q}%` } },
      { email:    { [Op.iLike]: `%${q}%` } },
    ];
  }

  return Usuario.findAll({
    where,
    attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
    order: [['createdAt', 'DESC']],
    // Para usuarios con rol 'empresa' incluimos su membresía y empresa;
    // para alumno/egresado incluimos el legajo (vive en Perfil).
    include: [
      {
        model: EmpresaUsuario,
        as: 'membresiasEmpresa',
        required: false,
        where: { activo: true },
        attributes: ['rolInterno'],
        include: [{
          model: Empresa,
          as: 'empresa',
          attributes: ['id', 'razonSocial'],
        }],
      },
      { model: Perfil, as: 'perfil', required: false, attributes: ['legajo'] },
    ],
  });
}

async function obtenerUsuario(id) {
  const usuario = await Usuario.findByPk(id, {
    attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
  });
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');
  return usuario;
}

async function _validarLegajoNuevo(legajo) {
  if (!legajo || !legajo.trim()) {
    throw new HttpError(400, 'El legajo es obligatorio para alumnos y egresados.');
  }
  const legajoNormalizado = legajo.trim().toUpperCase();

  const configRegex = await ConfiguracionInstitucional.findOne({ where: { clave: 'legajo.regex' } });
  const regex = new RegExp(configRegex?.valor || '^[A-Z0-9-]{3,20}$');
  if (!regex.test(legajoNormalizado)) {
    throw new HttpError(400, 'El legajo no tiene un formato válido.');
  }

  const legajoExistente = await Perfil.findOne({ where: { legajo: legajoNormalizado } });
  if (legajoExistente) {
    throw new HttpError(400, 'Ya existe un alumno/egresado con ese legajo.');
  }
  return legajoNormalizado;
}

async function crearUsuario({ nombre, apellido, email, password, rol, telefono, ubicacion, legajo }, { actorUsuarioId, ip }) {
  if (!nombre || !apellido || !email || !password || !rol) {
    throw new HttpError(400, 'Faltan campos obligatorios (nombre, apellido, email, password, rol).');
  }

  let legajoNormalizado = null;
  if (['alumno', 'egresado'].includes(rol)) {
    legajoNormalizado = await _validarLegajoNuevo(legajo);
  }

  // Verifica que el email no esté registrado
  const existe = await Usuario.findOne({ where: { email } });
  if (existe) throw new HttpError(400, 'Ya existe un usuario con ese email.');

  const hash = await bcrypt.hash(password, 10);
  const nuevo = await Usuario.create({
    nombre, apellido, email, password: hash, rol,
    telefono: telefono || null, ubicacion: ubicacion || null,
    activo: true, habilitado: true,
  });

  // Alumno/egresado necesitan su fila de Perfil desde el alta (ya no existe
  // el autorregistro público que la creaba); sin esto, PUT /users/perfil y
  // la subida de CV/carta quedarían sin efecto (Perfil.update sobre 0 filas).
  // El legajo se carga en esta misma alta — si el Perfil se creara vacío y
  // se completara después, quedaría una ventana sin legajo (EST-08 §2.2).
  if (['alumno', 'egresado'].includes(rol)) {
    await Perfil.create({ usuarioId: nuevo.id, legajo: legajoNormalizado });
  }

  await logAction({
    usuarioId: actorUsuarioId,
    accion: 'crear_usuario',
    entidad: 'usuario',
    entidadId: nuevo.id,
    detalle: { nombre, apellido, email, rol },
    ip,
  });

  const { password: _, ...data } = nuevo.toJSON();
  return data;
}

async function actualizarUsuario(id, body, { actorUsuarioId, ip }) {
  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

  // Evitar que el admin se auto-edite el rol a algo que lo deje sin acceso
  if (String(id) === String(actorUsuarioId) && body.rol && body.rol !== 'admin') {
    throw new HttpError(403, 'No podés cambiar tu propio rol de administrador.');
  }

  const {
    nombre, apellido, email, rol, activo,
    telefono, ubicacion, password, legajo,
  } = body;

  const updateData = {};
  if (nombre    !== undefined) updateData.nombre    = nombre;
  if (apellido  !== undefined) updateData.apellido  = apellido;
  if (email     !== undefined) updateData.email     = email;
  if (rol       !== undefined) updateData.rol       = rol;
  if (activo    !== undefined) updateData.activo    = activo;
  if (telefono  !== undefined) updateData.telefono  = telefono;
  if (ubicacion !== undefined) updateData.ubicacion = ubicacion;
  if (password) updateData.password = await bcrypt.hash(password, 10);

  const antes = { rol: usuario.rol, activo: usuario.activo };
  await usuario.update(updateData);

  // legajo vive en Perfil, no en Usuario — solo aplica a alumno/egresado
  if (legajo !== undefined && ['alumno', 'egresado'].includes(usuario.rol)) {
    const legajoNormalizado = legajo?.trim() ? legajo.trim().toUpperCase() : null;
    if (legajoNormalizado) {
      const configRegex = await ConfiguracionInstitucional.findOne({ where: { clave: 'legajo.regex' } });
      const regex = new RegExp(configRegex?.valor || '^[A-Z0-9-]{3,20}$');
      if (!regex.test(legajoNormalizado)) {
        throw new HttpError(400, 'El legajo no tiene un formato válido.');
      }
      const legajoDuplicado = await Perfil.findOne({ where: { legajo: legajoNormalizado, usuarioId: { [Op.ne]: usuario.id } } });
      if (legajoDuplicado) {
        throw new HttpError(400, 'Ya existe otro alumno/egresado con ese legajo.');
      }
    }
    await Perfil.update({ legajo: legajoNormalizado }, { where: { usuarioId: usuario.id } });
  }

  const accion = rol && rol !== antes.rol ? 'cambiar_rol' : 'editar_usuario';
  await logAction({
    usuarioId: actorUsuarioId,
    accion,
    entidad: 'usuario',
    entidadId: usuario.id,
    detalle: { antes, despues: { rol: usuario.rol, activo: usuario.activo } },
    ip,
  });

  const { password: _, tokenReset: __, tokenResetExpira: ___, ...data } = usuario.toJSON();
  return data;
}

async function eliminarUsuario(id, { actorUsuarioId, ip }) {
  if (String(id) === String(actorUsuarioId)) {
    throw new HttpError(403, 'No podés eliminar tu propia cuenta de administrador.');
  }

  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

  await usuario.update({ activo: false });

  await logAction({
    usuarioId: actorUsuarioId,
    accion: 'eliminar_usuario',
    entidad: 'usuario',
    entidadId: usuario.id,
    detalle: { nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, rol: usuario.rol },
    ip,
  });
}

async function toggleUsuario(id, { actorUsuarioId, ip }) {
  if (String(id) === String(actorUsuarioId)) {
    throw new HttpError(403, 'No podés cambiar el estado de tu propia cuenta de administrador.');
  }

  const usuario = await Usuario.findByPk(id);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

  await usuario.update({ activo: !usuario.activo });

  await logAction({
    usuarioId: actorUsuarioId,
    accion: 'toggle_usuario',
    entidad: 'usuario',
    entidadId: usuario.id,
    detalle: { nuevoEstado: usuario.activo },
    ip,
  });

  return usuario;
}

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario,
  toggleUsuario,
};
