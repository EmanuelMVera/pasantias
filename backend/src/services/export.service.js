'use strict';

/**
 * export.service.js — generación de PDF y Excel para el panel de admin
 * (sección 14 del pedido de iteración funcional/visual).
 *
 * Reglas comunes a los 4 exports de este archivo:
 * - Generación 100% server-side, con los MISMOS filtros/permisos que la
 *   pantalla (el controller pasa exactamente lo que ya valida cada ruta).
 * - Límite duro de filas (ver admin.service.LOGS_EXPORT_LIMIT) — nunca cargar
 *   un dataset sin cota en memoria.
 * - Ninguna columna interna/sensible (hashes, tokens, passwords, JWT,
 *   payloads completos) — mismo criterio que ya aplica AdminLogsPage/CSV.
 * - Toda celda de texto pasa por neutralizarFormula() antes de Excel — una
 *   celda que empieza con =+-@ se neutraliza (misma protección anti CSV/XLS
 *   injection que ya tiene el export CSV existente).
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { neutralizarFormula } = require('../utils/csv');
const adminService = require('./admin.service');
const adminEstadisticasService = require('./adminEstadisticas.service');

const INSTITUCION = 'SisPasantías — Instituto IT Beltrán';
const CONFIDENCIALIDAD = 'Documento de uso interno — contiene información institucional. No redistribuir.';

// ── Helpers comunes ──────────────────────────────────────────────────────────

function formatearFecha(d) {
  return new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Nombre de archivo seguro y descriptivo — siempre generado server-side. */
function nombreArchivo(tipo, formato) {
  const fecha = new Date().toISOString().slice(0, 10);
  return `${tipo}_${fecha}.${formato}`;
}

function describirFiltros({ accion, usuarioId, entidad, desde, hasta, periodoDias } = {}) {
  const partes = [];
  if (accion) partes.push(`acción=${accion}`);
  if (usuarioId) partes.push(`usuarioId=${usuarioId}`);
  if (entidad) partes.push(`entidad=${entidad}`);
  if (desde) partes.push(`desde=${desde}`);
  if (hasta) partes.push(`hasta=${hasta}`);
  if (periodoDias) partes.push(`período=${periodoDias} días`);
  return partes.length ? partes.join(' · ') : 'sin filtros (todo el rango disponible)';
}

// ── PDF: helpers de layout ───────────────────────────────────────────────────

function crearDocumentoPDF({ orientacion = 'portrait' } = {}) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: orientacion, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const promesaBuffer = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc, promesaBuffer };
}

function dibujarEncabezadoPDF(doc, { titulo, subtitulo, generadoPor, filtrosTexto }) {
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1e3a5f').text('SisPasantías');
  doc.font('Helvetica').fontSize(8).fillColor('#666').text('Instituto IT Beltrán');
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(titulo);
  if (subtitulo) doc.font('Helvetica').fontSize(9).fillColor('#333').text(subtitulo);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(7.5).fillColor('#666');
  doc.text(`Generado: ${formatearFecha(new Date())}  ·  Por: ${generadoPor}`);
  doc.text(`Filtros aplicados: ${filtrosTexto}`);
  doc.moveDown(0.4);
  doc.strokeColor('#cccccc').lineWidth(0.5)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.5);
}

