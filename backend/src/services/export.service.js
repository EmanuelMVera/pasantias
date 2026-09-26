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
  // Los reportes cuyas secciones ya rotulan su propio alcance (estadísticas) no
  // pasan `filtrosTexto`: un "Filtros aplicados: período" global sugeriría que el
  // período gobierna todo el documento, y solo gobierna la actividad del período.
  if (filtrosTexto) doc.text(`Filtros aplicados: ${filtrosTexto}`);
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
  const anchoTexto = anchoCard - 8;
  let y = doc.y;
  for (let inicio = 0; inicio < items.length; inicio += porFila) {
    const fila = items.slice(inicio, inicio + porFila);
    // El valor va debajo de la ALTURA REAL del rótulo: uno largo que se parte en
    // dos líneas ya no queda pisado por el valor.
    doc.font('Helvetica').fontSize(7.5);
    const altoRotulo = Math.max(...fila.map((it) => doc.heightOfString(it.label, { width: anchoTexto })));
    fila.forEach((item, col) => {
      const x = doc.page.margins.left + col * anchoCard;
      doc.font('Helvetica').fontSize(7.5).fillColor('#666').text(item.label, x, y, { width: anchoTexto });
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e3a5f')
        .text(item.value == null ? '—' : String(item.value), x, y + altoRotulo + 2, { width: anchoTexto });
    });
    y += altoRotulo + 2 + 16 + 12; // rótulo + valor (13pt) + separación entre filas
  }
  // text(x, y) deja doc.x en la última columna: volver al margen para lo que siga.
  doc.x = doc.page.margins.left;
  doc.y = y;
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
  doc.x = x;
  doc.y = y;
}

/** Deja `alto` puntos libres; si no entran en la página actual, abre una nueva. */
function asegurarEspacio(doc, alto) {
  if (doc.y + alto > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
}

/** Título de sección (con una nota gris opcional debajo). */
function dibujarSeccionPDF(doc, titulo, nota) {
  asegurarEspacio(doc, 70);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1e3a5f').text(titulo);
  if (nota) doc.font('Helvetica').fontSize(7.5).fillColor('#777').text(nota);
  doc.moveDown(0.8);
}

/** Subtítulo + tabla; si no hay filas, un texto en vez de una tabla vacía. */
function dibujarTablaConTituloPDF(doc, titulo, { columnas, filas }) {
  asegurarEspacio(doc, 70);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(titulo);
  doc.moveDown(0.2);
  if (filas.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#777').text('Sin datos para mostrar.');
    return;
  }
  dibujarTablaPDF(doc, { columnas, filas });
}

/**
 * Pie "… · Página X de N" en cada página.
 *
 * El pie va en el margen inferior, o sea FUERA del área de contenido de pdfkit:
 * con `margins.bottom > 0` cada `text()` ahí se toma como desborde y agrega una
 * página nueva — un reporte de 1 página salía de 2 (la 2ª vacía) y uno de N
 * páginas duplicaba las páginas al dibujar los pies. Por eso, mientras se dibuja el
 * pie el margen inferior se pone en 0 (y se restaura), y `lineBreak: false` evita
 * que el texto se parta. N se lee UNA vez, antes de dibujar cualquier pie.
 */
function agregarPiePaginaPDF(doc, footerText) {
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    const margenInferior = doc.page.margins.bottom;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(6.5).fillColor('#888').text(
      `${footerText}  ·  Página ${i + 1} de ${count}`,
      doc.page.margins.left,
      doc.page.height - margenInferior + 8,
      { width: ancho, align: 'center', lineBreak: false }
    );
    doc.page.margins.bottom = margenInferior;
  }
}

// ── Excel: helpers de layout ──────────────────────────────────────────────────

function celdaSegura(valor) {
  if (valor == null) return '';
  if (valor instanceof Date) return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  return neutralizarFormula(String(valor));
}

const AZUL_INSTITUCIONAL = 'FF1E3A5F';

/** Encabezado azul institucional (fondo azul, texto blanco en negrita) en las celdas [1..columnas] de una fila. */
function estilizarEncabezado(fila, columnas) {
  for (let i = 1; i <= columnas; i++) {
    const c = fila.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_INSTITUCIONAL } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  }
}

