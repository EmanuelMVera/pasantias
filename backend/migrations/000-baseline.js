'use strict';

/**
 * 000-baseline.js — Migración baseline (Fase 0, EST-08).
 *
 * Crea desde cero el esquema completo tal como lo definen hoy los modelos
 * Sequelize de la aplicación (backend/src/models/*.model.js), NO el estado
 * acumulado de los 13 scripts .sql históricos (ver migrations/legacy-sql/).
 *
 * Diferencias deliberadas respecto al historial:
 * - No crea la tabla `avales`: nunca tuvo modelo Sequelize ni código de
 *   aplicación asociado (EST-08 §1.6).
 * - `usuarios.rol`, `postulaciones.estado`, `ofertas.estado`,
 *   `notificaciones.tipo` y `empresa_usuarios.rolInterno` son
 *   VARCHAR + CHECK, no ENUM de Postgres (EST-08 §1.5 / decisión 3): un
 *   ENUM ya dejó atascados para siempre los valores 'profesor',
 *   'propietario', 'gerente' y 'viewer', que ni siquiera llegan a existir
 *   en esta baseline.
 * - `perfiles.disponibilidad`, `empresas.estadoAprobacion`,
 *   `solicitudes_empresa.estado` y `solicitudes_reclutador.estado` se
 *   mantienen como ENUM real: son conjuntos de 3-4 valores estables, sin
 *   historial de cambios.
 *
 * Pensada para correr contra una base vacía (entornos nuevos, CI, y
 * eventualmente producción). La base de desarrollo existente, creada
 * históricamente con `sequelize.sync({ alter: true })`, NO se reconcilia
 * automáticamente con esta migración — ver nota en el README de esta
 * carpeta sobre cómo adoptarla en un entorno que ya tiene datos.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes, Op } = Sequelize;
    const now = { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    await queryInterface.createTable('usuarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      nombre: { type: DataTypes.STRING(100), allowNull: false },
      apellido: { type: DataTypes.STRING(100), allowNull: false },
      email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      rol: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'alumno' },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      habilitado: { type: DataTypes.BOOLEAN, defaultValue: true },
      telefono: { type: DataTypes.STRING(30), allowNull: true },
      ubicacion: { type: DataTypes.STRING(150), allowNull: true },
      ultimoAcceso: { type: DataTypes.DATE, allowNull: true },
      fotoPerfil: { type: DataTypes.STRING(255), allowNull: true },
      tokenReset: { type: DataTypes.STRING, allowNull: true },
      tokenResetExpira: { type: DataTypes.DATE, allowNull: true },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('usuarios', {
      fields: ['rol'],
      type: 'check',
      name: 'chk_usuarios_rol',
      where: { rol: { [Op.in]: ['alumno', 'egresado', 'empresa', 'admin'] } },
    });

    await queryInterface.createTable('perfiles', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      carrera: { type: DataTypes.STRING(150), allowNull: true },
      anioEgreso: { type: DataTypes.INTEGER, allowNull: true },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      habilidades: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
      idiomas: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
      certificaciones: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
      linkedin: { type: DataTypes.STRING(255), allowNull: true },
      github: { type: DataTypes.STRING(255), allowNull: true },
      portfolio: { type: DataTypes.STRING(255), allowNull: true },
      redesSociales: { type: DataTypes.JSONB, allowNull: true },
      cvPath: { type: DataTypes.STRING(255), allowNull: true },
      cartaRecomendacion: { type: DataTypes.STRING(255), allowNull: true },
      fotoPerfil: { type: DataTypes.STRING(255), allowNull: true },
      areaInteres: { type: DataTypes.STRING(150), allowNull: true },
      disponibilidad: {
        type: DataTypes.ENUM('inmediata', '1_mes', '3_meses', 'no_disponible'),
        defaultValue: 'inmediata',
      },
      preferenciasLaborales: { type: DataTypes.TEXT, allowNull: true },
      salarioPretendido: { type: DataTypes.STRING(100), allowNull: true },
      visibilidadPerfil: { type: DataTypes.BOOLEAN, defaultValue: true },
      experienciaLaboral: { type: DataTypes.TEXT, allowNull: true },
      proyectos: { type: DataTypes.TEXT, allowNull: true },
      createdAt: now,
      updatedAt: now,
    });

    await queryInterface.createTable('empresas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      razonSocial: { type: DataTypes.STRING(200), allowNull: false },
      cuit: { type: DataTypes.STRING(20), allowNull: true },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      rubro: { type: DataTypes.STRING(150), allowNull: true },
      sitioWeb: { type: DataTypes.STRING(255), allowNull: true },
      telefono: { type: DataTypes.STRING(30), allowNull: true },
      direccion: { type: DataTypes.STRING(255), allowNull: true },
      ciudad: { type: DataTypes.STRING(100), allowNull: true },
      logo: { type: DataTypes.STRING(255), allowNull: true },
      estadoAprobacion: {
        type: DataTypes.ENUM('pendiente', 'aprobada', 'rechazada'),
        defaultValue: 'pendiente',
      },
      createdAt: now,
      updatedAt: now,
    });

    await queryInterface.createTable('empresa_usuarios', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      empresaId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
      },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      rolInterno: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'reclutador' },
      activo: { type: DataTypes.BOOLEAN, defaultValue: true },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('empresa_usuarios', {
      fields: ['empresaId', 'usuarioId'],
      type: 'unique',
      name: 'unique_empresa_usuario',
    });
    await queryInterface.addConstraint('empresa_usuarios', {
      fields: ['rolInterno'],
      type: 'check',
      name: 'chk_empresa_usuarios_rolinterno',
      where: { rolInterno: { [Op.in]: ['admin_empresa', 'reclutador'] } },
    });

    await queryInterface.createTable('ofertas', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      empresaId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
      },
      titulo: { type: DataTypes.STRING(200), allowNull: false },
      descripcion: { type: DataTypes.TEXT, allowNull: false },
      requisitos: { type: DataTypes.TEXT, allowNull: true },
      area: { type: DataTypes.STRING(150), allowNull: true },
      modalidad: {
        type: DataTypes.ENUM('presencial', 'remoto', 'hibrido'),
        defaultValue: 'presencial',
      },
      modalidadExtendida: { type: DataTypes.STRING(255), allowNull: true },
      ciudad: { type: DataTypes.STRING(100), allowNull: true },
      remuneracion: { type: DataTypes.STRING(100), allowNull: true },
      salario: { type: DataTypes.INTEGER, allowNull: true },
      beneficios: { type: DataTypes.TEXT, allowNull: true },
      cantidadVacantes: { type: DataTypes.INTEGER, defaultValue: 1 },
      habilidadesRequeridas: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
      nivelExperiencia: {
        type: DataTypes.ENUM('sin_experiencia', 'junior', 'semi_senior'),
        defaultValue: 'sin_experiencia',
      },
      tipoPuesto: { type: DataTypes.STRING(20), allowNull: true },
      requiereExperiencia: { type: DataTypes.BOOLEAN, defaultValue: false },
      experienciaDetalle: { type: DataTypes.TEXT, allowNull: true },
      carrerasDestinatarias: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
      fechaPublicacion: { type: DataTypes.DATE, allowNull: true },
      fechaLimite: { type: DataTypes.DATE, allowNull: true },
      estado: { type: DataTypes.STRING(20), defaultValue: 'activa' },
      moderada: { type: DataTypes.BOOLEAN, defaultValue: false },
      vistas: { type: DataTypes.INTEGER, defaultValue: 0 },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('ofertas', {
      fields: ['estado'],
      type: 'check',
      name: 'chk_ofertas_estado',
      where: { estado: { [Op.in]: ['activa', 'pausada', 'rechazada', 'cerrada'] } },
    });

    await queryInterface.createTable('postulaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      ofertaId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'ofertas', key: 'id' }, onDelete: 'CASCADE',
      },
      cartaPresentacion: { type: DataTypes.TEXT, allowNull: true },
      estado: { type: DataTypes.STRING(30), defaultValue: 'en_revision' },
      fechaPostulacion: { type: DataTypes.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      notasEmpresa: { type: DataTypes.TEXT, allowNull: true },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('postulaciones', {
      fields: ['usuarioId', 'ofertaId'],
      type: 'unique',
      name: 'unique_postulacion',
    });
    await queryInterface.addConstraint('postulaciones', {
      fields: ['estado'],
      type: 'check',
      name: 'chk_postulaciones_estado',
      where: {
        estado: {
          [Op.in]: [
            'en_revision', 'preseleccionado', 'entrevista_programada', 'entrevista',
            'no_seleccionado', 'rechazado', 'contratado',
          ],
        },
      },
    });

    await queryInterface.createTable('notificaciones', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      titulo: { type: DataTypes.STRING(200), allowNull: false },
      mensaje: { type: DataTypes.TEXT, allowNull: false },
      tipo: { type: DataTypes.STRING(30), defaultValue: 'sistema' },
      leida: { type: DataTypes.BOOLEAN, defaultValue: false },
      enlace: { type: DataTypes.STRING(255), allowNull: true },
      prioridad: {
        type: DataTypes.ENUM('baja', 'normal', 'alta', 'urgente'),
        defaultValue: 'normal',
      },
      tipoVisual: {
        type: DataTypes.ENUM('info', 'success', 'warning', 'error'),
        defaultValue: 'info',
      },
      accionURL: { type: DataTypes.STRING(255), allowNull: true },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addConstraint('notificaciones', {
      fields: ['tipo'],
      type: 'check',
      name: 'chk_notificaciones_tipo',
      where: { tipo: { [Op.in]: ['postulacion', 'estado', 'oferta', 'aval', 'chat', 'sistema'] } },
    });

    await queryInterface.createTable('mensajes', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      emisorId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      receptorId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'CASCADE',
      },
      mensaje: { type: DataTypes.TEXT, allowNull: false },
      leido: { type: DataTypes.BOOLEAN, defaultValue: false },
      createdAt: now,
      updatedAt: now,
    });
    await queryInterface.addIndex('mensajes', ['emisorId'], { name: 'mensajes_emisor_idx' });
    await queryInterface.addIndex('mensajes', ['receptorId'], { name: 'mensajes_receptor_idx' });
    await queryInterface.addIndex('mensajes', ['emisorId', 'receptorId'], { name: 'mensajes_emisor_receptor_idx' });
    await queryInterface.addIndex('mensajes', ['receptorId', 'leido'], { name: 'mensajes_receptor_leido_idx' });

    await queryInterface.createTable('activity_logs', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      usuarioId: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'usuarios', key: 'id' }, onDelete: 'SET NULL',
      },
      accion: {
        type: DataTypes.ENUM(
          'login', 'logout', 'crear_usuario', 'editar_usuario', 'eliminar_usuario',
          'cambiar_rol', 'toggle_usuario', 'aprobar_empresa', 'rechazar_empresa',
          'aprobar_oferta', 'rechazar_oferta', 'crear_oferta', 'cerrar_oferta',
          'postular', 'cambiar_estado_postulacion', 'aprobar_solicitud_empresa',
          'rechazar_solicitud_empresa', 'aprobar_solicitud_reclutador',
          'rechazar_solicitud_reclutador', 'sistema'
        ),
        allowNull: false,
      },
      entidad: { type: DataTypes.STRING(50), allowNull: true },
      entidadId: { type: DataTypes.INTEGER, allowNull: true },
      detalle: { type: DataTypes.JSON, allowNull: true },
      ip: { type: DataTypes.STRING(45), allowNull: true },
      createdAt: now,
    });

    await queryInterface.createTable('solicitudes_empresa', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      razonSocial: { type: DataTypes.STRING(200), allowNull: false },
      cuit: { type: DataTypes.STRING(20), allowNull: false },
      rubro: { type: DataTypes.STRING(150), allowNull: false },
      direccion: { type: DataTypes.STRING(255), allowNull: true },
      ciudad: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: false },
      sitioWeb: { type: DataTypes.STRING(255), allowNull: true },
      telefono: { type: DataTypes.STRING(30), allowNull: true },
      responsableNombre: { type: DataTypes.STRING(150), allowNull: true },
      responsableApellido: { type: DataTypes.STRING(150), allowNull: true },
      responsableEmail: { type: DataTypes.STRING(255), allowNull: true },
      responsableTelefono: { type: DataTypes.STRING(30), allowNull: true },
      responsableCargo: { type: DataTypes.STRING(100), allowNull: true },
      carrerasInteres: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      puestos: { type: DataTypes.TEXT, allowNull: true },
      estado: {
        type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'),
        defaultValue: 'pendiente', allowNull: false,
      },
      reclutadores: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
      createdAt: now,
      updatedAt: now,
    });

    await queryInterface.createTable('solicitudes_reclutador', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      empresaId: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'empresas', key: 'id' }, onDelete: 'CASCADE',
      },
      nombre: { type: DataTypes.STRING(150), allowNull: false },
      apellido: { type: DataTypes.STRING(150), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: false },
      estado: {
        type: DataTypes.ENUM('pendiente', 'aprobado', 'rechazado'),
        defaultValue: 'pendiente', allowNull: false,
      },
      motivoRechazo: { type: DataTypes.TEXT, allowNull: true },
      createdAt: now,
      updatedAt: now,
    });
  },

  async down(queryInterface) {
    // Orden inverso de dependencias FK
    await queryInterface.dropTable('solicitudes_reclutador');
    await queryInterface.dropTable('solicitudes_empresa');
    await queryInterface.dropTable('activity_logs');
    await queryInterface.dropTable('mensajes');
    await queryInterface.dropTable('notificaciones');
    await queryInterface.dropTable('postulaciones');
    await queryInterface.dropTable('ofertas');
    await queryInterface.dropTable('empresa_usuarios');
    await queryInterface.dropTable('empresas');
    await queryInterface.dropTable('perfiles');
    await queryInterface.dropTable('usuarios');

    // dropTable no elimina los tipos ENUM de Postgres asociados — hay que
    // sacarlos a mano para que el down() sea realmente simétrico.
    const enumTypes = [
      'enum_perfiles_disponibilidad',
      'enum_empresas_estadoAprobacion',
      'enum_ofertas_modalidad',
      'enum_ofertas_nivelExperiencia',
      'enum_notificaciones_prioridad',
      'enum_notificaciones_tipoVisual',
      'enum_activity_logs_accion',
      'enum_solicitudes_empresa_estado',
      'enum_solicitudes_reclutador_estado',
    ];
    for (const typeName of enumTypes) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${typeName}";`);
    }
  },
};
