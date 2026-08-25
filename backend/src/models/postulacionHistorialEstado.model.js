/**
 * postulacionHistorialEstado.model.js — Auditoría de cambios de estado.
 *
 * EST-08 §4.8: `postulaciones.estado` se pisa en cada cambio; sin historial
 * no se puede resolver una disputa alumno/empresa, medir tiempos del
 * embudo de selección, ni saber cuál reclutador cambió qué. Se escribe
 * una fila acá en la misma transacción que cada cambio de estado; la
 * columna `postulaciones.estado` se conserva como estado actual
 * desnormalizado (derivarlo del historial en cada lectura sería lento).
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PostulacionHistorialEstado = sequelize.define('PostulacionHistorialEstado', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    postulacionId: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'postulaciones', key: 'id' },
    },
    estadoAnterior: { type: DataTypes.STRING(30), allowNull: true }, // null = alta de la postulación
    estadoNuevo: { type: DataTypes.STRING(30), allowNull: false },
    cambiadoPorUsuarioId: {
      type: DataTypes.INTEGER, allowNull: true,
      references: { model: 'usuarios', key: 'id' },
    },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    notaInterna: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'postulacion_historial_estados',
    timestamps: true,
    updatedAt: false, // inmutable, como activity_logs
  });

  return PostulacionHistorialEstado;
};
