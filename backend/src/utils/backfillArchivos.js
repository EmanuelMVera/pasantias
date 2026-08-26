/**
 * backfillArchivos.js — SEC-01: vincula perfiles con cvPath/cartaRecomendacion
 * subidos ANTES de que existiera la tabla `archivos` (EST-08 Fase 4) a una
 * fila real de `archivos`, completando perfiles.cvArchivoId/cartaArchivoId.
 *
 * Es un script manual y revisable, no una migración automática: por cada
 * perfil con la ruta cruda seteada pero sin el FK, verifica si el archivo
 * existe de verdad en disco.
 *   - Si existe: crea la fila de `archivos` con metadata real (tamaño, hash,
 *     mimetype por extensión) y completa el FK.
 *   - Si NO existe (rutas ficticias del seed demo, archivos borrados a mano,
 *     etc.): no inventa nada, lo deja sin vincular y lo lista en el reporte
 *     final para revisión manual.
 *
 * Uso: node src/utils/backfillArchivos.js
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Perfil, Archivo } = require('../models');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');

const MIME_POR_EXT = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function resolverRuta(rutaCruda) {
  const relativa = rutaCruda.replace(/^\/?uploads\/?/, '');
  return path.normalize(path.join(UPLOADS_ROOT, relativa));
}

async function vincular(perfil, campoRuta, campoFk, tipo) {
  const rutaCruda = perfil[campoRuta];
  if (!rutaCruda || perfil[campoFk]) return null; // sin ruta, o ya vinculado

  const rutaAbsoluta = resolverRuta(rutaCruda);
  if (!fs.existsSync(rutaAbsoluta)) {
    return { usuarioId: perfil.usuarioId, tipo, rutaCruda, resultado: 'SIN_ARCHIVO_EN_DISCO' };
  }

  const stat = fs.statSync(rutaAbsoluta);
  const buffer = fs.readFileSync(rutaAbsoluta);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(rutaAbsoluta).toLowerCase();

  const archivo = await Archivo.create({
    usuarioPropietarioId: perfil.usuarioId,
    tipo,
    nombreOriginal: path.basename(rutaAbsoluta),
    claveAlmacenamiento: rutaCruda.startsWith('/uploads') ? rutaCruda : `/uploads/${rutaCruda}`,
    mimeType: MIME_POR_EXT[ext] || 'application/octet-stream',
    tamanioBytes: stat.size,
    hashSha256: hash,
    backend: 'local',
  });

  await perfil.update({ [campoFk]: archivo.id });
  return { usuarioId: perfil.usuarioId, tipo, rutaCruda, resultado: 'VINCULADO', archivoId: archivo.id };
}

async function main() {
  const perfiles = await Perfil.findAll({
    where: {
      [Op.or]: [
        { cvPath: { [Op.ne]: null } },
        { cartaRecomendacion: { [Op.ne]: null } },
      ],
    },
  });

  const reporte = [];
  for (const perfil of perfiles) {
    const rCv = await vincular(perfil, 'cvPath', 'cvArchivoId', 'cv');
    if (rCv) reporte.push(rCv);
    const rCarta = await vincular(perfil, 'cartaRecomendacion', 'cartaArchivoId', 'carta_recomendacion');
    if (rCarta) reporte.push(rCarta);
  }

  const vinculados = reporte.filter(r => r.resultado === 'VINCULADO');
  const sinArchivo = reporte.filter(r => r.resultado === 'SIN_ARCHIVO_EN_DISCO');

  console.log(`\n✅ Vinculados: ${vinculados.length}`);
  vinculados.forEach(r => console.log(`   usuarioId=${r.usuarioId} tipo=${r.tipo} -> archivoId=${r.archivoId}`));

  console.log(`\n⚠️  Sin archivo real en disco (revisar manualmente): ${sinArchivo.length}`);
  sinArchivo.forEach(r => console.log(`   usuarioId=${r.usuarioId} tipo=${r.tipo} ruta="${r.rutaCruda}"`));

  console.log(`\nTotal perfiles con ruta cruda pendiente evaluada: ${reporte.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error en backfillArchivos:', err);
  process.exit(1);
});
