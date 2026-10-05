/**
 * EquipoPage.jsx — Equipo de la empresa.
 *
 * Ruta: /empresa/equipo  (`?tab=solicitudes` abre la segunda pestaña)
 * Acceso: SOLO el administrador de empresa (gobierno del equipo). El guard
 * `SoloAdminEmpresa` de App.jsx redirige al reclutador a /empresa, y el
 * backend sigue exigiendo admin_empresa en cada acción de gestión.
 *
 * Estructura:
 *   - Resumen: reclutadores activos · suspendidos · solicitudes pendientes.
 *   - Pestaña Miembros: "Cuenta administradora" (la EMPRESA, con su
 *     responsable como dato secundario) separada de "Reclutadores" (personas).
 *   - Pestaña Solicitudes: historial de altas pedidas (pendiente / aprobada /
 *     rechazada). El badge de la pestaña avisa si hay pendientes.
 *
 * Alta de reclutadores (la lógica de confianza es del backend, acá solo cambia
 * el texto):
 *   - Empresa estándar  → "Solicitar reclutador": la revisa el instituto.
 *   - Empresa confiable → "Agregar reclutador": la cuenta se crea al instante.
 *
 * Suspender / reactivar / quitar / enviar recuperación piden confirmación.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { empresaService } from '../../services/empresa.service';
import { useEmpresa } from '../../hooks/useEmpresa';
import { useToast } from '../../hooks/useToast';
import Avatar from '../../components/Avatar/Avatar';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Tabs, { TabPanel } from '../../components/ui/Tabs';
import StatCard from '../../components/ui/StatCard';
import ActionMenu from '../../components/ui/ActionMenu';
import ConfirmModal from '../../components/ui/ConfirmModal';
import EmptyState from '../../components/ui/EmptyState';
import TableResponsive from '../../components/ui/TableResponsive';
import DataCard from '../../components/ui/DataCard';
import Toast from '../../components/ui/Toast';
import Icon from '../../components/ui/Icon';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import SolicitarReclutadorModal from '../../components/SolicitarReclutadorModal/SolicitarReclutadorModal';
import styles from './EquipoPage.module.css';

const ESTADO_SOLICITUD = {
  pendiente: { label: 'Pendiente', tone: 'orange', icon: 'clock' },
  aprobado:  { label: 'Aprobada',  tone: 'green',  icon: 'checkCircle' },
  rechazado: { label: 'Rechazada', tone: 'red',    icon: 'xCircle' },
};

const formatFecha = (iso) => (iso
  ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
  : 'Nunca');

const nombreDe = (m) => {
  const u = m.usuario ?? {};
  return `${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.email || 'Miembro';
};

function SolicitudBadge({ estado }) {
  const info = ESTADO_SOLICITUD[estado] ?? { label: estado, tone: 'gray', icon: 'info' };
  return (
    <span className={`badge badge-tone-${info.tone}`}>
      <Icon name={info.icon} size={14} strokeWidth={2} />
      {info.label}
    </span>
  );
}

// Textos de cada confirmación (qué pasa y qué se conserva).
const CONFIRMACIONES = {
  suspender: {
    title: 'Suspender cuenta', confirmLabel: 'Suspender cuenta', tone: 'danger',
    texto: 'no va a poder iniciar sesión hasta que reactives su cuenta. Sus datos y lo que ya gestionó se conservan.',
  },
  reactivar: {
    title: 'Reactivar cuenta', confirmLabel: 'Reactivar cuenta', tone: 'ok',
    texto: 'va a recuperar el acceso al sistema como reclutador.',
  },
  quitar: {
    title: 'Quitar del equipo', confirmLabel: 'Quitar del equipo', tone: 'danger',
    texto: 'va a dejar de tener acceso. A diferencia de suspender, para que vuelva vas a tener que pedir su alta de nuevo. Sus datos y las postulaciones que gestionó se conservan.',
  },
  recuperacion: {
    title: 'Enviar recuperación de acceso', confirmLabel: 'Enviar recuperación', tone: 'primary',
    texto: 'va a recibir un email con un link para establecer su propia contraseña. Vos no la vas a ver ni a elegir.',
  },
};

export default function EquipoPage() {
  const { empresa } = useEmpresa();
  const esTabla = useMediaQuery('(min-width: 768px)');
  const { toast, showToast } = useToast(4500);

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'solicitudes' ? 'solicitudes' : 'miembros';
  const setTab = (t) => setSearchParams(t === 'miembros' ? {} : { tab: t }, { replace: true });

  const [equipo,      setEquipo]      = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [modalAlta,   setModalAlta]   = useState(false);
  const [confirmar,   setConfirmar]   = useState(null); // { accion, miembro }
  const [guardando,   setGuardando]   = useState(false);

  const esConfiable = empresa?.nivelConfianza === 'confiable';
  const textoAlta = esConfiable ? 'Agregar reclutador' : 'Solicitar reclutador';

  const cargar = useCallback(async () => {
    try {
      const equipoRes = await empresaService.getEquipo();
      setEquipo(equipoRes.data.data ?? []);
      try {
        const solRes = await empresaService.getMisSolicitudesReclutador();
        setSolicitudes(solRes.data.data ?? []);
      } catch { /* secundario: no bloquea la pantalla */ }
      setError('');
    } catch {
      setError('No se pudo cargar el equipo. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cuentaAdmin   = equipo.find((m) => m.rolInterno === 'admin_empresa');
  const reclutadores  = equipo.filter((m) => m.rolInterno !== 'admin_empresa');
  const activos       = reclutadores.filter((m) => m.activo !== false);
  const suspendidos   = reclutadores.filter((m) => m.activo === false);
  const pendientes    = solicitudes.filter((s) => s.estado === 'pendiente');

  const handleAltaEnviada = (nueva) => {
    const sinEmail = nueva.estado === 'aprobado' && nueva.emailCredencialesEnviado === false;
    showToast(
      nueva.estado !== 'aprobado'
        ? 'Solicitud enviada. El administrador del instituto la revisará pronto.'
        : sinEmail
          ? `${nueva.nombre} ya tiene cuenta, pero no se pudo enviar el email con sus credenciales. Enviale la recuperación de acceso desde su ficha.`
          : `${nueva.nombre} ya puede acceder al sistema: le enviamos las credenciales por email.`,
      sinEmail ? 'error' : 'success',
    );
    cargar(); // empresa confiable: aparece el nuevo miembro; estándar: la solicitud pendiente
    if (nueva.estado !== 'aprobado') setTab('solicitudes');
  };

  const ejecutarConfirmacion = async () => {
    const { accion, miembro } = confirmar;
    const nombre = nombreDe(miembro);
    setGuardando(true);
    try {
      if (accion === 'suspender' || accion === 'reactivar') {
        await empresaService.editarMiembro(miembro.id, { activo: accion === 'reactivar' });
        showToast(`Cuenta de ${nombre} ${accion === 'reactivar' ? 'reactivada' : 'suspendida'}.`, 'success');
      } else if (accion === 'quitar') {
        await empresaService.eliminarMiembro(miembro.id);
        showToast(`${nombre} fue quitado del equipo.`, 'success');
      } else {
        const { data } = await empresaService.enviarRecuperacionMiembro(miembro.id);
        showToast(data.message ?? 'Email de recuperación enviado.', 'success');
      }
      setConfirmar(null);
      await cargar();
    } catch (err) {
      setConfirmar(null);
      showToast(err.response?.data?.message ?? 'No se pudo completar la acción.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const accionesDe = (m) => [
    { key: 'recuperacion', label: 'Enviar recuperación de acceso', onSelect: () => setConfirmar({ accion: 'recuperacion', miembro: m }) },
    m.activo
      ? { key: 'suspender', label: 'Suspender cuenta', onSelect: () => setConfirmar({ accion: 'suspender', miembro: m }) }
      : { key: 'reactivar', label: 'Reactivar cuenta', onSelect: () => setConfirmar({ accion: 'reactivar', miembro: m }) },
    { key: 'quitar', label: 'Quitar del equipo', danger: true, onSelect: () => setConfirmar({ accion: 'quitar', miembro: m }) },
  ];

  const filaReclutador = (m) => (
    <li key={m.id} className={`${styles.miembro} ${m.activo ? '' : styles.miembroSuspendido}`}>
      <Avatar src={m.usuario?.fotoPerfil} nombre={m.usuario?.nombre} apellido={m.usuario?.apellido} size={42} />
      <div className={styles.miembroInfo}>
        <span className={styles.miembroNombre}>{nombreDe(m)}</span>
        <span className={styles.miembroDato}>{m.usuario?.email}</span>
        <span className={styles.miembroDato}>Último acceso: {formatFecha(m.usuario?.ultimoAcceso)}</span>
      </div>
      <div className={styles.miembroEstado}>
        <span className="badge badge-tone-blue">Reclutador</span>
        <span className={`badge badge-tone-${m.activo ? 'green' : 'red'}`}>{m.activo ? 'Activo' : 'Suspendido'}</span>
      </div>
      <ActionMenu label={`Acciones para ${nombreDe(m)}`} items={accionesDe(m)} />
    </li>
  );

  const panelMiembros = (
    <>
      {cuentaAdmin && (
        <Card as="section" titleId="sec-cuenta" title="Cuenta administradora" headingLevel={2} className={styles.bloque}>
          <div className={styles.cuenta}>
            <Avatar src={empresa?.logo || null} nombre={empresa?.razonSocial || cuentaAdmin.usuario?.nombre} apellido="" size={56} />
            <div className={styles.miembroInfo}>
              <span className={styles.cuentaNombre}>{empresa?.razonSocial ?? 'Mi empresa'}</span>
              <span className="badge badge-tone-violet">Administrador de empresa</span>
              <span className={styles.miembroDato}>
                Responsable: <strong>{nombreDe(cuentaAdmin)}</strong>
              </span>
              <span className={styles.miembroDato}>{cuentaAdmin.usuario?.email}</span>
              <span className={styles.miembroDato}>Último acceso: {formatFecha(cuentaAdmin.usuario?.ultimoAcceso)}</span>
            </div>
          </div>
        </Card>
      )}

      <Card
        as="section" titleId="sec-reclutadores" title="Reclutadores" headingLevel={2}
        subtitle="Personas que publican ofertas y gestionan candidatos."
        className={styles.bloque}
      >
        {reclutadores.length === 0 ? (
          <EmptyState iconName="userPlus" title="Todavía no hay reclutadores en el equipo.">
            <button type="button" className="btn-primary" onClick={() => setModalAlta(true)}>{textoAlta}</button>
          </EmptyState>
        ) : (
          <ul className={styles.lista}>
            {[...activos, ...suspendidos].map(filaReclutador)}
          </ul>
        )}
      </Card>
    </>
  );

  const panelSolicitudes = solicitudes.length === 0 ? (
    <EmptyState
      iconName="inbox"
      title="No hay solicitudes de reclutadores."
      hint={esConfiable
        ? 'Tu empresa tiene habilitación institucional: los reclutadores que agregues se dan de alta al instante.'
        : 'Cuando pidas el alta de un reclutador, vas a ver acá su estado.'}
    />
  ) : esTabla ? (
    <TableResponsive minWidth={560}>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Estado</th>
          <th>Fecha</th>
        </tr>
      </thead>
      <tbody>
        {solicitudes.map((s) => (
          <tr key={s.id}>
            <td className="cell-break"><strong>{[s.nombre, s.apellido].filter(Boolean).join(' ')}</strong></td>
            <td className="cell-break">{s.email}</td>
            <td>
              <SolicitudBadge estado={s.estado} />
              {s.estado === 'rechazado' && s.motivoRechazo && <small className={styles.motivo}>{s.motivoRechazo}</small>}
            </td>
            <td className={styles.fecha}>{formatFecha(s.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </TableResponsive>
  ) : (
    <div className={styles.cards}>
      {solicitudes.map((s) => (
        <DataCard
          key={s.id}
          title={[s.nombre, s.apellido].filter(Boolean).join(' ')}
          subtitle={s.email}
          badge={<SolicitudBadge estado={s.estado} />}
          fields={[
            { label: 'Fecha', value: formatFecha(s.createdAt) },
            { label: 'Motivo', value: s.estado === 'rechazado' ? s.motivoRechazo : null },
          ]}
        />
      ))}
    </div>
  );

  const conf = confirmar ? CONFIRMACIONES[confirmar.accion] : null;

  return (
    <div className="page-container">
      <Toast toast={toast} />

      <PageHeader
        title="Equipo"
        subtitle="Gestioná las personas con acceso al espacio de tu empresa."
        actions={(
          <button type="button" className="btn-primary" onClick={() => setModalAlta(true)} id="btn-nuevo-miembro">
            <Icon name="userPlus" size={18} />
            {textoAlta}
          </button>
        )}
      />

      {error && <p className={`error-msg ${styles.error}`} role="alert">{error}</p>}

      {loading ? (
        <div className={styles.skeletonList} aria-hidden="true">
          {[1, 2, 3].map((i) => <div key={i} className={styles.skeletonRow} />)}
        </div>
      ) : !error && (
        <>
          <div className={styles.resumen}>
            <StatCard compact iconName="users" tone="green" label="Reclutadores activos" value={activos.length} />
            <StatCard compact iconName="pause" tone="neutral" label="Suspendidos" value={suspendidos.length} />
            <StatCard compact iconName="clock" tone="orange" label="Solicitudes pendientes" value={pendientes.length} />
          </div>

          <Tabs
            idPrefix="equipo"
            ariaLabel="Secciones del equipo"
            stretch
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'miembros', label: 'Miembros', icon: 'users' },
              { key: 'solicitudes', label: 'Solicitudes', icon: 'inbox', count: pendientes.length || undefined, alerta: true },
            ]}
          />
          <TabPanel idPrefix="equipo" tabKey={tab}>
            {tab === 'miembros' ? panelMiembros : panelSolicitudes}
          </TabPanel>
        </>
      )}

      {modalAlta && (
        <SolicitarReclutadorModal
          onClose={() => setModalAlta(false)}
          onEnviada={handleAltaEnviada}
          esConfiable={esConfiable}
        />
      )}

      {confirmar && (
        <ConfirmModal
          title={conf.title}
          confirmLabel={conf.confirmLabel}
          tone={conf.tone}
          busy={guardando}
          onConfirm={ejecutarConfirmacion}
          onClose={() => setConfirmar(null)}
          confirmId="btn-confirmar-equipo"
        >
          <p>
            <strong>{nombreDe(confirmar.miembro)}</strong> ({confirmar.miembro.usuario?.email}) {conf.texto}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
