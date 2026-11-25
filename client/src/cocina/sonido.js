import { toast } from './toast.js';

/** Sonidos de aviso: id, nombre y notas [frecuencia Hz, inicio s, duración s]. Se sintetizan, sin archivos. */
export const SONIDOS = [
  { id: 'campana', nombre: 'Campana', onda: 'sine', notas: [[880, 0, 0.3]] },
  { id: 'timbre', nombre: 'Timbre', onda: 'triangle', notas: [[988, 0, 0.25], [740, 0.28, 0.4]] },
  { id: 'pulso', nombre: 'Pulso', onda: 'square', notas: [[520, 0, 0.1], [520, 0.2, 0.1], [520, 0.4, 0.1]] },
  { id: 'arpegio', nombre: 'Arpegio', onda: 'sine', notas: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.3]] },
  { id: 'alarma', nombre: 'Alarma', onda: 'sawtooth', notas: [[700, 0, 0.25], [1000, 0.25, 0.25], [700, 0.5, 0.25], [1000, 0.75, 0.25]] },
];

let actual = 'campana';
/** Sonido que se toca al llegar un pedido nuevo. @param {string|undefined} id */
export function fijarSonido(id) { if (SONIDOS.some(s => s.id === id)) actual = /** @type {string} */ (id); }

/** Toca un sonido (el configurado si no se indica). @param {string} [id] */
export function beep(id = actual) {
  const s = SONIDOS.find(x => x.id === id) || SONIDOS[0];
  try {
    const a = new AudioContext();
    for (const [f, ini, dur] of s.notas) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = /** @type {OscillatorType} */ (s.onda);
      o.connect(g); g.connect(a.destination);
      o.frequency.value = f; g.gain.value = 0.15;
      o.start(a.currentTime + ini); o.stop(a.currentTime + ini + dur);
    }
  } catch { /* sin audio */ }
}

/** @param {string} m @param {string} [titulo] */
export function ping(m, titulo = 'Alcipizza') {
  beep();
  toast(m);
  try { if (Notification.permission === 'granted') new Notification(titulo, { body: m }); } catch { /* sin notificaciones */ }
}
