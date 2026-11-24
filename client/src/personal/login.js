// Lógica pura del acceso del personal.

/** Mensaje para mostrar ante un error del POST /api/auth/login. @param {any} err @returns {string} */
export function mensajeErrorLogin(err) {
  const status = err?.status;
  if (status === 401) return 'Usuario o contraseña incorrectos';
  if (status === 423) return 'Usuario bloqueado temporalmente por varios intentos fallidos. Intenta de nuevo en 15 minutos.';
  if (status === 429) return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (status === 403 && err?.data?.code === 'SUSPENDIDO') return 'El servicio está suspendido. Contacta al desarrollador.';
  if (!status) return 'No se pudo conectar con el servidor. Intenta de nuevo.';
  return err.message || 'No se pudo iniciar sesión';
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
