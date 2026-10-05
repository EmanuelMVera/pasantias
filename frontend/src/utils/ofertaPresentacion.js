/**
 * ofertaPresentacion.js — textos de una oferta tal como los ve el alumno/egresado
 * (explorador, detalle, inicio y Mis postulaciones). Solo presentación: los
 * valores vienen del backend tal cual.
 */

export const MODALIDAD_LABEL = {
  presencial: 'Presencial',
  remoto: 'Remoto',
  hibrido: 'Híbrido',
};

export const TIPO_PUESTO = {
  pasante: { label: 'Pasante', tone: 'teal', desc: 'Rol educativo, sin experiencia previa requerida.' },
  trainee: { label: 'Trainee', tone: 'green', desc: 'Incorporación con acompañamiento y mentoría.' },
  junior: { label: 'Junior', tone: 'violet', desc: 'Requiere habilidades comprobables o experiencia inicial.' },
};

export const modalidadLabel = (m) => MODALIDAD_LABEL[m] ?? m;

/** Badge del tipo de puesto; las ofertas legacy sin tipoPuesto usan nivelExperiencia. */
export function puestoBadge(oferta) {
  if (oferta?.tipoPuesto) {
    const t = TIPO_PUESTO[oferta.tipoPuesto];
    return { label: t?.label ?? oferta.tipoPuesto, tone: t?.tone ?? 'gray' };
  }
  if (oferta?.nivelExperiencia) {
    const txt = oferta.nivelExperiencia.replace(/_/g, ' ');
    return { label: txt.charAt(0).toUpperCase() + txt.slice(1), tone: 'gray' };
  }
  return null;
}

export function formatFecha(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** true si la fecha límite ya pasó (el backend rechaza con OFERTA_VENCIDA). */
export function plazoVencido(oferta) {
  return Boolean(oferta?.fechaLimite) && new Date() > new Date(oferta.fechaLimite);
}
