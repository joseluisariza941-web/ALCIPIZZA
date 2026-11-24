// Configuración pública del local (GET /api/public/config), compartida por <Shell> con sus hijos.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

export const LOGO = '/assets/logo.png';

/** Mismos valores iniciales que seed() original, mientras llega la configuración. h: lunes..domingo. */
export const CONFIG_INICIAL = {
  n: 'Alcipizza', w1: 'Tu próximo antojo está a un clic', w2: 'Calidad, sabor y amor en cada preparación.',
  w3: 'Descubre nuestro menú y disfruta tus comidas rápidas favoritas', w4: 'Todo a tu gusto', tel: '3108819617', mesas: 8,
  h: [[18, 22], null, [18, 22], [18, 22], [18, 22], [18, 22], [18, 22]], logo: '', bg: '',
};

/**
 * @typedef {{ codigo:string, nombre:string, numero:string, activo:boolean }} MetodoPago
 * @typedef {{ config: typeof CONFIG_INICIAL, pagos: MetodoPago[], abierto: boolean|null, suscripcionActiva: boolean,
 *   cargado: boolean, recargar: () => Promise<void> }} PublicConfig
 */

/** @type {PublicConfig} */
const VACIO = { config: CONFIG_INICIAL, pagos: [], abierto: null, suscripcionActiva: true, cargado: false, recargar: async () => {} };

export const ConfigContext = createContext(VACIO);

/** Configuración pública dentro de <Shell>. @returns {PublicConfig} */
export const usePublicConfig = () => useContext(ConfigContext);

/** Logo configurado o el original. @param {{logo?:string}} c */
export const logoDe = c => c?.logo || LOGO;

/** Carga /api/public/config (lo usa <Shell>). @returns {PublicConfig} */
export function useCargarConfig() {
  const [estado, setEstado] = useState(VACIO);
  const recargar = useCallback(async () => {
    try {
      const r = await api.get('/api/public/config');
      setEstado(e => ({
        ...e, config: { ...CONFIG_INICIAL, ...(r?.config || {}) }, pagos: r?.pagos || [],
        abierto: typeof r?.abierto === 'boolean' ? r.abierto : null, suscripcionActiva: r?.suscripcionActiva !== false, cargado: true,
      }));
    } catch {
      setEstado(e => ({ ...e, cargado: true }));
    }
  }, []);
  useEffect(() => { recargar(); }, [recargar]);
  return { ...estado, recargar };
}