/** Grilla simple de tarjetas KPI (label + value), varias por fila. */
function dibujarKPIs(doc, items, { porFila = 4 } = {}) {
  const anchoDisponible = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoCard = anchoDisponible / porFila;
  const yInicio = doc.y;
  let maxYFila = yInicio;
  items.forEach((item, i) => {
    const col = i % porFila;
    const fila = Math.floor(i / porFila);
    const x = doc.page.margins.left + col * anchoCard;
    const y = yInicio + fila * 38;
    doc.font('Helvetica').fontSize(7.5).fillColor('#666').text(item.label, x, y, { width: anchoCard - 8 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a5f')
      .text(item.value == null ? '—' : String(item.value), x, y + 11, { width: anchoCard - 8 });
    maxYFila = Math.max(maxYFila, y + 32);
  });
  doc.y = maxYFila + 8;
}

function dibujarEncabezadoTablaPDF(doc, columnas, x, y) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#fff');
  const anchoTotal = columnas.reduce((a, c) => a + c.width, 0);
  doc.rect(x, y - 3, anchoTotal, 15).fill('#1e3a5f');
  doc.fillColor('#fff');
  let cx = x;
  for (const col of columnas) {
    doc.text(col.header, cx + 2, y, { width: col.width - 4, lineBreak: false });
    cx += col.width;
  }
  return y + 16;
}

/**
 * Tabla paginada manual (pdfkit no trae tablas): redibuja el encabezado en
 * cada página nueva y corta filas largas con ellipsis en vez de desbordar.
 */
function dibujarTablaPDF(doc, { columnas, filas }) {
  const x = doc.page.margins.left;
  const limiteInferior = doc.page.height - doc.page.margins.bottom - 20;
  let y = dibujarEncabezadoTablaPDF(doc, columnas, x, doc.y);

  doc.font('Helvetica').fontSize(7.5).fillColor('#222');
  filas.forEach((fila, idx) => {
    if (y > limiteInferior) {
      doc.addPage();
      y = dibujarEncabezadoTablaPDF(doc, columnas, x, doc.page.margins.top);
      doc.font('Helvetica').fontSize(7.5).fillColor('#222');
    }
    if (idx % 2 === 1) {
      const anchoTotal = columnas.reduce((a, c) => a + c.width, 0);
      doc.rect(x, y - 2, anchoTotal, 13).fill('#f5f5f5');
      doc.fillColor('#222');
    }
    let cx = x;
    for (const col of columnas) {
      const valor = fila[col.key] == null ? '' : String(fila[col.key]);
      doc.text(valor, cx + 2, y, { width: col.width - 4, height: 12, ellipsis: true, lineBreak: false });
      cx += col.width;
    }
    y += 14;
  });
  doc.y = y;
}

function agregarPiePaginaPDF(doc, footerText) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const numero = i - range.start + 1;
    doc.font('Helvetica').fontSize(6.5).fillColor('#888').text(
      `${footerText}  ·  Página ${numero} de ${range.count}`,
      doc.page.margins.left,
      doc.page.height - doc.page.margins.bottom + 8,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
    );
  }
}

// ── Excel: helpers de layout ──────────────────────────────────────────────────

function celdaSegura(valor) {
  if (valor == null) return '';
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  return neutralizarFormula(String(valor));
}

function crearHojaResumen(wb, { titulo, generadoPor, filtrosTexto, kpis }) {
  const hoja = wb.addWorksheet('Resumen');
  hoja.columns = [{ width: 32 }, { width: 40 }];
  hoja.addRow(['SisPasantías', INSTITUCION]).font = { bold: true, size: 14 };
  hoja.addRow([titulo]).font = { bold: true, size: 12 };
  hoja.addRow([]);
  hoja.addRow(['Generado', formatearFecha(new Date())]);
  hoja.addRow(['Generado por', celdaSegura(generadoPor)]);
  hoja.addRow(['Filtros aplicados', celdaSegura(filtrosTexto)]);
  hoja.addRow([]);
  const filaHeaderKpi = hoja.addRow(['Métrica', 'Valor']);
  filaHeaderKpi.font = { bold: true };
  filaHeaderKpi.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const kpi of kpis) {
    hoja.addRow([kpi.label, kpi.value == null ? '—' : kpi.value]);
  }
  hoja.addRow([]);
  hoja.addRow([CONFIDENCIALIDAD]).font = { italic: true, size: 8, color: { argb: 'FF888888' } };
  return hoja;
}

function crearHojaDatos(wb, { columnas, filas }) {
  const hoja = wb.addWorksheet('Datos');
  hoja.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  const headerRow = hoja.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }; });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];

  for (const fila of filas) {
    const valores = {};
    for (const col of columnas) {
      const raw = fila[col.key];
      valores[col.key] = col.tipo === 'fecha' && raw ? new Date(raw) : celdaSegura(raw);
    }
    hoja.addRow(valores);
  }
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  for (const col of columnas) {
    if (col.tipo === 'fecha') hoja.getColumn(col.key).numFmt = 'dd/mm/yyyy hh:mm';
    if (col.tipo === 'porcentaje') hoja.getColumn(col.key).numFmt = '0.0"%"';
  }
  return hoja;
}

function crearHojaFiltros(wb, { filtrosTexto, generadoPor, totalFilas, limite }) {
  const hoja = wb.addWorksheet('Filtros y metadatos');
  hoja.columns = [{ width: 28 }, { width: 50 }];
  hoja.addRow(['Filtros aplicados', celdaSegura(filtrosTexto)]);
  hoja.addRow(['Generado por', celdaSegura(generadoPor)]);
  hoja.addRow(['Generado', formatearFecha(new Date())]);
  hoja.addRow(['Filas exportadas', totalFilas]);
  if (limite && totalFilas >= limite) {
    hoja.addRow(['Aviso', `Se alcanzó el límite máximo de ${limite} filas — hay más resultados sin exportar. Acotá el rango de fechas u otros filtros.`]);
  }
  hoja.addRow([CONFIDENCIALIDAD]);
  hoja.getRow(1).font = { bold: true };
  return hoja;
}

