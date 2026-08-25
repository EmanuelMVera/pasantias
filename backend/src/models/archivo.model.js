/**
 * archivo.model.js — Metadata de archivos subidos (CV, cartas, fotos, logos).
 *
 * EST-08 §5.4: reemplaza gradualmente los campos STRING sueltos
 * (cvPath, cartaRecomendacion, fotoPerfil, logo) que solo guardaban una
 * ruta sin nombre original, mimetype, tamaño ni versión. Los campos STRING
 * originales se conservan (expand pattern) — esta tabla se puebla en
 * paralelo a partir de ahora, sin romper lecturas existentes.
 *
 * id UUID: para que la URL de descarga no sea enumerable secuencialmente.
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Archivo = sequelize.define('Archivo', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    usuarioPropietarioId: {
      type: DataTypes.INTEGER, allowNull: false,
      references: { model: 'usuarios', key: 'id' },
    },
    tipo: {
      type: DataTypes.STRING(30), allowNull: false,
      validate: {
        isIn: [['cv', 'carta_recomendacion', 'foto_perfil', 'logo_empresa', 'certificacion', 'adjunto_mensaje']],
      },
    },
    nombreOriginal: { type: DataTypes.STRING(255), allowNull: true },
    claveAlmacenamiento: { type: DataTypes.STRING(500), allowNull: false }, // path local o key de S3
    mimeType: { type: DataTypes.STRING(100), allowNull: true },
    tamanioBytes: { type: DataTypes.INTEGER, allowNull: true },
    hashSha256: { type: DataTypes.STRING(64), allowNull: true },
    backend: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'local', validate: { isIn: [['local', 's3']] } },
  }, {
    tableName: 'archivos',
    timestamps: true,
    paranoid: true, // soft delete: no perder la referencia si se "elimina" un archivo con evidencia asociada
  });

  return Archivo;
};
