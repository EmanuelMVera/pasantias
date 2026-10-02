// Catálogo de acciones y entidades de la auditoría (AdminLogsPage). Vive en un .js
// aparte para que el componente exporte solo el componente
// (react-refresh/only-export-components).
//
// Las claves son EXACTAMENTE los valores del ENUM `activity_logs.accion` del backend
// (backend/src/models/activityLog.model.js): si se agrega uno allá, agregarlo acá para
// que aparezca en el filtro con una etiqueta legible (si falta, la tabla muestra la clave cruda).

// Colores con contraste suficiente (≥4.5:1) como texto sobre su fondo tintado.
const AZUL = '#0073AD';
const VERDE = '#1e8449';
const ROJO = '#a93226';
const NARANJA = '#a04000';
const VIOLETA = '#7d3c98';
const GRIS = '#566573';
const TEAL = '#0e6655';

export const ACCIONES = {
  login:                              { label: 'Inicio de sesión',                 color: AZUL },
  logout:                             { label: 'Cierre de sesión',                 color: GRIS },
  crear_usuario:                      { label: 'Crear usuario',                    color: VERDE },
  editar_usuario:                     { label: 'Editar usuario',                   color: AZUL },
  eliminar_usuario:                   { label: 'Eliminar usuario',                 color: ROJO },
  cambiar_rol:                        { label: 'Cambiar rol',                      color: VIOLETA },
  toggle_usuario:                     { label: 'Suspender / reactivar cuenta',     color: NARANJA },
  aprobar_empresa:                    { label: 'Aprobar empresa',                  color: VERDE },
  rechazar_empresa:                   { label: 'Rechazar empresa',                 color: ROJO },
  aprobar_solicitud_empresa:          { label: 'Aprobar solicitud de empresa',     color: VERDE },
  rechazar_solicitud_empresa:         { label: 'Rechazar solicitud de empresa',    color: ROJO },
  aprobar_solicitud_reclutador:       { label: 'Aprobar solicitud de reclutador',  color: VERDE },
  rechazar_solicitud_reclutador:      { label: 'Rechazar solicitud de reclutador', color: ROJO },
  auto_aprobar_solicitud_reclutador:  { label: 'Alta de reclutador automática',    color: TEAL },
  solicitar_recuperacion_miembro:     { label: 'Solicitar recuperación de miembro', color: NARANJA },
  marcar_empresa_confiable:           { label: 'Marcar empresa confiable',         color: TEAL },
  revocar_confianza_empresa:          { label: 'Revocar confianza de empresa',     color: NARANJA },
  crear_oferta:                       { label: 'Nueva oferta',                     color: AZUL },
  oferta_auto_aprobada:               { label: 'Oferta publicada automáticamente', color: TEAL },
  aprobar_oferta:                     { label: 'Aprobar oferta',                   color: VERDE },
  rechazar_oferta:                    { label: 'Rechazar oferta',                  color: ROJO },
  pausar_oferta:                      { label: 'Pausar oferta',                    color: NARANJA },
  reactivar_oferta:                   { label: 'Reactivar oferta',                 color: VERDE },
  cerrar_oferta:                      { label: 'Cerrar oferta',                    color: GRIS },
  asignar_responsable_oferta:         { label: 'Asignar responsable de oferta',    color: AZUL },
  reasignar_responsable_oferta:       { label: 'Cambiar responsable de oferta',    color: AZUL },
  postular:                           { label: 'Postulación',                      color: TEAL },
  cambiar_estado_postulacion:         { label: 'Estado de postulación',            color: VIOLETA },
  importar_alumnos_csv:               { label: 'Importar alumnos (CSV)',           color: AZUL },
  exportar_logs:                      { label: 'Exportar auditoría',               color: VIOLETA },
  exportar_estadisticas:              { label: 'Exportar estadísticas',            color: VIOLETA },
  sistema:                            { label: 'Sistema',                          color: GRIS },
};

// Opciones del filtro de acción, ordenadas por etiqueta para encontrarlas rápido.
export const OPCIONES_ACCION = Object.entries(ACCIONES)
  .map(([value, { label }]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));

// Valores de `activity_logs.entidad` que registra el backend.
export const ENTIDADES = {
  usuario:              'Usuario',
  empresa:              'Empresa',
  oferta:               'Oferta',
  postulacion:          'Postulación',
  solicitud_empresa:    'Solicitud de empresa',
  solicitud_reclutador: 'Solicitud de reclutador',
  activity_log:         'Auditoría',
  estadisticas:         'Estadísticas',
};

export const OPCIONES_ENTIDAD = Object.entries(ENTIDADES).map(([value, label]) => ({ value, label }));

export const accionInfo = (accion) => ACCIONES[accion] ?? { label: accion, color: GRIS };
export const entidadLabel = (entidad) => ENTIDADES[entidad] ?? entidad;
