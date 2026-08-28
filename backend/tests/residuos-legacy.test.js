'use strict';

/**
 * residuos-legacy.test.js — DB-02.
 *
 * `'aval'` (feature "Avales Académicos" desmontada) ya no es un tipo de
 * notificación válido: ni el modelo lo acepta ni el CHECK de la tabla.
 */

const { Notificacion, sequelize } = require('../src/models');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('DB-02 — residuos legacy', () => {
  const idsUsuarios = [];

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await cerrarConexion();
  });

  test("Notificacion.create con tipo 'aval' → rechazado por el modelo", async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    await expect(
      Notificacion.create({ usuarioId: usuario.id, titulo: 't', mensaje: 'm', tipo: 'aval' }),
    ).rejects.toThrow(/validation|isin|aval/i);
  });

  test("INSERT directo con tipo 'aval' → viola chk_notificaciones_tipo (23514)", async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    await expect(
      sequelize.query(
        `INSERT INTO "notificaciones" ("usuarioId", titulo, mensaje, tipo, "createdAt", "updatedAt")
         VALUES (:uid, 't', 'm', 'aval', NOW(), NOW())`,
        { replacements: { uid: usuario.id } },
      ),
    ).rejects.toMatchObject({ parent: { code: '23514' } });
  });

  test("tipo 'sistema' sigue funcionando", async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const n = await Notificacion.create({ usuarioId: usuario.id, titulo: 't', mensaje: 'm', tipo: 'sistema' });
    expect(n.tipo).toBe('sistema');
  });
});
