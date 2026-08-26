/**
 * admin.routes.js — Rutas del panel de administración.
 *
 * Prefijo de la API: /api/admin
 *
 * Todas las rutas requieren: verifyToken + rol 'admin'
 *
 * Módulos:
 * 1. Dashboard general con métricas del sistema
 * 2. Gestión completa de usuarios (CRUD + cambio de rol)
 * 3. Gestión de empresas pendientes de aprobación
 * 4. Moderación de ofertas antes de publicarlas
 * 5. Logs de auditoría del sistema (con filtros y exportación CSV)
 * 6. Gestión de solicitudes de registro de empresa (v1.6)
 *
 * Changelog:
 * - v1.3: /dashboard-general con métricas y actividad reciente
 * - v1.4: CRUD de usuarios, /logs con filtros y exportación CSV
 * - v1.6: /solicitudes-empresa (listar, aprobar con creación automática, rechazar)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const {
  Usuario, Perfil, Empresa, Oferta, Postulacion, Notificacion, ActivityLog,
  EmpresaUsuario, SolicitudEmpresa, SolicitudReclutador, ConfiguracionInstitucional,
} = require('../models');

const { sequelize } = require('../models');
const { Op } = require('sequelize');
const { crearNotificacion } = require('../utils/notificador');
const solicitudEmpresaService    = require('../services/solicitudEmpresa.service');
const solicitudReclutadorService = require('../services/solicitudReclutador.service');

// Shorthand para no repetir los middlewares en cada ruta
const soloAdmin = [verifyToken, authorizeRoles('admin')];

// ── Helper: registrar acción en el log ────────────────────────────────────────
/**
 * Registra una acción en la tabla activity_logs.
 * Llamar con await dentro de las rutas del admin.
 *
 * @param {object} opts
 * @param {number|null} opts.usuarioId  — Quién realizó la acción
 * @param {string}      opts.accion     — Tipo de acción (ver ENUM del modelo)
 * @param {string}      opts.entidad    — Entidad afectada ('usuario', 'empresa', ...)
 * @param {number|null} opts.entidadId  — ID del registro afectado
 * @param {object|null} opts.detalle    — Información adicional en JSON
 * @param {string|null} opts.ip         — IP de la petición
 */
async function logAction({ usuarioId, accion, entidad, entidadId, detalle, ip }) {
  try {
    await ActivityLog.create({ usuarioId, accion, entidad, entidadId, detalle, ip });
  } catch (e) {
    // El log nunca debe interrumpir la operación principal
    console.warn('[ActivityLog] Error al registrar acción:', e.message);
  }
}

// ── Dashboard general (v1.3) ──────────────────────────────────────────────────
/**
 * GET /api/admin/dashboard-general
 * Panel principal con métricas completas del sistema.
 */
router.get('/dashboard-general', ...soloAdmin, async (req, res) => {
  try {
    const [
      alumnosActivos, egresadosActivos,
      empresasAprobadas, totalUsuarios, ofertasActivas,
      ofertasPendiente, totalPostulaciones, contrataciones,
      entrevistas, notificacionesPendientes,
    ] = await Promise.all([
      Usuario.count({ where: { rol: 'alumno',   activo: true } }),
      Usuario.count({ where: { rol: 'egresado', activo: true } }),
      Empresa.count({ where: { estadoAprobacion: 'aprobada' } }),
      Usuario.count({ where: { activo: true } }),
      Oferta.count({ where: { estado: 'activa', moderada: true } }),
      Oferta.count({ where: { moderada: false } }),
      Postulacion.count(),
      Postulacion.count({ where: { estado: 'contratado' } }),
      Postulacion.count({ where: { estado: 'entrevista' } }),
      Notificacion.count({ where: { leida: false } }),
    ]);

    const tasaInsercion = totalPostulaciones > 0
      ? ((contrataciones / totalPostulaciones) * 100).toFixed(1) + '%'
      : '0%';

    const actividadReciente = await Postulacion.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email', 'rol'] },
        {
          model: Oferta, as: 'oferta', attributes: ['titulo', 'area'],
          include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial'] }],
        },
      ],
    });

    return res.json({
      success: true,
      data: {
        usuarios: { alumnosActivos, egresadosActivos, empresasAprobadas, totalActivos: totalUsuarios },
        pasantias: { ofertasActivas, ofertasPendienteModeracion: ofertasPendiente, totalPostulaciones, entrevistas, contrataciones, tasaInsercion },
        sistema: { notificacionesPendientes },
        actividadReciente,
      },
    });
  } catch (err) {
    console.error('Error en dashboard-general:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener el dashboard.' });
  }
});

