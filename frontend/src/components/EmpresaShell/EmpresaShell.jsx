/**
 * EmpresaShell.jsx — layout autenticado del ADMINISTRADOR DE EMPRESA.
 *
 * Usuario global `empresa` con rolInterno `admin_empresa`. Usa el mismo shell
 * genérico que el admin del sistema (components/AppShell) con sus propias
 * secciones: Resumen, Ofertas, Candidatos, Equipo y Mi empresa.
 *
 * La cuenta representa a la EMPRESA: la cabecera de la sidebar muestra el logo
 * (o las iniciales de la razón social) y la razón social; la persona
 * responsable aparece como dato secundario en el menú de usuario.
 *
 * La sidebar no muestra el nivel de confianza de la empresa: es un dato
 * administrativo secundario que vive, con su explicación, en Mi empresa →
 * Datos institucionales.
 *
 * El reclutador NO usa este shell (sigue con el Navbar): su experiencia es
 * operativa, no de gobierno. Ver `Chrome` en App.jsx.
 */

import { useLocation } from 'react-router-dom';
import AppShell from '../AppShell/AppShell';
import Avatar from '../Avatar/Avatar';
import { useEmpresa } from '../../hooks/useEmpresa';
import { EMPRESA_LINKS, EMPRESA_MENU_USUARIO, seccionEmpresa } from './empresaNav';
import styles from './EmpresaShell.module.css';

export default function EmpresaShell({ children }) {
  const { pathname } = useLocation();
  const { empresa } = useEmpresa();

  const razonSocial = empresa?.razonSocial || 'Mi empresa';

  const identidad = (
    <div className={styles.identidad} title={razonSocial}>
      <Avatar
        src={empresa?.logo || null}
        nombre={razonSocial}
        apellido=""
        size={40}
        className={styles.logo}
      />
      <div className={styles.texto}>
        <span className={styles.razonSocial}>{razonSocial}</span>
        <span className={styles.rol}>Administrador de empresa</span>
      </div>
    </div>
  );

  return (
    <AppShell
      links={EMPRESA_LINKS}
      crumbRoot="Empresa"
      seccion={seccionEmpresa(pathname)}
      incluirChat
      sidebarHeader={identidad}
      userMenuLinks={EMPRESA_MENU_USUARIO}
    >
      {children}
    </AppShell>
  );
}
