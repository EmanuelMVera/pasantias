/**
 * postulacion.model.js — Modelo Sequelize para la tabla "postulaciones".
 *
 * Representa la acción de un alumno/egresado de aplicar a una oferta de pasantía.
 *
 * Restricción importante:
 * - Un mismo usuario no puede postularse dos veces a la misma oferta
 *   (índice único compuesto por usuarioId + ofertaId)
 *
 * Flujo de estados:
 *
 *   en_revision
 *       ↓
 *   preseleccionado
 *       ↓
 *   entrevista
 *       ↓               ↘
 *   contratado         rechazado
 *
 * El detalle de quién cambió qué y cuándo vive en
 * PostulacionHistorialEstado, no en este campo (que solo guarda el
 * estado actual).
 *
 * Changelog:
 * - v1.2: agregados 'entrevista' y 'rechazado' al ENUM de estado
 * - v1.3 (EST-08): consolidados los pares legacy/alias
 *   (entrevista_programada→entrevista, no_seleccionado→rechazado);
 *   agregado cvArchivoId
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Postulacion = sequelize.define('Postulacion', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Usuario que se postula (alumno o egresado)
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },

    // Oferta a la que se postula el usuario
    ofertaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'ofertas', key: 'id' },
    },

    // Texto libre que el alumno puede escribir para presentarse a la empresa
    cartaPresentacion: { type: DataTypes.TEXT, allowNull: true },

    // Estado actual del proceso de selección para esta postulación.
    // EST-08 §4.8: se consolidaron los pares legacy/alias
    // (entrevista_programada→entrevista, no_seleccionado→rechazado) que
    // convivían desde Etapa 4 — toda query que filtrara por estado tenía
    // que acordarse de incluir ambos. Los valores legacy se migraron a
    // los canónicos en la migración correspondiente y ya no se aceptan
    // acá; el historial de qué pasó y cuándo ahora vive en
    // PostulacionHistorialEstado, no en el propio valor de este campo.
    estado: {
      type: DataTypes.STRING(30),
      defaultValue: 'en_revision',
      validate: {
        isIn: [[
          'en_revision',     // Recién enviada, esperando revisión de la empresa
          'preseleccionado', // La empresa mostró interés inicial
          'entrevista',      // Se agendó una entrevista
          'contratado',      // El postulante fue seleccionado para la pasantía
          'rechazado',       // El postulante no fue seleccionado
        ]],
      },
    },

    // Fecha y hora en que se realizó la postulación
    fechaPostulacion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

    // Notas internas de la empresa sobre el candidato (no visibles para el alumno)
    notasEmpresa: { type: DataTypes.TEXT, allowNull: true },

    // Snapshot del archivo de CV usado en el momento de postularse (EST-08
    // §5.4): si el alumno actualiza su CV después, esta postulación sigue
    // apuntando al que existía cuando la empresa lo evaluó.
    cvArchivoId: {
      type: DataTypes.UUID, allowNull: true,
      references: { model: 'archivos', key: 'id' },
    },

  }, {
    tableName: 'postulaciones', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,           // Agrega automáticamente createdAt y updatedAt
    indexes: [
      {
        // Evita que un usuario se postule dos veces a la misma oferta
        unique: true,
        fields: ['usuarioId', 'ofertaId'],
        name: 'unique_postulacion',
      },
      // Índices de rendimiento — creados por migraciones (no hay sync()):
      //   002-indices.js  → oferta_estado, usuario_created
      //   010-indices-escala.js → usuario_estado, oferta_updated, created
      { name: 'idx_postulaciones_oferta_estado', fields: ['ofertaId', 'estado'] },
      { name: 'idx_postulaciones_usuario_created', fields: ['usuarioId', { name: 'createdAt', order: 'DESC' }] },
      { name: 'idx_postulaciones_usuario_estado', fields: ['usuarioId', 'estado'] },
      { name: 'idx_postulaciones_oferta_updated', fields: ['ofertaId', { name: 'updatedAt', order: 'DESC' }] },
      { name: 'idx_postulaciones_created', fields: [{ name: 'createdAt', order: 'DESC' }] },
    ],
  });

  return Postulacion;
};
