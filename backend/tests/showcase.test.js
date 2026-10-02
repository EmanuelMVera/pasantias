'use strict';

/**
 * showcase.test.js — reset y diagnóstico del showcase (presentación +
 * institucional).
 *
 * - showcaseReset: idempotente (dos corridas seguidas dejan la misma estructura
 *   y los mismos conteos), no toca usuarios reales fuera de los namespaces
 *   ficticios, y limpia los residuos conocidos del antiguo seedDemo sin
 *   llevarse a un alumno real del dominio institucional.
 * - showcaseStatus: solo lectura, sin secretos, y detecta las incoherencias
 *   clave (admin_empresa como responsable, chat admin_empresa↔alumno,
 *   "nueva postulación" al admin_empresa, etc.).
 */

const { execFileSync } = require('child_process');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  Usuario, Empresa, EmpresaUsuario, Oferta, Postulacion, Mensaje, Notificacion,
  ActivityLog, PostulacionHistorialEstado, sequelize,
} = require('../src/models');
const { ejecutarShowcaseReset } = require('../src/utils/showcaseReset');
const { diagnosticarShowcase, formatearInforme } = require('../src/utils/showcaseStatus');
const { limpiarEscenarioPresentacion, EMP_ADMIN, ALUMNO, RAZON_SOCIAL } = require('../src/utils/seedPresentacion');
const { limpiarSoloInstitucional, DOMINIO } = require('../src/utils/seedInstitucional');
const { LEGACY_EMAILS_EMPRESA, LEGACY_ALUMNOS, LEGACY_RAZONES_SOCIALES } = require('../src/utils/seedLegacy');
const { crearAdmin, crearAlumno, crearEmpresaConAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const BACKEND_DIR = path.join(__dirname, '..');

jest.setTimeout(180000); // cada reset siembra los dos datasets completos

const TABLAS = {
  usuarios: Usuario, empresas: Empresa, empresaUsuarios: EmpresaUsuario, ofertas: Oferta,
  postulaciones: Postulacion, historial: PostulacionHistorialEstado, mensajes: Mensaje,
  notificaciones: Notificacion, activityLogs: ActivityLog,
};
async function conteosGlobales() {
  const out = {};
  for (const [nombre, modelo] of Object.entries(TABLAS)) out[nombre] = await modelo.count({ paranoid: false });
  return out;
}

const textoDe = (r, patron) => [...r.presentacion.checks, ...r.institucional.checks].find((c) => patron.test(c.texto));

describe('showcase — reset y status', () => {
  const idsAjenos = [];

  afterAll(async () => {
    await limpiarEscenarioPresentacion();
    await limpiarSoloInstitucional();
    await limpiarUsuarios(idsAjenos);
    await cerrarConexion();
  });

  test('reset: deja el showcase coherente con la estructura esperada', async () => {
    const r = await ejecutarShowcaseReset({ verbose: false });

    expect(r.status.coherente).toBe(true);
    expect(r.status.errores).toBe(0);

    const p = r.status.presentacion.datos;
    expect(p).toMatchObject({
      adminsEmpresa: 1,
      reclutadoresActivos: 2,
      solicitudesPendientes: 1,
      logins: 3,
      candidatos: 10,
      nivelConfianza: 'estandar',
      ofertas: 7,
      ofertasConResponsable: 6,
      ofertasSinResponsable: 1,
      ofertasConAdminEmpresa: 0,
      postulaciones: 16,
      chatAdminCandidatos: 0,
      notifNuevaPostulacionAdminEmpresa: 0,
      adminsIndebidos: 0,
    });
    expect(p.chatEquipo).toBeGreaterThan(0);
    expect(p.chatReclutadorAlumno).toBeGreaterThan(0);
    expect(p.notifNuevaPostulacionReclutadores).toBeGreaterThan(0);

    const i = r.status.institucional.datos;
    expect(i).toMatchObject({ empresas: 20, estandar: 15, confiables: 5, adminsIndebidos: 0 });
    expect(i.ofertasAutoAprobadas).toBeGreaterThan(0);
    expect(i.postulaciones).toBeGreaterThan(100);
  });

  test('reset: idempotente — dos corridas seguidas dejan los mismos conteos en toda la base', async () => {
    const r1 = await ejecutarShowcaseReset({ verbose: false });
    const antes = await conteosGlobales();

    const r2 = await ejecutarShowcaseReset({ verbose: false });
    const despues = await conteosGlobales();

    expect(despues).toEqual(antes);
    expect(r2.status.presentacion.datos).toEqual(r1.status.presentacion.datos);
    expect(r2.status.institucional.datos).toEqual(r1.status.institucional.datos);
    expect(r2.legacy).toEqual({ usuarios: 0, empresas: 0 });
  });

  test('reset: no toca un admin real, un alumno real ni una empresa real ajenos a los namespaces demo', async () => {
    const { usuario: adminReal, passwordPlana } = await crearAdmin();
    const { usuario: alumnoReal } = await crearAlumno();
    const real = await crearEmpresaConAdmin();
    idsAjenos.push(adminReal.id, alumnoReal.id, real.usuarioAdmin.id);

    await ejecutarShowcaseReset({ verbose: false });

    expect(await Usuario.findByPk(adminReal.id)).not.toBeNull();
    expect(await Usuario.findByPk(alumnoReal.id)).not.toBeNull();
    expect(await Usuario.findByPk(real.usuarioAdmin.id)).not.toBeNull();
    expect(await Empresa.findByPk(real.empresa.id)).not.toBeNull();
    expect(typeof (await loginYObtenerToken(adminReal.email, passwordPlana))).toBe('string');
  });

  test('reset: limpia los residuos del viejo seedDemo, pero no a un alumno real con el mismo email ni a una empresa real homónima', async () => {
    const hash = await bcrypt.hash('x-legacy-test', 4);
    const base = { password: hash, activo: true, habilitado: true };

    // Residuo legítimo: empresa legacy con su responsable, y un alumno legacy.
    const legacyOwner = await Usuario.create({ ...base, rol: 'empresa', nombre: 'Martín', apellido: 'Ferreyra', email: LEGACY_EMAILS_EMPRESA[0] });
    const legacyEmpresa = await Empresa.create({ razonSocial: LEGACY_RAZONES_SOCIALES[0], estadoAprobacion: 'aprobada' });
    await EmpresaUsuario.create({ empresaId: legacyEmpresa.id, usuarioId: legacyOwner.id, rolInterno: 'admin_empresa', activo: true });
    const legacyOferta = await Oferta.create({ empresaId: legacyEmpresa.id, titulo: 'Oferta legacy', descripcion: 'x', estado: 'activa', estadoModeracion: 'aprobada' });
    const [emailLegacy, nombreLegacy, apellidoLegacy] = LEGACY_ALUMNOS[0];
    const legacyAlumno = await Usuario.create({ ...base, rol: 'alumno', nombre: nombreLegacy, apellido: apellidoLegacy, email: emailLegacy });
    await Postulacion.create({ usuarioId: legacyAlumno.id, ofertaId: legacyOferta.id, estado: 'en_revision' });

    // NO son residuo: mismo patrón de email del dominio real pero otra persona,
    // y una empresa real que casualmente comparte razón social con la lista.
    const [emailReal] = LEGACY_ALUMNOS[1];
    const alumnoReal = await Usuario.create({ ...base, rol: 'alumno', nombre: 'Persona', apellido: 'Real', email: emailReal });
    const realOwner = await Usuario.create({ ...base, rol: 'empresa', nombre: 'Dueña', apellido: 'Real', email: `duena-real-${Date.now()}@test.local` });
    const empresaHomonima = await Empresa.create({ razonSocial: LEGACY_RAZONES_SOCIALES[1], estadoAprobacion: 'aprobada' });
    await EmpresaUsuario.create({ empresaId: empresaHomonima.id, usuarioId: realOwner.id, rolInterno: 'admin_empresa', activo: true });
    idsAjenos.push(alumnoReal.id, realOwner.id);

    const r = await ejecutarShowcaseReset({ verbose: false });

    expect(r.legacy).toEqual({ usuarios: 2, empresas: 1 });
    expect(await Usuario.findByPk(legacyOwner.id, { paranoid: false })).toBeNull();
    expect(await Usuario.findByPk(legacyAlumno.id, { paranoid: false })).toBeNull();
    expect(await Empresa.findByPk(legacyEmpresa.id, { paranoid: false })).toBeNull();
    expect(await Oferta.findByPk(legacyOferta.id, { paranoid: false })).toBeNull();

    expect(await Usuario.findByPk(alumnoReal.id)).not.toBeNull();
    expect(await Usuario.findByPk(realOwner.id)).not.toBeNull();
    expect(await Empresa.findByPk(empresaHomonima.id)).not.toBeNull();
  });

  test('status: es de solo lectura (no cambia ningún conteo ni ningún updatedAt)', async () => {
    await ejecutarShowcaseReset({ verbose: false });
    const antes = await conteosGlobales();
    const [[marcaAntes]] = await sequelize.query('SELECT MAX("updatedAt") AS m FROM usuarios');

    const r = await diagnosticarShowcase();
    expect(r.coherente).toBe(true);

    expect(await conteosGlobales()).toEqual(antes);
    const [[marcaDespues]] = await sequelize.query('SELECT MAX("updatedAt") AS m FROM usuarios');
    expect(marcaDespues.m).toEqual(marcaAntes.m);
  });

  test('status CLI: imprime el informe sin secretos y sale con 0 si es coherente', async () => {
    await ejecutarShowcaseReset({ verbose: false });
    const salida = execFileSync('node', ['src/utils/showcaseStatus.js'], {
      cwd: BACKEND_DIR, env: { ...process.env }, stdio: 'pipe',
    }).toString();

    expect(salida).toMatch(/SHOWCASE SISPASANTÍAS/);
    expect(salida).toMatch(/PRESENTACIÓN/);
    expect(salida).toMatch(/INSTITUCIONAL/);
    expect(salida).toMatch(/✓ Reclutadores activos: 2/);
    expect(salida).toMatch(/✓ Ofertas sin responsable intencional: 1/);
    expect(salida).toMatch(/SHOWCASE COHERENTE/);
    expect(salida).not.toContain('Demo1234!');
    expect(salida).not.toMatch(/\$2[aby]\$/); // ningún hash bcrypt
    expect(salida).not.toMatch(/postgres(ql)?:\/\//i); // ninguna URL de base
    expect(salida).not.toMatch(/password|secret|token/i);
  });

  test('status: detecta las incoherencias clave de la presentación', async () => {
    await ejecutarShowcaseReset({ verbose: false });
    const admin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    const oferta = await Oferta.findOne({ where: { empresaId: empresa.id, creadaPorUsuarioId: { [Op.ne]: null } } });
    const postulacion = await Postulacion.findOne({ where: { ofertaId: oferta.id } });

    // Se rompen a mano cuatro reglas (todo dentro del namespace demo).
    await oferta.update({ creadaPorUsuarioId: admin.id });
    await Mensaje.create({ emisorId: admin.id, receptorId: alumno.id, mensaje: 'no debería existir', leido: true });
    await Notificacion.create({ usuarioId: admin.id, tipo: 'postulacion', titulo: 'Nueva postulación recibida', mensaje: 'ruido' });
    await postulacion.update({ estado: postulacion.estado === 'contratado' ? 'rechazado' : 'contratado' });

    const r = await diagnosticarShowcase();
    expect(r.coherente).toBe(false);
    expect(r.errores).toBeGreaterThanOrEqual(4);
    expect(textoDe(r, /admin_empresa como responsable: 1/).nivel).toBe('error');
    expect(textoDe(r, /Chat admin_empresa ↔ alumno\/candidatos: 1/).nivel).toBe('error');
    expect(textoDe(r, /"nueva postulación" al admin_empresa: 1/).nivel).toBe('error');
    expect(textoDe(r, /historial no termina en su estado actual: 1/).nivel).toBe('error');
    expect(formatearInforme(r)).toMatch(/SHOWCASE INCOHERENTE/);

    // El reset lo deja coherente otra vez.
    expect((await ejecutarShowcaseReset({ verbose: false })).status.coherente).toBe(true);
  });

  test('status: detecta las incoherencias clave del dataset institucional', async () => {
    await ejecutarShowcaseReset({ verbose: false });
    const estandar = await Empresa.findOne({ where: { cuit: { [Op.like]: '307000000%' }, nivelConfianza: 'estandar' } });
    const oferta = await Oferta.findOne({ where: { empresaId: estandar.id } });
    const adminEmpresa = await EmpresaUsuario.findOne({ where: { empresaId: estandar.id, rolInterno: 'admin_empresa' } });

    await oferta.update({ estadoModeracion: 'auto_aprobada', creadaPorUsuarioId: adminEmpresa.usuarioId });
    const intruso = await Usuario.create({
      nombre: 'Admin', apellido: 'Indebido', email: `admin.indebido@${DOMINIO}`,
      password: await bcrypt.hash('x-indebido', 4), rol: 'admin', activo: true, habilitado: true,
    });

    const r = await diagnosticarShowcase();
    expect(r.coherente).toBe(false);
    expect(textoDe(r, /publicación automática en empresas estándar: 1/).nivel).toBe('error');
    expect(r.institucional.checks.find((c) => /admin_empresa como responsable: 1/.test(c.texto)).nivel).toBe('error');
    expect(textoDe(r, /rol admin en el dataset: 1/).nivel).toBe('error');

    await Usuario.destroy({ where: { id: intruso.id }, force: true });
    expect((await ejecutarShowcaseReset({ verbose: false })).status.coherente).toBe(true);
  });

  test('status: sin datos cargados informa "NO está cargado" y no es coherente', async () => {
    await limpiarEscenarioPresentacion();
    await limpiarSoloInstitucional();

    const r = await diagnosticarShowcase();
    expect(r.presentacion.cargado).toBe(false);
    expect(r.institucional.cargado).toBe(false);
    expect(r.coherente).toBe(false);
    expect(formatearInforme(r)).toMatch(/NO está cargado/);
  });
});
