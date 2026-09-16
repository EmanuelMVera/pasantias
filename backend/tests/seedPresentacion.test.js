'use strict';

/**
 * seedPresentacion.test.js — reescritura del seed de demo a 3 cuentas.
 *
 * Cubre: exactamente 3 cuentas (ninguna admin), independencia del admin real
 * (Empresa.aprobadaPorUsuarioId null), sin archivos ficticios (CV/logo),
 * idempotencia, y limpieza segura de una cuenta legacy "sistema@demo.com"
 * sin tocar ningún otro admin real.
 */

const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { Usuario, Empresa, Perfil, Archivo, sequelize } = require('../src/models');
const {
  escenarioExiste,
  ejecutarSeedPresentacion,
  EMP_ADMIN,
  RECLUTA,
  ALUMNO,
} = require('../src/utils/seedPresentacion');
const { crearAdmin, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

const RAZON_SOCIAL = 'Delta Innovación IT';

describe('seedPresentacion — escenario de 3 cuentas', () => {
  const idsUsuariosAjenos = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuariosAjenos);
    await cerrarConexion();
  });

  test('sembrar crea exactamente 3 usuarios (empresa/reclutador/alumno), ninguno admin', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const demoUsers = await Usuario.findAll({
      where: { email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email, 'sistema@demo.com'] },
      attributes: ['email', 'rol'],
      paranoid: false,
    });
    const porEmail = Object.fromEntries(demoUsers.map((u) => [u.email, u.rol]));

    expect(porEmail[EMP_ADMIN.email]).toBe('empresa');
    expect(porEmail[RECLUTA.email]).toBe('empresa');
    expect(porEmail[ALUMNO.email]).toBe('alumno');
    expect(porEmail['sistema@demo.com']).toBeUndefined();

    const totalAdminsDemo = await Usuario.count({ where: { rol: 'admin', email: [EMP_ADMIN.email, RECLUTA.email, ALUMNO.email] } });
    expect(totalAdminsDemo).toBe(0);
  });

  test('Empresa.aprobadaPorUsuarioId es null — independiente del admin real', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    const empresa = await Empresa.findOne({ where: { razonSocial: RAZON_SOCIAL } });
    expect(empresa.aprobadaPorUsuarioId).toBeNull();
    expect(empresa.logo).toMatch(/^https:\/\//); // URL externa, no un path local
  });

  test('sin archivos ficticios: Perfil del alumno sin CV, ninguna fila Archivo de tipo cv/logo_empresa', async () => {
    await ejecutarSeedPresentacion({ verbose: false });

    const alumno = await Usuario.findOne({ where: { email: ALUMNO.email } });
    const perfil = await Perfil.findOne({ where: { usuarioId: alumno.id } });
    expect(perfil.cvPath).toBeNull();
    expect(perfil.cvArchivoId).toBeNull();

    // Ninguna fila Archivo (CV ni logo) para el alumno/empresa demo.
    const empAdmin = await Usuario.findOne({ where: { email: EMP_ADMIN.email } });
    const archivosDemo = await Archivo.count({
      where: { usuarioPropietarioId: [alumno.id, empAdmin.id], tipo: ['cv', 'logo_empresa'] },
    });
    expect(archivosDemo).toBe(0);
  });

  test('idempotente: correr el seed dos veces seguidas deja el mismo estado (3 cuentas, sin admin)', async () => {
    await ejecutarSeedPresentacion({ verbose: false });
    await ejecutarSeedPresentacion({ verbose: false });

    expect(await escenarioExiste()).toBe(true);
    expect(await Usuario.findOne({ where: { email: 'sistema@demo.com' } })).toBeNull();
    expect(await Usuario.count({ where: { rol: 'admin', email: { [Op.like]: '%@demo.com' } } })).toBe(0);

    // Un solo registro de cada cuenta — la segunda corrida no duplicó nada.
    expect(await Usuario.count({ where: { email: EMP_ADMIN.email } })).toBe(1);
    expect(await Empresa.count({ where: { razonSocial: RAZON_SOCIAL } })).toBe(1);
  });

  test('limpia una cuenta legacy "sistema@demo.com" (rol admin) sin tocar otro admin real', async () => {
    // Simula el residuo de una versión anterior del seed.
    const hash = await bcrypt.hash('Demo1234!', 4);
    const legacy = await Usuario.create({
      nombre: 'Sofía', apellido: 'Administradora', email: 'sistema@demo.com',
      password: hash, rol: 'admin', activo: true, habilitado: true,
    });

    // Admin real, ajeno al seed — no debe ser tocado.
    const { usuario: adminReal, passwordPlana } = await crearAdmin();
    idsUsuariosAjenos.push(adminReal.id);

    await ejecutarSeedPresentacion({ verbose: false });

    expect(await Usuario.findOne({ where: { id: legacy.id }, paranoid: false })).toBeNull();

    // El admin real sigue intacto y puede loguear normalmente.
    const sigueExistiendo = await Usuario.findByPk(adminReal.id);
    expect(sigueExistiendo).not.toBeNull();
    const token = await loginYObtenerToken(adminReal.email, passwordPlana);
    expect(typeof token).toBe('string');
  });
});
