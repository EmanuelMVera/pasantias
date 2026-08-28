/**
 * passwordStrength.js — Fuente única de cálculo de fortaleza de contraseña (FE-04).
 *
 * Antes: ResetPasswordPage medía fortaleza solo por longitud (3 niveles) y
 * SeguridadPage por longitud + mayúscula/número (4 niveles) — la misma
 * contraseña podía verse "Aceptable" en una pantalla y "Media" en la otra.
 *
 * Política real de backend (auth.validator.js::validateCambiarPassword,
 * auth.controller.js::resetPassword, empresaEquipo.service.js): el único
 * requisito duro es longitud >= 6. No hay regla de mayúscula/número/carácter
 * especial en el servidor — este módulo NO inventa un requisito de submit
 * que el backend no exige; el score de abajo es puramente indicativo/UX
 * para ayudar a elegir una mejor contraseña, no un gate adicional.
 */

const LONGITUD_MINIMA = 6; // igual que el backend — no cambiar sin justificar ahí también
const LONGITUD_RECOMENDADA = 10;

const NIVELES = {
  1: { label: 'Muy débil', color: '#dc2626' },
  2: { label: 'Débil', color: '#ea580c' },
  3: { label: 'Media', color: '#ca8a04' },
  4: { label: 'Fuerte', color: '#16a34a' },
};

/**
 * Calcula la fortaleza de una contraseña.
 * @returns {null|{score:number, nivel:1|2|3|4, label:string, color:string, cumple:object}}
 *   null cuando `pwd` está vacía (para que la pantalla no muestre indicador).
 */
export function calcularFortalezaPassword(pwd) {
  if (!pwd) return null;

  const cumple = {
    longitudMinima: pwd.length >= LONGITUD_MINIMA,
    longitudRecomendada: pwd.length >= LONGITUD_RECOMENDADA,
    mayuscula: /[A-Z]/.test(pwd),
    minuscula: /[a-z]/.test(pwd),
    numero: /[0-9]/.test(pwd),
    especial: /[^A-Za-z0-9]/.test(pwd),
  };

  // Por debajo del mínimo del backend, siempre "Muy débil" — no importa
  // qué combinación de mayúsculas/números tenga, no sirve para el submit.
  let nivel;
  if (!cumple.longitudMinima) {
    nivel = 1;
  } else {
    const score =
      (cumple.longitudRecomendada ? 1 : 0) +
      (cumple.mayuscula && cumple.minuscula ? 1 : 0) +
      (cumple.numero ? 1 : 0) +
      (cumple.especial ? 1 : 0);
    nivel = score <= 1 ? 2 : score === 2 ? 3 : 4;
  }

  return { nivel, ...NIVELES[nivel], cumple };
}
