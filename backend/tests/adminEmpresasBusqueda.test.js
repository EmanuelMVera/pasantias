'use strict';
const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const {
  crearAdmin,
  crearEmpresaConAdmin,
  agregarReclutador,
  loginYObtenerToken,
} = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

// Búsqueda `q` de GET /api/admin/empresas: razón social, CUIT y responsable.
describe('ADMIN EMPRESAS — búsqueda server-side (q)', () => {
  const idsUsuarios = [];
  // Marca única por corrida: acota la búsqueda a las empresas de este test,
  // aunque la base local tenga otras empresas.
  const marca = `Zeta${crypto.randomUUID().slice(0, 6)}`;
  let token;
  let alfa;
  let beta;
  let gamma;

  beforeAll(async () => {
    const { usuario, passwordPlana } = await crearAdmin();
    idsUsuarios.push(usuario.id);
    token = await loginYObtenerToken(usuario.email, passwordPlana);

    alfa = await crearEmpresaConAdmin({ empresa: { razonSocial: `${marca} Alfa SA`, cuit: '30111222334' } });
    beta = await crearEmpresaConAdmin({ empresa: { razonSocial: `${marca} Beta SRL`, cuit: '30999888771', nivelConfianza: 'confiable' } });
    gamma = await crearEmpresaConAdmin({ empresa: { razonSocial: `${marca} Gamma 100%`, cuit: '30555444335' } });
    for (const e of [alfa, beta, gamma]) idsUsuarios.push(e.usuarioAdmin.id);

    await alfa.usuarioAdmin.update({ nombre: 'Marcela', apellido: `Quiroga${marca}` });
    await beta.usuarioAdmin.update({ nombre: 'Osvaldo', apellido: `Pereyra${marca}` });

    // Un reclutador con nombre distinto NO debe hacer matchear a la empresa:
    // el "responsable" es el admin_empresa, no cualquier miembro del equipo.
    const { usuarioReclutador } = await agregarReclutador(alfa.empresa, { nombre: 'Reclutin', apellido: `Suelto${marca}` });
    idsUsuarios.push(usuarioReclutador.id);
  });

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  const buscar = (params) =>
    request(app).get('/api/admin/empresas').query(params).set('Authorization', `Bearer ${token}`);

  const razones = (res) => res.body.data.map((e) => e.razonSocial).sort();

  test('por razón social: coincidencia parcial e insensible a mayúsculas', async () => {
    const res = await buscar({ q: `${marca.toLowerCase()} alfa` });
    expect(res.status).toBe(200);
    expect(razones(res)).toEqual([`${marca} Alfa SA`]);
  });

  test('por CUIT: acepta el CUIT con guiones y también un fragmento de dígitos', async () => {
    const conGuiones = await buscar({ q: '30-11122233-4' });
    expect(razones(conGuiones)).toEqual([`${marca} Alfa SA`]);

    const fragmento = await buscar({ q: '99988877' });
    expect(razones(fragmento)).toEqual([`${marca} Beta SRL`]);
  });

  test('por responsable: nombre, apellido, nombre completo y email del admin_empresa', async () => {
    const porNombre = await buscar({ q: 'Marcela' });
    expect(razones(porNombre)).toContain(`${marca} Alfa SA`);

    const porApellido = await buscar({ q: `Pereyra${marca}` });
    expect(razones(porApellido)).toEqual([`${marca} Beta SRL`]);

    const porCompleto = await buscar({ q: `Osvaldo Pereyra${marca}` });
    expect(razones(porCompleto)).toEqual([`${marca} Beta SRL`]);

    const porEmail = await buscar({ q: beta.usuarioAdmin.email });
    expect(razones(porEmail)).toEqual([`${marca} Beta SRL`]);
  });

  test('un reclutador (no admin_empresa) no hace matchear a la empresa', async () => {
    const res = await buscar({ q: `Suelto${marca}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  test('un texto con letras no se interpreta como CUIT', async () => {
    // "Beta 9" contiene un dígito, pero al tener letras no debe traer empresas
    // solo porque su CUIT contenga un 9 (el de Beta es 30999888771).
    const res = await buscar({ q: 'Beta 9' });
    expect(res.status).toBe(200);
    expect(razones(res)).not.toContain(`${marca} Beta SRL`);
  });

  test('los comodines de LIKE se buscan literales (100% no matchea todo)', async () => {
    const res = await buscar({ q: '100%' });
    expect(razones(res)).toContain(`${marca} Gamma 100%`);
    expect(razones(res).every((r) => r.includes('100%'))).toBe(true);

    const soloComodin = await buscar({ q: `${marca} %` });
    expect(soloComodin.body.data).toHaveLength(0);
  });

  test('se combina con los filtros de estado y confianza', async () => {
    const soloConfiables = await buscar({ q: marca, nivelConfianza: 'confiable' });
    expect(razones(soloConfiables)).toEqual([`${marca} Beta SRL`]);

    const pendientes = await buscar({ q: marca, estadoAprobacion: 'pendiente' });
    expect(pendientes.body.data).toHaveLength(0);
  });

  test('la búsqueda se aplica antes de paginar: total y páginas reflejan los resultados', async () => {
    const pag1 = await buscar({ q: marca, limit: 2, page: 1 });
    expect(pag1.status).toBe(200);
    expect(pag1.body.data).toHaveLength(2);
    expect(pag1.body.pagination.total).toBe(3);

    const pag2 = await buscar({ q: marca, limit: 2, page: 2 });
    expect(pag2.body.data).toHaveLength(1);

    const vistas = [...pag1.body.data, ...pag2.body.data].map((e) => e.id).sort();
    expect(vistas).toEqual([alfa.empresa.id, beta.empresa.id, gamma.empresa.id].sort());
  });

  test('una empresa con varios miembros no se cuenta dos veces', async () => {
    // alfa tiene admin_empresa + reclutador: el join `equipo` produce 2 filas.
    const res = await buscar({ q: `${marca} Alfa` });
    expect(res.body.pagination.total).toBe(1);
  });

  test('q vacío o solo espacios equivale a no filtrar', async () => {
    const sinQ = await buscar({ limit: 1 });
    const espacios = await buscar({ q: '   ', limit: 1 });
    expect(espacios.status).toBe(200);
    expect(espacios.body.pagination.total).toBe(sinQ.body.pagination.total);
  });
});
