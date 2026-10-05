/**
 * CuitInput.jsx — campo de CUIT con formato guiado.
 *
 *   <CuitInput id="cuit" value={form.cuit} onChange={(cuit) => setForm({ ...form, cuit })}
 *              error={errores.cuit} required className={styles.input} />
 *
 * - `value` / `onChange` trabajan con el CANÓNICO: hasta 11 dígitos, sin guiones
 *   ("30999999979"). El usuario ve "30-99999997-9": los guiones los pone el
 *   sistema y no cuentan para el máximo.
 * - Escribir, pegar ("30 99999997 9", "30-99999997-9", "30999999979") o borrar
 *   funciona normal; las letras se descartan. El cursor no salta al formatear.
 * - Error junto al campo: al completar los 11 dígitos o al salir del campo
 *   ("El CUIT debe tener 11 dígitos." / "El dígito verificador del CUIT no es
 *   válido."), nunca mientras se escriben los primeros números. `error` (por
 *   ejemplo el de un submit) tiene prioridad.
 * - El backend vuelve a validar: la máscara no protege la API.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { formatearCuit, normalizarCuit, soloDigitos } from '../../utils/formatos';
import { errorCuit } from '../../utils/validacion';
import styles from './CampoFormato.module.css';

export default function CuitInput({
  id, value, onChange, error, required = false, className = '', describedBy, ...rest
}) {
  const [tocado, setTocado] = useState(false);
  const inputRef = useRef(null);
  const caretRef = useRef(null); // cantidad de dígitos a la izquierda del cursor

  const digitos = normalizarCuit(value);
  const visible = formatearCuit(digitos);

  // Después de reformatear, devolver el cursor al mismo dígito.
  useLayoutEffect(() => {
    const n = caretRef.current;
    if (n == null || !inputRef.current) return;
    caretRef.current = null;
    let pos = 0;
    for (let vistos = 0; pos < visible.length && vistos < n; pos++) {
      if (/\d/.test(visible[pos])) vistos++;
    }
    inputRef.current.setSelectionRange(pos, pos);
  }, [visible]);

  const handleChange = (e) => {
    const crudo = e.target.value;
    const cursor = e.target.selectionStart ?? crudo.length;
    let nuevos = normalizarCuit(crudo);
    let antesDelCursor = soloDigitos(crudo.slice(0, cursor)).length;
    // Borrar justo después de un guion: el guion vuelve a aparecer solo, así
    // que se borra el dígito anterior (si no, la tecla "no haría nada").
    if (nuevos === digitos && crudo.length < visible.length && antesDelCursor > 0) {
      nuevos = digitos.slice(0, antesDelCursor - 1) + digitos.slice(antesDelCursor);
      antesDelCursor -= 1;
    }
    caretRef.current = antesDelCursor;
    onChange(nuevos);
  };

  const propio = tocado || digitos.length === 11 ? errorCuit(digitos) : '';
  const mensaje = error || propio;
  const errorId = `${id}-error`;
  const describe = [describedBy, mensaje && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="30-12345678-9"
        value={visible}
        onChange={handleChange}
        onBlur={() => setTocado(true)}
        required={required}
        aria-invalid={mensaje ? true : undefined}
        aria-describedby={describe}
        className={`${className} ${mensaje ? styles.invalido : ''}`.trim()}
        {...rest}
      />
      {mensaje && <p id={errorId} className={styles.error} role="alert">{mensaje}</p>}
    </>
  );
}
