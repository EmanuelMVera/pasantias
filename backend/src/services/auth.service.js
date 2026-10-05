const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { enviarEmail } = require('../utils/mailer');
const { config } = require('../config/env');

// tokenVersion viaja en el payload del JWT: verifyToken la compara contra
// usuarios.tokenVersion en cada request. Incrementar la columna (cambio de
// contraseña, "cerrar sesión en todos los dispositivos") invalida de golpe
// cualquier token viejo, sin necesidad de una tabla de sesiones (EST-08 §5.3).
//
// `persistente` = el usuario marcó "Recordarme": JWT de larga duración
// (JWT_EXPIRES_IN, 7d). Si no, sesión corta (JWT_SESSION_EXPIRES_IN, 8h).
const generarToken = (usuario, { persistente = false } = {}) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol, tokenVersion: usuario.tokenVersion ?? 0 }, config.jwt.secret, {
    expiresIn: persistente ? config.jwt.expiresIn : config.jwt.sessionExpiresIn,
  });

// Hash del token de recupero — se persiste esto, nunca el token en claro.
const hashTokenReset = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Forma pública del usuario que ve el frontend (login y /auth/me devuelven
// exactamente esto — nunca el modelo Sequelize crudo, que filtraría
// tokenVersion, habilitado, timestamps, etc.).
const serializarUsuario = (usuario) => ({
  id: usuario.id,
  nombre: usuario.nombre,
  apellido: usuario.apellido,
  email: usuario.email,
  rol: usuario.rol,
  telefono: usuario.telefono || null,
  ubicacion: usuario.ubicacion || null,
  fotoPerfil: usuario.fotoPerfil || null,
  ultimoAcceso: usuario.ultimoAcceso || null,
});

const hashPassword = (plain) => bcrypt.hash(plain, 12);

const compararPassword = (plain, hash) => bcrypt.compare(plain, hash);

const generarTokenReset = () => crypto.randomBytes(32).toString('hex');

/**
 * Envía el link de recuperación. Devuelve el resultado de enviarEmail
 * ({ ok, messageId } | { ok: false, errorCode, categoria }) — nunca lanza.
 * El link lleva el token en claro: no se loguea (enviarEmail no loguea cuerpos).
 *
 * @param {string} email
 * @param {string} token
 * @param {{ log?: object, tipo?: string }} [opts] log = req.log (requestId)
 */
const enviarEmailReset = (email, token, { log, tipo = 'recupero_password' } = {}) => {
  // config.urls.client ya viene normalizada (sin barra final) y con default de
  // desarrollo — así el link nunca queda `undefined/reset-password/...`.
  const resetUrl = `${config.urls.client}/reset-password/${token}`;
  return enviarEmail({
    to: email,
    tipo,
    log,
    subject: 'Recupero de contraseña – SisPasantías',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#6366f1">Recupero de contraseña</h2>
        <p>Hacé clic en el siguiente enlace para restablecer tu contraseña.<br>El link expira en <strong>1 hora</strong>.</p>
        <a href="${resetUrl}" style="background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;font-weight:bold">
          Restablecer contraseña
        </a>
        <p style="margin-top:24px;color:#888;font-size:0.85rem">Si no solicitaste esto, ignorá este email.</p>
      </div>
    `,
  });
};

module.exports = {
  generarToken,
  serializarUsuario,
  hashPassword,
  compararPassword,
  generarTokenReset,
  hashTokenReset,
  enviarEmailReset,
};