/** Nota larga a todo el ancho (A:B), con ajuste de texto y alto fijo (las celdas combinadas no se autoajustan). */
function agregarNotaCombinada(hoja, texto, { alto = 30, estilo } = {}) {
  const fila = hoja.addRow([texto]);
  hoja.mergeCells(fila.number, 1, fila.number, 2);
  fila.getCell(1).alignment = { vertical: 'top', wrapText: true };
  if (estilo) fila.getCell(1).font = estilo;
  fila.height = alto;
  return fila;
}

const ESTILO_NOTA = { italic: true, size: 8, color: { argb: 'FF888888' } };

function crearHojaResumen(wb, { titulo, generadoPor, filtrosTexto, kpis }) {
  const hoja = wb.addWorksheet('Resumen');
  hoja.columns = [{ width: 32 }, { width: 44 }];
  hoja.addRow(['SisPasantías', INSTITUCION]).font = { bold: true, size: 14 };
  hoja.addRow([titulo]).font = { bold: true, size: 12 };
  hoja.addRow([]);
  hoja.addRow(['Generado', formatearFecha(new Date())]);
  hoja.addRow(['Generado por', celdaSegura(generadoPor)]);
  const filaFiltros = hoja.addRow(['Filtros aplicados', celdaSegura(filtrosTexto)]);
  filaFiltros.getCell(2).alignment = { vertical: 'top', wrapText: true };
  hoja.addRow([]);
  estilizarEncabezado(hoja.addRow(['Métrica', 'Valor']), 2);
  for (const kpi of kpis) {
    hoja.addRow([kpi.label, kpi.value == null ? '—' : kpi.value]);
  }
  hoja.addRow([]);
  agregarNotaCombinada(hoja, CONFIDENCIALIDAD, { estilo: ESTILO_NOTA });
  return hoja;
}

function crearHojaDatos(wb, { columnas, filas }) {
  const hoja = wb.addWorksheet('Datos');
  hoja.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width || 20 }));
  estilizarEncabezado(hoja.getRow(1), columnas.length);
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

