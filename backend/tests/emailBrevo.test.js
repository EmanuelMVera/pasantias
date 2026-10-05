'use strict';

/**
 * emailBrevo.test.js — proveedor Brevo (API HTTPS). `fetch` está mockeado:
 * NUNCA se llama a la API real. No toca la base de datos.
 *
 * Cubre: sin API key, 401, envío OK, 400, 429, 500, timeout, uno y varios
 * destinatarios, verify por GET /v3/account, fallo de arranque con
 * EMAIL_REQUIRED + auth inválida, fallo temporal que no impide arrancar, y
 * que la API key nunca aparece en logs ni resultados.
 */

const API_KEY = 'xkeysib-clave-super-secreta-de-prueba';

/** Carga una instancia limpia del mailer con el entorno dado. */
function cargarMailer(env) {
  const prev = {};
  for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
  let mailer;
  let logger;
  jest.isolateModules(() => {
    mailer = require('../src/utils/mailer');
    logger = require('../src/utils/logger');
  });
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return { mailer, logger };
}

const ENV_BREVO = {
  EMAIL_PROVIDER: 'brevo',
  BREVO_API_KEY: API_KEY,
  BREVO_SENDER_EMAIL: 'sender@sispasantias.test',
  BREVO_SENDER_NAME: 'SisPasantías',
};

