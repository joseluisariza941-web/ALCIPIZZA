import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useCarga } from './hooks.js';
import { fd } from './util.js';
import { toast, toastError } from './toast.js';

/** Aviso que explica que eliminar solo oculta. */
export const textoOcultar = que => `¿Eliminar ${que}?\n\nSe oculta y se puede restaurar desde "Ver eliminados".`;

/**
 * Botón "Ver eliminados" y la lista de registros ocultos con su fecha y el botón Restaurar.
 * @param {{ ruta: string, nombre: (x:any)=>string, etiqueta?: string, restaurar?: string, version?: any,
 *   filtrar?: (x:any)=>boolean, onRestaurado?: () => void, id?: (x:any)=>string|number }} p
 */
export default function FiltroEliminados({ ruta, nombre, etiqueta = 'Ver eliminados', restaurar = 'Restaurar', version, filtrar, onRestaurado, id = x => x.id }) {
  const [ver, setVer] = useState(false);
  const { data, recargar } = useCarga(ver ? `${ruta}?eliminados=1` : null, /** @type {any[]} */ ([]));
  const previa = useRef(version);
  useEffect(() => {
    if (previa.current === version) return;
    previa.current = version;
    if (ver) recargar();
  }, [version, ver, recargar]);
  const lista = filtrar ? data.filter(filtrar) : data;

  async function volver(x) {
    try {
      await api.post(`${ruta}/${id(x)}/restaurar`, {});
      toast('Restaurado');
    } catch (e) { toastError(e); }
    await recargar();
    onRestaurado?.();
  }

  return (
    <div style={{ margin: '.6rem 0' }}>
      <button className={`btn s ${ver ? 'y' : ''}`} aria-pressed={ver} onClick={() => setVer(!ver)}>{etiqueta}</button>
      {ver && (
        <div className="card scr" style={{ marginTop: '.6rem' }}>
          <table>
            <tbody>
              {lista.length ? lista.map(x => (
                <tr key={id(x)}>
                  <td><b>{nombre(x)}</b></td>
                  <td className="sm">{x.eliminadoEn ? fd(x.eliminadoEn) : ''}</td>
                  <td><button className="btn s y" onClick={() => volver(x)}>{restaurar}</button></td>
                </tr>
              )) : <tr><td colSpan={3}>No hay registros eliminados</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
