/**
 * empresa.model.js — Modelo Sequelize para la tabla "empresas".
 *
 * Representa la información institucional de una empresa empleadora.
 * Cada empresa está vinculada a un Usuario con rol 'empresa'.
 *
 * Proceso de alta:
 * - La empresa se registra y queda en estado "pendiente"
 * - El administrador la aprueba o rechaza desde el panel de administración
 * - Solo las empresas "aprobadas" pueden publicar ofertas de pasantía
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Empresa = sequelize.define('Empresa', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Referencia al usuario dueño de esta empresa (clave foránea).
    // unique: la relación es 1:1 — sin esto, un bug podía crear dos
    // empresas para el mismo usuario sin que nada lo impidiera.
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'usuarios', key: 'id' },
    },

    // Nombre legal/comercial de la empresa
    razonSocial: { type: DataTypes.STRING(200), allowNull: false },

    // CUIT de la empresa: 11 dígitos, sin guiones (el frontend formatea
    // XX-XXXXXXXX-X para mostrar). Nullable a nivel columna por empresas
    // históricas sin CUIT cargado; obligatorio a nivel aplicación en altas
    // nuevas. El dígito verificador se valida en empresa.service.js.
    cuit: {
      type: DataTypes.STRING(11),
      allowNull: true,
      unique: true,
      validate: { is: /^[0-9]{11}$/ },
    },

    // Descripción general de la empresa (qué hace, su historia, etc.)
    descripcion: { type: DataTypes.TEXT, allowNull: true },

    // Rubro o industria a la que pertenece la empresa
    rubro: { type: DataTypes.STRING(150), allowNull: true },

    // URL del sitio web oficial de la empresa
    sitioWeb: { type: DataTypes.STRING(255), allowNull: true },

    // Número de contacto de la empresa
    telefono: { type: DataTypes.STRING(30), allowNull: true },

    // Dirección física de la empresa
    direccion: { type: DataTypes.STRING(255), allowNull: true },

    // Ciudad donde opera la empresa
    ciudad: { type: DataTypes.STRING(100), allowNull: true },

    // Ruta al logo de la empresa (imagen subida al servidor)
    logo: { type: DataTypes.STRING(255), allowNull: true },

    // Estado de aprobación por parte del administrador
    // 'pendiente' → esperando revisión | 'aprobada' → puede publicar ofertas | 'rechazada' → acceso denegado
    estadoAprobacion: {
      type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
      defaultValue: 'pendiente',
    },

    // ── Auditoría de aprobación (EST-08 §4.7) ─────────────────────────────
    // Quién y cuándo aprobó/rechazó, y por qué — hoy solo quedaba en
    // activity_logs genérico, que se depura por retención y no está
    // pensado para responder "¿por qué se rechazó esta empresa?".
    aprobadaPorUsuarioId: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'usuarios', key: 'id' },
    },
    aprobadaEn: { type: DataTypes.DATE, allowNull: true },
    motivoRechazo: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'empresas', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,      // Agrega automáticamente createdAt y updatedAt
    paranoid: true,        // Soft delete — no se pierde el historial de ofertas/postulaciones
  });

  return Empresa;
};
