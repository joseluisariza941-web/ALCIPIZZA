// Cliente HTTP de la API. Sesión por cookie httpOnly (misma origen) + token CSRF en cambios.

export class ApiError extends Error {
  /** @param {number} status @param {string} message @param {any} [data] */
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}

let csrf = null;

async function csrfToken() {
  if (!csrf) csrf = (await request('GET', '/api/auth/csrf')).csrfToken;
  return csrf;
}

/** Olvida el token CSRF (cambia al iniciar o cerrar sesión). */
export function resetCsrf() { csrf = null; }

async function request(method, path, body, reintento = true) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await csrfToken();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    if (res.status === 403 && data?.code === 'CSRF') {
      resetCsrf(); // el token venció (p. ej. la sesión se renovó): uno nuevo y un solo reintento
      if (reintento) return request(method, path, body, false);
    }
    throw new ApiError(res.status, data?.error || `Error ${res.status}`, data);
  }
  return data;
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: path => request('DELETE', path),
};
