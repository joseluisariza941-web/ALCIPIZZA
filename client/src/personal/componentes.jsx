// Piezas pequeñas compartidas por las pantallas del personal (HTML igual al de app.js original).
import { createPortal } from 'react-dom';
import { pesos } from './formato.js';

/** Contenedor de modal (.md) accesible, montado en el body para que al imprimir salga solo la ventana. @param {{ etiqueta:string, children:any }} p */
export function Modal({ etiqueta, children }) {
  return createPortal(<div className="md" role="dialog" aria-modal="true" aria-label={etiqueta}>{children}</div>, document.body);
}

/**
 * Detalles de un ítem (sin, extras, salsas, nota). Sirve para el carrito y para ItemPedido de la API.
 * @param {{ c:{sin?:string[], extras?:{nombre:string}[], salsas?:string[], nota?:string}, salsas?:string, nota?:boolean }} p
 */
export function DetalleItem({ c, salsas = 'salsas: ', nota = true }) {
  return (
    <>
      {c.sin?.length ? <><br /><small>sin {c.sin.join(', ')}</small></> : null}
      {c.extras?.length ? <><br /><small>+ {c.extras.map(e => e.nombre).join(', ')}</small></> : null}
      {c.salsas?.length ? <><br /><small>{salsas}{c.salsas.join(', ')}</small></> : null}
      {nota && c.nota ? <><br /><small>“{c.nota}”</small></> : null}
    </>
  );
}

/** Línea de total del ticket. */
export const Total = ({ valor, style }) => <p className="r" style={style}><b>Total</b><b>{pesos(valor)}</b></p>;

/** Ícono de WhatsApp del original. */
export function WaIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path d="M16.04 3C9.4 3 4 8.4 4 15.03c0 2.12.55 4.19 1.6 6.01L4 29l8.1-1.57a12 12 0 0 0 3.94.66h.01C22.67 28.09 28 22.7 28 16.06 28 9.4 22.68 3 16.04 3zm0 22.1h-.01a10 10 0 0 1-5.1-1.4l-.37-.22-4.8.93.99-4.68-.24-.38a9.9 9.9 0 0 1-1.52-5.3C5 9.6 9.9 5 16.04 5 22 5 26 9.6 26 16.06c0 5.5-4.4 9.04-9.96 9.04zm5.5-7.4c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.96 1.18-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.67-2.08-.18-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.25-.25-.58-.5-.5-.68-.5h-.58c-.2 0-.53.08-.8.38-.28.3-1.06 1.04-1.06 2.53s1.08 2.93 1.23 3.13c.15.2 2.13 3.25 5.15 4.56.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.18-1.43-.07-.13-.27-.2-.57-.35z" />
    </svg>
  );
}