// ── Estadísticas generales (legacy) ──────────────────────────────────────────
router.get('/stats', ...soloAdmin, async (req, res) => {
  try {
    const [totalUsuarios, totalEmpresas, totalOfertas, totalPostulaciones] = await Promise.all([
      Usuario.count({ where: { rol: ['alumno', 'egresado'] } }),
      Empresa.count(),
      Oferta.count(),
      Postulacion.count(),
    ]);
    const contratados = await Postulacion.count({ where: { estado: 'contratado' } });
    return res.json({
      success: true,
      data: {
        totalUsuarios, totalEmpresas, totalOfertas, totalPostulaciones, contratados,
        tasaInsercion: totalPostulaciones > 0
          ? ((contratados / totalPostulaciones) * 100).toFixed(1) + '%' : '0%',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al obtener estadísticas.' });
  }
});

// ── Actividad reciente ────────────────────────────────────────────────────────
router.get('/actividad-reciente', ...soloAdmin, async (req, res) => {
  try {
    const logs = await ActivityLog.findAll({
      limit: 20,
      order: [['createdAt', 'DESC']],
      include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email', 'rol'] }],
    });
    return res.json({ success: true, data: logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al obtener actividad.' });
  }
});

// ── CRUD de usuarios (v1.4) ───────────────────────────────────────────────────

/**
 * GET /api/admin/usuarios
 * Lista todos los usuarios del sistema con filtros opcionales.
 * Query params: rol, activo (true/false), q (búsqueda por nombre o email)
 */
router.get('/usuarios', ...soloAdmin, async (req, res) => {
  try {
    const { rol, activo, q } = req.query;
    const where = {};

    if (rol) where.rol = rol;
    if (activo !== undefined) where.activo = activo === 'true';
    if (q) {
      where[Op.or] = [
        { nombre:   { [Op.iLike]: `%${q}%` } },
        { apellido: { [Op.iLike]: `%${q}%` } },
        { email:    { [Op.iLike]: `%${q}%` } },
      ];
    }

    const usuarios = await Usuario.findAll({
      where,
      attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
      order: [['createdAt', 'DESC']],
      // Para usuarios con rol 'empresa' incluimos su membresía y empresa;
      // para alumno/egresado incluimos el legajo (vive en Perfil).
      include: [
        {
          model: EmpresaUsuario,
          as: 'membresiasEmpresa',
          required: false,
          where: { activo: true },
          attributes: ['rolInterno'],
          include: [{
            model: Empresa,
            as: 'empresa',
            attributes: ['id', 'razonSocial'],
          }],
        },
        { model: Perfil, as: 'perfil', required: false, attributes: ['legajo'] },
      ],
    });
    return res.json({ success: true, total: usuarios.length, data: usuarios });
  } catch (err) {
    console.error('Error en GET /admin/usuarios:', err);
    return res.status(500).json({ success: false, message: 'Error al listar usuarios.' });
  }
});

/**
 * GET /api/admin/usuarios/:id
 * Devuelve el detalle completo de un usuario por ID.
 */
router.get('/usuarios/:id', ...soloAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'tokenReset', 'tokenResetExpira'] },
    });
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    return res.json({ success: true, data: usuario });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al obtener el usuario.' });
  }
});

/**
 * POST /api/admin/usuarios
 * Crea un nuevo usuario desde el panel admin.
 * El admin puede asignarle cualquier rol directamente.
 *
 * Body: { nombre, apellido, email, password, rol, telefono?, ubicacion?, legajo? }
 * legajo es obligatorio cuando rol es alumno/egresado (EST-08 §2).
 */
