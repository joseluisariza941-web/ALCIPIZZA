// Horarios del local. En la API, Config.h va de lunes (0) a domingo (6).
import { h12 } from './formato.js';

/** @typedef {([number, number]|null)[]} Horario */

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Índice lunes=0 … domingo=6 de una fecha. @param {Date} d */
export const indiceDia = d => (d.getDay() + 6) % 7;

/** ¿Está abierto en ese momento? (como abre() original) @param {Horario|undefined} h @param {Date} [d] */
export function estaAbierto(h, d = new Date()) {
  const x = h?.[indiceDia(d)];
  const hora = d.getHours() + d.getMinutes() / 60;
  return !!x && hora >= x[0] && hora < x[1];
}

/**
 * Filas del cartel de horarios.
 * @param {Horario} h @param {Date} [d]
 * @returns {{dia:string, texto:string, hoy:boolean, cerrado:boolean}[]}
 */
export function filasHorario(h, d = new Date()) {
  const hoy = indiceDia(d);
  return DIAS.map((dia, i) => {
    const x = h?.[i];
    return { dia, texto: x ? `${h12(x[0])} – ${h12(x[1])}` : 'CERRADO', hoy: i === hoy, cerrado: !x };
  });
}
