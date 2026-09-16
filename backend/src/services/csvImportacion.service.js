'use strict';

/**
 * csvImportacion.service.js — importación masiva de alumnos/egresados por CSV.
 *
 * Formato: legajo,nombre,apellido,email,rol,carrera,anioEgreso,telefono,ubicacion
 * (UTF-8, BOM admitido). Flujo: analizarCsv (dry-run, no escribe nada) →
 * confirmarImportacion (crea Usuario+Perfil en transacción, nunca recibe
 * passwords, genera un token de activación de un solo uso por usuario).
 *
 * Reutiliza infraestructura ya existente en vez de duplicarla:
 * - auth.service.js::generarTokenReset/hashTokenReset — mismo campo
 *   Usuario.tokenReset (hash SHA-256) que forgot-password y recuperación de
 *   acceso de equipo. El endpoint público POST /auth/reset-password/:token
 *   ya existente sirve tal cual para que el usuario active su cuenta.
 * - utils/mailer.js — mismo transporter/plantilla que el resto del sistema.
 * - utils/legajo.js — misma regex configurable que el alta manual de admin.
 */

const crypto = require('crypto');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { Op } = require('sequelize');

const { sequelize, Usuario, Perfil } = require('../models');
const HttpError = require('../utils/httpError');
const { config } = require('../config/env');
const logger = require('../utils/logger');
const { enviarEmail, htmlNotificacion } = require('../utils/mailer');
const { registrarAuditoria } = require('../utils/auditLog');
const { hashPassword, generarTokenReset, hashTokenReset } = require('./auth.service');
const { obtenerRegexLegajo } = require('../utils/legajo');
const { COLUMNAS, validarHeader, validarFilaCsv } = require('../validators/csvImport.validator');

const TOKEN_ACTIVACION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días — más margen que el reset normal (1h)

const multerCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.csvImport.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const nombreOk = /\.csv$/i.test(file.originalname || '');
    const mimeOk = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'].includes(file.mimetype);
    if (nombreOk || mimeOk) cb(null, true);
    else cb(new HttpError(400, 'El archivo debe ser un CSV (.csv).'));
  },
});

function parsearCsv(buffer) {
  let headerValido = true;
  let registros;
  try {
    registros = parse(buffer, {
      bom: true,
      trim: true,
      skip_empty_lines: true,
      columns: (header) => {
        headerValido = validarHeader(header);
        return header;
      },
    });
  } catch (err) {
    throw new HttpError(400, `No se pudo leer el CSV: ${err.message}`);
  }
  if (!headerValido) {
    throw new HttpError(400, `El CSV debe tener exactamente estas columnas, en este orden: ${COLUMNAS.join(',')}`);
  }
  if (registros.length > config.csvImport.maxRows) {
    throw new HttpError(400, `El archivo tiene ${registros.length} filas; el máximo permitido es ${config.csvImport.maxRows}.`);
  }
  return registros;
}

/**
 * Analiza el CSV sin escribir nada: valida cada fila, detecta duplicados
 * internos (mismo email/legajo repetido en el archivo) y conflictos contra
 * la base ya existente.
 * @returns {Promise<{ totalFilas, validas, invalidas, filas: Array }>}
 */
async function analizarCsv(buffer) {
  const registrosCrudos = parsearCsv(buffer);
  const regexLegajo = await obtenerRegexLegajo();

  const filas = registrosCrudos.map((cruda, idx) => {
    const { ok, fila, errores } = validarFilaCsv(cruda, regexLegajo);
    return { linea: idx + 2, fila, errores: [...errores], ok }; // +1 header, +1 para 1-indexado
  });

  // Duplicados internos (mismo email/legajo repetido dentro del archivo).
  const contarPor = (campo) => {
    const conteo = new Map();
    for (const f of filas) {
      const v = f.fila[campo];
      if (v) conteo.set(v, (conteo.get(v) || 0) + 1);
    }
    return conteo;
  };
  const conteoEmail = contarPor('email');
  const conteoLegajo = contarPor('legajo');
  for (const f of filas) {
    if (f.fila.email && conteoEmail.get(f.fila.email) > 1) {
      f.errores.push('email duplicado dentro del archivo.');
      f.ok = false;
    }
    if (f.fila.legajo && conteoLegajo.get(f.fila.legajo) > 1) {
      f.errores.push('legajo duplicado dentro del archivo.');
      f.ok = false;
    }
  }

  // Conflictos contra la base. IMPORTANTE: Usuario.email tiene un índice
  // único global sobre LOWER(email) que NO es parcial por deletedAt — un
  // email de un usuario soft-deleted sigue bloqueando el alta, así que la
  // búsqueda va con paranoid:false (Perfil no es paranoid, no aplica ahí).
  const emails = [...new Set(filas.map((f) => f.fila.email).filter(Boolean))];
  const legajos = [...new Set(filas.map((f) => f.fila.legajo).filter(Boolean))];
  const [usuariosExistentes, perfilesExistentes] = await Promise.all([
    emails.length
      ? Usuario.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['email'], paranoid: false })
      : [],
    legajos.length
      ? Perfil.findAll({ where: { legajo: { [Op.in]: legajos } }, attributes: ['legajo'] })
      : [],
  ]);
  const emailsExistentes = new Set(usuariosExistentes.map((u) => u.email));
  const legajosExistentes = new Set(perfilesExistentes.map((p) => p.legajo));
  for (const f of filas) {
    if (f.fila.email && emailsExistentes.has(f.fila.email)) {
      f.errores.push('Ya existe un usuario con ese email.');
      f.ok = false;
    }
    if (f.fila.legajo && legajosExistentes.has(f.fila.legajo)) {
      f.errores.push('Ya existe un alumno/egresado con ese legajo.');
      f.ok = false;
    }
  }

  const validas = filas.filter((f) => f.ok).length;
  return { totalFilas: filas.length, validas, invalidas: filas.length - validas, filas };
}

