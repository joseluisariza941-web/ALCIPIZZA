// Avisos: usa el toast compartido de components/ (con <AlertasProvider> montado salen como alertas; si no, ToastHost o div.toast).
import { toast } from '../components/toast.jsx';

export { toast };

/** Alerta de éxito. */
export const exito = texto => toast(texto, 'exito');
/** Alerta de advertencia (validaciones del formulario). */
export const aviso = texto => toast(texto, 'aviso');
/** Muestra el mensaje de un error de la API (o uno genérico). */
export const toastError = err => toast(err?.message || 'No se pudo completar la acción', 'error');
