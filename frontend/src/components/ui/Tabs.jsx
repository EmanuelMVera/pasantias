/**
 * Tabs.jsx — pestañas accesibles (patrón WAI-ARIA "tabs", activación manual).
 *
 *   <Tabs idPrefix="sol" ariaLabel="Tipo de solicitud" value={tab} onChange={setTab}
 *         tabs={[{ key: 'empresas', label: 'Empresas', count: 3, alerta: true }, ...]} />
 *   <TabPanel idPrefix="sol" tabKey={tab}> ...contenido de la pestaña activa... </TabPanel>
 *
 * - `role="tablist" / "tab" / "tabpanel"`, `aria-selected`, `aria-controls`.
 * - Flechas ← → Home End mueven el foco Y la selección (roving tabindex).
 * - `count` opcional (pendientes); `alerta` lo resalta en naranja (hay algo por atender).
 * - `icon` opcional: nombre de un ícono de `ui/Icon` (decorativo).
 * - `stretch`: las pestañas se reparten el ancho en partes iguales (grilla).
 *   En teléfonos angostos el contador puede bajar de línea, pero el label y el
 *   ícono nunca se cortan y no aparece scroll horizontal.
 */

import { useRef } from 'react';
import Icon from './Icon';
import styles from './Tabs.module.css';

export function TabPanel({ idPrefix, tabKey, children }) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      tabIndex={0}
      className={styles.panel}
    >
      {children}
    </div>
  );
}

export default function Tabs({ tabs, value, onChange, idPrefix = 'tabs', ariaLabel, stretch = false }) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === value);
    let siguiente = null;
    if (e.key === 'ArrowRight') siguiente = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') siguiente = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') siguiente = 0;
    else if (e.key === 'End') siguiente = tabs.length - 1;
    if (siguiente == null) return;
    e.preventDefault();
    const destino = tabs[siguiente].key;
    onChange(destino);
    refs.current[destino]?.focus();
  };

  return (
    <div
      className={`${styles.tabs} ${stretch ? styles.tabsStretch : ''}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const activo = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={activo}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={activo ? 0 : -1}
            className={`${styles.tab} ${activo ? styles.tabActivo : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.icon && <span className={styles.icon}><Icon name={t.icon} size={18} /></span>}
            <span className={styles.label}>{t.label}</span>
            {t.count != null && (
              <span className={`${styles.count} ${t.alerta && t.count > 0 ? styles.countAlerta : ''}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
