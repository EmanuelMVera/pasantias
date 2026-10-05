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

const { Usuario } = require('../models');
const authService = require('../services/auth.service');
const HttpError = require('../utils/httpError');
const { cookieOptionsToken, cookieClearOptions } = require('../utils/cookies');
const { esPasswordValida, MENSAJE_PASSWORD_CORTA } = require('../utils/password');
const { config } = require('../config/env');
const { registrarAuditoria } = require('../utils/auditLog');
const logger = require('../utils/logger');
const { normalizarEmail, esEmailValido } = require('../validators/common.validator');

// ── Login ─────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/login
 * Autentica un usuario con email y contraseña.
 *
 * `remember` ("Recordarme"): solo `true` (o el string exacto 'true') pide una
 * sesión persistente; cualquier otro valor → sesión corta (fail-safe).
 */
exports.login = async (req, res) => {
  const { password } = req.body;
  // Los emails se guardan en minúsculas (usuario.model.js): se busca igual.
  const email = normalizarEmail(req.body.email);
  const remember = req.body?.remember === true || req.body?.remember === 'true';
  // Solo presencia y tipo: no se impone el mínimo de 8 en el login (hay
  // contraseñas previas a esa regla que tienen que seguir funcionando).
  if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Ingresá tu email y tu contraseña.');
  }

  const usuario = await Usuario.findOne({ where: { email } });
  // Mismo mensaje para "no existe" y "password incorrecta" (más abajo) —
  // protección deliberada contra enumeración de cuentas, no simplificar.
  if (!usuario) throw new HttpError(401, 'Credenciales inválidas.');

  if (!usuario.activo) throw new HttpError(403, 'Cuenta desactivada.');
  if (!usuario.habilitado) {
    throw new HttpError(403, 'Tu cuenta está pendiente de aprobación por el administrador.');
  }

  const match = await authService.compararPassword(password, usuario.password);
  if (!match) throw new HttpError(401, 'Credenciales inválidas.');

  const token = authService.generarToken(usuario, { persistente: remember });

  // SEC-02: el token va en una cookie HttpOnly. Se mantiene también en el body
  // por transición (clientes API / suite de tests con header Authorization).
  // Sin "Recordarme" es una cookie de sesión (sin maxAge); con "Recordarme",
  // persistente por JWT_EXPIRES_IN.
  res.cookie('token', token, cookieOptionsToken({ persistent: remember }));

  // Actualiza ultimoAcceso de forma no bloqueante (fire-and-forget)
  usuario.update({ ultimoAcceso: new Date() }).catch((err) =>
    (req.log || logger).warn({ err }, 'ultimoAcceso_no_actualizado')
  );

  registrarAuditoria({
    req,
    usuarioId: usuario.id,
    accion: 'login',
    entidad: 'usuario',
    entidadId: usuario.id,
    detalle: { rol: usuario.rol, email: usuario.email, recordarme: remember },
  });

  return res.json({
    success: true,
    token,
    usuario: authService.serializarUsuario(usuario),
  });
};

// ── Perfil propio ─────────────────────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Devuelve los datos del usuario actualmente autenticado.
 */
exports.me = async (req, res) => {
  return res.json({ success: true, usuario: authService.serializarUsuario(req.usuario) });
};

// ── Logout ────────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/logout
 * Borra la cookie de sesión. No requiere token válido (borrar siempre es seguro).
 */
exports.logout = async (req, res) => {
  res.clearCookie('token', cookieClearOptions());
  return res.json({ success: true, message: 'Sesión cerrada.' });
};

// ── Solicitar recupero de contraseña ──────────────────────────────────────────
/**
 * POST /api/auth/forgot-password
 * Genera un token de reset, lo persiste y envía el email.
 * En modo desarrollo (sin EMAIL_USER) devuelve el token en la respuesta.
 */
