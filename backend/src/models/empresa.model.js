/**
 * empresa.model.js — Modelo Sequelize para la tabla "empresas".
 *
 * Representa la información institucional de una empresa empleadora.
 * Las personas asociadas a una empresa (quien la representa
 * institucionalmente y los reclutadores) viven exclusivamente en
 * `EmpresaUsuario` — ver empresaUsuario.model.js. `Empresa` en sí no tiene
 * ninguna referencia directa a un usuario (RBAC-06: se eliminó
 * `usuarioId`, el mecanismo "dueño directo" legacy que convivía con
 * `EmpresaUsuario` desde el baseline del esquema — migración 019).
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

    // Política institucional "empresa estándar vs. empresa de confianza"
    // (RBAC-05): una empresa confiable publica ofertas auto-aprobadas y
    // agrega reclutadores sin pasar por aprobación manual del admin del
    // sistema (moderación posterior, no previa). La confianza es de la
    // EMPRESA, nunca de un reclutador individual — todo el equipo la
    // hereda. Cambia solo vía PATCH /api/admin/empresas/:id/confianza.
    // STRING + CHECK (no ENUM) — mismo criterio que Oferta.estado/estadoModeracion.
    nivelConfianza: {
      type: DataTypes.STRING(20),
      defaultValue: 'estandar',
      validate: { isIn: [['estandar', 'confiable']] },
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
