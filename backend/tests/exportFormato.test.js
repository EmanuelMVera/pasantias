'use strict';

/**
 * exportFormato.test.js — CONTENIDO y formato de los exports de estadísticas
 * (secciones del PDF, hojas/estilos del Excel). Sin base de datos: el servicio de
 * estadísticas se reemplaza por un objeto fijo, así los tests son deterministas y
 * no dependen de lo que haya cargado en la base local.
 */

const ExcelJS = require('exceljs');
const adminEstadisticasService = require('../src/services/adminEstadisticas.service');
const exportService = require('../src/services/export.service');
const { cerrarConexion } = require('./helpers/cleanup');
const { contarPaginasPdf, textoDePdf } = require('./helpers/pdf');

const STATS = {
  periodo: { desde: '2026-03-01T00:00:00.000Z', hasta: '2026-03-31T00:00:00.000Z' },
  usuarios: { totalActivos: 120, alumnos: 90, egresados: 20, altasEnPeriodo: 7 },
  empresas: {
    aprobadas: 14, pendientes: 0, solicitudesPendientes: 3, rechazadas: 1,
    reclutadoresActivos: 22, tiempoPromedioAprobacionDias: 2.5,
    conMasOfertas: [{ empresaId: 1, razonSocial: 'Delta SA', totalOfertas: 9 }],
  },
  ofertas: {
    activas: 30, pausadas: 2, cerradas: 5, rechazadas: 1, pendienteModeracion: 4,
    porArea: { Programación: 12, Logística: 5, 'Redes y Telecomunicaciones': 12 },
  },
  postulaciones: { total: 200, enPeriodo: 35 },
  contrataciones: { total: 39, enPeriodo: 6, tasaContratacion: 19.5 },
  embudo: { enRevision: 200, preseleccionado: 80, entrevista: 50, contratado: 39 },
};

const AZUL = 'FF1E3A5F';
const FILTROS = { periodoDias: 30 };
const AUTOR = { generadoPor: 'Test' };

