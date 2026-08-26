/**
 * tests/helpers/factories.js — TEST-01.
 *
 * Crea datos de prueba directo contra los modelos Sequelize, con valores
 * únicos por invocación (nunca IDs ni emails fijos) para que los tests no
 * choquen entre sí ni dependan de haber corrido antes.
 */

'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../../src/app');
const { Usuario, Perfil, Empresa, EmpresaUsuario, Oferta, SolicitudEmpresa, Archivo } = require('../../src/models');

// Misma carpeta que archivo.service.js::UPLOADS_ROOT (backend/uploads) —
// resolverRutaSegura exige que el archivo exista de verdad en disco.
const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const PASSWORD_PLANA = 'Test1234!';

function sufijo() {
  return crypto.randomUUID().slice(0, 8);
}

function cuitUnico() {
  // 11 dígitos exactos (chk_empresas_cuit_formato), generados al azar —
  // no hace falta que sea un CUIT "real", solo pasar el CHECK + ser único.
  return Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
}

async function crearAlumno(overrides = {}) {
  const suf = sufijo();
  const usuario = await Usuario.create({
    nombre: 'Alumno', apellido: `Test-${suf}`,
    email: `alumno-${suf}@test.local`,
    password: await bcrypt.hash(PASSWORD_PLANA, 4), // costo bajo: solo velocidad de test, no seguridad real
    rol: 'alumno', activo: true, habilitado: true,
    ...overrides.usuario,
  });
  await Perfil.create({
    usuarioId: usuario.id,
    // Requerido por postulacionService.validarPostulacion antes de postularse.
    cvPath: `/uploads/cv_test_${suf}.pdf`,
    ...overrides.perfil,
  });
  return { usuario, passwordPlana: PASSWORD_PLANA };
}

async function crearAdmin(overrides = {}) {
  const suf = sufijo();
  const usuario = await Usuario.create({
    nombre: 'Admin', apellido: `Test-${suf}`,
    email: `admin-${suf}@test.local`,
    password: await bcrypt.hash(PASSWORD_PLANA, 4),
    rol: 'admin', activo: true, habilitado: true,
    ...overrides,
  });
  return { usuario, passwordPlana: PASSWORD_PLANA };
}

/** Usuario dueño + Empresa aprobada + EmpresaUsuario admin_empresa. */
async function crearEmpresaConAdmin(overrides = {}) {
  const suf = sufijo();
  const usuarioAdmin = await Usuario.create({
    nombre: 'Dueño', apellido: `Empresa-${suf}`,
    email: `empresa-admin-${suf}@test.local`,
    password: await bcrypt.hash(PASSWORD_PLANA, 4),
    rol: 'empresa', activo: true, habilitado: true,
  });
  const empresa = await Empresa.create({
    usuarioId: usuarioAdmin.id,
    razonSocial: `Empresa Test ${suf}`,
    cuit: cuitUnico(),
    estadoAprobacion: 'aprobada',
    ...overrides.empresa,
  });
  const membresia = await EmpresaUsuario.create({
    empresaId: empresa.id, usuarioId: usuarioAdmin.id,
    rolInterno: 'admin_empresa', activo: true,
  });
  return { usuarioAdmin, empresa, membresia, passwordPlana: PASSWORD_PLANA };
}

/** Agrega un reclutador a una empresa ya creada. */
async function agregarReclutador(empresa, overrides = {}) {
  const suf = sufijo();
  const usuarioReclutador = await Usuario.create({
    nombre: 'Reclutador', apellido: `Test-${suf}`,
    email: `reclutador-${suf}@test.local`,
    password: await bcrypt.hash(PASSWORD_PLANA, 4),
    rol: 'empresa', activo: true, habilitado: true,
    ...overrides,
  });
  const membresia = await EmpresaUsuario.create({
    empresaId: empresa.id, usuarioId: usuarioReclutador.id,
    rolInterno: 'reclutador', activo: true,
  });
  return { usuarioReclutador, membresia, passwordPlana: PASSWORD_PLANA };
}

async function crearOferta(empresa, overrides = {}) {
  const suf = sufijo();
  return Oferta.create({
    empresaId: empresa.id,
    titulo: `Pasantía de prueba ${suf}`,
    descripcion: 'Descripción de prueba generada por la suite de tests.',
    estado: 'activa',
    moderada: true,
    cantidadVacantes: 1,
    ...overrides,
  });
}

async function crearSolicitudEmpresaPendiente(overrides = {}) {
  const suf = sufijo();
  return SolicitudEmpresa.create({
    razonSocial: `Solicitante Test ${suf}`,
    cuit: cuitUnico(),
    rubro: 'Software',
    email: `contacto-${suf}@test.local`,
    responsableNombre: 'Responsable',
    responsableApellido: `Test-${suf}`,
    responsableEmail: `responsable-${suf}@test.local`,
    estado: 'pendiente',
    ...overrides,
  });
}

/**
 * Crea un Archivo real (fila + PDF chico en disco) propiedad de `usuario`,
 * para tests de autorización de descarga (backend/src/services/archivo.service.js
 * exige que claveAlmacenamiento exista de verdad en disco antes de servirlo).
 * Devuelve también rutaAbsoluta para que el test pueda borrarlo al terminar.
 */
async function crearArchivoCV(usuario, overrides = {}) {
  const suf = sufijo();
  const nombreArchivo = `cv_test_${suf}.pdf`;
  const rutaAbsoluta = path.join(UPLOADS_ROOT, nombreArchivo);
  fs.writeFileSync(rutaAbsoluta, '%PDF-1.4 contenido de prueba');

  const archivo = await Archivo.create({
    usuarioPropietarioId: usuario.id,
    tipo: 'cv',
    nombreOriginal: 'cv-test.pdf',
    claveAlmacenamiento: nombreArchivo,
    mimeType: 'application/pdf',
    tamanioBytes: fs.statSync(rutaAbsoluta).size,
    backend: 'local',
    ...overrides,
  });
  return { archivo, rutaAbsoluta };
}

/** Login real vía HTTP — el token sale del mismo flujo que usa un usuario real. */
async function loginYObtenerToken(email, passwordPlana = PASSWORD_PLANA) {
  const res = await request(app).post('/api/auth/login').send({ email, password: passwordPlana });
  if (res.status !== 200) {
    throw new Error(`Login de fixture falló (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

module.exports = {
  PASSWORD_PLANA,
  crearAlumno,
  crearAdmin,
  crearEmpresaConAdmin,
  agregarReclutador,
  crearOferta,
  crearSolicitudEmpresaPendiente,
  crearArchivoCV,
  loginYObtenerToken,
};
