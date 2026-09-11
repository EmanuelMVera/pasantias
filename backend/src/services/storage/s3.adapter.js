'use strict';

/**
 * storage/s3.adapter.js — Backend de almacenamiento S3-compatible (AWS S3 /
 * Cloudflare R2). AWS SDK v3.
 *
 * Dos buckets (DEPLOY-01):
 *   area 'private' → S3_BUCKET         (sin acceso público; CV, cartas)
 *   area 'public'  → S3_PUBLIC_BUCKET  (lectura pública; fotos, logos)
 *
 * Los objetos privados se sirven SIEMPRE por streaming a través del backend
 * (GET /api/archivos/:id, con su autorización) — nunca por redirect ni signed
 * URL. Por eso no se usa `@aws-sdk/s3-request-presigner`.
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { config } = require('../../config/env');

const name = 's3';
const s3cfg = config.storage.s3;

const VAR_POR_CAMPO = {
  endpoint: 'S3_ENDPOINT',
  bucket: 'S3_BUCKET',
  publicBucket: 'S3_PUBLIC_BUCKET',
  accessKeyId: 'S3_ACCESS_KEY_ID',
  secretAccessKey: 'S3_SECRET_ACCESS_KEY',
  publicBaseUrl: 'S3_PUBLIC_BASE_URL',
};

function assertConfigurado() {
  const faltan = Object.keys(VAR_POR_CAMPO).filter((k) => !s3cfg[k]).map((k) => VAR_POR_CAMPO[k]);
  if (faltan.length) {
    throw new Error(`STORAGE_BACKEND=s3 pero falta configuración: ${faltan.join(', ')}`);
  }
}

let _client = null;
function client() {
  if (_client) return _client;
  assertConfigurado();
  _client = new S3Client({
    region: s3cfg.region || 'auto',
    endpoint: s3cfg.endpoint,
    forcePathStyle: s3cfg.forcePathStyle,
    credentials: {
      accessKeyId: s3cfg.accessKeyId,
      secretAccessKey: s3cfg.secretAccessKey,
    },
  });
  return _client;
}

function bucketFor(area) {
  return area === 'public' ? s3cfg.publicBucket : s3cfg.bucket;
}

function esNotFound(err) {
  return err
    && (err.name === 'NoSuchKey' || err.name === 'NotFound'
      || err.$metadata?.httpStatusCode === 404);
}

async function putObject({ key, body, contentType, cacheControl, area = 'private' }) {
  await client().send(new PutObjectCommand({
    Bucket: bucketFor(area),
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
    // Sin ACL: R2 no soporta ACLs por objeto; el acceso público del bucket
    // público se configura a nivel bucket.
  }));
  return { key };
}

async function getObjectStream(key, { area = 'private' } = {}) {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucketFor(area), Key: key }));
    return { stream: res.Body, contentType: res.ContentType, contentLength: res.ContentLength };
  } catch (err) {
    if (esNotFound(err)) {
      const e = new Error('NoSuchKey');
      e.notFound = true;
      throw e;
    }
    throw err;
  }
}

async function deleteObject(key, { area = 'private' } = {}) {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucketFor(area), Key: key }));
  } catch (err) {
    if (!esNotFound(err)) throw err; // borrar algo inexistente no es error
  }
}

async function objectExists(key, { area = 'private' } = {}) {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucketFor(area), Key: key }));
    return true;
  } catch (err) {
    if (esNotFound(err)) return false;
    throw err;
  }
}

/** URL pública (bucket público expuesto vía S3_PUBLIC_BASE_URL). */
function publicUrl(key) {
  const base = (s3cfg.publicBaseUrl || '').replace(/\/+$/, '');
  return `${base}/${String(key).replace(/^\/+/, '')}`;
}

module.exports = { name, putObject, getObjectStream, deleteObject, objectExists, publicUrl };
