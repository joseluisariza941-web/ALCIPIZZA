// Utilidades compartidas para las pruebas del cliente.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '../auth/AuthContext.jsx';

/**
 * Simula fetch por ruta. Ejemplo:
 *   mockApi({ 'GET /api/menu': [...], 'POST /api/pedidos': { status: 201, body: {...} } })
 * Un valor simple se responde con 200. Una función recibe (body, url) y devuelve la respuesta.
 * @returns {import('vitest').Mock}
 */
export function mockApi(routes) {
  const fn = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const path = String(url).split('?')[0];
    const key = `${method} ${path}`;
    let r = routes[key];
    if (r === undefined) return jsonResponse(404, { error: `Sin mock para ${key}` });
    if (typeof r === 'function') r = await r(opts.body ? JSON.parse(opts.body) : undefined, String(url));
    if (r && typeof r === 'object' && 'status' in r && 'body' in r) return jsonResponse(r.status, r.body);
    return jsonResponse(200, r);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

/**
 * Renderiza con router en memoria y un usuario de sesión opcional.
 * @param {import('react').ReactElement} ui
 * @param {{ route?: string, user?: null | { id:number, usuario:string, nombre:string, rol:'dev'|'cocina'|'mesera'|'superadmin' } }} [o]
 */
export function renderWith(ui, { route = '/', user = null } = {}) {
  const auth = { user, loading: false, login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), setUser: vi.fn() };
  return { auth, ...render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  ) };
}