router.post('/usuarios', ...soloAdmin, async (req, res) => {
  try {
    const { nombre, apellido, email, password, rol, telefono, ubicacion, legajo } = req.body;

    if (!nombre || !apellido || !email || !password || !rol) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios (nombre, apellido, email, password, rol).' });
    }

    let legajoNormalizado = null;
    if (['alumno', 'egresado'].includes(rol)) {
      if (!legajo || !legajo.trim()) {
        return res.status(400).json({ success: false, message: 'El legajo es obligatorio para alumnos y egresados.' });
      }
      legajoNormalizado = legajo.trim().toUpperCase();

      const configRegex = await ConfiguracionInstitucional.findOne({ where: { clave: 'legajo.regex' } });
      const regex = new RegExp(configRegex?.valor || '^[A-Z0-9-]{3,20}$');
      if (!regex.test(legajoNormalizado)) {
        return res.status(400).json({ success: false, message: 'El legajo no tiene un formato válido.' });
      }

      const legajoExistente = await Perfil.findOne({ where: { legajo: legajoNormalizado } });
      if (legajoExistente) {
        return res.status(400).json({ success: false, message: 'Ya existe un alumno/egresado con ese legajo.' });
      }
    }

    // Verifica que el email no esté registrado
    const existe = await Usuario.findOne({ where: { email } });
    if (existe) return res.status(400).json({ success: false, message: 'Ya existe un usuario con ese email.' });

    const hash = await bcrypt.hash(password, 10);
    const nuevo = await Usuario.create({
      nombre, apellido, email, password: hash, rol,
      telefono: telefono || null, ubicacion: ubicacion || null,
      activo: true, habilitado: true,
    });

    // Alumno/egresado necesitan su fila de Perfil desde el alta (ya no existe
    // el autorregistro público que la creaba); sin esto, PUT /users/perfil y
    // la subida de CV/carta quedarían sin efecto (Perfil.update sobre 0 filas).
    // El legajo se carga en esta misma alta — si el Perfil se creara vacío y
    // se completara después, quedaría una ventana sin legajo (EST-08 §2.2).
    if (['alumno', 'egresado'].includes(rol)) {
      await Perfil.create({ usuarioId: nuevo.id, legajo: legajoNormalizado });
    }

    await logAction({
      usuarioId: req.usuario.id,
      accion: 'crear_usuario',
      entidad: 'usuario',
      entidadId: nuevo.id,
      detalle: { nombre, apellido, email, rol },
      ip: req.ip,
    });

    const { password: _, ...data } = nuevo.toJSON();
    return res.status(201).json({ success: true, message: 'Usuario creado.', data });
  } catch (err) {
    console.error('Error en POST /admin/usuarios:', err);
    return res.status(500).json({ success: false, message: 'Error al crear el usuario.' });
  }
});

/**
 * PUT /api/admin/usuarios/:id
 * Edita los datos y/o el rol de un usuario.
 *
 * Body: { nombre?, apellido?, email?, rol?, activo?, telefono?, ubicacion?, password? }
 */
router.put('/usuarios/:id', ...soloAdmin, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    // Evitar que el admin se auto-edite el rol a algo que lo deje sin acceso
    if (String(req.params.id) === String(req.usuario.id) && req.body.rol && req.body.rol !== 'admin') {
      return res.status(403).json({ success: false, message: 'No podés cambiar tu propio rol de administrador.' });
    }

    const {
      nombre, apellido, email, rol, activo,
      telefono, ubicacion, password, legajo,
    } = req.body;

    const updateData = {};
    if (nombre    !== undefined) updateData.nombre    = nombre;
    if (apellido  !== undefined) updateData.apellido  = apellido;
    if (email     !== undefined) updateData.email     = email;
    if (rol       !== undefined) updateData.rol       = rol;
    if (activo    !== undefined) updateData.activo    = activo;
    if (telefono  !== undefined) updateData.telefono  = telefono;
    if (ubicacion !== undefined) updateData.ubicacion = ubicacion;
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const antes = { rol: usuario.rol, activo: usuario.activo };
    await usuario.update(updateData);

    // legajo vive en Perfil, no en Usuario — solo aplica a alumno/egresado
    if (legajo !== undefined && ['alumno', 'egresado'].includes(usuario.rol)) {
      const legajoNormalizado = legajo?.trim() ? legajo.trim().toUpperCase() : null;
      if (legajoNormalizado) {
        const configRegex = await ConfiguracionInstitucional.findOne({ where: { clave: 'legajo.regex' } });
        const regex = new RegExp(configRegex?.valor || '^[A-Z0-9-]{3,20}$');
        if (!regex.test(legajoNormalizado)) {
          return res.status(400).json({ success: false, message: 'El legajo no tiene un formato válido.' });
        }
        const legajoDuplicado = await Perfil.findOne({ where: { legajo: legajoNormalizado, usuarioId: { [Op.ne]: usuario.id } } });
        if (legajoDuplicado) {
          return res.status(400).json({ success: false, message: 'Ya existe otro alumno/egresado con ese legajo.' });
        }
      }
      await Perfil.update({ legajo: legajoNormalizado }, { where: { usuarioId: usuario.id } });
    }

    const accion = rol && rol !== antes.rol ? 'cambiar_rol' : 'editar_usuario';
    await logAction({
      usuarioId: req.usuario.id,
      accion,
      entidad: 'usuario',
      entidadId: usuario.id,
      detalle: { antes, despues: { rol: usuario.rol, activo: usuario.activo } },
      ip: req.ip,
    });

    const { password: _, tokenReset: __, tokenResetExpira: ___, ...data } = usuario.toJSON();
    return res.json({ success: true, message: 'Usuario actualizado.', data });
  } catch (err) {
    console.error('Error en PUT /admin/usuarios/:id:', err);
    return res.status(500).json({ success: false, message: 'Error al actualizar el usuario.' });
  }
});

