/**
 * usuario.model.js — Modelo Sequelize para la tabla "usuarios".
 *
 * Representa a todas las personas que pueden acceder al sistema:
 * alumnos, egresados, empresas y administradores.
 *
 * Campos destacados:
 * - rol: define qué tipo de usuario es y qué puede hacer en el sistema
 * - activo: permite desactivar una cuenta sin eliminarla
 * - habilitado: las cuentas de empresa empiezan deshabilitadas hasta que el admin las aprueba
 * - tokenReset / tokenResetExpira: se usan para el flujo de recuperación de contraseña
 * - ultimoAcceso: se actualiza cada vez que el usuario hace una request autenticada
 *
 * Changelog:
 * - v1.1: campos telefono, ubicacion, ultimoAcceso, fotoPerfil
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Usuario = sequelize.define('Usuario', {
    // Identificador único autoincremental
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Nombre de pila del usuario
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    // Apellido del usuario
    apellido: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    // Email único que se usa para iniciar sesión.
    // Se normaliza a minúsculas antes de guardar (set) para que el UNIQUE
    // de la base (sobre LOWER(email), ver migración) sea efectivo de
    // verdad: sin esto, "Juan@x.com" y "juan@x.com" serían cuentas
    // distintas pese al índice case-insensitive.
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
      set(value) {
        this.setDataValue('email', value ? String(value).trim().toLowerCase() : value);
      },
    },
    // Contraseña almacenada como hash bcrypt (nunca en texto plano)
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // Rol del usuario en el sistema — determina sus permisos y flujos de registro
    // STRING + CHECK (no ENUM de Postgres): los roles ya cambiaron una vez
    // (existió 'profesor', eliminado) y un ENUM deja valores muertos
    // irreversibles en el tipo de Postgres cuando eso vuelve a pasar.
    rol: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'alumno',
      validate: { isIn: [['alumno', 'egresado', 'empresa', 'admin']] },
    },
    // Si es false la cuenta está desactivada y no puede iniciar sesión
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Para empresas: empieza en false hasta que el admin aprueba la cuenta
    habilitado: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Para empresas: requiere aprobación del admin',
    },
    // Número de teléfono de contacto del usuario (opcional)
    telefono: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    // Ciudad / provincia / país donde reside el usuario
    ubicacion: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    // Fecha y hora del último acceso autenticado al sistema
    // Se actualiza automáticamente en cada request con token válido
    ultimoAcceso: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Ruta o URL de la foto de perfil del usuario (avatar)
    fotoPerfil: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    // Hash SHA-256 del token de recuperación (NUNCA el token en claro —
    // quien lea un backup/dump no puede reusar un reset pendiente).
    // El token real solo existe en el email enviado al usuario.
    tokenReset: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Fecha de expiración del token de recuperación (válido por 1 hora)
    tokenResetExpira: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Marca cuándo se usó el token de reset, para que no pueda reusarse
    // aunque todavía no haya expirado.
    tokenResetUsadoEn: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Se incrementa en cambio de contraseña / "cerrar sesión en todos los
    // dispositivos". Va en el payload del JWT: un token viejo con una
    // tokenVersion distinta a la actual se rechaza — es la forma barata
    // de revocar sesiones sin mantener una tabla de tokens activos.
    tokenVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'usuarios',  // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,       // Agrega automáticamente createdAt y updatedAt
    paranoid: true,         // Soft delete (deletedAt) — no se pierde el historial institucional
  });

  return Usuario;
};
