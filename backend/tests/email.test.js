'use strict';

/**
 * email.test.js — mailer y flujos que envían correo. `nodemailer` está
 * mockeado: NUNCA se conecta a Gmail desde los tests (el verify real se corre
 * a mano con `npm run email:verify`).
 *
 * Cubre: contrato de enviarEmail ({ ok, messageId } / { ok: false, errorCode }),
 * config ausente, fallo de sendMail, verify al arrancar (falla solo con
 * credenciales inválidas + EMAIL_REQUIRED), recuperación sin enumeración,
 * confirmación de solicitud de empresa, aprobación con email observable y
 * logs sin secretos.
 */

// Antes de requerir src/* (tests/setup/env.js deshabilita el email; acá se
// elige el proveedor SMTP con credenciales falsas para este archivo).
process.env.EMAIL_PROVIDER = 'smtp';
process.env.EMAIL_USER = 'smtp-login@sispasantias.edu';
process.env.EMAIL_PASS = 'smtp-pass-super-secreta';
process.env.EMAIL_FROM = '"SisPasantías" <noreply@sispasantias.edu>';
process.env.EMAIL_SECURE = 'true';
process.env.EMAIL_PORT = '465';

const SECRETO = 'smtp-pass-super-secreta';

const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail, verify: mockVerify }));
jest.mock('nodemailer', () => ({ createTransport: (...a) => mockCreateTransport(...a) }));

const request = require('supertest');
const app = require('../src/app');
const logger = require('../src/utils/logger');
const mailer = require('../src/utils/mailer');
const { Usuario } = require('../src/models');
const {
  crearAlumno, crearAdmin, crearSolicitudEmpresaPendiente, loginYObtenerToken, cuitValido,
} = require('./helpers/factories');
const { limpiarUsuarios, limpiarSolicitudesEmpresa, cerrarConexion } = require('./helpers/cleanup');

const errorSmtp = (code, extra = {}) => Object.assign(new Error(`${code} simulado`), { code, ...extra });
const esperar = () => new Promise((r) => setImmediate(r));

/** Todo lo que se logueó, serializado, para buscar secretos. */
const logsComoTexto = (...spies) => JSON.stringify(spies.flatMap((s) => s.mock.calls));

