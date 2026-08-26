'use strict';
const request = require('supertest');
const app = require('../src/app');
const { crearAdmin, crearSolicitudEmpresaPendiente, loginYObtenerToken } = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');
const { Usuario, Empresa, EmpresaUsuario } = require('../src/models');

describe('SOLICITUD EMPRESA', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await limpiarSolicitudesEmpresa(idsSolicitudes);
    await cerrarConexion();
  });

  test('10. aprobar solicitud crea de forma consistente empresa + usuario + EmpresaUsuario admin_empresa', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const solicitud = await crearSolicitudEmpresaPendiente();
    idsSolicitudes.push(solicitud.id);

    const tokenAdmin = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app)
      .patch(`/api/admin/solicitudes-empresa/${solicitud.id}/aprobar`)
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { empresaId, usuarioId } = res.body.data;
    idsUsuarios.push(usuarioId);

    const usuarioCreado = await Usuario.findByPk(usuarioId);
    expect(usuarioCreado.rol).toBe('empresa');

    const empresaCreada = await Empresa.findByPk(empresaId);
    expect(empresaCreada.estadoAprobacion).toBe('aprobada');
    expect(empresaCreada.usuarioId).toBe(usuarioId);

    const membresia = await EmpresaUsuario.findOne({ where: { empresaId, usuarioId } });
    expect(membresia.rolInterno).toBe('admin_empresa');
    expect(membresia.activo).toBe(true);
  });
});