/** Respuesta de fetch simulada. */
const respuesta = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('email — proveedor Brevo (fetch mockeado)', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('envío OK: POST /v3/smtp/email con api-key, sender, destinatario único y el HTML del código', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { messageId: '<brevo-1@smtp-relay>' }));
    const { mailer, logger } = cargarMailer(ENV_BREVO);
    const spyInfo = jest.spyOn(logger, 'info');

    const r = await mailer.enviarEmail({ to: 'ana.perez@example.com', subject: 'Hola', html: '<p>cuerpo</p>', tipo: 'prueba' });

    expect(r).toEqual({ ok: true, messageId: '<brevo-1@smtp-relay>' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.method).toBe('POST');
    expect(opts.headers['api-key']).toBe(API_KEY);
    expect(JSON.parse(opts.body)).toEqual({
      sender: { name: 'SisPasantías', email: 'sender@sispasantias.test' },
      to: [{ email: 'ana.perez@example.com' }],
      subject: 'Hola',
      htmlContent: '<p>cuerpo</p>',
    });
    const logs = JSON.stringify(spyInfo.mock.calls);
    expect(logs).toContain('email_enviado');
    expect(logs).toContain('"provider":"brevo"');
    expect(logs).toContain('an***@example.com');
    expect(logs).not.toContain(API_KEY);
    expect(logs).not.toContain('cuerpo');
  });

  test('varios destinatarios (to: string[]) → un elemento por email', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { messageId: 'm' }));
    const { mailer } = cargarMailer(ENV_BREVO);
    await mailer.enviarEmail({ to: ['a@example.com', 'b@example.com'], subject: 's', html: 'x' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual([{ email: 'a@example.com' }, { email: 'b@example.com' }]);
  });

  test.each([
    [401, { code: 'unauthorized', message: 'Key not found' }, 'BREVO_AUTH', 'auth'],
    [400, { code: 'invalid_parameter', message: 'sender is invalid / not verified' }, 'BREVO_RECHAZO', 'envio'],
    [429, { code: 'too_many_requests', message: 'Rate limit' }, 'BREVO_RATE_LIMIT', 'envio'],
    [500, { message: 'Internal error' }, 'BREVO_HTTP_5XX', 'red'],
  ])('HTTP %i → errorCode %s / categoría %s, sin lanzar y sin exponer la key ni el body', async (status, body, errorCode, categoria) => {
    fetchMock.mockResolvedValue(respuesta(status, body));
    const { mailer, logger } = cargarMailer(ENV_BREVO);
    const spyError = jest.spyOn(logger, 'error');

    const r = await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' });

    expect(r).toEqual({ ok: false, errorCode, categoria });
    const logs = JSON.stringify(spyError.mock.calls);
    expect(logs).toContain('email_envio_fallo');
    expect(logs).toContain(`"status":${status}`);
    expect(logs).not.toContain(API_KEY);
  });

  test('timeout → BREVO_TIMEOUT (red), sin colgar el request', async () => {
    const abortError = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValue(abortError);
    const { mailer } = cargarMailer(ENV_BREVO);
    expect(await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' }))
      .toEqual({ ok: false, errorCode: 'BREVO_TIMEOUT', categoria: 'red' });
    // El fetch recibe una señal de AbortController (timeout de 10 s).
    expect(fetchMock.mock.calls[0][1].signal).toBeDefined();
  });

  test('error de red (DNS / conexión) → BREVO_RED', async () => {
    fetchMock.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }));
    const { mailer } = cargarMailer(ENV_BREVO);
    expect(await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' }))
      .toEqual({ ok: false, errorCode: 'BREVO_RED', categoria: 'red' });
  });

  test('brevo sin BREVO_API_KEY → EMAIL_NO_CONFIGURADO y no llama a la API', async () => {
    const { mailer } = cargarMailer({ ...ENV_BREVO, BREVO_API_KEY: '' });
    expect(await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' }))
      .toMatchObject({ ok: false, errorCode: 'EMAIL_NO_CONFIGURADO', categoria: 'config' });
    expect(await mailer.verificarEmail()).toMatchObject({ ok: false, categoria: 'config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('verificarEmail (lo que usa email:verify) hace GET /v3/account y no envía nada', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { email: 'cuenta@x.com', plan: [{ type: 'free' }] }));
    const { mailer } = cargarMailer(ENV_BREVO);

    expect(await mailer.verificarEmail()).toEqual({ ok: true });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/account');
    expect(opts.method).toBe('GET');
    expect(opts.headers['api-key']).toBe(API_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('resumen de config sin secretos: sender redactado y "API key: configurada"', () => {
    const { mailer } = cargarMailer(ENV_BREVO);
    const resumen = mailer.resumenConfigEmail();
    expect(resumen).toMatchObject({ provider: 'brevo', apiKey: 'configurada', sender: 'SisPasantías <se***@sispasantias.test>' });
    expect(JSON.stringify(resumen)).not.toContain(API_KEY);
  });

  test('arranque: API key inválida (401) + EMAIL_REQUIRED=true → impide arrancar', async () => {
    fetchMock.mockResolvedValue(respuesta(401, { code: 'unauthorized', message: 'Key not found' }));
    const { mailer } = cargarMailer({ ...ENV_BREVO, EMAIL_REQUIRED: 'true' });
    const log = { info: jest.fn(), error: jest.fn() };

    await expect(mailer.verificarEmailAlArrancar(log)).rejects.toThrow(/proveedor de email \(brevo\) no es utilizable: BREVO_AUTH/);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ provider: 'brevo', critico: true }), 'email_provider_verificacion_fallo');
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(API_KEY);
  });

  test('arranque: falta BREVO_SENDER_EMAIL + EMAIL_REQUIRED=true → impide arrancar', async () => {
    const { mailer } = cargarMailer({ ...ENV_BREVO, BREVO_SENDER_EMAIL: '', EMAIL_REQUIRED: 'true' });
    await expect(mailer.verificarEmailAlArrancar({ info: jest.fn(), error: jest.fn() })).rejects.toThrow(/EMAIL_NO_CONFIGURADO/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('arranque: fallo temporal (timeout / 5xx) → log crítico pero NO impide arrancar', async () => {
    fetchMock.mockResolvedValue(respuesta(503, { message: 'Service unavailable' }));
    const { mailer } = cargarMailer({ ...ENV_BREVO, EMAIL_REQUIRED: 'true' });
    const log = { info: jest.fn(), error: jest.fn() };

    await expect(mailer.verificarEmailAlArrancar(log)).resolves.toMatchObject({ ok: false });
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ categoria: 'red', errorCode: 'BREVO_HTTP_5XX' }) }),
      'email_provider_verificacion_fallo',
    );
  });

  test('arranque OK → email_provider_verificado { provider: "brevo" }', async () => {
    fetchMock.mockResolvedValue(respuesta(200, {}));
    const { mailer } = cargarMailer({ ...ENV_BREVO, EMAIL_REQUIRED: 'true' });
    const log = { info: jest.fn(), error: jest.fn() };
    await expect(mailer.verificarEmailAlArrancar(log)).resolves.toEqual({ ok: true });
    expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ provider: 'brevo' }), 'email_provider_verificado');
  });

  test('con EMAIL_PROVIDER=brevo nunca se inicializa Nodemailer', async () => {
    fetchMock.mockResolvedValue(respuesta(201, { messageId: 'm' }));
    const createTransport = jest.fn();
    jest.doMock('nodemailer', () => ({ createTransport }));
    const { mailer } = cargarMailer(ENV_BREVO);
    await mailer.enviarEmail({ to: 'x@example.com', subject: 's', html: 'x' });
    await mailer.verificarEmail();
    expect(createTransport).not.toHaveBeenCalled();
    jest.dontMock('nodemailer');
  });

  test('EMAIL_PROVIDER inválido → error de configuración', () => {
    const { loadConfig, validateConfig } = require('../src/config/env');
    expect(validateConfig(loadConfig({ EMAIL_PROVIDER: 'gmail' })).some((e) => /EMAIL_PROVIDER debe ser/.test(e))).toBe(true);
    expect(validateConfig(loadConfig({ EMAIL_PROVIDER: 'brevo', EMAIL_REQUIRED: 'true' }))
      .some((e) => /faltan BREVO_API_KEY/.test(e))).toBe(true);
    // Con Brevo no se exigen ni se advierten variables SMTP.
    const c = loadConfig({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 's@x.com', EMAIL_REQUIRED: 'true' });
    expect(validateConfig(c).some((e) => /EMAIL_/.test(e))).toBe(false);
    expect(c.warnings.some((w) => /EMAIL_USER|EMAIL_PASS|App Password/.test(w))).toBe(false);
  });
});
