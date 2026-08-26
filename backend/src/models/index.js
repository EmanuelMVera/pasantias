/**
 * models/index.js — Inicialización y asociaciones de los modelos Sequelize.
 *
 * Changelog:
 * - v1.2: EmpresaUsuario (equipo de reclutadores)
 * - v1.3: Mensaje (chat directo)
 *         Notificacion añade prioridad, tipoVisual, accionURL
 * - v1.4: ActivityLog (auditoría de acciones del sistema)
 * - v1.5: SolicitudEmpresa (solicitudes de registro pendientes de aprobación)
 */

'use strict';
const sequelize = require('../config/database');

// ── Inicialización de modelos ─────────────────────────────────────────────────
const Usuario        = require('./usuario.model')(sequelize);
const Perfil         = require('./perfil.model')(sequelize);
const Empresa        = require('./empresa.model')(sequelize);
const Oferta         = require('./oferta.model')(sequelize);
const Postulacion    = require('./postulacion.model')(sequelize);
const Notificacion   = require('./notificacion.model')(sequelize);
const EmpresaUsuario = require('./empresaUsuario.model')(sequelize);
const Mensaje        = require('./mensaje.model')(sequelize);
const ActivityLog       = require('./activityLog.model')(sequelize);       // v1.4
const SolicitudEmpresa  = require('./solicitudEmpresa.model')(sequelize);  // v1.5
const SolicitudReclutador = require('./solicitudReclutador.model')(sequelize); // v1.7
const Archivo = require('./archivo.model')(sequelize); // EST-08 Fase 4
const PostulacionHistorialEstado = require('./postulacionHistorialEstado.model')(sequelize); // EST-08 Fase 3
const ConfiguracionInstitucional = require('./configuracionInstitucional.model')(sequelize); // EST-08 Fase 9 (adelantada)

// ── Asociaciones — Perfil ─────────────────────────────────────────────────────
Usuario.hasOne(Perfil, { foreignKey: 'usuarioId', as: 'perfil', onDelete: 'CASCADE' });
Perfil.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// ── Asociaciones — Empresa ────────────────────────────────────────────────────
Usuario.hasOne(Empresa, { foreignKey: 'usuarioId', as: 'empresa', onDelete: 'CASCADE' });
Empresa.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// ── Asociaciones — Oferta ─────────────────────────────────────────────────────
Empresa.hasMany(Oferta, { foreignKey: 'empresaId', as: 'ofertas', onDelete: 'CASCADE' });
Oferta.belongsTo(Empresa, { foreignKey: 'empresaId', as: 'empresa' });

// ── Asociaciones — Postulacion ────────────────────────────────────────────────
Usuario.hasMany(Postulacion, { foreignKey: 'usuarioId', as: 'postulaciones', onDelete: 'CASCADE' });
Postulacion.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Oferta.hasMany(Postulacion, { foreignKey: 'ofertaId', as: 'postulaciones', onDelete: 'CASCADE' });
Postulacion.belongsTo(Oferta, { foreignKey: 'ofertaId', as: 'oferta' });

// ── Asociaciones — Notificacion ───────────────────────────────────────────────
Usuario.hasMany(Notificacion, { foreignKey: 'usuarioId', as: 'notificaciones', onDelete: 'CASCADE' });
Notificacion.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// ── Asociaciones — EmpresaUsuario (equipo reclutadores) ───────────────────────
Empresa.hasMany(EmpresaUsuario, { foreignKey: 'empresaId', as: 'equipo', onDelete: 'CASCADE' });
EmpresaUsuario.belongsTo(Empresa, { foreignKey: 'empresaId', as: 'empresa' });
EmpresaUsuario.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Usuario.hasMany(EmpresaUsuario, { foreignKey: 'usuarioId', as: 'membresiasEmpresa', onDelete: 'CASCADE' });


// ── Asociaciones — Mensaje / Chat (v1.3) ──────────────────────────────────────
// Un usuario puede haber enviado muchos mensajes
Usuario.hasMany(Mensaje, { foreignKey: 'emisorId', as: 'mensajesEnviados', onDelete: 'CASCADE' });
Mensaje.belongsTo(Usuario, { foreignKey: 'emisorId', as: 'emisor' });

// Un usuario puede haber recibido muchos mensajes
Usuario.hasMany(Mensaje, { foreignKey: 'receptorId', as: 'mensajesRecibidos', onDelete: 'CASCADE' });
Mensaje.belongsTo(Usuario, { foreignKey: 'receptorId', as: 'receptor' });

// ── Asociaciones — ActivityLog (v1.4) ─────────────────────────────────────────
// Un usuario puede tener muchos registros en el log de actividad
Usuario.hasMany(ActivityLog, { foreignKey: 'usuarioId', as: 'activityLogs', onDelete: 'SET NULL' });
ActivityLog.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// ── Asociaciones — SolicitudReclutador (v1.7) ─────────────────────────────────
Empresa.hasMany(SolicitudReclutador, { foreignKey: 'empresaId', as: 'solicitudesReclutador', onDelete: 'CASCADE' });
SolicitudReclutador.belongsTo(Empresa, { foreignKey: 'empresaId', as: 'empresa' });

// ── Asociaciones — SolicitudEmpresa → Empresa creada (EST-08) ────────────────
SolicitudEmpresa.belongsTo(Empresa, { foreignKey: 'empresaIdCreada', as: 'empresaCreada' });

// ── Asociaciones — Archivo (EST-08 Fase 4 / SEC-01) ───────────────────────────
Usuario.hasMany(Archivo, { foreignKey: 'usuarioPropietarioId', as: 'archivos', onDelete: 'CASCADE' });
Archivo.belongsTo(Usuario, { foreignKey: 'usuarioPropietarioId', as: 'propietario' });
Postulacion.belongsTo(Archivo, { foreignKey: 'cvArchivoId', as: 'cvArchivo' });
Perfil.belongsTo(Archivo, { foreignKey: 'cvArchivoId', as: 'cvArchivo' });
Perfil.belongsTo(Archivo, { foreignKey: 'cartaArchivoId', as: 'cartaArchivo' });

// ── Asociaciones — PostulacionHistorialEstado (EST-08 Fase 3) ────────────────
Postulacion.hasMany(PostulacionHistorialEstado, { foreignKey: 'postulacionId', as: 'historialEstados', onDelete: 'CASCADE' });
PostulacionHistorialEstado.belongsTo(Postulacion, { foreignKey: 'postulacionId', as: 'postulacion' });
PostulacionHistorialEstado.belongsTo(Usuario, { foreignKey: 'cambiadoPorUsuarioId', as: 'cambiadoPor' });

// ── Exportaciones ─────────────────────────────────────────────────────────────
module.exports = {
  sequelize,
  Usuario,
  Perfil,
  Empresa,
  Oferta,
  Postulacion,
  Notificacion,
  EmpresaUsuario,   // v1.2 — equipo de reclutadores
  Mensaje,          // v1.3 — chat directo entre usuarios
  ActivityLog,      // v1.4 — auditoría del sistema
  SolicitudEmpresa, // v1.5 — solicitudes de registro de empresa
  SolicitudReclutador, // v1.7 — solicitudes de alta de reclutador
  Archivo, // EST-08 Fase 4 — metadata de archivos subidos
  PostulacionHistorialEstado, // EST-08 Fase 3 — auditoría de cambios de estado
  ConfiguracionInstitucional, // EST-08 Fase 9 — parámetros institucionales editables
};
