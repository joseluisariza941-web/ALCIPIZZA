import { toast } from './toast.js';

// Campana y aviso de pedido nuevo (beep() y ping() originales).
export function beep() {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(a.currentTime + 0.3);
  } catch { /* sin audio */ }
}

/** @param {string} m @param {string} [titulo] */
export function ping(m, titulo = 'Alcipizza') {
  beep();
  toast(m);
  try { if (Notification.permission === 'granted') new Notification(titulo, { body: m }); } catch { /* sin notificaciones */ }
}
