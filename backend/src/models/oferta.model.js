/**
 * oferta.model.js — Modelo Sequelize para la tabla "ofertas".
 *
 * Representa una publicación de pasantía creada por una empresa.
 *
 * Ciclo de vida de una oferta:
 * 1. La empresa la crea → queda con moderada: false y estado: 'activa'
 * 2. El admin la revisa y aprueba → moderada: true (aparece en el listado público)
 * 3. La empresa puede pausarla o cerrarla cuando ya no necesita postulantes
 *
 * Changelog:
 * - v1.2: agregados fechaPublicacion, cantidadVacantes, salario, beneficios,
 *         modalidadExtendida para el panel corporativo avanzado.
 *         fechaLimite cumple la función de fechaCierre (sin duplicar campo).
 */

'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Oferta = sequelize.define('Oferta', {
    // Identificador único autoincremental
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Referencia a la empresa que publica la oferta (clave foránea)
    empresaId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'empresas', key: 'id' },
    },

    // ── Información principal ─────────────────────────────────────────────

    // Título descriptivo de la pasantía (ej: "Pasantía en Desarrollo Web")
    titulo: { type: DataTypes.STRING(200), allowNull: false },

    // Descripción detallada de las tareas y responsabilidades del puesto
    descripcion: { type: DataTypes.TEXT, allowNull: false },

    // Requisitos que debe cumplir el postulante (técnicos, académicos, etc.)
    requisitos: { type: DataTypes.TEXT, allowNull: true },

    // Área tecnológica o profesional de la oferta (ej: "Sistemas", "Diseño")
    area: { type: DataTypes.STRING(150), allowNull: true },

    // ── Condiciones laborales ─────────────────────────────────────────────

    // Modalidad de trabajo: presencial, remoto o híbrido
    modalidad: {
      type: DataTypes.ENUM('presencial', 'remoto', 'hibrido'),
      defaultValue: 'presencial',
    },

    // Descripción extendida de la modalidad (ej: "3 días en oficina, 2 remoto")
    modalidadExtendida: { type: DataTypes.STRING(255), allowNull: true },

    // Ciudad donde se realiza la pasantía
    ciudad: { type: DataTypes.STRING(100), allowNull: true },

    // Remuneración en texto libre — campo legacy, mantener por compatibilidad
    remuneracion: { type: DataTypes.STRING(100), allowNull: true },

    // Salario en formato numérico (en pesos ARS) para poder ordenar/filtrar
    salario: { type: DataTypes.INTEGER, allowNull: true },

    // Beneficios adicionales del puesto (texto libre o separado por comas)
    // Ej: "Obra social, Bonos, Capacitaciones, Home office"
    beneficios: { type: DataTypes.TEXT, allowNull: true },

    // Cantidad de posiciones disponibles para esta oferta
    cantidadVacantes: { type: DataTypes.INTEGER, defaultValue: 1 },

    // ── Requisitos del candidato ──────────────────────────────────────────

    // Lista de tecnologías o habilidades específicas requeridas (array de strings)
    habilidadesRequeridas: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },

    // Nivel de experiencia esperado en el postulante
    // LEGACY — se mantiene por compatibilidad con filtros y ofertas anteriores a Etapa 4
    // Las nuevas ofertas deben usar tipoPuesto + requiereExperiencia en su lugar
    nivelExperiencia: {
      type: DataTypes.ENUM('sin_experiencia', 'junior', 'semi_senior'),
      defaultValue: 'sin_experiencia',
    },

    // ── Normalización de puesto y experiencia (Etapa 4) ───────────────────
    // Reemplaza nivelExperiencia en los nuevos flujos de creación de ofertas

    // Tipo de puesto ofrecido
    // pasante: rol educativo, sin requerimiento de experiencia laboral
    // trainee: incorporación con acompañamiento, puede valorar proyectos académicos
    // junior:  requiere habilidades comprobables o experiencia inicial
    tipoPuesto: {
      type: DataTypes.STRING(20),
      allowNull: true, // nullable para compatibilidad con ofertas anteriores
    },

    // Si true, se espera experiencia laboral previa o proyectos comprobables
    requiereExperiencia: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // Aclaración opcional sobre la experiencia esperada
    // Ej: "1 año en atención al cliente", "Proyectos académicos comprobables"
    experienciaDetalle: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // Carreras del instituto a las que está orientada esta oferta
    // Usa la lista canónica de catalogos.json para filtrar/recomendar por carrera del alumno
    carrerasDestinatarias: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },

    // ── Fechas ────────────────────────────────────────────────────────────

    // Fecha en que la empresa publicó (o planea publicar) la oferta
    fechaPublicacion: { type: DataTypes.DATE, allowNull: true },

    // Fecha límite para recibir postulaciones (también usada como fecha de cierre)
    // Alias semántico: fechaCierre = fechaLimite
    fechaLimite: { type: DataTypes.DATE, allowNull: true },

    // ── Estado y moderación ───────────────────────────────────────────────

    // Estado actual de la oferta
    // 'activa' → recibe postulaciones | 'pausada' → inactiva temporalmente
    // 'rechazada' → rechazada por el admin | 'cerrada' → finalizada
    // STRING + CHECK (no ENUM de Postgres): ya se le agregó 'rechazada' una
    // vez después de creado el tipo; un conjunto que sigue evolucionando no
    // debería vivir en un ENUM irreversible.
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'activa',
      validate: { isIn: [['activa', 'pausada', 'rechazada', 'cerrada']] },
    },

    // Indica si el administrador revisó y aprobó la oferta (visible públicamente)
    moderada: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Contador de vistas de la oferta (se incrementa en cada consulta de detalle)
    vistas: { type: DataTypes.INTEGER, defaultValue: 0 },

  }, {
    tableName: 'ofertas', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,     // Agrega automáticamente createdAt y updatedAt
    paranoid: true,       // Soft delete — no se pierde el historial de postulaciones
  });

  return Oferta;
};