function crearHojaFiltros(wb, { filtrosTexto, generadoPor, totalFilas, limite, etiquetaFilas = 'Filas exportadas' }) {
  const hoja = wb.addWorksheet('Filtros y metadatos');
  hoja.columns = [{ width: 28 }, { width: 56 }];
  hoja.addRow(['Filtros aplicados', celdaSegura(filtrosTexto)]);
  hoja.addRow(['Generado por', celdaSegura(generadoPor)]);
  hoja.addRow(['Generado', formatearFecha(new Date())]);
  hoja.addRow([etiquetaFilas, totalFilas]);
  if (limite && totalFilas >= limite) {
    hoja.addRow(['Aviso', `Se alcanzó el límite máximo de ${limite} filas — hay más resultados sin exportar. Acotá el rango de fechas u otros filtros.`]);
  }
  hoja.eachRow((fila) => {
    fila.getCell(1).font = { bold: true };
    fila.getCell(1).alignment = { vertical: 'top' };
    fila.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  });
  hoja.addRow([]);
  agregarNotaCombinada(hoja, CONFIDENCIALIDAD, { estilo: ESTILO_NOTA });
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

/**
 * Las métricas de estadísticas se reparten en TRES bloques con alcance distinto —
 * es la misma separación que el dashboard, y evita presentar el período como si
 * fuera un filtro global del reporte:
 *   - Estado actual:        "a hoy" (no depende del período).
 *   - Actividad del período: SOLO estas tres dependen de `periodoDias`/`desde`-`hasta`.
 *   - Indicadores históricos: acumulados desde el inicio del sistema.
 *
 * `tipo` le dice a cada formato cómo mostrar el valor: 'porcentaje' (en puntos, 19.6)
 * y 'dias' se muestran con su unidad en el PDF y como número con formato en Excel.
 */
function describirPeriodo(periodo) {
  const desde = new Date(periodo.desde);
  const hasta = new Date(periodo.hasta);
  const dias = Math.max(1, Math.round((hasta - desde) / (24 * 60 * 60 * 1000)));
  const fecha = (d) => d.toLocaleDateString('es-AR');
  return { dias, rango: `${fecha(desde)} – ${fecha(hasta)}` };
}

function bloquesEstadisticas(stats) {
  const { dias, rango } = describirPeriodo(stats.periodo);
  return [
    {
      titulo: 'Estado actual',
      nota: 'Valores a la fecha de generación del reporte. No dependen del período.',
      items: [
        { label: 'Usuarios activos', value: stats.usuarios.totalActivos },
        { label: 'Alumnos', value: stats.usuarios.alumnos },
        { label: 'Egresados', value: stats.usuarios.egresados },
        { label: 'Empresas aprobadas', value: stats.empresas.aprobadas },
        { label: 'Solicitudes de empresa pendientes', value: stats.empresas.solicitudesPendientes },
        { label: 'Reclutadores activos', value: stats.empresas.reclutadoresActivos },
        { label: 'Ofertas activas', value: stats.ofertas.activas },
        { label: 'Ofertas pendientes de moderación', value: stats.ofertas.pendienteModeracion },
      ],
    },
    {
      titulo: `Actividad del período — ${dias} días (${rango})`,
      nota: 'Solo estas métricas dependen del período seleccionado.',
      items: [
        { label: 'Postulaciones', value: stats.postulaciones.enPeriodo },
        { label: 'Contrataciones', value: stats.contrataciones.enPeriodo },
        { label: 'Altas de alumnos y egresados', value: stats.usuarios.altasEnPeriodo },
      ],
    },
    {
      titulo: 'Indicadores históricos',
      nota: 'Acumulados desde el inicio del sistema. No dependen del período.',
      items: [
        { label: 'Postulaciones totales', value: stats.postulaciones.total },
        { label: 'Contrataciones totales', value: stats.contrataciones.total },
        { label: 'Tasa de contratación', value: stats.contrataciones.tasaContratacion, tipo: 'porcentaje' },
        { label: 'Tiempo promedio de aprobación de empresas', value: stats.empresas.tiempoPromedioAprobacionDias, tipo: 'dias' },
      ],
    },
  ];
}

function textoKpi({ value, tipo }) {
  if (value == null) return '—';
  if (tipo === 'porcentaje') return `${value}%`;
  if (tipo === 'dias') return `${value} días`;
  return String(value);
}

function filasEmbudo(stats) {
  return [
    { etapa: 'En revisión', cantidad: stats.embudo.enRevision },
    { etapa: 'Preseleccionado', cantidad: stats.embudo.preseleccionado },
    { etapa: 'Entrevista', cantidad: stats.embudo.entrevista },
    { etapa: 'Contratado', cantidad: stats.embudo.contratado },
  ];
}

function filasPorArea(stats) {
  return Object.entries(stats.ofertas.porArea)
    .map(([area, cantidad]) => ({ area, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.area.localeCompare(b.area, 'es'));
}

/** Resumen de estadísticas: los tres bloques, cada uno con su encabezado azul. Números como números. */
function crearHojaResumenEstadisticas(wb, { generadoPor, stats }) {
  const { dias, rango } = describirPeriodo(stats.periodo);
  const hoja = wb.addWorksheet('Resumen');
  hoja.columns = [{ width: 42 }, { width: 40 }];
  hoja.addRow(['SisPasantías', INSTITUCION]).font = { bold: true, size: 14 };
  hoja.addRow(['Estadísticas del sistema']).font = { bold: true, size: 12 };
  hoja.addRow([]);
  hoja.addRow(['Generado', formatearFecha(new Date())]);
  hoja.addRow(['Generado por', celdaSegura(generadoPor)]);
  const filaPeriodo = hoja.addRow(['Período de actividad', `${dias} días (${rango})`]);
  filaPeriodo.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  hoja.addRow([]);

  for (const bloque of bloquesEstadisticas(stats)) {
    estilizarEncabezado(hoja.addRow([bloque.titulo, 'Valor']), 2);
    hoja.lastRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    const notaFila = hoja.addRow([bloque.nota]);
    hoja.mergeCells(notaFila.number, 1, notaFila.number, 2);
    notaFila.getCell(1).font = ESTILO_NOTA;
    notaFila.getCell(1).alignment = { vertical: 'top', wrapText: true };

    for (const item of bloque.items) {
      const fila = hoja.addRow([item.label]);
      const celda = fila.getCell(2);
      if (item.value == null) {
        celda.value = '—';
      } else if (item.tipo === 'porcentaje') {
        celda.value = Math.round(item.value * 10) / 1000; // 19.6 → 0.196, formateado como 19.6%
        celda.numFmt = '0.0%';
      } else if (item.tipo === 'dias') {
        celda.value = item.value;
        celda.numFmt = '0.0" días"';
      } else {
        celda.value = item.value;
      }
      celda.alignment = { horizontal: 'right' };
      fila.getCell(1).alignment = { vertical: 'top', wrapText: true };
    }
    hoja.addRow([]);
  }

  agregarNotaCombinada(hoja, CONFIDENCIALIDAD, { estilo: ESTILO_NOTA });
  return hoja;
}

function crearHojaSimple(wb, nombre, columnas, filas) {
  const hoja = wb.addWorksheet(nombre);
  hoja.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  estilizarEncabezado(hoja.getRow(1), columnas.length);
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  for (const fila of filas) hoja.addRow(fila);
  return hoja;
}

async function generarEstadisticasExcel(filtros, { generadoPor }) {
  const stats = await adminEstadisticasService.obtenerEstadisticasGenerales(filtros);
  const filtrosTexto = describirFiltros(filtros);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SisPasantías';
  wb.created = new Date();
  crearHojaResumenEstadisticas(wb, { generadoPor, stats });

  const filasArea = filasPorArea(stats);
  crearHojaDatos(wb, {
    columnas: [
      { header: 'Área', key: 'area', width: 32 },
      { header: 'Cantidad de ofertas', key: 'cantidad', width: 20 },
    ],
    filas: filasArea,
  });

  crearHojaSimple(wb, 'Embudo de selección',
    [{ header: 'Etapa', key: 'etapa', width: 26 }, { header: 'Cantidad', key: 'cantidad', width: 14 }],
    filasEmbudo(stats));

  crearHojaSimple(wb, 'Empresas con más ofertas',
    [{ header: 'Empresa', key: 'razonSocial', width: 34 }, { header: 'Ofertas', key: 'totalOfertas', width: 12 }],
    stats.empresas.conMasOfertas.map((e) => ({ razonSocial: celdaSegura(e.razonSocial), totalOfertas: e.totalOfertas })));

  crearHojaFiltros(wb, { filtrosTexto, generadoPor, totalFilas: filasArea.length, etiquetaFilas: 'Áreas incluidas' });

  return { buffer: await bufferDeWorkbook(wb), filename: nombreArchivo('estadisticas', 'xlsx') };
}

async function generarEstadisticasPDF(filtros, { generadoPor }) {
  const stats = await adminEstadisticasService.obtenerEstadisticasGenerales(filtros);

  const { doc, promesaBuffer } = crearDocumentoPDF({ orientacion: 'portrait' });
  // Sin `filtrosTexto`: el período NO es un filtro global — lo rotula la sección de actividad.
  dibujarEncabezadoPDF(doc, { titulo: 'Estadísticas del sistema', generadoPor });

  for (const bloque of bloquesEstadisticas(stats)) {
    dibujarSeccionPDF(doc, bloque.titulo, bloque.nota);
    asegurarEspacio(doc, 40 * Math.ceil(bloque.items.length / 4));
    dibujarKPIs(doc, bloque.items.map((k) => ({ label: k.label, value: textoKpi(k) })), { porFila: 4 });
  }

  // Los desgloses van dentro de "Indicadores históricos" (acumulados, no dependen del período).
  dibujarTablaConTituloPDF(doc, 'Embudo de selección', {
    columnas: [
      { header: 'Etapa', key: 'etapa', width: 250 },
      { header: 'Cantidad', key: 'cantidad', width: 100 },
    ],
    filas: filasEmbudo(stats),
  });

  dibujarTablaConTituloPDF(doc, 'Empresas con más ofertas publicadas', {
    columnas: [
      { header: 'Empresa', key: 'razonSocial', width: 300 },
      { header: 'Ofertas', key: 'totalOfertas', width: 100 },
    ],
    filas: stats.empresas.conMasOfertas,
  });

  dibujarTablaConTituloPDF(doc, 'Ofertas por área', {
    columnas: [
      { header: 'Área', key: 'area', width: 300 },
      { header: 'Cantidad', key: 'cantidad', width: 100 },
    ],
    filas: filasPorArea(stats),
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
