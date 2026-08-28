'use strict';

const { Usuario, Empresa, EmpresaUsuario } = require('../models');
const logger = require('../utils/logger');

/**
 * Devuelve un Set con todos los IDs de empresa a los que pertenece el usuario.
 * Considera propietario directo (empresa.usuarioId) y membresías en equipo.
 */
async function resolverEmpresasDeUsuario(usuarioId) {
  const [directa, membresias] = await Promise.all([
    Empresa.findOne({ where: { usuarioId }, attributes: ['id'] }),
    EmpresaUsuario.findAll({ where: { usuarioId, activo: true }, attributes: ['empresaId'] }),
  ]);
  const ids = new Set(membresias.map((m) => m.empresaId));
  if (directa) ids.add(directa.id);
  return ids;
}

/**
 * Devuelve true si ambos usuarios pertenecen a al menos una empresa en común.
 */
async function comparteMismaEmpresa(usuarioAId, usuarioBId) {
  const [empresasA, empresasB] = await Promise.all([
    resolverEmpresasDeUsuario(usuarioAId),
    resolverEmpresasDeUsuario(usuarioBId),
  ]);
  for (const id of empresasA) {
    if (empresasB.has(id)) return true;
  }
  return false;
}

/**
 * Verifica si dos usuarios pueden intercambiar mensajes según las reglas de roles.
 *
 * Reglas:
 *   alumno/egresado ↔ alumno/egresado   → ok
 *   alumno/egresado ↔ empresa           → ok
 *   empresa ↔ empresa (misma empresa)   → ok
 *   empresa ↔ empresa (distinta)        → denegado
 *   admin ↔ cualquiera                  → denegado
 *   cuenta inactiva/deshabilitada       → denegado
 *
 * @returns {{ ok: boolean, motivo?: string }}
 */
async function puedeChatear(emisorId, receptorId) {
  try {
    const [emisor, receptor] = await Promise.all([
      Usuario.findByPk(emisorId,  { attributes: ['id', 'rol', 'activo', 'habilitado'] }),
      Usuario.findByPk(receptorId, { attributes: ['id', 'rol', 'activo', 'habilitado'] }),
    ]);

    if (!emisor || !receptor) return { ok: false, motivo: 'Usuario no encontrado.' };

    if (!emisor.activo || !emisor.habilitado) {
      return { ok: false, motivo: 'Tu cuenta no está activa.' };
    }
    if (!receptor.activo || !receptor.habilitado) {
      return { ok: false, motivo: 'El destinatario no tiene una cuenta activa.' };
    }
    if (emisor.rol === 'admin' || receptor.rol === 'admin') {
      return { ok: false, motivo: 'Los administradores del sistema no participan en el chat.' };
    }

    const emisorEsAlumno    = ['alumno', 'egresado'].includes(emisor.rol);
    const receptorEsAlumno  = ['alumno', 'egresado'].includes(receptor.rol);
    const emisorEsEmpresa   = emisor.rol  === 'empresa';
    const receptorEsEmpresa = receptor.rol === 'empresa';

    if (emisorEsAlumno && receptorEsAlumno)  return { ok: true };
    if ((emisorEsAlumno && receptorEsEmpresa) || (emisorEsEmpresa && receptorEsAlumno)) return { ok: true };

    if (emisorEsEmpresa && receptorEsEmpresa) {
      const misma = await comparteMismaEmpresa(emisorId, receptorId);
      if (misma) return { ok: true };
      return { ok: false, motivo: 'El chat entre empresas distintas no está habilitado en esta plataforma.' };
    }

    return { ok: false, motivo: 'Combinación de roles no válida para el chat.' };
  } catch (err) {
    logger.error({ err }, 'puedeChatear_fallo');
    return { ok: false, motivo: 'Error al verificar permisos de chat.' };
  }
}

module.exports = {
  resolverEmpresasDeUsuario,
  comparteMismaEmpresa,
  puedeChatear,
};