describe('EXPORT — estadísticas: PDF', () => {
  let spy;
  beforeEach(() => { spy = jest.spyOn(adminEstadisticasService, 'obtenerEstadisticasGenerales').mockResolvedValue(STATS); });
  afterEach(() => spy.mockRestore());
  afterAll(cerrarConexion);

  test('separa Estado actual / Actividad del período / Indicadores históricos', async () => {
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    const texto = textoDePdf(buffer);

    const iEstado = texto.indexOf('Estado actual');
    const iActividad = texto.indexOf('Actividad del período');
    const iHistoricos = texto.indexOf('Indicadores históricos');
    expect(iEstado).toBeGreaterThan(-1);
    expect(iActividad).toBeGreaterThan(iEstado);
    expect(iHistoricos).toBeGreaterThan(iActividad);
  });

  test('el período se rotula en su sección (N días + rango) y NO como filtro global', async () => {
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    const texto = textoDePdf(buffer);

    expect(texto).toMatch(/Actividad del período — 30 días \(/);
    expect(texto).not.toContain('Filtros aplicados');
    expect(texto).not.toContain('período=30');
  });

  test('las métricas del período son solo postulaciones, contrataciones y altas', async () => {
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    const texto = textoDePdf(buffer);
    const actividad = texto.slice(texto.indexOf('Actividad del período'), texto.indexOf('Indicadores históricos'));

    for (const rotulo of ['Postulaciones', 'Contrataciones', 'Altas de alumnos y egresados']) {
      expect(actividad).toContain(rotulo);
    }
    expect(actividad).not.toContain('Tasa de contratación');
    expect(actividad).not.toContain('Tiempo promedio');
  });

  test('incluye la tabla "Ofertas por área" (Área | Cantidad), ordenada por cantidad', async () => {
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    const texto = textoDePdf(buffer);

    const tabla = texto.slice(texto.indexOf('Ofertas por área'));
    expect(tabla).toContain('Área');
    expect(tabla).toContain('Cantidad');
    // Empate (12) resuelto alfabéticamente; luego Logística (5).
    expect(tabla.indexOf('Programación')).toBeLessThan(tabla.indexOf('Redes y Telecomunicaciones'));
    expect(tabla.indexOf('Redes y Telecomunicaciones')).toBeLessThan(tabla.indexOf('Logística'));
  });

  test('muestra "Solicitudes de empresa pendientes" (no "Empresas pendientes") y la tasa como 19.5%', async () => {
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    const texto = textoDePdf(buffer);

    expect(texto).toContain('Solicitudes de empresa pendientes');
    expect(texto).not.toContain('Empresas pendientes');
    expect(texto).toContain('19.5%');
    expect(texto).toContain('2.5 días');
  });

  test('con todos los datos vacíos sigue siendo 1 página (tablas sin filas → "Sin datos")', async () => {
    spy.mockResolvedValue({
      ...STATS,
      empresas: { ...STATS.empresas, conMasOfertas: [], tiempoPromedioAprobacionDias: null },
      ofertas: { ...STATS.ofertas, porArea: {} },
      contrataciones: { total: 0, enPeriodo: 0, tasaContratacion: null },
    });
    const { buffer } = await exportService.generarEstadisticasPDF(FILTROS, AUTOR);
    expect(contarPaginasPdf(buffer)).toBe(1);
    const texto = textoDePdf(buffer);
    expect(texto).toContain('Sin datos para mostrar');
    expect(texto).toContain('Página 1 de 1');
  });
});

describe('EXPORT — estadísticas: Excel', () => {
  let spy;
  let wb;

  beforeAll(async () => {
    spy = jest.spyOn(adminEstadisticasService, 'obtenerEstadisticasGenerales').mockResolvedValue(STATS);
    const { buffer } = await exportService.generarEstadisticasExcel(FILTROS, AUTOR);
    spy.mockRestore();
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
  });
  afterAll(cerrarConexion);

  const filaConTexto = (hoja, texto) => {
    let encontrada = null;
    hoja.eachRow((fila) => { if (fila.getCell(1).value === texto) encontrada = fila; });
    return encontrada;
  };

  test('conserva los nombres de hoja', () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual(
      ['Resumen', 'Datos', 'Embudo de selección', 'Empresas con más ofertas', 'Filtros y metadatos']
    );
  });

  test('Resumen: tres bloques con encabezado azul, separados por una fila vacía', () => {
    const hoja = wb.getWorksheet('Resumen');
    const titulos = ['Estado actual', expect.stringMatching(/^Actividad del período — 30 días/), 'Indicadores históricos'];
    const filas = [];
    hoja.eachRow((fila, n) => {
      const v = fila.getCell(1).value;
      if (v === 'Estado actual' || v === 'Indicadores históricos' || (typeof v === 'string' && v.startsWith('Actividad del período'))) {
        filas.push({ n, v, fill: fila.getCell(1).fill?.fgColor?.argb, valor: fila.getCell(2).value });
      }
    });
    expect(filas.map((f) => f.v)).toEqual(titulos);
    for (const f of filas) {
      expect(f.fill).toBe(AZUL);
      expect(f.valor).toBe('Valor');
      // La fila anterior al encabezado del bloque está vacía (separación visual).
      expect(hoja.getRow(f.n - 1).getCell(1).value).toBeNull();
    }
  });

  test('la tasa de contratación es un NÚMERO (0.195) con formato de porcentaje, no un texto', () => {
    const celda = filaConTexto(wb.getWorksheet('Resumen'), 'Tasa de contratación').getCell(2);
    expect(typeof celda.value).toBe('number');
    expect(celda.value).toBe(0.195);
    expect(celda.numFmt).toBe('0.0%');
  });

  test('el tiempo promedio de aprobación también es numérico', () => {
    const celda = filaConTexto(wb.getWorksheet('Resumen'), 'Tiempo promedio de aprobación de empresas').getCell(2);
    expect(celda.value).toBe(2.5);
  });

  test('las métricas de estado actual usan "Solicitudes de empresa pendientes"', () => {
    const hoja = wb.getWorksheet('Resumen');
    expect(filaConTexto(hoja, 'Solicitudes de empresa pendientes').getCell(2).value).toBe(3);
    expect(filaConTexto(hoja, 'Empresas pendientes')).toBeNull();
  });

  test.each(['Datos', 'Embudo de selección', 'Empresas con más ofertas'])(
    'la hoja "%s" tiene el encabezado azul institucional con texto blanco',
    (nombre) => {
      const celda = wb.getWorksheet(nombre).getRow(1).getCell(1);
      expect(celda.fill.fgColor.argb).toBe(AZUL);
      expect(celda.font.bold).toBe(true);
      expect(celda.font.color.argb).toBe('FFFFFFFF');
    }
  );

  test('"Datos" es Ofertas por área, ordenado por cantidad', () => {
    const hoja = wb.getWorksheet('Datos');
    expect(hoja.getRow(1).values.slice(1)).toEqual(['Área', 'Cantidad de ofertas']);
    expect(hoja.getRow(2).values.slice(1)).toEqual(['Programación', 12]);
    expect(hoja.getRow(4).values.slice(1)).toEqual(['Logística', 5]);
  });

  test('"Filtros y metadatos": "Áreas incluidas" en lugar de "Filas exportadas", con ajuste de texto', () => {
    const hoja = wb.getWorksheet('Filtros y metadatos');
    expect(filaConTexto(hoja, 'Filas exportadas')).toBeNull();
    const fila = filaConTexto(hoja, 'Áreas incluidas');
    expect(fila.getCell(2).value).toBe(3);
    expect(filaConTexto(hoja, 'Filtros aplicados').getCell(2).alignment.wrapText).toBe(true);
  });

  test('la nota de confidencialidad ocupa el ancho de la hoja con ajuste de texto', () => {
    const hoja = wb.getWorksheet('Resumen');
    let nota = null;
    hoja.eachRow((fila) => { if (String(fila.getCell(1).value).startsWith('Documento de uso interno')) nota = fila; });
    expect(nota).not.toBeNull();
    expect(nota.getCell(1).alignment.wrapText).toBe(true);
    expect(hoja.model.merges.some((m) => m.startsWith(`A${nota.number}`))).toBe(true);
  });
});
