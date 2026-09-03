/**
 * CrearOfertaPage.jsx — Formulario para publicar una nueva oferta laboral.
 *
 * Campos de empresa/puesto:
 *   titulo, descripcion, requisitos, area, modalidad, modalidadExtendida,
 *   ciudad, cantidadVacantes, remuneracion, salario, beneficios,
 *   fechaPublicacion, fechaLimite
 *
 * Campos normalizados (Etapa 4 — reemplazan nivelExperiencia en el UI):
 *   tipoPuesto          → pasante | trainee | junior  (requerido)
 *   requiereExperiencia → boolean
 *   experienciaDetalle  → texto libre (visible solo si requiereExperiencia)
 *   carrerasDestinatarias → array de carreras del instituto
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ofertaService } from '../../services/api';
import styles from './CrearOfertaPage.module.css';

// Carreras del instituto (lista canónica de catalogos.json)
const CARRERAS_INSTITUTO = [
  'Tecnicatura Superior en Programación',
  'Tecnicatura en Redes y Telecomunicaciones',
  'Tecnicatura en Ciberseguridad',
  'Tecnicatura en Electrónica',
  'Tecnicatura en Automatización y Control',
  'Tecnicatura en Mecánica',
  'Tecnicatura en Administración',
  'Tecnicatura en Contabilidad',
  'Tecnicatura en Logística',
  'Tecnicatura en Marketing',
  'Tecnicatura en Diseño Industrial',
];

const TIPO_PUESTO_CONFIG = {
  pasante: {
    label:    'Pasante',
    emoji:    '🎓',
    desc:     'Rol educativo. Sin requerimiento de experiencia laboral previa.',
    forzarSinExp: true,
  },
  trainee: {
    label:    'Trainee',
    emoji:    '🌱',
    desc:     'Incorporación con acompañamiento. Puede valorarse experiencia en proyectos académicos.',
    forzarSinExp: false,
  },
  junior: {
    label:    'Junior',
    emoji:    '💼',
    desc:     'Requiere habilidades comprobables o experiencia inicial.',
    forzarSinExp: false,
  },
};

export default function CrearOfertaPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    titulo:             '',
    descripcion:        '',
    requisitos:         '',
    area:               '',
    modalidad:          'presencial',
    modalidadExtendida: 'tiempo_completo',
    ciudad:             '',
    cantidadVacantes:   1,
    remuneracion:       '',
    salario:            '',
    beneficios:         '',
    fechaPublicacion:   '',
    fechaLimite:        '',
    // Campos normalizados (Etapa 4)
    tipoPuesto:          'pasante',
    requiereExperiencia: false,
    experienciaDetalle:  '',
  });

  const [carrerasDestinatarias, setCarrerasDestinatarias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
    }));
  };

  const handleTipoPuesto = (tipo) => {
    setForm(prev => ({
      ...prev,
      tipoPuesto: tipo,
      // Pasante: forzar sin experiencia. Junior: experiencia por defecto.
      requiereExperiencia: tipo === 'junior' ? true : (tipo === 'pasante' ? false : prev.requiereExperiencia),
      // Si pasamos a no-requiere, limpiar el detalle
      experienciaDetalle: tipo === 'pasante' ? '' : prev.experienciaDetalle,
    }));
  };

  const handleCarreraToggle = (carrera) => {
    setCarrerasDestinatarias(prev =>
      prev.includes(carrera) ? prev.filter(c => c !== carrera) : [...prev, carrera]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.tipoPuesto) {
      setError('Por favor seleccioná el tipo de puesto (Pasante, Trainee o Junior).');
      return;
    }

    setLoading(true);
    try {
      await ofertaService.create({ ...form, carrerasDestinatarias });
      navigate('/empresa');
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear la oferta.');
    } finally {
      setLoading(false);
    }
  };

  const tipoCfg = TIPO_PUESTO_CONFIG[form.tipoPuesto] ?? {};

  return (
    <div className="page-container">
      <h1>Publicar Nueva Oferta</h1>

      <form onSubmit={handleSubmit} className="oferta-form">

        {/* ── Información principal ─────────────────────────────────────── */}
        <div className="form-group">
          <label htmlFor="titulo">Título del puesto *</label>
          <input
            id="titulo" name="titulo" value={form.titulo} onChange={handleChange} required
            placeholder="Ej: Pasantía en Desarrollo Web"
          />
        </div>

        <div className="form-group">
          <label htmlFor="descripcion">Descripción *</label>
          <textarea
            id="descripcion" name="descripcion" value={form.descripcion} onChange={handleChange} required
            rows={5} placeholder="Describí las responsabilidades y el contexto del puesto..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="requisitos">Requisitos</label>
          <textarea
            id="requisitos" name="requisitos" value={form.requisitos} onChange={handleChange}
            rows={3} placeholder="Ej: Conocimientos básicos en React y Node.js..."
          />
        </div>

        {/* ── Tipo de puesto ────────────────────────────────────────────── */}
        <div className="form-group">
          <span className="form-group-label">Tipo de puesto *</span>
          <div className={styles.tipoGrid}>
            {Object.entries(TIPO_PUESTO_CONFIG).map(([value, cfg]) => (
              <label
                key={value}
                className={`${styles.tipoCard} ${form.tipoPuesto === value ? styles.tipoCardActiva : ''}`}
              >
                <input
                  type="radio" name="tipoPuesto" value={value}
                  checked={form.tipoPuesto === value}
                  onChange={() => handleTipoPuesto(value)}
                />
                <div>
                  <strong className={styles.tipoNombre}>
                    {cfg.emoji} {cfg.label}
                  </strong>
                  <p className={styles.tipoDesc}>{cfg.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Experiencia ────────────────────────────────────────────────── */}
        <div className="form-group">
          <label className={`${styles.checkLabel} ${tipoCfg.forzarSinExp ? styles.checkLabelDisabled : ''}`}>
            <input
              type="checkbox"
              name="requiereExperiencia"
              checked={form.requiereExperiencia}
              onChange={handleChange}
              disabled={tipoCfg.forzarSinExp}
            />
            Requiere experiencia previa
            {tipoCfg.forzarSinExp && (
              <span className={styles.hint}>(no aplica para pasantes)</span>
            )}
          </label>
        </div>

        {form.requiereExperiencia && (
          <div className="form-group">
            <label htmlFor="experienciaDetalle">Detalle de experiencia requerida</label>
            <textarea
              id="experienciaDetalle" name="experienciaDetalle" value={form.experienciaDetalle} onChange={handleChange}
              rows={2} placeholder="Ej: Proyectos académicos comprobables o 6 meses de experiencia en área similar"
            />
          </div>
        )}

        {/* ── Área + Modalidad ──────────────────────────────────────────── */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="area">Área</label>
            <input
              id="area" name="area" value={form.area} onChange={handleChange}
              placeholder="Ej: Programación, Marketing..."
            />
          </div>
          <div className="form-group">
            <label htmlFor="modalidad">Modalidad de trabajo</label>
            <select id="modalidad" name="modalidad" value={form.modalidad} onChange={handleChange}>
              <option value="presencial">Presencial</option>
              <option value="remoto">Remoto</option>
              <option value="hibrido">Híbrido</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="modalidadExtendida">Tipo de jornada</label>
            <select id="modalidadExtendida" name="modalidadExtendida" value={form.modalidadExtendida} onChange={handleChange}>
              <option value="tiempo_completo">Tiempo completo</option>
              <option value="medio_tiempo">Medio tiempo</option>
              <option value="pasantia">Pasantía</option>
              <option value="freelance">Freelance / Por proyecto</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ciudad">Ciudad</label>
            <input
              id="ciudad" name="ciudad" value={form.ciudad} onChange={handleChange}
              placeholder="Ej: Avellaneda"
            />
          </div>
        </div>

        {/* ── Vacantes + Remuneración ───────────────────────────────────── */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="cantidadVacantes">Cantidad de vacantes</label>
            <input
              id="cantidadVacantes" type="number" name="cantidadVacantes" value={form.cantidadVacantes}
              onChange={handleChange} min={1} max={999}
            />
          </div>
          <div className="form-group">
            <label htmlFor="remuneracion">Remuneración (visible)</label>
            <input
              id="remuneracion" name="remuneracion" value={form.remuneracion} onChange={handleChange}
              placeholder="Ej: A convenir / $200.000"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="salario">Salario estimado (interno)</label>
            <input
              id="salario" name="salario" value={form.salario} onChange={handleChange}
              placeholder="Ej: 150000"
            />
          </div>
          <div className="form-group">
            <label htmlFor="beneficios">Beneficios</label>
            <input
              id="beneficios" name="beneficios" value={form.beneficios} onChange={handleChange}
              placeholder="Ej: Capacitaciones, comedor, certificado"
            />
          </div>
        </div>

        {/* ── Fechas ────────────────────────────────────────────────────── */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="fechaPublicacion">Fecha de publicación</label>
            <input id="fechaPublicacion" type="date" name="fechaPublicacion" value={form.fechaPublicacion} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="fechaLimite">Fecha límite de postulación</label>
            <input id="fechaLimite" type="date" name="fechaLimite" value={form.fechaLimite} onChange={handleChange} />
          </div>
        </div>

        {/* ── Carreras destinatarias ────────────────────────────────────── */}
        <div className="form-group">
          <span className="form-group-label">
            Carreras destinatarias
            <span className={styles.labelHint}>
              (opcional — seleccioná las carreras a las que está orientada la oferta)
            </span>
          </span>
          <div className={styles.chips}>
            {CARRERAS_INSTITUTO.map(carrera => {
              const activa = carrerasDestinatarias.includes(carrera);
              return (
                <label
                  key={carrera}
                  className={`${styles.chip} ${activa ? styles.chipActiva : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={activa}
                    onChange={() => handleCarreraToggle(carrera)}
                  />
                  {activa ? '✓ ' : ''}{carrera}
                </label>
              );
            })}
          </div>
        </div>

        {/* ── Error + Submit ────────────────────────────────────────────── */}
        {error && <p className="error-msg">{error}</p>}

        <div className={styles.acciones}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Publicando...' : '✓ Publicar Oferta'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/empresa')}>
            Cancelar
          </button>
        </div>

      </form>
    </div>
  );
}