exports.forgotPassword = async (req, res) => {
  // Los emails se guardan trim + minúsculas: sin normalizar, " Juan@Mail.com"
  // no encontraba la cuenta y el pedido se perdía en silencio.
  const email = normalizarEmail(req.body.email);
  if (!email) throw new HttpError(400, 'Ingresá tu email.');
  if (!esEmailValido(email)) throw new HttpError(400, 'Ingresá un email válido.');

  const usuario = await Usuario.findOne({ where: { email } });

  // Respuesta genérica e IDÉNTICA para un email registrado y uno que no (antes
  // eran dos textos distintos: el mensaje revelaba si la cuenta existía).
  if (!usuario) {
    return res.json({ success: true, message: MENSAJE_RECUPERO });
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

  // Sin await: la respuesta no espera al SMTP, así un email registrado no
  // tarda más que uno inexistente (tampoco se revela por tiempo). El
  // resultado SÍ se registra: un fallo queda como ERROR con el requestId —
  // nunca el token ni el link (enviarEmail no loguea cuerpos).
  const log = req.log || logger;
  void authService.enviarEmailReset(email, token, { log }).then((r) => {
    if (!r.ok && r.errorCode !== 'EMAIL_NO_CONFIGURADO') {
      log.error({ usuarioId: usuario.id, errorCode: r.errorCode, categoria: r.categoria }, 'recupero_password_email_fallo');
    }
  });

  // Solo FUERA de producción, y sin SMTP configurado, se expone el token para
  // facilitar pruebas locales. En producción NUNCA se devuelve ni se loguea
  // (SEC-02): filtraría tokens de reset si faltara EMAIL_USER. El token va como
  // campo (no interpolado en el mensaje) para que la redacción de pino lo tape
  // también en dev. NODE_ENV se lee en vivo (no config.isProd) porque la suite
  // lo cambia a mitad de test para verificar justamente que no se filtra.
  if (process.env.NODE_ENV !== 'production' && !config.email.configured) {
    (req.log || logger).debug({ email, devToken: token }, 'token_recupero_dev');
    return res.json({
      success: true,
      message: 'Token generado (modo desarrollo — email no configurado).',
      devToken: token,
    });
  }

  return res.json({ success: true, message: MENSAJE_RECUPERO });
};

const MENSAJE_RECUPERO = 'Si el email está registrado, vas a recibir un correo con las instrucciones para restablecer tu contraseña.';

// ── Restablecer contraseña ────────────────────────────────────────────────────
/**
 * POST /api/auth/reset-password/:token
 * Permite cambiar la contraseña usando el token recibido por email.
 */
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!esPasswordValida(password)) {
    throw new HttpError(400, MENSAJE_PASSWORD_CORTA);
  }

  const tokenHash = authService.hashTokenReset(token);
  const usuario = await Usuario.findOne({ where: { tokenReset: tokenHash } });

  if (!usuario) throw new HttpError(400, 'Token inválido o ya utilizado.');
  if (usuario.tokenResetUsadoEn) throw new HttpError(400, 'Este token ya fue utilizado. Solicitá uno nuevo.');
  if (new Date() > new Date(usuario.tokenResetExpira)) {
    throw new HttpError(400, 'El token expiró. Solicitá uno nuevo.');
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

  // SEC-02: si había una sesión abierta en este navegador, la cookie ya no
  // sirve (tokenVersion cambió) — se borra para forzar un login limpio.
  res.clearCookie('token', cookieClearOptions());

  return res.json({ success: true, message: 'Contraseña restablecida correctamente. Ya podés iniciar sesión.' });
};

// ── Cambiar contraseña ────────────────────────────────────────────────────────
/**
 * PUT /api/auth/cambiar-password
 * Cambia la contraseña del usuario autenticado.
 */
exports.cambiarPassword = async (req, res) => {
  const { passwordActual, nuevaPassword } = req.body;

  const usuario = await Usuario.findByPk(req.usuario.id);
  if (!usuario) throw new HttpError(404, 'Usuario no encontrado.');

  const esCorrecta = await authService.compararPassword(passwordActual, usuario.password);
  if (!esCorrecta) throw new HttpError(401, 'La contraseña actual es incorrecta.');

  const hash = await authService.hashPassword(nuevaPassword);
  // Incrementa tokenVersion: cualquier JWT emitido antes de este cambio
  // deja de ser válido (EST-08 §5.3) — es lo que un usuario espera al
  // cambiar su contraseña después de sospechar que alguien más la tiene.
  await usuario.update({ password: hash, tokenVersion: usuario.tokenVersion + 1 });

  // SEC-02: la sesión actual queda invalidada (tokenVersion) — borrar la cookie.
  res.clearCookie('token', cookieClearOptions());

  return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
};