/**
 * DELETE /api/admin/usuarios/:id
 * Soft delete: desactiva la cuenta sin borrar el registro.
 * Preserva integridad referencial con postulaciones, avales y mensajes.
 */
router.delete('/usuarios/:id', ...soloAdmin, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.usuario.id)) {
      return res.status(403).json({ success: false, message: 'No podés eliminar tu propia cuenta de administrador.' });
    }

    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    await usuario.update({ activo: false });

    await logAction({
      usuarioId: req.usuario.id,
      accion: 'eliminar_usuario',
      entidad: 'usuario',
      entidadId: usuario.id,
      detalle: { nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, rol: usuario.rol },
      ip: req.ip,
    });

    return res.json({ success: true, message: 'Usuario desactivado (soft delete).' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al eliminar el usuario.' });
  }
});

/**
 * PATCH /api/admin/usuarios/:id/toggle
 * Activa o desactiva una cuenta de usuario.
 */
router.patch('/usuarios/:id/toggle', ...soloAdmin, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.usuario.id)) {
      return res.status(403).json({ success: false, message: 'No podés cambiar el estado de tu propia cuenta de administrador.' });
    }

    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

    await usuario.update({ activo: !usuario.activo });

    await logAction({
      usuarioId: req.usuario.id,
      accion: 'toggle_usuario',
      entidad: 'usuario',
      entidadId: usuario.id,
      detalle: { nuevoEstado: usuario.activo },
      ip: req.ip,
    });

    return res.json({ success: true, message: `Usuario ${usuario.activo ? 'activado' : 'desactivado'}.` });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al cambiar estado del usuario.' });
  }
});

// ── Gestión de empresas pendientes ────────────────────────────────────────────

router.get('/empresas/pendientes', ...soloAdmin, async (req, res) => {
  const empresas = await Empresa.findAll({
    where: { estadoAprobacion: 'pendiente' },
    include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'] }],
  });
  return res.json({ success: true, data: empresas });
});

