/**
 * TelefonoArgentinaInput.jsx — teléfono argentino separado en código de área + número.
 *
 *   <TelefonoArgentinaInput id="telefono" label="Teléfono institucional"
 *     value={form.telefono} onChange={(telefono) => setForm({ ...form, telefono })}
 *     error={errores.telefono} labelClassName={styles.label} inputClassName={styles.input} />
 *
 *      Teléfono institucional
 *      +54 | [ 11 ]  [ 44445555 ]
 *      Sin 0 y sin 15. Ej.: 11 4444-5555.
 *
 * - `value` puede llegar canónico ("+541144445555"), legacy ("11-4444-5555") o
 *   vacío: se parte en código de área + número para editar. Mientras se edita,
 *   `onChange` recibe "+54 <área> <número>"; el backend lo guarda canónico
 *   (+54 + 10 dígitos). Para mandar el canónico directo: normalizarTelefonoAR().
 * - Código de área: solo dígitos, se le saca el 0 inicial, máx. 4.
 * - Número: solo dígitos. Si se pega un teléfono completo ("11 4444-5555",
 *   "+54 9 11 …") se reparte solo entre los dos campos.
 * - `id` es el del input del número (el que suele apuntar un <label htmlFor>);
 *   el código de área es `${id}-area`.
 * - Error junto al campo al salir del grupo; `error` externo tiene prioridad.
 * Solo números argentinos: si hace falta exterior, se amplía este componente.
 */

import { useState } from 'react';
import { normalizarTelefonoAR, partirTelefonoAR, soloDigitos, unirTelefonoAR } from '../../utils/formatos';
import { errorTelefonoAR } from '../../utils/validacion';
import styles from './CampoFormato.module.css';

export default function TelefonoArgentinaInput({
  id, label, value, onChange, error, required = false, disabled = false,
  hint = 'Sin 0 y sin 15. Ej.: 11 4444-5555.',
  labelClassName = '', inputClassName = '',
}) {
  const [tocado, setTocado] = useState(false);
  const { codigoArea, numero } = partirTelefonoAR(value);

  const emitir = (area, num) => onChange(unirTelefonoAR(area, num));

  const handleArea = (e) => {
    emitir(soloDigitos(e.target.value).replace(/^0+/, '').slice(0, 4), numero);
  };

  const handleNumero = (e) => {
    const crudo = e.target.value;
    // Pegado/tipeo de un número completo: repartirlo entre los dos campos.
    // Solo si el área está vacía o si lo pegado trae formato (espacios, +, guiones…),
    // para no pisar un código de área que el usuario ya escribió.
    const completo = normalizarTelefonoAR(crudo);
    if (completo && soloDigitos(crudo).length >= 10 && (!codigoArea || /[\s()+-]/.test(crudo))) {
      const partes = partirTelefonoAR(completo);
      emitir(partes.codigoArea, partes.numero);
      return;
    }
    emitir(codigoArea, soloDigitos(crudo).slice(0, 10));
  };

  const handleBlurGrupo = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setTocado(true);
  };

  const mensaje = error || (tocado ? errorTelefonoAR(value) : '');
  const labelId = `${id}-label`;
  const ayudaId = `${id}-ayuda`;
  const errorId = `${id}-error`;
  const describe = [ayudaId, mensaje && errorId].filter(Boolean).join(' ');

  return (
    <div className={styles.campo}>
      {label && (
        <label id={labelId} htmlFor={id} className={labelClassName}>
          {label}{required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      <div
        className={styles.telefono}
        role="group"
        aria-labelledby={label ? labelId : undefined}
        onBlur={handleBlurGrupo}
      >
        <span className={styles.prefijo} aria-label="Código de país Argentina">+54</span>
        <input
          id={`${id}-area`}
          type="text"
          inputMode="numeric"
          autoComplete="tel-area-code"
          className={`${styles.area} ${inputClassName} ${mensaje ? styles.invalido : ''}`.trim()}
          placeholder="11"
          aria-label="Código de área, sin 0"
          value={codigoArea}
          onChange={handleArea}
          disabled={disabled}
          aria-invalid={mensaje ? true : undefined}
          aria-describedby={describe}
        />
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="tel-local"
          className={`${styles.numero} ${inputClassName} ${mensaje ? styles.invalido : ''}`.trim()}
          placeholder="44445555"
          aria-label="Número, sin 15"
          value={numero}
          onChange={handleNumero}
          disabled={disabled}
          required={required}
          aria-invalid={mensaje ? true : undefined}
          aria-describedby={describe}
        />
      </div>
      <p id={ayudaId} className={styles.ayuda}>{hint}</p>
      {mensaje && <p id={errorId} className={styles.error} role="alert">{mensaje}</p>}
    </div>
  );
}
