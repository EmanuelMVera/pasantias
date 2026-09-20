'use strict';

const { Usuario, Empresa, EmpresaUsuario, Postulacion, Oferta } = require('../models');
const { Op } = require('sequelize');
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
 * Devuelve TODAS las membresías empresariales activas del usuario, cada una
 * con su rolInterno específico (a diferencia de resolverEmpresasDeUsuario,
 * que solo da el Set de IDs). Dueño directo sin fila EmpresaUsuario propia
 * para esa empresa cuenta como admin_empresa implícito.
 * @returns {Array<{ empresaId: number, rolInterno: 'admin_empresa'|'reclutador' }>}
 */
async function resolverMembresiasActivas(usuarioId) {
  const [directa, membresias] = await Promise.all([
    Empresa.findOne({ where: { usuarioId }, attributes: ['id'] }),
    EmpresaUsuario.findAll({ where: { usuarioId, activo: true }, attributes: ['empresaId', 'rolInterno'] }),
  ]);
  const lista = membresias.map((m) => ({ empresaId: m.empresaId, rolInterno: m.rolInterno }));
  if (directa && !lista.some((m) => m.empresaId === directa.id)) {
    lista.push({ empresaId: directa.id, rolInterno: 'admin_empresa' });
  }
  return lista;
}

/**
 * Postulaciones del alumno bajo la responsabilidad de `reclutadorId` dentro
 * de las empresas donde ese usuario es reclutador activo. "Responsable" =
 * oferta.creadaPorUsuarioId === reclutadorId, o NULL (ofertas huérfanas
 * previas a la migración 013 — mismo criterio que oferta.controller.js
 * usa para permitir editar/cambiar estado: cualquier reclutador activo de
 * la empresa asume la responsabilidad, sin abrir nada fuera de la empresa).
 */
async function evaluarPostulacionesConReclutador(alumnoId, reclutadorId, empresaIds) {
  if (!empresaIds.length) return [];
  return Postulacion.findAll({
    where: { usuarioId: alumnoId },
    attributes: ['id', 'estado', 'ofertaId'],
    include: [{
      model: Oferta,
      as: 'oferta',
      attributes: [],
      required: true,
      where: {
        empresaId: { [Op.in]: empresaIds },
        [Op.or]: [{ creadaPorUsuarioId: reclutadorId }, { creadaPorUsuarioId: null }],
      },
    }],
  });
}

// Prioridad de estado: si el alumno tiene varias Postulaciones con el mismo
// reclutador, se toma la más avanzada — hay una relación activa entre ellos
// aunque algún proceso puntual haya sido rechazado.
const PRIORIDAD_ESTADO = {
  en_revision: 0,
  rechazado: 1,
  preseleccionado: 2,
  entrevista: 3,
  contratado: 4,
};

const MOTIVO_SOLO_LECTURA = 'Esta conversación pertenece a un proceso de selección finalizado.';

/**
 * Evalúa acceso entre un alumno/egresado y un usuario de empresa (en
 * cualquier orden — el llamador ya resolvió quién es quién).
 */
async function evaluarAccesoAlumnoEmpresa(alumnoId, empresaUserId) {
  const membresias = await resolverMembresiasActivas(empresaUserId);

  if (membresias.length === 0) {
    return { puedeVer: false, puedeEnviar: false, motivo: 'El destinatario no tiene una cuenta de empresa activa.' };
  }

  const empresaIdsComoReclutador = membresias
    .filter((m) => m.rolInterno === 'reclutador')
    .map((m) => m.empresaId);

  if (empresaIdsComoReclutador.length === 0) {
    return {
      puedeVer: false,
      puedeEnviar: false,
      motivo: 'Los administradores de empresa no participan del chat con candidatos; contactá al reclutador a cargo de tu postulación.',
    };
  }

  const postulaciones = await evaluarPostulacionesConReclutador(alumnoId, empresaUserId, empresaIdsComoReclutador);
  if (postulaciones.length === 0) {
    return { puedeVer: false, puedeEnviar: false, motivo: 'No tenés una postulación con este reclutador.' };
  }

  const prioridadMax = Math.max(...postulaciones.map((p) => PRIORIDAD_ESTADO[p.estado] ?? 0));

  if (prioridadMax >= PRIORIDAD_ESTADO.preseleccionado) {
    return { puedeVer: true, puedeEnviar: true, motivo: null };
  }
  if (prioridadMax === PRIORIDAD_ESTADO.rechazado) {
    return { puedeVer: true, puedeEnviar: false, motivo: MOTIVO_SOLO_LECTURA };
  }
  return {
    puedeVer: false,
    puedeEnviar: false,
    motivo: 'Tu postulación todavía está en revisión; el chat se habilita cuando la empresa avance tu proceso.',
  };
}

