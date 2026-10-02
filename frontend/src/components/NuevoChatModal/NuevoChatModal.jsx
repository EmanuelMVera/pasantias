import { useState, useEffect, useRef } from 'react';
import { mensajeService } from '../../services/chat.service';
import { displayNombre, displayAvatarProps } from '../../utils/chatDisplay';
import Avatar from '../Avatar/Avatar';
import Modal from '../Modal/Modal';
import styles from './NuevoChatModal.module.css';

/** Etiqueta de rol para el modal de búsqueda */
const ROL_LABEL = {
  alumno:   '🎓 Alumno',
  egresado: '🏅 Egresado',
  empresa:  '🏢 Empresa',
  admin:    '⚙️ Admin',
};

/**
 * Modal para iniciar un nuevo chat buscando un usuario.
 */
// `soloEquipo`: el administrador de empresa solo puede escribirle a su equipo
// (la restricción real es del backend, GET /chat/usuarios); acá se ajustan los
// textos para que la búsqueda no parezca global.
export default function NuevoChatModal({ onClose, onSeleccionar, soloEquipo = false }) {
  const [query,       setQuery]       = useState('');
  const [resultados,  setResultados]  = useState([]);
  const [buscando,    setBuscando]    = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const buscar = (texto) => {
    setQuery(texto);
    setSinResultados(false);
    clearTimeout(debounceRef.current);

    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const { data } = await mensajeService.buscarUsuarios(texto.trim());
        const lista = data.data ?? [];
        setResultados(lista);
        setSinResultados(lista.length === 0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
  };

  return (
    <Modal
      title={soloEquipo ? 'Nuevo mensaje al equipo' : '✏️ Nuevo mensaje'}
      onClose={onClose}
      style={{ display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}
    >

        <div className={styles.modalSearch}>
          <input
            ref={inputRef}
            type="text"
            placeholder={soloEquipo ? 'Buscar a alguien de tu equipo…' : 'Buscar por nombre, apellido o email...'}
            value={query}
            onChange={(e) => buscar(e.target.value)}
            className={styles.modalInput}
          />
        </div>

        <div className={styles.modalResultados}>
          {buscando ? (
            <p className={styles.modalEstado}>Buscando...</p>
          ) : sinResultados ? (
            <p className={styles.modalEstado}>
              {soloEquipo
                ? `No hay miembros de tu equipo que coincidan con "${query}". Solo podés escribirle a tu equipo.`
                : `No se encontraron usuarios con "${query}".`}
            </p>
          ) : resultados.length === 0 && query.length >= 2 ? (
            <p className={styles.modalEstado}>Ingresá un nombre, apellido o email.</p>
          ) : query.length < 2 ? (
            <p className={styles.modalEstado}>Escribí al menos 2 caracteres para buscar.</p>
          ) : null}

          {resultados.map((u) => (
            <div
              key={u.id}
              className={styles.modalResultadoItem}
              onClick={() => onSeleccionar(u)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSeleccionar(u)}
            >
              <Avatar {...displayAvatarProps(u)} size={40} />
              <div className={styles.modalResultadoInfo}>
                <strong>{displayNombre(u)}</strong>
                <span>{u.email}</span>
                <span className={styles.modalRolBadge}>{ROL_LABEL[u.rol] ?? u.rol}</span>
              </div>
            </div>
          ))}
        </div>
    </Modal>
  );
}
