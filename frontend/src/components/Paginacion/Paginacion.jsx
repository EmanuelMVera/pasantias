/**
 * Paginacion.jsx — Controles de paginación reutilizables (SCALE-03).
 *
 * Consume el objeto `pagination` del contrato común del backend:
 *   { page, limit, total, totalPages }
 *
 * No se renderiza si hay una sola página (o ninguna).
 *
 * Uso:
 *   <Paginacion pagination={pagination} onPageChange={(p) => cargar(p)} />
 */

import styles from './Paginacion.module.css';

export default function Paginacion({ pagination, onPageChange }) {
  if (!pagination) return null;
  const { page, limit, total, totalPages } = pagination;
  if (totalPages <= 1) return null;

  const desde = total === 0 ? 0 : (page - 1) * limit + 1;
  const hasta = Math.min(page * limit, total);

  return (
    <div className={styles.paginacion}>
      <button
        type="button"
        className={styles.btn}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ← Anterior
      </button>

      <span className={styles.info}>
        Página <strong>{page}</strong> de <strong>{totalPages}</strong>
        {' '}({desde}–{hasta} de {total})
      </span>

      <button
        type="button"
        className={styles.btn}
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Siguiente →
      </button>
    </div>
  );
}
