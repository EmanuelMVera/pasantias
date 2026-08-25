/**
 * perfil.model.js — Modelo Sequelize para la tabla "perfiles".
 *
 * Almacena la información académica y profesional del alumno, egresado o profesor.
 * Se crea automáticamente al registrar un usuario con rol 'alumno', 'egresado' o 'profesor'.
 *
 * El perfil es visible por las empresas cuando un alumno se postula a una oferta.
 *
 * Changelog:
 * - v1.1: agregados campos portfolio, preferenciasLaborales, salarioPretendido,
 *         visibilidadPerfil, experienciaLaboral, proyectos, certificaciones, redesSociales
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Perfil = sequelize.define('Perfil', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Referencia al usuario dueño del perfil (clave foránea).
    // unique: la relación es 1:1 — sin esto, un bug podía crear dos
    // perfiles para el mismo usuario sin que nada lo impidiera.
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: 'usuarios', key: 'id' },
    },

    // ── Identificador institucional (EST-07 / EST-08 §2) ──────────────────────

    // Legajo del alumno/egresado en el instituto. Nullable a nivel columna
    // (perfiles históricos sin legajo cargado); obligatorio a nivel
    // aplicación en altas nuevas (ver admin.routes.js POST /usuarios).
    // VARCHAR, no INTEGER: los legajos reales suelen tener ceros a la
    // izquierda o prefijos (ej. "00457", "TS-00457") que un tipo numérico
    // destruye de forma irrecuperable. Es la clave de negocio recomendada
    // para futuras importaciones masivas — no es la PK.
    // Formato validado contra configuracion_institucional (clave
    // 'legajo.regex'), no hardcodeado, para poder ajustarlo sin migración
    // si el formato real del instituto difiere del default.
    legajo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },

    // ── Datos académicos ──────────────────────────────────────────────────────

    // Carrera que estudia o estudió el alumno (ej: "Tecnicatura en Programación")
    carrera: { type: DataTypes.STRING(150), allowNull: true },

    // Año en que el alumno se graduó (nulo si aún está cursando)
    anioEgreso: { type: DataTypes.INTEGER, allowNull: true },

    // Descripción personal/profesional redactada por el alumno
    descripcion: { type: DataTypes.TEXT, allowNull: true },

    // ── Habilidades e idiomas ─────────────────────────────────────────────────

    // Listado de habilidades técnicas del alumno (array de strings, ej: ["JavaScript", "React"])
    habilidades: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },

    // Idiomas que domina el alumno (array de strings, ej: ["Inglés B2", "Español nativo"])
    idiomas: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },

    // Certificaciones obtenidas (ej: ["AWS Cloud Practitioner", "Scrum Master"])
    certificaciones: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },

    // ── Redes y contacto ──────────────────────────────────────────────────────

    // URL del perfil de LinkedIn del alumno
    linkedin: { type: DataTypes.STRING(255), allowNull: true },

    // URL del perfil de GitHub del alumno
    github: { type: DataTypes.STRING(255), allowNull: true },

    // URL del portfolio personal o sitio web propio
    portfolio: { type: DataTypes.STRING(255), allowNull: true },

    // Redes sociales adicionales en formato JSON
    // Ej: { "twitter": "https://twitter.com/...", "behance": "https://..." }
    redesSociales: { type: DataTypes.JSONB, allowNull: true },

    // ── Archivos ──────────────────────────────────────────────────────────────

    // Ruta del archivo CV subido por el alumno (PDF almacenado en /uploads)
    cvPath: { type: DataTypes.STRING(255), allowNull: true },

    // Ruta de la carta de recomendación (PDF o imagen) subida por el alumno
    // Puede ser una referencia institucional, de docente o empleador anterior
    cartaRecomendacion: { type: DataTypes.STRING(255), allowNull: true },

    // Ruta de la foto de perfil del alumno
    fotoPerfil: { type: DataTypes.STRING(255), allowNull: true },

    // ── Preferencias laborales ────────────────────────────────────────────────

    // Área de interés laboral del alumno (ej: "Desarrollo Backend", "Diseño UX")
    areaInteres: { type: DataTypes.STRING(150), allowNull: true },

    // Disponibilidad horaria o temporal para comenzar la pasantía
    disponibilidad: {
      type: DataTypes.ENUM('inmediata', '1_mes', '3_meses', 'no_disponible'),
      defaultValue: 'inmediata',
    },

    // Descripción libre de las preferencias laborales del alumno
    // (modalidad, tipo de empresa, tecnologías, etc.)
    preferenciasLaborales: { type: DataTypes.TEXT, allowNull: true },

    // Pretensión salarial expresada como texto libre (ej: "$200.000/mes", "A convenir")
    salarioPretendido: { type: DataTypes.STRING(100), allowNull: true },

    // Controla si el perfil es visible para las empresas que buscan candidatos
    // false = oculto (solo el propio usuario y el admin lo ven)
    visibilidadPerfil: { type: DataTypes.BOOLEAN, defaultValue: true },

    // ── Experiencia y proyectos ───────────────────────────────────────────────

    // Historial de experiencia laboral en texto libre o con formato Markdown
    experienciaLaboral: { type: DataTypes.TEXT, allowNull: true },

    // Proyectos realizados (personales, académicos, etc.) en texto libre o Markdown
    proyectos: { type: DataTypes.TEXT, allowNull: true },

  }, {
    tableName: 'perfiles', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,      // Agrega automáticamente createdAt y updatedAt
  });

  return Perfil;
};
