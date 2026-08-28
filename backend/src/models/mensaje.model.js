/**
 * mensaje.model.js — Modelo Sequelize para la tabla "mensajes".
 *
 * Implementa un sistema de mensajería directa (DM) entre usuarios del sistema.
 * Permite la comunicación entre:
 * - Alumno ↔ Empresa
 * - Alumno ↔ Profesor
 * - Admin ↔ cualquier usuario
 * - Cualquier combinación de roles autenticados
 *
 * Una "conversación" es el conjunto de mensajes entre dos usuarios.
 * No existe una tabla de conversaciones; se deriva de emisorId + receptorId.
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Mensaje = sequelize.define('Mensaje', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Usuario que envía el mensaje
    emisorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },

    // Usuario destinatario del mensaje
    receptorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },

    // Contenido del mensaje (texto libre)
    mensaje: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'El mensaje no puede estar vacío.' },
        len: { args: [1, 2000], msg: 'El mensaje debe tener entre 1 y 2000 caracteres.' },
      },
    },

    // Si el receptor ya leyó el mensaje
    leido: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

  }, {
    tableName: 'mensajes',   // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,        // createdAt = fecha de envío; updatedAt = fecha de lectura
    indexes: [
      // Lista de conversaciones e historial: filtro por emisor/receptor +
      // ORDER BY createdAt DESC LIMIT. Los índices simples (emisorId) /
      // (receptorId) del baseline quedaron subsumidos por estos compuestos
      // y se eliminaron en la migración 010-indices-escala.js (SCALE-02).
      { name: 'idx_mensajes_emisor_created', fields: ['emisorId', { name: 'createdAt', order: 'DESC' }] },
      { name: 'idx_mensajes_receptor_created', fields: ['receptorId', { name: 'createdAt', order: 'DESC' }] },
      { name: 'mensajes_emisor_receptor_idx', fields: ['emisorId', 'receptorId'] }, // par exacto (debeNotificarMensaje)
      { name: 'mensajes_receptor_leido_idx', fields: ['receptorId', 'leido'] }, // contar no leídos
    ],
  });

  return Mensaje;
};
