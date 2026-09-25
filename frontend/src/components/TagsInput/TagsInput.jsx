/**
 * TagsInput.jsx — campo de texto separado por comas con vista previa de tags
 * (habilidades / idiomas del perfil). Antes el mismo bloque estaba duplicado
 * en PerfilPage con distintos textos y colores.
 *
 * `tags`: el valor ya parseado a array (la página ya tiene el parser porque
 * también lo usa al guardar). La vista previa se muestra solo si hay texto.
 */
export default function TagsInput({
  name, value, onChange, label, hint, placeholder,
  tags, tagBackground, tagColor,
}) {
  return (
    <div className="form-group">
      <label>
        {label}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
          {hint}
        </span>
      </label>
      <input
        name={name}
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
      />
      {value && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
          {tags.map((t, i) => (
            <span key={i} style={{
              background: tagBackground, color: tagColor,
              borderRadius: '999px', padding: '0.15rem 0.65rem', fontSize: '0.78rem', fontWeight: 600,
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