describe('email — mailer y flujos', () => {
  const idsUsuarios = [];
  const idsSolicitudes = [];
  let spyInfo;
  let spyError;

  beforeEach(() => {
    mockSendMail.mockReset().mockResolvedValue({ messageId: '<id-123@test>' });
    mockVerify.mockReset().mockResolvedValue(true);
    spyInfo = jest.spyOn(logger, 'info');
    spyError = jest.spyOn(logger, 'error');
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await limpiarUsuarios(idsUsuarios);
    await limpiarSolicitudesEmpresa(idsSolicitudes);
    await cerrarConexion();
    for (const k of ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM', 'EMAIL_SECURE', 'EMAIL_PORT']) delete process.env[k];
  });

  // ── Contrato de enviarEmail ─────────────────────────────────────────────

  test('usa EMAIL_FROM y EMAIL_SECURE/EMAIL_PORT, con timeouts acotados', async () => {
    await mailer.enviarEmail({ to: 'dest@example.com', subject: 'hola', html: '<p>x</p>' });

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      secure: true,
      port: 465,
      connectionTimeout: expect.any(Number),
      socketTimeout: expect.any(Number),
    }));
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"SisPasantías" <noreply@sispasantias.edu>',
      to: 'dest@example.com',
    }));
  });

  test('envío exitoso → { ok: true, messageId } y log email_enviado sin cuerpo ni destinatario completo', async () => {
    const r = await mailer.enviarEmail({ to: 'juana.perez@example.com', subject: 's', html: '<p>link-con-token-xyz</p>', tipo: 'prueba' });
    expect(r).toEqual({ ok: true, messageId: '<id-123@test>' });
    const logs = logsComoTexto(spyInfo, spyError);
    expect(logs).toContain('email_enviado');
    expect(logs).toContain('ju***@example.com');
    expect(logs).not.toContain('juana.perez@example.com');
    expect(logs).not.toContain('link-con-token-xyz');
    expect(logs).not.toContain(SECRETO);
  });

  test('sendMail falla → { ok: false, errorCode, categoria } (no lanza) y log de error sin secretos', async () => {
    mockSendMail.mockRejectedValue(errorSmtp('EAUTH', {
      responseCode: 535, command: 'AUTH PLAIN', response: '535-5.7.8 Username and Password not accepted.',
    }));
    const r = await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: '<p>x</p>' });
    expect(r).toEqual({ ok: false, errorCode: 'EAUTH', categoria: 'auth' });
    const logs = logsComoTexto(spyError);
    expect(logs).toContain('email_envio_fallo');
    expect(logs).toContain('535-5.7.8 Username and Password not accepted.');
    expect(logs).not.toContain(SECRETO);
  });

  test('un timeout de red se clasifica como "red"', async () => {
    mockSendMail.mockRejectedValue(errorSmtp('ETIMEDOUT', { command: 'CONN' }));
    const r = await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' });
    expect(r).toMatchObject({ ok: false, errorCode: 'ETIMEDOUT', categoria: 'red' });
  });

  test('sin EMAIL_USER/EMAIL_PASS → { ok: false, errorCode: EMAIL_NO_CONFIGURADO } y no intenta conectar', async () => {
    const prev = { u: process.env.EMAIL_USER, p: process.env.EMAIL_PASS };
    let mailerSinConfig;
    jest.isolateModules(() => {
      process.env.EMAIL_USER = '';
      process.env.EMAIL_PASS = '';
      mailerSinConfig = require('../src/utils/mailer');
    });
    process.env.EMAIL_USER = prev.u;
    process.env.EMAIL_PASS = prev.p;

    const r = await mailerSinConfig.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' });
    expect(r).toMatchObject({ ok: false, errorCode: 'EMAIL_NO_CONFIGURADO' });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await mailerSinConfig.verificarEmail()).toMatchObject({ ok: false, categoria: 'config' });
  });

  test('advertencias de config: EMAIL_FROM incoherente y App Password con formato raro, sin exponer la contraseña', () => {
    const { advertenciasEmail } = require('../src/config/env');
    const avisos = advertenciasEmail({
      host: 'smtp.gmail.com', port: 587, secure: false,
      user: 'cuenta@gmail.com', pass: 'contraseña normal', from: '"SisPasantías" <otra@dominio.com>',
    });
    const texto = avisos.join(' | ');
    expect(texto).toMatch(/EMAIL_FROM \(otra@dominio.com\) no coincide con EMAIL_USER \(cu\*\*\*@gmail.com\)/);
    expect(texto).toMatch(/App Password/);
    expect(texto).not.toContain('contraseña normal');
    expect(advertenciasEmail({ host: 'smtp.gmail.com', port: 465, secure: false, user: 'a@b.com', pass: 'abcdabcdabcdabcd', from: '' }))
      .toEqual(['EMAIL_PORT=465 usa TLS implícito: requiere EMAIL_SECURE=true.']);
  });

  test('escapeHtml neutraliza HTML que escribe un usuario', () => {
    expect(mailer.escapeHtml('<img src=x onerror="a()">')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt;');
  });

  // ── verify al arrancar ──────────────────────────────────────────────────

  test('verificarEmail (smtp) OK → { ok: true }, sin enviar ningún email', async () => {
    expect(await mailer.verificarEmail()).toEqual({ ok: true });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('verify al arrancar: credenciales inválidas + EMAIL_REQUIRED=true → falla el arranque con mensaje claro (sin secretos)', async () => {
    mockVerify.mockRejectedValue(errorSmtp('EAUTH', { responseCode: 535, response: '535-5.7.8 Username and Password not accepted.' }));
    let mailerRequerido;
    jest.isolateModules(() => {
      process.env.EMAIL_REQUIRED = 'true';
      mailerRequerido = require('../src/utils/mailer');
    });
    delete process.env.EMAIL_REQUIRED;
    const log = { info: jest.fn(), error: jest.fn() };

    await expect(mailerRequerido.verificarEmailAlArrancar(log)).rejects.toThrow(/proveedor de email \(smtp\) no es utilizable: EAUTH/);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ critico: true }), 'email_provider_verificacion_fallo');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(SECRETO);
  });

  test('verify al arrancar: fallo de red → log crítico pero el servidor sigue', async () => {
    mockVerify.mockRejectedValue(errorSmtp('ETIMEDOUT'));
    let mailerRequerido;
    jest.isolateModules(() => {
      process.env.EMAIL_REQUIRED = 'true';
      mailerRequerido = require('../src/utils/mailer');
    });
    delete process.env.EMAIL_REQUIRED;
    const log = { info: jest.fn(), error: jest.fn() };

    await expect(mailerRequerido.verificarEmailAlArrancar(log)).resolves.toMatchObject({ ok: false });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ categoria: 'red' }) }),
      'email_provider_verificacion_fallo',
    );
  });

  test('verify OK al arrancar → log email_provider_verificado con usuario redactado', async () => {
    const log = { info: jest.fn(), error: jest.fn() };
    await expect(mailer.verificarEmailAlArrancar(log)).resolves.toEqual({ ok: true });
    const [contexto, msg] = log.info.mock.calls[0];
    expect(msg).toBe('email_provider_verificado');
    expect(contexto.provider).toBe('smtp');
    expect(contexto.email).toMatchObject({ host: expect.any(String), port: 465, secure: true, user: 'sm***@sispasantias.edu' });
    expect(JSON.stringify(contexto)).not.toContain(SECRETO);
  });

  // ── Recuperación de contraseña ──────────────────────────────────────────

  test('forgot-password: misma respuesta para email registrado e inexistente; solo envía al registrado', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const existente = await request(app).post('/api/auth/forgot-password').send({ email: usuario.email });
    const inexistente = await request(app).post('/api/auth/forgot-password').send({ email: `nadie-${Date.now()}@example.com` });

    expect(existente.status).toBe(200);
    expect(inexistente.status).toBe(200);
    expect(existente.body.message).toBe(inexistente.body.message);
    expect(existente.body.devToken).toBeUndefined();
    await esperar();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(usuario.email);
  });

  test('forgot-password normaliza el email (mayúsculas y espacios encuentran la cuenta)', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: `  ${usuario.email.toUpperCase()} ` });
    expect(res.status).toBe(200);
    await esperar();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect((await Usuario.findByPk(usuario.id)).tokenReset).toBeTruthy();
  });

  test('forgot-password con SMTP caído: respuesta genérica igual, ERROR en el log, sin token ni link', async () => {
    mockSendMail.mockRejectedValue(errorSmtp('ECONNECTION'));
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

    const res = await request(app).post('/api/auth/forgot-password').send({ email: usuario.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Si el email está registrado/);
    await esperar();
    await esperar();

    const logs = logsComoTexto(spyError);
    expect(logs).toContain('recupero_password_email_fallo');
    expect(logs).toContain('ECONNECTION');
    expect(logs).not.toMatch(/[a-f0-9]{64}/); // ningún token
    expect(logs).not.toContain('/reset-password/');
    expect(logs).not.toContain(SECRETO);
  });

  test('forgot-password en producción NO devuelve el token (con email configurado)', async () => {
    const { usuario } = await crearAlumno();
    idsUsuarios.push(usuario.id);

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

  // ── Solicitud de empresa y aprobación ───────────────────────────────────

  test('crear una solicitud de empresa envía la confirmación de recepción (sin credenciales)', async () => {
    const suf = `${Date.now()}`;
    const res = await request(app).post('/api/solicitudes-empresa').send({
      razonSocial: `Confirmación ${suf} SA`,
      cuit: cuitValido(),
      rubro: 'Software',
      email: `contacto-${suf}@test.local`,
      responsableNombre: 'Ana',
      responsableApellido: 'Prueba',
      responsableEmail: `resp-${suf}@test.local`,
    });
    expect(res.status).toBe(201);
    idsSolicitudes.push(res.body.data.id);
    await esperar();

    const envio = mockSendMail.mock.calls.find(([o]) => o.subject === 'Recibimos tu solicitud – SisPasantías');
    expect(envio).toBeDefined();
    expect(envio[0].to).toEqual([`resp-${suf}@test.local`, `contacto-${suf}@test.local`]);
    expect(envio[0].html).toContain('pendiente de revisión');
    expect(envio[0].html).not.toMatch(/contraseña/i);
  });

  test('aprobar una solicitud envía las credenciales y lo informa (emailCredencialesEnviado=true)', async () => {
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const solicitud = await crearSolicitudEmpresaPendiente();
    idsSolicitudes.push(solicitud.id);
    const token = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app).patch(`/api/admin/solicitudes-empresa/${solicitud.id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    idsUsuarios.push(res.body.data.usuarioId);
    expect(res.body.data.emailCredencialesEnviado).toBe(true);
    expect(res.body.message).toMatch(/Credenciales enviadas a/);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: solicitud.responsableEmail, subject: 'Tu solicitud fue aprobada – SisPasantías',
    }));
  });

  test('aprobar con SMTP caído: la empresa queda aprobada, la respuesta lo dice y queda un ERROR sin la contraseña', async () => {
    mockSendMail.mockRejectedValue(errorSmtp('ETIMEDOUT'));
    const { usuario: admin, passwordPlana } = await crearAdmin();
    idsUsuarios.push(admin.id);
    const solicitud = await crearSolicitudEmpresaPendiente();
    idsSolicitudes.push(solicitud.id);
    const token = await loginYObtenerToken(admin.email, passwordPlana);

    const res = await request(app).patch(`/api/admin/solicitudes-empresa/${solicitud.id}/aprobar`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    idsUsuarios.push(res.body.data.usuarioId);
    expect(res.body.data.emailCredencialesEnviado).toBe(false);
    expect(res.body.message).toMatch(/No se pudo enviar el email con las credenciales/);
    expect(res.body.message).toMatch(/Olvidé mi contraseña/);

    const logs = logsComoTexto(spyError);
    expect(logs).toContain('aprobacion_empresa_credenciales_no_enviadas');
    if (res.body.data.passwordGenerada) expect(logs).not.toContain(res.body.data.passwordGenerada);
  });
});