/**
 * Core de decisión: evalúa si dos usuarios pueden ver el historial y/o
 * enviarse mensajes nuevos. Es la única fuente de verdad — los dos permisos
 * públicos (puedeVerConversacion / puedeEnviarMensaje) son wrappers finos
 * sobre este resultado, para no duplicar queries ni el árbol de reglas.
 *
 * Reglas:
 *   alumno/egresado ↔ alumno/egresado        → bloqueado
 *   alumno/egresado ↔ empresa (admin_empresa) → bloqueado
 *   alumno/egresado ↔ empresa (reclutador)    → según Postulacion (ver tabla abajo)
 *   empresa ↔ empresa (misma empresa)         → permitido
 *   empresa ↔ empresa (distinta)              → bloqueado
 *   admin ↔ cualquiera                        → bloqueado
 *   cuenta inactiva/deshabilitada             → bloqueado
 *
 * Estado de Postulacion → acceso:
 *   en_revision                        → ver: no, enviar: no
 *   preseleccionado/entrevista/contratado → ver: sí, enviar: sí
 *   rechazado                          → ver: sí (soloLectura), enviar: no
 *
 * @returns {{ puedeVer: boolean, puedeEnviar: boolean, motivo: ?string }}
 */
async function resolverAccesoChat(usuarioAId, usuarioBId) {
  try {
    const [usuarioA, usuarioB] = await Promise.all([
      Usuario.findByPk(usuarioAId, { attributes: ['id', 'rol', 'activo', 'habilitado'] }),
      Usuario.findByPk(usuarioBId, { attributes: ['id', 'rol', 'activo', 'habilitado'] }),
    ]);

    if (!usuarioA || !usuarioB) {
      return { puedeVer: false, puedeEnviar: false, motivo: 'Usuario no encontrado.' };
    }
    if (!usuarioA.activo || !usuarioA.habilitado) {
      return { puedeVer: false, puedeEnviar: false, motivo: 'Tu cuenta no está activa.' };
    }
    if (!usuarioB.activo || !usuarioB.habilitado) {
      return { puedeVer: false, puedeEnviar: false, motivo: 'El destinatario no tiene una cuenta activa.' };
    }
    if (usuarioA.rol === 'admin' || usuarioB.rol === 'admin') {
      return { puedeVer: false, puedeEnviar: false, motivo: 'Los administradores del sistema no participan en el chat.' };
    }

    const aEsAlumno   = ['alumno', 'egresado'].includes(usuarioA.rol);
    const bEsAlumno   = ['alumno', 'egresado'].includes(usuarioB.rol);
    const aEsEmpresa  = usuarioA.rol === 'empresa';
    const bEsEmpresa  = usuarioB.rol === 'empresa';

    if (aEsAlumno && bEsAlumno) {
      return {
        puedeVer: false,
        puedeEnviar: false,
        motivo: 'El chat entre alumnos y egresados no está disponible en esta plataforma.',
      };
    }

    if (aEsEmpresa && bEsEmpresa) {
      const misma = await comparteMismaEmpresa(usuarioAId, usuarioBId);
      if (misma) return { puedeVer: true, puedeEnviar: true, motivo: null };
      return { puedeVer: false, puedeEnviar: false, motivo: 'El chat entre empresas distintas no está habilitado en esta plataforma.' };
    }

    if (aEsAlumno && bEsEmpresa) return evaluarAccesoAlumnoEmpresa(usuarioAId, usuarioBId);
    if (aEsEmpresa && bEsAlumno) return evaluarAccesoAlumnoEmpresa(usuarioBId, usuarioAId);

    return { puedeVer: false, puedeEnviar: false, motivo: 'Combinación de roles no válida para el chat.' };
  } catch (err) {
    logger.error({ err }, 'resolverAccesoChat_fallo');
    return { puedeVer: false, puedeEnviar: false, motivo: 'Error al verificar permisos de chat.' };
  }
}

/**
 * Acceso al historial de la conversación (leer mensajes existentes, marcar
 * como leído). `soloLectura: true` cuando se puede ver pero no enviar
 * (candidato rechazado con historial previo).
 * @returns {{ ok: boolean, soloLectura: boolean, motivo: ?string }}
 */
async function puedeVerConversacion(usuarioAId, usuarioBId) {
  const r = await resolverAccesoChat(usuarioAId, usuarioBId);
  return { ok: r.puedeVer, soloLectura: r.puedeVer && !r.puedeEnviar, motivo: r.motivo };
}

/**
 * Capacidad de enviar un mensaje nuevo.
 * @returns {{ ok: boolean, motivo: ?string }}
 */
async function puedeEnviarMensaje(usuarioAId, usuarioBId) {
  const r = await resolverAccesoChat(usuarioAId, usuarioBId);
  return { ok: r.puedeEnviar, motivo: r.motivo };
}

module.exports = {
  resolverEmpresasDeUsuario,
  comparteMismaEmpresa,
  resolverMembresiasActivas,
  puedeVerConversacion,
  puedeEnviarMensaje,
};
