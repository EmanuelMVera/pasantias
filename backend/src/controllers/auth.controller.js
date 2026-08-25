/**
 * auth.controller.js — Controlador de autenticación del sistema.
 *
 * Maneja los siguientes flujos:
 * - Inicio de sesión con email y contraseña
 * - Obtención del perfil del usuario autenticado
 * - Solicitud de recuperación de contraseña (envío de email con token)
 * - Restablecimiento de contraseña usando el token recibido por email
 * - Cambio de contraseña del usuario autenticado
 *
 * El alta de usuarios NO se hace por autorregistro: alumnos/egresados se
 * cargan desde el panel de administración (POST /api/admin/usuarios) y las
 * empresas ingresan vía /api/solicitudes-empresa con aprobación del admin.
 */

const { Usuario, ActivityLog } = require('../models');
const authService = require('../services/auth.service');

// Helper para registrar acciones en el log sin interrumpir el flujo principal
async function logAction(datos) {
  try { await ActivityLog.create(datos); } catch (e) { /* Fallo silencioso */ }
}

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/login
 * Autentica un usuario con email y contraseña.
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const usuario = await Usuario.findOne({ where: { email } });
    if (!usuario) return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });

    if (!usuario.activo) return res.status(403).json({ success: false, message: 'Cuenta desactivada.' });
    if (!usuario.habilitado) return res.status(403).json({
      success: false,
      message: 'Tu cuenta está pendiente de aprobación por el administrador.',
    });

    const match = await authService.compararPassword(password, usuario.password);
    if (!match) return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });

    const token = authService.generarToken(usuario);

    // Actualiza ultimoAcceso de forma no bloqueante (fire-and-forget)
    usuario.update({ ultimoAcceso: new Date() }).catch((err) =>
      console.error('⚠️  No se pudo actualizar ultimoAcceso:', err.message)
    );

    logAction({
      usuarioId: usuario.id,
      accion: 'login',
      entidad: 'usuario',
      entidadId: usuario.id,
      detalle: { rol: usuario.rol, email: usuario.email },
      ip: req.ip,
    });

    return res.json({
      success: true,
      token,
      usuario: authService.serializarUsuario(usuario),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Error al iniciar sesión.' });
  }
};

// ── Perfil propio ─────────────────────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Devuelve los datos del usuario actualmente autenticado.
 */
exports.me = async (req, res) => {
  return res.json({ success: true, usuario: req.usuario });
};

// ── Solicitar recupero de contraseña ──────────────────────────────────────────
/**
 * POST /api/auth/forgot-password
 * Genera un token de reset, lo persiste y envía el email.
 * En modo desarrollo (sin EMAIL_USER) devuelve el token en la respuesta.
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Ingresá tu email.' });

    const usuario = await Usuario.findOne({ where: { email } });

    // Respuesta genérica para no revelar si el email existe
    if (!usuario) {
      return res.json({ success: true, message: 'Si el email está registrado, recibirás las instrucciones.' });
    }

    const token = authService.generarTokenReset();
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
    // Se persiste el HASH del token, nunca el token en claro — el token
    // real solo viaja en el email que recibe el usuario.
    await usuario.update({
      tokenReset: authService.hashTokenReset(token),
      tokenResetExpira: expira,
      tokenResetUsadoEn: null,
    });

    await authService.enviarEmailReset(email, token);

    // En modo dev (sin SMTP) devolver el token para facilitar pruebas
    if (!process.env.EMAIL_USER) {
      console.log(`\n🔑 TOKEN DE RECUPERO para ${email}:\n   ${token}\n`);
      return res.json({
        success: true,
        message: 'Token generado (modo desarrollo — email no configurado).',
        devToken: token,
      });
    }

    return res.json({ success: true, message: 'Te enviamos un email con las instrucciones.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Error al procesar la solicitud.' });
  }
};

// ── Restablecer contraseña ────────────────────────────────────────────────────
/**
 * POST /api/auth/reset-password/:token
 * Permite cambiar la contraseña usando el token recibido por email.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const tokenHash = authService.hashTokenReset(token);
    const usuario = await Usuario.findOne({ where: { tokenReset: tokenHash } });

    if (!usuario) {
      return res.status(400).json({ success: false, message: 'Token inválido o ya utilizado.' });
    }
    if (usuario.tokenResetUsadoEn) {
      return res.status(400).json({ success: false, message: 'Este token ya fue utilizado. Solicitá uno nuevo.' });
    }
    if (new Date() > new Date(usuario.tokenResetExpira)) {
      return res.status(400).json({ success: false, message: 'El token expiró. Solicitá uno nuevo.' });
    }

    const hash = await authService.hashPassword(password);
    // tokenReset/tokenResetExpira se limpian igual que antes; además se
    // marca tokenResetUsadoEn (por si algo dejara el hash sin limpiar) y
    // se incrementa tokenVersion para cerrar cualquier sesión que hubiera
    // quedado abierta con la contraseña vieja.
    await usuario.update({
      password: hash,
      tokenReset: null,
      tokenResetExpira: null,
      tokenResetUsadoEn: new Date(),
      tokenVersion: usuario.tokenVersion + 1,
    });

    return res.json({ success: true, message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Error al restablecer la contraseña.' });
  }
};

// ── Cambiar contraseña ────────────────────────────────────────────────────────
/**
 * PUT /api/auth/cambiar-password
 * Cambia la contraseña del usuario autenticado.
 */
exports.cambiarPassword = async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;

    const usuario = await Usuario.findByPk(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    }

    const esCorrecta = await authService.compararPassword(passwordActual, usuario.password);
    if (!esCorrecta) {
      return res.status(401).json({ success: false, message: 'La contraseña actual es incorrecta.' });
    }

    const hash = await authService.hashPassword(nuevaPassword);
    // Incrementa tokenVersion: cualquier JWT emitido antes de este cambio
    // deja de ser válido (EST-08 §5.3) — es lo que un usuario espera al
    // cambiar su contraseña después de sospechar que alguien más la tiene.
    await usuario.update({ password: hash, tokenVersion: usuario.tokenVersion + 1 });

    return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('[Auth] Error en cambiar-password:', err);
    return res.status(500).json({ success: false, message: 'Error interno al cambiar la contraseña.' });
  }
};
