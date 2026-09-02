const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { enviarEmail } = require('../utils/mailer');

// tokenVersion viaja en el payload del JWT: verifyToken la compara contra
// usuarios.tokenVersion en cada request. Incrementar la columna (cambio de
// contraseña, "cerrar sesión en todos los dispositivos") invalida de golpe
// cualquier token viejo, sin necesidad de una tabla de sesiones (EST-08 §5.3).
const generarToken = (usuario) =>
  jwt.sign({ id: usuario.id, rol: usuario.rol, tokenVersion: usuario.tokenVersion ?? 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
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

const enviarEmailReset = async (email, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${token}`;
  await enviarEmail({
    to: email,
    subject: 'Recupero de contraseña',
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