router.patch('/empresas/:id/aprobar', ...soloAdmin, async (req, res) => {
  const empresa = await Empresa.findByPk(req.params.id);
  if (!empresa) return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
  await empresa.update({
    estadoAprobacion: 'aprobada',
    aprobadaPorUsuarioId: req.usuario.id,
    aprobadaEn: new Date(),
  });
  await Usuario.update({ habilitado: true }, { where: { id: empresa.usuarioId } });
  await logAction({ usuarioId: req.usuario.id, accion: 'aprobar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial }, ip: req.ip });
  return res.json({ success: true, message: 'Empresa aprobada.' });
});

router.patch('/empresas/:id/rechazar', ...soloAdmin, async (req, res) => {
  const empresa = await Empresa.findByPk(req.params.id);
  if (!empresa) return res.status(404).json({ success: false, message: 'Empresa no encontrada.' });
  await empresa.update({
    estadoAprobacion: 'rechazada',
    motivoRechazo: req.body?.motivo || null,
  });
  await logAction({ usuarioId: req.usuario.id, accion: 'rechazar_empresa', entidad: 'empresa', entidadId: empresa.id, detalle: { razonSocial: empresa.razonSocial }, ip: req.ip });
  return res.json({ success: true, message: 'Empresa rechazada.' });
});

// ── Moderación de ofertas ─────────────────────────────────────────────────────

/**
 * GET /api/admin/ofertas/pendientes
 * Ofertas que aún no fueron revisadas por el admin (moderada=false).
 */
router.get('/ofertas/pendientes', ...soloAdmin, async (req, res) => {
  try {
    const ofertas = await Oferta.findAll({
      where: { moderada: false },
      include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
      order: [['createdAt', 'ASC']],
    });
    return res.json({ success: true, data: ofertas });
  } catch (err) {
    console.error('[Admin] Error en GET /ofertas/pendientes:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener ofertas pendientes.' });
  }
});

/**
 * GET /api/admin/ofertas
 * Todas las ofertas con filtro opcional por estado.
 * Query param: estado (activa | pausada | rechazada | cerrada)
 */
router.get('/ofertas', ...soloAdmin, async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const ofertas = await Oferta.findAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['razonSocial', 'rubro'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, total: ofertas.length, data: ofertas });
  } catch (err) {
    console.error('[Admin] Error en GET /ofertas:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener las ofertas.' });
  }
});

/**
 * PATCH /api/admin/ofertas/:id/moderar
 * Acciones de moderación sobre una oferta.
 *
 * Body: { accion: 'aprobar' | 'pausar' | 'rechazar' | 'cerrar' }
 * Legacy compatible: { aprobada: true | false }
 *
 * Siempre setea moderada=true al revisar.
 * Notifica a la empresa en pausa/rechazo/cierre.
 */
router.patch('/ofertas/:id/moderar', ...soloAdmin, async (req, res) => {
  try {
    const oferta = await Oferta.findByPk(req.params.id);
    if (!oferta) return res.status(404).json({ success: false, message: 'Oferta no encontrada.' });

    // Resolver acción — soporta nuevo `accion` y legacy `aprobada`
    let accion = req.body.accion;
    if (!accion && req.body.aprobada !== undefined) {
      accion = req.body.aprobada ? 'aprobar' : 'rechazar';
    }

    const ACCIONES_VALIDAS = ['aprobar', 'pausar', 'rechazar', 'cerrar'];
    if (!ACCIONES_VALIDAS.includes(accion)) {
      return res.status(400).json({ success: false, message: `accion inválida. Válidas: ${ACCIONES_VALIDAS.join(', ')}.` });
    }

    const ESTADO_POR_ACCION = {
      aprobar:  'activa',
      pausar:   'pausada',
      rechazar: 'rechazada',
      cerrar:   'cerrada',
    };

    const nuevoEstado = ESTADO_POR_ACCION[accion];
    await oferta.update({ moderada: true, estado: nuevoEstado });

    await logAction({
      usuarioId: req.usuario.id,
      accion: `${accion}_oferta`,
      entidad: 'oferta',
      entidadId: oferta.id,
      detalle: { titulo: oferta.titulo, nuevoEstado },
      ip: req.ip,
    });

    // Notificar a la empresa según la acción
    const notifPorAccion = {
      aprobar:  { titulo: '✅ Tu oferta fue aprobada',  mensaje: `La oferta "${oferta.titulo}" fue aprobada y está publicada.`,                        tipoVisual: 'success' },
      pausar:   { titulo: '⏸️ Tu oferta fue pausada',   mensaje: `La oferta "${oferta.titulo}" fue pausada por el administrador.`,                     tipoVisual: 'warning' },
      rechazar: { titulo: '❌ Tu oferta fue rechazada', mensaje: `La oferta "${oferta.titulo}" fue rechazada por el administrador.`,                    tipoVisual: 'error'   },
      cerrar:   { titulo: '🔒 Tu oferta fue cerrada',   mensaje: `La oferta "${oferta.titulo}" fue cerrada por el administrador.`,                      tipoVisual: 'info'    },
    };

    try {
      const empresaOferta = await Empresa.findByPk(oferta.empresaId, { attributes: ['usuarioId'] });
      if (empresaOferta?.usuarioId) {
        const notif = notifPorAccion[accion];
        await crearNotificacion({
          usuarioId: empresaOferta.usuarioId,
          titulo: notif.titulo,
          mensaje: notif.mensaje,
          tipo: 'oferta',
          tipoVisual: notif.tipoVisual,
          enlace: '/empresa',
          accionURL: '/empresa',
        });
      }
    } catch (e) { console.error('[Admin] Error notif moderación oferta:', e.message); }

    return res.json({ success: true, message: `Oferta ${accion === 'aprobar' ? 'aprobada' : accion === 'pausar' ? 'pausada' : accion === 'rechazar' ? 'rechazada' : 'cerrada'}.`, data: { estado: nuevoEstado, moderada: true } });
  } catch (err) {
    console.error('[Admin] Error en PATCH /ofertas/:id/moderar:', err);
    return res.status(500).json({ success: false, message: 'Error al moderar la oferta.' });
  }
});

