// Avisos: usa el toast compartido de components/ (ToastHost dentro de <Shell>; sin él, div.toast en el body).
import { toast } from '../components/toast.jsx';

export { toast };

/** Muestra el mensaje de un error de la API (o uno genérico). */
export const toastError = err => toast(err?.message || 'No se pudo completar la acción');