async function bufferDeWorkbook(wb) {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Logs: columnas comunes a Excel y PDF ─────────────────────────────────────

function filasLogsParaTabla(logs) {
  return logs.map((l) => ({
    id: l.id,
    fecha: l.createdAt,
    accion: l.accion,
    entidad: l.entidad || '',
    entidadId: l.entidadId || '',
    usuario: l.usuario ? `${l.usuario.nombre} ${l.usuario.apellido}` : 'Sistema',
    email: l.usuario ? l.usuario.email : '',
    ip: l.ip || '',
  }));
}

// ── API pública: logs ─────────────────────────────────────────────────────────

async function generarLogsExcel(filtros, { generadoPor }) {
  const logs = await adminService.obtenerLogsParaExport(filtros);
  const filas = filasLogsParaTabla(logs);
  const filtrosTexto = describirFiltros(filtros);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SisPasantías';
  wb.created = new Date();
  crearHojaResumen(wb, {
    titulo: 'Auditoría del sistema',
    generadoPor, filtrosTexto,
    kpis: [{ label: 'Registros exportados', value: filas.length }],
  });
  crearHojaDatos(wb, {
    columnas: [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 20, tipo: 'fecha' },
      { header: 'Acción', key: 'accion', width: 26 },
      { header: 'Entidad', key: 'entidad', width: 14 },
      { header: 'ID entidad', key: 'entidadId', width: 10 },
      { header: 'Usuario', key: 'usuario', width: 24 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'IP', key: 'ip', width: 16 },
    ],
    filas,
  });
  crearHojaFiltros(wb, { filtrosTexto, generadoPor, totalFilas: filas.length, limite: adminService.LOGS_EXPORT_LIMIT });

  return { buffer: await bufferDeWorkbook(wb), filename: nombreArchivo('auditoria', 'xlsx'), filas: filas.length };
}

async function generarLogsPDF(filtros, { generadoPor }) {
  const logs = await adminService.obtenerLogsParaExport(filtros);
  const filas = filasLogsParaTabla(logs);
  const filtrosTexto = describirFiltros(filtros);

  const { doc, promesaBuffer } = crearDocumentoPDF({ orientacion: 'landscape' });
  dibujarEncabezadoPDF(doc, { titulo: 'Auditoría del sistema', generadoPor, filtrosTexto });
  dibujarKPIs(doc, [{ label: 'Registros exportados', value: filas.length }], { porFila: 4 });

  dibujarTablaPDF(doc, {
    columnas: [
      { header: 'ID', key: 'id', width: 35 },
      { header: 'Fecha', key: 'fecha', width: 90 },
      { header: 'Acción', key: 'accion', width: 140 },
      { header: 'Entidad', key: 'entidad', width: 80 },
      { header: 'Usuario', key: 'usuario', width: 130 },
      { header: 'Email', key: 'email', width: 160 },
      { header: 'IP', key: 'ip', width: 90 },
    ],
    filas: filas.map((f) => ({ ...f, fecha: formatearFecha(f.fecha) })),
  });

  agregarPiePaginaPDF(doc, CONFIDENCIALIDAD);
  doc.end();
  const buffer = await promesaBuffer;
  return { buffer, filename: nombreArchivo('auditoria', 'pdf'), filas: filas.length };
}

// ── API pública: estadísticas ─────────────────────────────────────────────────

function kpisEstadisticas(stats) {
  return [
    { label: 'Usuarios activos', value: stats.usuarios.totalActivos },
    { label: 'Alumnos', value: stats.usuarios.alumnos },
    { label: 'Egresados', value: stats.usuarios.egresados },
    { label: 'Empresas aprobadas', value: stats.empresas.aprobadas },
    { label: 'Empresas pendientes', value: stats.empresas.pendientes },
    { label: 'Reclutadores activos', value: stats.empresas.reclutadoresActivos },
    { label: 'Ofertas activas', value: stats.ofertas.activas },
    { label: 'Ofertas pend. moderación', value: stats.ofertas.pendienteModeracion },
    { label: 'Postulaciones (período)', value: stats.postulaciones.enPeriodo },
    { label: 'Contrataciones (período)', value: stats.contrataciones.enPeriodo },
    { label: 'Tasa de contratación', value: stats.contrataciones.tasaContratacion == null ? '—' : `${stats.contrataciones.tasaContratacion}%` },
    { label: 'Altas de usuarios (período)', value: stats.usuarios.altasEnPeriodo },
  ];
}