// ── Logs del sistema (v1.4) ───────────────────────────────────────────────────

/**
 * GET /api/admin/logs
 * Lista los registros de auditoría del sistema con filtros opcionales.
 *
 * Query params:
 *   accion       — filtra por tipo de acción
 *   usuarioId    — filtra por usuario que realizó la acción
 *   entidad      — filtra por entidad afectada
 *   desde        — fecha ISO de inicio del rango
 *   hasta        — fecha ISO de fin del rango
 *   page         — página (default: 1)
 *   limit        — registros por página (default: 25, max: 100)
 */
router.get('/logs', ...soloAdmin, async (req, res) => {
  try {
    const { accion, usuarioId, entidad, desde, hasta, page = 1, limit = 25 } = req.query;
    const where = {};

    if (accion)    where.accion    = accion;
    if (usuarioId) where.usuarioId = usuarioId;
    if (entidad)   where.entidad   = entidad;
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt[Op.gte] = new Date(desde);
      if (hasta) where.createdAt[Op.lte] = new Date(hasta);
    }

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const { count, rows } = await ActivityLog.findAndCountAll({
      where,
      include: [{
        model: Usuario, as: 'usuario',
        attributes: ['nombre', 'apellido', 'email', 'rol'],
        required: false,
      }],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    });

    return res.json({
      success: true,
      total: count,
      page: pageNum,
      totalPages: Math.ceil(count / limitNum),
      data: rows,
    });
  } catch (err) {
    console.error('Error en GET /admin/logs:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener los logs.' });
  }
});

/**
 * GET /api/admin/logs/export
 * Exporta los logs filtrados como un archivo CSV.
 */
router.get('/logs/export', ...soloAdmin, async (req, res) => {
  try {
    const { accion, usuarioId, entidad, desde, hasta } = req.query;
    const where = {};

    if (accion)    where.accion    = accion;
    if (usuarioId) where.usuarioId = usuarioId;
    if (entidad)   where.entidad   = entidad;
    if (desde || hasta) {
      where.createdAt = {};
      if (desde) where.createdAt[Op.gte] = new Date(desde);
      if (hasta) where.createdAt[Op.lte] = new Date(hasta);
    }

    const logs = await ActivityLog.findAll({
      where,
      include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'apellido', 'email'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: 5000, // Cap para no sobrecargar el servidor
    });

    // Construye CSV
    const header = 'ID,Fecha,Acción,Entidad,EntidadID,Usuario,Email,IP,Detalle\n';
    const rows = logs.map((l) => {
      const u = l.usuario;
      const nombreUsuario = u ? `${u.nombre} ${u.apellido}` : 'Sistema';
      const email = u ? u.email : '';
      const detalle = l.detalle ? JSON.stringify(l.detalle).replace(/"/g, '""') : '';
      return [l.id, new Date(l.createdAt).toISOString(), l.accion, l.entidad || '', l.entidadId || '', nombreUsuario, email, l.ip || '', `"${detalle}"`].join(',');
    });

    const csv = header + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.csv"`);
    return res.send('\uFEFF' + csv); // BOM para que Excel lo abra bien
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error al exportar los logs.' });
  }
});

// ── Gestión de solicitudes de empresa (v1.6) ─────────────────────────────────

/**
 * GET /api/admin/solicitudes-empresa
 * Devuelve todas las solicitudes, con filtro opcional por estado.
 * Query param: estado (pendiente | aprobado | rechazado)
 */
router.get('/solicitudes-empresa', ...soloAdmin, async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const solicitudes = await SolicitudEmpresa.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, total: solicitudes.length, data: solicitudes });
  } catch (err) {
    console.error('[Admin] Error al listar solicitudes:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener las solicitudes.' });
  }
});

