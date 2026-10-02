/**
 * ActionMenu.jsx — menú "⋯" de acciones secundarias de una fila.
 *
 *   <ActionMenu
 *     label="Más acciones para «Oferta X»"
 *     items={[{ key: 'pausar', label: 'Pausar', onSelect: () => ... }, ...]}
 *   />
 *
 * - Botón con `aria-haspopup="menu"` / `aria-expanded`; el menú tiene `role="menu"`
 *   e ítems `role="menuitem"`. Flechas ↑↓, Home/End, Escape (devuelve el foco al
 *   botón) y click afuera lo cierran.
 * - Se dibuja en un portal con `position: fixed` calculada desde el botón al abrir:
 *   así no lo recorta el `overflow` del contenedor de la tabla.
 * - Se cierra si la página hace scroll o cambia de tamaño (la posición ya no sería válida).
 * - Un ítem con `separatorBefore: true` dibuja una línea divisoria arriba suyo
 *   (para separar grupos de acciones).
 * - Si `items` está vacío no renderiza nada.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import styles from './ActionMenu.module.css';

const ANCHO_MENU = 190;
const ALTO_ITEM = 42;
const MARGEN = 8;
const ALTO_SEPARADOR = 9;

export default function ActionMenu({ items, label = 'Más acciones', disabled = false }) {
  const [pos, setPos] = useState(null); // null = cerrado
  const botonRef = useRef(null);
  const menuRef = useRef(null);
  const abierto = pos !== null;

  const cerrar = useCallback((devolverFoco = false) => {
    setPos(null);
    if (devolverFoco) botonRef.current?.focus();
  }, []);

  const alternar = (e) => {
    e.stopPropagation();
    if (abierto) { cerrar(); return; }
    const r = botonRef.current.getBoundingClientRect();
    const alto = items.length * ALTO_ITEM + 14
      + items.filter((it) => it.separatorBefore).length * ALTO_SEPARADOR;
    const left = Math.min(Math.max(MARGEN, r.right - ANCHO_MENU), window.innerWidth - ANCHO_MENU - MARGEN);
    const entraAbajo = r.bottom + 4 + alto <= window.innerHeight - MARGEN;
    setPos({ left, top: entraAbajo ? r.bottom + 4 : Math.max(MARGEN, r.top - 4 - alto) });
  };

  useEffect(() => {
    if (!abierto) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });

    const onMouseDown = (e) => {
      if (menuRef.current?.contains(e.target) || botonRef.current?.contains(e.target)) return;
      cerrar();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(true); }
    };
    const onScrollOResize = () => cerrar();

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScrollOResize, true);
    window.addEventListener('resize', onScrollOResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScrollOResize, true);
      window.removeEventListener('resize', onScrollOResize);
    };
  }, [abierto, cerrar]);

  if (!items || items.length === 0) return null;

  const onMenuKeyDown = (e) => {
    const opciones = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const i = opciones.indexOf(document.activeElement);
    let destino = null;
    if (e.key === 'ArrowDown') destino = (i + 1) % opciones.length;
    else if (e.key === 'ArrowUp') destino = (i - 1 + opciones.length) % opciones.length;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = opciones.length - 1;
    else if (e.key === 'Tab') { cerrar(); return; }
    if (destino == null) return;
    e.preventDefault();
    opciones[destino].focus();
  };

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={alternar}
      >
        <Icon name="dots" size={18} />
      </button>

      {abierto && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={styles.menu}
          style={{ left: pos.left, top: pos.top, width: ANCHO_MENU }}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`${styles.item} ${it.danger ? styles.itemDanger : ''} ${it.separatorBefore ? styles.itemSeparado : ''}`}
              onClick={() => { cerrar(true); it.onSelect(); }}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