async function generarEstadisticasExcel(filtros, { generadoPor }) {
  const stats = await adminEstadisticasService.obtenerEstadisticasGenerales(filtros);
  const filtrosTexto = describirFiltros(filtros);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SisPasantías';
  wb.created = new Date();
  crearHojaResumen(wb, { titulo: 'Estadísticas del sistema', generadoPor, filtrosTexto, kpis: kpisEstadisticas(stats) });

  const filasArea = Object.entries(stats.ofertas.porArea).map(([area, cantidad]) => ({ area, cantidad }));
  crearHojaDatos(wb, {
    columnas: [
      { header: 'Área', key: 'area', width: 32 },
      { header: 'Cantidad de ofertas', key: 'cantidad', width: 20 },
    ],
    filas: filasArea,
  });

  const hojaEmbudo = wb.addWorksheet('Embudo de selección');
  hojaEmbudo.columns = [{ header: 'Etapa', key: 'etapa', width: 26 }, { header: 'Cantidad', key: 'cantidad', width: 14 }];
  hojaEmbudo.getRow(1).font = { bold: true };
  hojaEmbudo.addRows([
    { etapa: 'En revisión', cantidad: stats.embudo.enRevision },
    { etapa: 'Preseleccionado', cantidad: stats.embudo.preseleccionado },
    { etapa: 'Entrevista', cantidad: stats.embudo.entrevista },
    { etapa: 'Contratado', cantidad: stats.embudo.contratado },
  ]);

  const hojaEmpresas = wb.addWorksheet('Empresas con más ofertas');
  hojaEmpresas.columns = [{ header: 'Empresa', key: 'razonSocial', width: 34 }, { header: 'Ofertas', key: 'totalOfertas', width: 12 }];
  hojaEmpresas.getRow(1).font = { bold: true };
  for (const e of stats.empresas.conMasOfertas) {
    hojaEmpresas.addRow({ razonSocial: celdaSegura(e.razonSocial), totalOfertas: e.totalOfertas });
  }

  crearHojaFiltros(wb, { filtrosTexto, generadoPor, totalFilas: filasArea.length });

  return { buffer: await bufferDeWorkbook(wb), filename: nombreArchivo('estadisticas', 'xlsx') };
}

async function generarEstadisticasPDF(filtros, { generadoPor }) {
  const stats = await adminEstadisticasService.obtenerEstadisticasGenerales(filtros);
  const filtrosTexto = describirFiltros(filtros);

  const { doc, promesaBuffer } = crearDocumentoPDF({ orientacion: 'portrait' });
  dibujarEncabezadoPDF(doc, { titulo: 'Estadísticas del sistema', generadoPor, filtrosTexto });
  dibujarKPIs(doc, kpisEstadisticas(stats), { porFila: 3 });

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Embudo de selección', { underline: false });
  doc.moveDown(0.2);
  dibujarTablaPDF(doc, {
    columnas: [
      { header: 'Etapa', key: 'etapa', width: 250 },
      { header: 'Cantidad', key: 'cantidad', width: 100 },
    ],
    filas: [
      { etapa: 'En revisión', cantidad: stats.embudo.enRevision },
      { etapa: 'Preseleccionado', cantidad: stats.embudo.preseleccionado },
      { etapa: 'Entrevista', cantidad: stats.embudo.entrevista },
      { etapa: 'Contratado', cantidad: stats.embudo.contratado },
    ],
  });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text('Empresas con más ofertas publicadas');
  doc.moveDown(0.2);
  dibujarTablaPDF(doc, {
    columnas: [
      { header: 'Empresa', key: 'razonSocial', width: 300 },
      { header: 'Ofertas', key: 'totalOfertas', width: 100 },
    ],
    filas: stats.empresas.conMasOfertas,
  });

  agregarPiePaginaPDF(doc, CONFIDENCIALIDAD);
  doc.end();
  const buffer = await promesaBuffer;
  return { buffer, filename: nombreArchivo('estadisticas', 'pdf') };
}

module.exports = {
  generarLogsExcel,
  generarLogsPDF,
  generarEstadisticasExcel,
  generarEstadisticasPDF,
  describirFiltros,
  nombreArchivo,
};
