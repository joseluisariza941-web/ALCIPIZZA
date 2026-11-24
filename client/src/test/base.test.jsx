import { describe, expect, it } from 'vitest';
import { act, renderHook, screen } from '@testing-library/react';
import { Routes } from 'react-router-dom';
import { PALETAS, ThemeProvider, useTheme } from '../theme/useTheme.js';
import { api, ApiError, resetCsrf } from '../api.js';
import { appRoutes } from '../App.jsx';
import { mockApi, renderWith } from './helpers.jsx';

describe('Tema (mismas paletas y modo que la app original)', () => {
  it('aplica la paleta "aji" y modo claro por defecto en <html>', () => {
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.p).toBe('aji');
    expect(document.documentElement.dataset.m).toBe('l');
  });

  it('conserva las 10 paletas originales', () => {
    expect(Object.keys(PALETAS)).toEqual(['aji', 'limon', 'mora', 'mango', 'mar', 'choco', 'rosa', 'cielo', 'vinotinto', 'blanconegro']);
  });

  it('cambia paleta y modo, y los recuerda', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setPaleta('mora'); result.current.setModo('d'); });
    expect(document.documentElement.dataset.p).toBe('mora');
    expect(document.documentElement.dataset.m).toBe('d');
    expect(JSON.parse(localStorage.getItem('tema'))).toEqual({ p: 'mora', m: 'd' });
  });

  it('ignora una paleta inexistente', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPaleta('no-existe'));
    expect(document.documentElement.dataset.p).toBe('aji');
  });

  it('con ThemeProvider todos los componentes comparten un solo estado de tema', () => {
    const { result } = renderHook(() => [useTheme(), useTheme()], { wrapper: ThemeProvider });
    act(() => result.current[0].setPaleta('mar'));
    expect(result.current[1].paleta).toBe('mar');
    expect(document.documentElement.dataset.p).toBe('mar');
  });
});

describe('Cliente de API', () => {
  it('GET devuelve el JSON y envía cookies de la misma origen', async () => {
    const f = mockApi({ 'GET /api/menu': [{ id: 1 }] });
    expect(await api.get('/api/menu')).toEqual([{ id: 1 }]);
    expect(f.mock.calls[0][1].credentials).toBe('same-origin');
  });

  it('POST envía JSON con el token CSRF obtenido de /api/auth/csrf', async () => {
    const f = mockApi({
      'GET /api/auth/csrf': { csrfToken: 'tok-123' },
      'POST /api/pedidos': { status: 201, body: { id: 7 } },
    });
    expect(await api.post('/api/pedidos', { a: 1 })).toEqual({ id: 7 });
    const [, opts] = f.mock.calls.find(([u]) => u === '/api/pedidos');
    expect(opts.headers['X-CSRF-Token']).toBe('tok-123');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ a: 1 });
  });

  it('si el token CSRF venció (403 CSRF), pide uno nuevo y reintenta una sola vez', async () => {
    resetCsrf();
    let tokens = 0;
    const vistos = [];
    const f = mockApi({
      'GET /api/auth/csrf': () => ({ csrfToken: `tok-${++tokens}` }),
      'POST /api/pedidos': (_b) => {
        const t = f.mock.calls.at(-1)[1].headers['X-CSRF-Token'];
        vistos.push(t);
        return t === 'tok-1' ? { status: 403, body: { error: 'venció', code: 'CSRF' } } : { status: 201, body: { id: 9 } };
      },
    });
    expect(await api.post('/api/pedidos', { a: 1 })).toEqual({ id: 9 });
    expect(vistos).toEqual(['tok-1', 'tok-2']);
  });

  it('no reintenta más de una vez si el servidor sigue rechazando el CSRF', async () => {
    resetCsrf();
    const f = mockApi({
      'GET /api/auth/csrf': { csrfToken: 'x' },
      'POST /api/pedidos': { status: 403, body: { error: 'venció', code: 'CSRF' } },
    });
    const err = await api.post('/api/pedidos', {}).catch(e => e);
    expect(err.status).toBe(403);
    expect(f.mock.calls.filter(([u]) => u === '/api/pedidos')).toHaveLength(2);
  });

  it('un error HTTP lanza ApiError con estado y mensaje del servidor', async () => {
    mockApi({ 'GET /api/auth/me': { status: 401, body: { error: 'No autenticado' } } });
    const err = await api.get('/api/auth/me').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe('No autenticado');
  });
});

describe('Rutas protegidas por rol', () => {
  it('/cocina sin sesión redirige al login del personal', async () => {
    renderWith(<Routes>{appRoutes}</Routes>, { route: '/cocina' });
    expect(await screen.findByRole('heading', { name: /acceso del personal/i })).toBeInTheDocument();
  });

  it('/cocina con rol mesera no entra (redirige a su panel)', async () => {
    renderWith(<Routes>{appRoutes}</Routes>, { route: '/cocina', user: { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera' } });
    expect(await screen.findByTestId('pagina-mesera')).toBeInTheDocument();
  });

  it('con debeCambiarClave pendiente no entra al panel: va a /personal a cambiarla', async () => {
    mockApi({ 'GET /api/public/config': { config: {}, pagos: [], abierto: true, suscripcionActiva: true } });
    renderWith(<Routes>{appRoutes}</Routes>, { route: '/cocina', user: { id: 2, usuario: 'admin', nombre: 'Admin', rol: 'cocina', debeCambiarClave: true } });
    expect(await screen.findByTestId('pagina-login')).toBeInTheDocument();
    expect(screen.queryByTestId('pagina-cocina')).not.toBeInTheDocument();
  });

  it('/cocina con rol cocina entra', async () => {
    renderWith(<Routes>{appRoutes}</Routes>, { route: '/cocina', user: { id: 2, usuario: 'admin', nombre: 'Admin', rol: 'cocina' } });
    expect(await screen.findByTestId('pagina-cocina')).toBeInTheDocument();
  });
});
