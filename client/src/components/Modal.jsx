// Ventana modal con la clase original .md, montada en el body (así @media print imprime solo la ventana).
import { createPortal } from 'react-dom';

/**
 * @param {{ children: import('react').ReactNode, className?: string }} p
 * className por defecto "md"; los hijos suelen ser <div className="card" ...> o <div className="rc">.
 */
export default function Modal({ children, className = 'md' }) {
  return createPortal(<div className={className}>{children}</div>, document.body);
}
