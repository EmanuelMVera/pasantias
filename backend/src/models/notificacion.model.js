/**
 * notificacion.model.js — Modelo Sequelize para la tabla "notificaciones".
 *
 * Las notificaciones se generan automáticamente en los siguientes eventos:
 * - Cuando un alumno se postula a una oferta → notifica a la empresa
 * - Cuando la empresa cambia el estado de una postulación → notifica al alumno
 * - El admin puede generar notificaciones de sistema
 *
 * Las notificaciones se muestran en el ícono de campana del Navbar.
 *
 * Changelog:
 * - v1.3: agregados campos prioridad, tipoVisual y accionURL para
 *         mejorar la presentación visual y la navegación contextual.
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notificacion = sequelize.define('Notificacion', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Usuario destinatario de la notificación
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },

    // Título corto de la notificación (ej: "Nueva postulación recibida")
    titulo: { type: DataTypes.STRING(200), allowNull: false },

    // Cuerpo completo del mensaje de la notificación
    mensaje: { type: DataTypes.TEXT, allowNull: false },

    // Tipo de notificación para filtrado y lógica de negocio
    // STRING + CHECK (no ENUM de Postgres): ya tiene un valor muerto ('aval',
    // sin ningún emisor activo en el código) — el mismo problema que dejó
    // 'profesor'/'propietario'/'gerente'/'viewer' atascados en otros ENUMs.
    tipo: {
      type: DataTypes.STRING(30),
      defaultValue: 'sistema',
      validate: {
        isIn: [[
          'postulacion', // Nueva postulación recibida (dirigida a empresa)
          'estado',      // Cambio de estado en postulación (dirigida a alumno)
          'oferta',      // Relacionada a una oferta de trabajo
          'aval',        // (legacy) aval académico — sin emisores activos hoy
          'chat',        // Nuevo mensaje de chat recibido
          'sistema',     // Mensaje general del sistema
        ]],
      },
    },

    // Si el usuario ya leyó la notificación (false = nueva, no leída)
    leida: { type: DataTypes.BOOLEAN, defaultValue: false },

    // URL interna legacy (se mantiene por compatibilidad con código existente)
    enlace: { type: DataTypes.STRING(255), allowNull: true },

    // ── Campos nuevos v1.3 ────────────────────────────────────────────────────

    // Nivel de importancia de la notificación
    // Afecta el orden de visualización y los estilos del frontend
    prioridad: {
      type: DataTypes.ENUM('baja', 'normal', 'alta', 'urgente'),
      defaultValue: 'normal',
    },

    // Estilo visual de la notificación en el frontend (color, ícono, badge)
    tipoVisual: {
      type: DataTypes.ENUM('info', 'success', 'warning', 'error'),
      defaultValue: 'info',
    },

    // URL explícita de la acción asociada a la notificación
    // Más semántico que 'enlace'; se usa cuando hay una acción directa disponible
    accionURL: { type: DataTypes.STRING(255), allowNull: true },

  }, {
    tableName: 'notificaciones', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,            // Agrega automáticamente createdAt y updatedAt
  });

  return Notificacion;
};
