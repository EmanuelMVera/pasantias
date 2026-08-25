/**
 * configuracionInstitucional.model.js — Parámetros institucionales editables.
 *
 * Tabla clave/valor tipada (EST-08 §4.7) para no tener que hacer un deploy
 * cada vez que cambia un parámetro operativo. Primer uso real: el formato
 * de legajo (clave 'legajo.regex'), que así puede ajustarse desde el panel
 * admin sin migración si el formato real del instituto difiere del default.
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ConfiguracionInstitucional = sequelize.define('ConfiguracionInstitucional', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    clave: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    valor: { type: DataTypes.TEXT, allowNull: false },
    // 'string' | 'number' | 'boolean' | 'json' — cómo interpretar `valor`
    tipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'string' },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    editablePorAdmin: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'configuracion_institucional',
    timestamps: true,
  });

  return ConfiguracionInstitucional;
};
