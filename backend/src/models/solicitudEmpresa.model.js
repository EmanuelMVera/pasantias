/**
 * solicitudEmpresa.model.js — Modelo Sequelize para la tabla "solicitudes_empresa".
 *
 * Representa una solicitud de registro de empresa enviada por un interesado.
 * NO crea ni una empresa ni un usuario; simplemente registra el pedido
 * para que el administrador lo evalúe y, si lo aprueba, cree la cuenta.
 *
 * Estados posibles:
 *  - 'pendiente'  → recién ingresada, aún no revisada
 *  - 'aprobado'   → el administrador aceptó la solicitud
 *  - 'rechazado'  → el administrador rechazó la solicitud
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SolicitudEmpresa = sequelize.define('SolicitudEmpresa', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Nombre legal o razón social de la empresa
    razonSocial: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },

    // CUIT de la empresa
    cuit: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    // Rubro o industria a la que pertenece
    rubro: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    // Dirección física de la empresa
    direccion: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // Ciudad donde opera la empresa
    ciudad: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // Email institucional de contacto de la empresa (visible en el perfil)
    // NO es el email de login — ese es responsableEmail
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    // Sitio web de la empresa
    sitioWeb: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    // Teléfono de contacto institucional
    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    // ── Datos del responsable / admin_empresa ─────────────────────────────────
    // El responsable será el usuario administrador de la empresa.
    // Sus credenciales de acceso se generan con responsableEmail como login.

    responsableNombre: {
      type: DataTypes.STRING(150),
      allowNull: true, // nullable en DB para compatibilidad con registros anteriores
    },

    responsableApellido: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    // Email de acceso/login del usuario admin_empresa que se creará al aprobar
    responsableEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    responsableTelefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    responsableCargo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // Carreras de interés para contratar pasantes (array almacenado como JSON)
    carrerasInteres: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },

    // Descripción general de la empresa
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Tipos de puestos o áreas donde buscan pasantes
    puestos: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Estado de la solicitud
    estado: {
      type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'),
      defaultValue: 'pendiente',
      allowNull: false,
    },

    // Reclutadores iniciales cargados en el formulario de registro
    // Array de { nombre, apellido, email } — se convierten en SolicitudReclutador al aprobar
    reclutadores: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },

    // ── Auditoría de revisión (EST-08 §4.7) ───────────────────────────────
    revisadaPorUsuarioId: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'usuarios', key: 'id' },
    },
    revisadaEn: { type: DataTypes.DATE, allowNull: true },
    motivoRechazo: { type: DataTypes.TEXT, allowNull: true },
    // Empresa que nació de esta solicitud al aprobarse — hoy esta tabla es
    // standalone sin ninguna FK, ese vínculo se perdía por completo.
    empresaIdCreada: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'empresas', key: 'id' },
    },

  }, {
    tableName: 'solicitudes_empresa',
    timestamps: true,  // Genera createdAt y updatedAt automáticamente
  });

  return SolicitudEmpresa;
};
