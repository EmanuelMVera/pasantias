/**
 * PageHeader.jsx — encabezado de página estándar.
 *
 * Envuelve el patrón `dashboard-header` (globals.css) ya usado en casi todas
 * las páginas de panel (Empresa/Admin/Alumno) para que dejen de repetir la
 * misma estructura de título + subtítulo + acciones a mano. Puramente
 * presentacional — no cambia el CSS global existente.
 *
 *   <PageHeader title="Estadísticas" subtitle="Últimos 30 días" actions={<ExportMenu .../>} />
 */

export default function PageHeader({ title, subtitle, backTo, actions, children }) {
  return (
    <div className="dashboard-header">
      <div>
        {backTo}
        <h1>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-muted)', margin: '0.15rem 0 0' }}>{subtitle}</p>}
        {children}
      </div>
      {actions && <div>{actions}</div>}
    </div>
  );
}
