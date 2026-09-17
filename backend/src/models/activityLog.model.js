/**
 * activityLog.model.js — Modelo Sequelize para la tabla "activity_logs".
 *
 * Registra todas las acciones importantes realizadas en el sistema,
 * especialmente las del administrador: creación, edición, eliminación
 * de usuarios, aprobaciones de empresas, moderación de ofertas, etc.
 *
 * Campos:
 * - usuarioId    : quién realizó la acción (null si fue el sistema)
 * - accion       : tipo de acción ('crear_usuario', 'eliminar_usuario', 'login', ...)
 * - entidad      : tabla/entidad afectada ('usuario', 'empresa', 'oferta', ...)
 * - entidadId    : ID del registro afectado (opcional)
 * - detalle      : objeto JSON con contexto adicional (datos antes/después, motivo, etc.)
 * - ip           : dirección IP desde donde se realizó la acción
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ActivityLog = sequelize.define('ActivityLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // ID del usuario que realizó la acción (null = sistema/automático)
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
      onDelete: 'SET NULL',
    },
    // Tipo de acción realizada
    accion: {
      type: DataTypes.ENUM(
        'login',
        'logout',
        'crear_usuario',
        'editar_usuario',
        'eliminar_usuario',
        'cambiar_rol',
        'toggle_usuario',
        'aprobar_empresa',
        'rechazar_empresa',
        'aprobar_oferta',
        'rechazar_oferta',
        'crear_oferta',
        'cerrar_oferta',
        'postular',
        'cambiar_estado_postulacion',
        'aprobar_solicitud_empresa',
        'rechazar_solicitud_empresa',
        'aprobar_solicitud_reclutador',
        'rechazar_solicitud_reclutador',
        'solicitar_recuperacion_miembro', // EST-10
        'importar_alumnos_csv',          // migración 014 — faltaba acá (bug: quedaba
                                          // desincronizado del ENUM de Postgres y
                                          // Sequelize rechazaba el valor antes de
                                          // llegar a la DB, perdiendo la auditoría)
        'pausar_oferta',                 // migración 015 — RBAC-01
        'reactivar_oferta',              // migración 015 — RBAC-01
        'exportar_logs',                 // migración 015
        'exportar_estadisticas',         // migración 015
        'sistema'
      ),
      allowNull: false,
    },
    // Entidad principal afectada por la acción
    entidad: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // ID del registro afectado (ej: id del usuario editado)
    entidadId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // Información adicional en formato JSON (valores anteriores/nuevos, motivos, etc.)
    detalle: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    // IP desde donde se realizó la acción
    ip: {
      type: DataTypes.STRING(45), // Hasta 45 chars para soportar IPv6
      allowNull: true,
    },
    // OPS-01: id del request (X-Request-Id / req.id) que originó esta acción —
    // permite cruzar esta entrada de auditoría con los logs técnicos.
    requestId: {
      type: DataTypes.STRING(36),
      allowNull: true,
    },
  }, {
    tableName: 'activity_logs',
    timestamps: true,
    updatedAt: false, // Los logs son inmutables — solo tienen createdAt
  });

  return ActivityLog;
};
