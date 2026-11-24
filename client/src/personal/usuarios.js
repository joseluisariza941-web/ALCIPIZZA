// Lógica pura del panel de desarrollador.
import { MIN_CLAVE } from './login.js';

const ANIO = 365 * 864e5;

/**
 * Valida un acceso nuevo (cocina o mesera).
 * @param {{nombre:string, usuario:string, clave:string}} f @param {string[]} [existentes] usuarios ya creados
 * @returns {string|null}
 */
export function validarNuevoUsuario({ nombre, usuario, clave }, existentes = []) {
  const u = (usuario || '').trim().toLowerCase();
  if (!(nombre || '').trim() || !u || !clave || existentes.includes(u)) return 'Datos incompletos o usuario repetido';
  if (clave.length < MIN_CLAVE) return `La contraseña debe tener al menos ${MIN_CLAVE} caracteres`;
  return null;
}

/** "Activar / renovar 1 año": un año desde hoy o desde el vencimiento si aún no llega. @param {string|null} hasta */
export function renovarHasta(hasta, ahora = Date.now()) {
  const h = hasta ? Date.parse(hasta) : 0;
  return new Date(Math.max(ahora, h || 0) + ANIO).toISOString();
}

/** @param {{activa:boolean, hasta:string|null}} s */
export const suscripcionActiva = (s, ahora = Date.now()) => !!s?.activa && !!s.hasta && Date.parse(s.hasta) > ahora;