router.patch('/solicitudes-empresa/:id/aprobar', ...soloAdmin, async (req, res) => {
  try {
    const resultado = await solicitudEmpresaService.aprobarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.json({
      success: true,
      message: `Solicitud aprobada. Empresa "${resultado.razonSocial}" y usuario creados. Credenciales enviadas a ${resultado.email}.`,
      data: {
        empresaId:             resultado.empresaId,
        usuarioId:             resultado.usuarioId,
        email:                 resultado.email,
        reclutadoresPendientes: resultado.reclutadoresPendientes,
        ...(process.env.NODE_ENV !== 'production' && { passwordGenerada: resultado.passwordGenerada }),
      },
    });
  } catch (err) {
    if (err.statusCode) {
      const resp = { success: false, message: err.message };
      if (err.code) resp.code = err.code;
      return res.status(err.statusCode).json(resp);
    }
    console.error('[Admin] Error al aprobar solicitud:', err);
    return res.status(500).json({ success: false, message: 'Error al aprobar la solicitud.' });
  }
});

router.patch('/solicitudes-empresa/:id/rechazar', ...soloAdmin, async (req, res) => {
  try {
    await solicitudEmpresaService.rechazarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip },
      req.body.motivo
    );
    return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada por email.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    console.error('[Admin] Error al rechazar solicitud:', err);
    return res.status(500).json({ success: false, message: 'Error al rechazar la solicitud.' });
  }
});


// ── Solicitudes de reclutadores (v1.7) ───────────────────────────────────────

/**
 * GET /api/admin/solicitudes-reclutador
 * Lista todas las solicitudes de reclutadores con datos de empresa.
 * Query param: estado (pendiente | aprobado | rechazado)
 */
router.get('/solicitudes-reclutador', ...soloAdmin, async (req, res) => {
  try {
    const { estado } = req.query;
    const where = {};
    if (estado) where.estado = estado;

    const solicitudes = await SolicitudReclutador.findAll({
      where,
      include: [{ model: Empresa, as: 'empresa', attributes: ['id', 'razonSocial', 'usuarioId'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, total: solicitudes.length, data: solicitudes });
  } catch (err) {
    console.error('[Admin] Error al listar solicitudes-reclutador:', err);
    return res.status(500).json({ success: false, message: 'Error al obtener las solicitudes.' });
  }
});

router.patch('/solicitudes-reclutador/:id/aprobar', ...soloAdmin, async (req, res) => {
  try {
    const resultado = await solicitudReclutadorService.aprobarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip }
    );
    return res.json({
      success: true,
      message: `Reclutador aprobado. Cuenta creada para ${resultado.email}.`,
      data: {
        usuarioId: resultado.usuarioId,
        email:     resultado.email,
        ...(process.env.NODE_ENV !== 'production' && { passwordGenerada: resultado.passwordGenerada }),
      },
    });
  } catch (err) {
    if (err.statusCode) {
      const resp = { success: false, message: err.message };
      if (err.code) resp.code = err.code;
      return res.status(err.statusCode).json(resp);
    }
    console.error('[Admin] Error al aprobar solicitud-reclutador:', err);
    return res.status(500).json({ success: false, message: 'Error al aprobar la solicitud.' });
  }
});

router.patch('/solicitudes-reclutador/:id/rechazar', ...soloAdmin, async (req, res) => {
  try {
    await solicitudReclutadorService.rechazarSolicitud(
      req.params.id,
      { adminUsuarioId: req.usuario.id, ip: req.ip },
      req.body.motivo
    );
    return res.json({ success: true, message: 'Solicitud rechazada. Notificación enviada a la empresa.' });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    console.error('[Admin] Error al rechazar solicitud-reclutador:', err);
    return res.status(500).json({ success: false, message: 'Error al rechazar la solicitud.' });
  }
});

module.exports = router;

