import styles from './Composer.module.css';

/**
 * Barra de envío de mensajes + aviso de conversación en solo lectura (el aviso
 * y la barra están siempre juntos y ambos dependen de `soloLectura`).
 * El estado del borrador y el envío viven en useConversacion.
 */
export default function Composer({
  inputRef,
  valor,
  onChange,
  onSubmit,
  enviando,
  soloLectura,
  motivoSoloLectura,
}) {
  return (
    <>
      {soloLectura && (
        <div className={styles.avisoLectura}>
          🔒 {motivoSoloLectura || 'Esta conversación pertenece a un proceso de selección finalizado.'}
        </div>
      )}

      {/* Input de envío */}
      <form className={styles.inputBar} onSubmit={onSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={soloLectura ? 'Esta conversación es de solo lectura' : 'Escribí un mensaje...'}
          disabled={enviando || soloLectura}
          maxLength={2000}
          autoComplete="off"
        />
        <button
          type="submit"
          className={styles.sendBtn}
          disabled={enviando || soloLectura || !valor.trim()}
          aria-label="Enviar mensaje"
        >
          {enviando ? '…' : '➤'}
        </button>
      </form>
    </>
  );
}
