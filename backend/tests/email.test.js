'use strict';

/**
 * email.test.js — DEPLOY-01 / sección 9.
 *
 * Config de Nodemailer (EMAIL_FROM / EMAIL_SECURE) y no-filtrado del token de
 * recuperación en producción. `nodemailer` está mockeado.
 */

// Antes de requerir src/* (tests/setup/env.js vacía EMAIL_USER/PASS; acá los
// volvemos a poner para este archivo).
process.env.EMAIL_USER = 'smtp-login';
process.env.EMAIL_PASS = 'smtp-pass';
process.env.EMAIL_FROM = '"SisPasantías" <noreply@sispasantias.edu>';
process.env.EMAIL_SECURE = 'true';
process.env.EMAIL_PORT = '465';

const mockSendMail = jest.fn().mockResolvedValue({});
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
jest.mock('nodemailer', () => ({ createTransport: (...a) => mockCreateTransport(...a) }));

const request = require('supertest');
const app = require('../src/app');
const { enviarEmail } = require('../src/utils/mailer');
const { crearAlumno } = require('./helpers/factories');
const { limpiarUsuarios, cerrarConexion } = require('./helpers/cleanup');

describe('email — configuración endurecida', () => {
  const ids = [];

  afterAll(async () => {
    await limpiarUsuarios(ids);
    await cerrarConexion();
    for (const k of ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM', 'EMAIL_SECURE', 'EMAIL_PORT']) delete process.env[k];
  });

  test('usa EMAIL_FROM y EMAIL_SECURE/EMAIL_PORT en el transporter', async () => {
    await enviarEmail({ to: 'dest@example.com', subject: 'hola', html: '<p>x</p>' });

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: true,
      port: 465,
    }));
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"SisPasantías" <noreply@sispasantias.edu>',
      to: 'dest@example.com',
    }));
  });

  test('forgot-password en producción NO devuelve el token (con email configurado)', async () => {
    const { usuario } = await crearAlumno();
    ids.push(usuario.id);

    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: usuario.email });
      expect([200, 429]).toContain(res.status);
      expect(res.body.devToken).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/[a-f0-9]{64}/); // ningún token hex de 32 bytes
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
