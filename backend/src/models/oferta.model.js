/**
 * oferta.model.js — Modelo Sequelize para la tabla "ofertas".
 *
 * Representa una publicación de pasantía creada por una empresa.
 *
 * Dos ejes independientes (RBAC-04 / DB-03 — antes mezclados en `estado` +
 * `moderada`, ver migración 016):
 *   - `estado`: ciclo de vida de la publicación (activa/pausada/cerrada).
 *   - `estadoModeracion`: revisión institucional (pendiente/aprobada/
 *     rechazada/auto_aprobada).
 *
 * Ciclo de vida típico:
 * 1. La empresa la crea → estado: 'activa', estadoModeracion: 'pendiente'.
 * 2. El admin la revisa: aprobada (aparece en listados/recomendadas — ver
 *    esOfertaVisible en oferta.service.js) o rechazada (terminal, nunca se
 *    vuelve visible aunque estado siga siendo 'activa').
 * 3. La empresa puede pausarla o cerrarla cuando ya no necesita postulantes,
 *    independientemente de su estado de moderación.
 *
 * Changelog:
 * - v1.2: agregados fechaPublicacion, cantidadVacantes, salario, beneficios,
 *         modalidadExtendida para el panel corporativo avanzado.
 *         fechaLimite cumple la función de fechaCierre (sin duplicar campo).
 * - v1.3 (RBAC-04): reemplazado `moderada` (boolean) + `estado='rechazada'`
 *         por `estadoModeracion` — ver migración 016.
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

    // Estado de ciclo de vida de la publicación — NO incluye moderación
    // (ver `estadoModeracion` abajo). 'activa' → recibe postulaciones |
    // 'pausada' → inactiva temporalmente | 'cerrada' → finalizada, terminal.
    // STRING + CHECK (no ENUM de Postgres): un conjunto que puede seguir
    // evolucionando no debería vivir en un ENUM irreversible.
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'activa',
      validate: { isIn: [['activa', 'pausada', 'cerrada']] },
    },

    // Revisión institucional — independiente del ciclo de vida. Determina si
    // la oferta es elegible para mostrarse a alumnos/egresados (ver
    // oferta.service.js::esOfertaVisible / whereOfertaVisible):
    //   'pendiente'     → recién creada, sin revisar todavía (default).
    //   'aprobada'      → un admin la revisó y aprobó.
    //   'rechazada'     → un admin la rechazó — terminal, no se re-modera.
    //   'auto_aprobada' → aprobada sin intervención humana (reservado para
    //                     una política de confianza futura; nada la asigna
    //                     todavía — RBAC-04 solo deja el modelo listo).
    estadoModeracion: {
      type: DataTypes.STRING(20),
      defaultValue: 'pendiente',
      validate: { isIn: [['pendiente', 'aprobada', 'rechazada', 'auto_aprobada']] },
    },

    // Contador de vistas de la oferta (se incrementa en cada consulta de detalle)
    vistas: { type: DataTypes.INTEGER, defaultValue: 0 },

    // ── Auditoría ─────────────────────────────────────────────────────────

    // RECLUTADOR RESPONSABLE ACTUAL de la oferta. El nombre de la columna es
    // histórico ("quién la creó"): nace con el reclutador que la crea, pero el
    // admin_empresa puede asignarlo o cambiarlo después
    // (PATCH /api/empresas/ofertas/:id/responsable). De este campo depende
    // quién edita la oferta y gestiona sus candidatos, quién recibe las
    // postulaciones nuevas y con quién se habilita el chat. No restringe la
    // visibilidad: cualquier miembro de la empresa ve todas sus ofertas.
    // Nullable: las ofertas históricas (anteriores a la migración 013) quedan
    // en NULL hasta que un admin_empresa les asigne responsable — no hay
    // backfill. ON DELETE SET NULL (ver migración).
    creadaPorUsuarioId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' },
    },

  }, {
    tableName: 'ofertas', // Nombre exacto de la tabla en PostgreSQL
    timestamps: true,     // Agrega automáticamente createdAt y updatedAt
    paranoid: true,       // Soft delete — no se pierde el historial de postulaciones
  });

  return Oferta;
};
