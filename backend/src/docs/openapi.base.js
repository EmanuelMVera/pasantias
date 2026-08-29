/**
 * openapi.base.js — Documento raíz de la spec OpenAPI (DOC-02).
 *
 * `info`, `servers`, `tags` y el `security` por defecto. Los `paths` y
 * `components` se ensamblan en `docs/index.js`.
 */
'use strict';

module.exports = {
  openapi: '3.1.0',
  info: {
    title: 'API — Sistema de Pasantías IT Beltrán',
    version: '1.0.0',
    license: { name: 'ISC' },
    description: [
      'Documentación de la API REST (DOC-02).',
      '',
      '## Convenciones',
      '- **Envelope de éxito:** `{ "success": true, ... }`. Normalmente los datos',
      '  van en `data`; algunas operaciones (login, `/auth/me`, subidas) usan',
      '  otras claves — está documentado operación por operación.',
      '- **Errores:** `{ "success": false, "message": "<texto>", "code"?: "<CODE>" }`.',
      '  `requestId` se agrega solo en los 500.',
      '- **Paginación:** query `?page=&limit=`; respuesta',
      '  `pagination: { page, limit, total, totalPages }`. Las listas repiten',
      '  `total` en el nivel superior por compatibilidad (legacy).',
      '',
      '## Autenticación',
      'La sesión vive en la **cookie `token` HttpOnly** (se setea al hacer login).',
      'Para clientes de API / esta consola: `Authorization: Bearer <token>`',
      '(el body del login devuelve el `token`).',
      '',
      '## CSRF',
      'Los métodos que mutan estado (`POST/PUT/PATCH/DELETE`) exigen el header',
      '`X-CSRF-Token` con el valor de la cookie `csrf_token`. Excepciones:',
      '`POST /auth/login`, `/auth/logout`, `/auth/forgot-password`,',
      '`/auth/reset-password/{token}` y `POST /solicitudes-empresa`.',
      '',
      '## Comportamientos conocidos',
      '- `POST/PUT /ofertas` sin `titulo`/`descripcion` responde **500** (no 400):',
      '  la validación de esos campos la hace Sequelize, no un guard de request.',
      '- `PATCH /admin/solicitudes-empresa/{id}/rechazar` y',
      '  `.../solicitudes-reclutador/{id}/rechazar` con body vacío responden **500**.',
    ].join('\n'),
  },
  servers: [
    { url: 'http://localhost:5000/api', description: 'Desarrollo local' },
    {
      url: '{publicUrl}/api',
      description: 'Despliegue',
      variables: { publicUrl: { default: 'https://api.ejemplo.edu' } },
    },
  ],
  // Por defecto toda operación acepta cookie o bearer. Las públicas hacen
  // `security: []` para anular esto.
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  tags: [
    { name: 'auth', description: 'Autenticación, sesión y contraseña' },
    { name: 'usuarios', description: 'Perfil propio y subida de CV / carta / foto' },
    { name: 'alumno', description: 'Panel del alumno / egresado' },
    { name: 'empresas', description: 'Panel corporativo, perfil de empresa y equipo' },
    { name: 'ofertas', description: 'Publicaciones de pasantías' },
    { name: 'postulaciones', description: 'Postulaciones y embudo de selección' },
    { name: 'solicitudes', description: 'Alta de empresa (pública) y de reclutadores' },
    { name: 'chat', description: 'Mensajería directa entre usuarios' },
    { name: 'notificaciones', description: 'Notificaciones in-app' },
    { name: 'admin', description: 'Panel de administración del instituto (rol admin)' },
    { name: 'archivos', description: 'Descarga autenticada de archivos privados' },
  ],
  externalDocs: {
    description: 'Roles y matriz de permisos',
    url: 'https://github.com/lucashmercado/pasantias/blob/main/docs/ROLES-Y-PERMISOS.md',
  },
};
