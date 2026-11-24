import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { pedidosNuevos } from './util.js';
import { ping } from './sonido.js';

export const INTERVALO = 5000;

/**
 * Pedidos del día consultados cada 5 s. Suena la campana cuando llega uno nuevo
 * (no en la primera carga), como detect()/ping() del original.
 * @returns {{ pedidos: any[], recargar: () => Promise<void> }}
 */
export function usePedidos() {
  const [pedidos, setPedidos] = useState(/** @type {any[]} */ ([]));
  const conocidos = useRef(/** @type {Set<number>|null} */ (null));
  const vivo = useRef(true);

  const recargar = useCallback(async () => {
    let l;
    try { l = await api.get('/api/pedidos'); } catch { return; }
    if (!vivo.current || !Array.isArray(l)) return;
    if (conocidos.current) {
      const n = pedidosNuevos(conocidos.current, l);
      if (n.length) ping('🔔 Pedido nuevo #' + n[0].id + (n.length > 1 ? ' y ' + (n.length - 1) + ' más' : ''));
    }
    conocidos.current = new Set(l.map(p => p.id));
    setPedidos(l);
  }, []);

  useEffect(() => {
    vivo.current = true;
    recargar();
    const t = setInterval(recargar, INTERVALO);
    return () => { vivo.current = false; clearInterval(t); };
  }, [recargar]);

  return { pedidos, recargar };
}
