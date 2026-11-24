// El cliente web recuerda su último pedido ({id, token}) para ver solo su propia tirilla.
const CLAVE = 'alcipizza.tirilla';

/** @returns {{id:number, token:string}|null} */
export function leerTirilla() {
  try {
    const t = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    return t && t.id && t.token ? { id: t.id, token: t.token } : null;
  } catch { return null; }
}

/** @param {{id:number, token:string}} t */
export function guardarTirilla({ id, token }) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ id, token })); } catch { /* almacenamiento bloqueado */ }
}

export function borrarTirilla() {
  try { localStorage.removeItem(CLAVE); } catch { /* almacenamiento bloqueado */ }
}

/** @param {number|string} id @param {string} token */
export const urlTirilla = (id, token) => `/tirilla/${id}?token=${encodeURIComponent(token)}`;
