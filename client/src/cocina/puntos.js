// Lógica pura de la pestaña Clientes (puntos).
export const TIPOS_MOV = { ganado: 'Ganado', canjeado: 'Canjeado', devuelto: 'Devuelto', revertido: 'Revertido' };
/** Puntos con signo explícito. @param {number} n */
export const puntosTxt = n => (n > 0 ? `+${n}` : String(n));