/**
 * Confirma la importación: crea Usuario+Perfil por cada fila válida, dentro
 * de una única transacción (todo o nada). Nunca recibe/persiste passwords en
 * claro: genera un password aleatorio inutilizable (nadie lo conoce) y un
 * token de activación de un solo uso reutilizando auth.service.js.
 */
async function confirmarImportacion(buffer, { actorUsuarioId, ip, requestId }) {
  const analisis = await analizarCsv(buffer);
  const filasValidas = analisis.filas.filter((f) => f.ok);
  if (filasValidas.length === 0) {
    throw new HttpError(400, 'No hay filas válidas para importar.');
  }

  const creados = [];
  await sequelize.transaction(async (t) => {
    for (const f of filasValidas) {
      const passwordInutilizable = await hashPassword(crypto.randomBytes(32).toString('hex'));
      const usuario = await Usuario.create({
        nombre: f.fila.nombre,
        apellido: f.fila.apellido,
        email: f.fila.email,
        password: passwordInutilizable,
        rol: f.fila.rol,
        telefono: f.fila.telefono,
        ubicacion: f.fila.ubicacion,
        activo: true,
        habilitado: true,
      }, { transaction: t });

      await Perfil.create({
        usuarioId: usuario.id,
        legajo: f.fila.legajo,
        carrera: f.fila.carrera,
        anioEgreso: f.fila.anioEgreso,
      }, { transaction: t });

      const token = generarTokenReset();
      await usuario.update({
        tokenReset: hashTokenReset(token),
        tokenResetExpira: new Date(Date.now() + TOKEN_ACTIVACION_MS),
        tokenResetUsadoEn: null,
      }, { transaction: t });

      creados.push({ id: usuario.id, email: usuario.email, nombre: usuario.nombre, apellido: usuario.apellido, token });
    }
  });

  // Fuera de la transacción: email de activación (fire-and-forget, mismo
  // criterio que solicitudEmpresa.service.js::aprobarSolicitud) + auditoría.
  creados.forEach((c) => {
    enviarEmail({
      to: c.email,
      subject: 'Activá tu cuenta – SisPasantías',
      html: htmlNotificacion({
        titulo: 'Activá tu cuenta',
        mensaje: `Hola ${c.nombre}, se creó una cuenta para vos en SisPasantías. Hacé clic en el botón para elegir tu contraseña y activarla. El link expira en 7 días.`,
        enlace: `/reset-password/${c.token}`,
      }),
    }).catch((e) => logger.error({ err: e, email: c.email }, 'email_activacion_csv_fallo'));
  });

  await registrarAuditoria({
    usuarioId: actorUsuarioId,
    ip,
    requestId,
    accion: 'importar_alumnos_csv',
    entidad: 'usuario',
    detalle: { totalFilas: analisis.totalFilas, totalCreados: creados.length, totalInvalidas: analisis.invalidas },
  });

  // Igual que forgotPassword: solo fuera de producción y sin SMTP configurado
  // se exponen los tokens, para poder probar el flujo sin depender de email
  // real. NUNCA en producción, y nunca se loguea ningún token.
  const exponerTokens = process.env.NODE_ENV !== 'production' && !config.email.configured;

  return {
    totalFilas: analisis.totalFilas,
    totalCreados: creados.length,
    totalInvalidas: analisis.invalidas,
    creados: creados.map((c) => ({ id: c.id, email: c.email, nombre: c.nombre, apellido: c.apellido })),
    ...(exponerTokens ? { devTokens: creados.map((c) => ({ email: c.email, devToken: c.token })) } : {}),
  };
}

function generarPlantillaCsv() {
  const header = COLUMNAS.join(',');
  const ejemploAlumno = 'TSP-2025-0001,Juana,Pérez,juana.perez@ejemplo.com,alumno,Tecnicatura Superior en Programación,,11-5555-0001,Avellaneda';
  const ejemploEgresado = 'TSP-2020-0099,Carlos,Gómez,carlos.gomez@ejemplo.com,egresado,Tecnicatura Superior en Análisis de Sistemas,2021,11-5555-0002,Lanús';
  return `${header}\n${ejemploAlumno}\n${ejemploEgresado}\n`;
}

module.exports = { multerCsv, parsearCsv, analizarCsv, confirmarImportacion, generarPlantillaCsv };
