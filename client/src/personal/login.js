// Lógica pura del acceso del personal.

/** Clave de sessionStorage con la que api.js avisa al login que la sesión venció. */
export const CLAVE_SESION_EXPIRADA = 'alci:sesion-expirada';
export const MSG_SESION_EXPIRADA = 'Tu sesión expiró, vuelve a entrar';
export const MSG_CAMPOS_VACIOS = 'Escribe el usuario y la contraseña';

/**
 * Mensaje para mostrar ante un error del POST /api/auth/login (nunca revela si el usuario existe).
 * @param {any} err @returns {string}
 */
export function mensajeErrorLogin(err) {
  const status = err?.status;
  const codigo = err?.data?.code || err?.data?.codigo;
  if (status === 401) return 'Usuario o contraseña incorrectos';
  if (status === 423) return err?.message && err.message !== `Error ${status}` ? err.message : 'Cuenta bloqueada temporalmente. Intenta de nuevo en unos minutos.';
  if (status === 429) return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (status === 403 && codigo === 'SUSPENDIDO') return 'La suscripción del servicio está inactiva. Contacta al desarrollador.';
  if (!status) return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  return 'Ocurrió un error inesperado. Intenta de nuevo en un momento.';
}

export const MIN_CLAVE = 8;

/**
 * Valida el formulario de cambio obligatorio de contraseña.
 * @param {{actual:string, nueva:string, confirma:string}} f
 * @returns {string|null} mensaje de error o null si es válido
 */
export function validarCambioClave({ actual, nueva, confirma }) {
  if (!actual) return 'Escribe tu contraseña actual';
  if ((nueva || '').length < MIN_CLAVE) return `La nueva contraseña debe tener al menos ${MIN_CLAVE} caracteres`;
  if (nueva !== confirma) return 'Las contraseñas no coinciden';
  if (nueva === actual) return 'La nueva contraseña debe ser distinta de la actual';
  return null;
}
