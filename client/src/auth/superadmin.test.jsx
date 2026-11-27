import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes } from 'react-router-dom';
import { appRoutes } from '../App.jsx';
import { INICIO } from './AuthContext.jsx';
import Personal from '../cocina/Personal.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';

const SA = { id: 1, usuario: 'superadmin', nombre: 'Super', rol: 'superadmin', activo: true, debeCambiarClave: false };
const COCINA = { id: 2, usuario: 'admin', nombre: 'Cocina', rol: 'cocina', activo: true, debeCambiarClave: false };
const DEV = { id: 3, usuario: 'dev', nombre: 'Dev', rol: 'dev', activo: true, debeCambiarClave: false };
const USUARIOS = [
  SA, COCINA, DEV,
  { id: 4, usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false },
  { id: 5, usuario: 'otro', nombre: 'Otro Super', rol: 'superadmin', activo: true, debeCambiarClave: false },
];
const FUTURO = new Date(Date.now() + 30 * 864e5).toISOString();
const api = (extra = {}) => mockApi({
  'GET /api/auth/csrf': { csrfToken: 't' },
  'GET /api/public/config': { config: {}, pagos: [], abierto: true, suscripcionActiva: true },
  'GET /api/suscripcion': { activa: true, hasta: FUTURO },
  'GET /api/usuarios': USUARIOS,
  'GET /api/bitacora': [],
  ...extra,
});
const rutas = (route, user) => renderWith(<Routes>{appRoutes}</Routes>, { route, user });

describe('superadmin · rutas', () => {
  it('su panel de inicio es el de cocina', () => {
    expect(INICIO.superadmin).toBe('/cocina');
  });

  it('entra al panel de cocina y al de desarrollador', async () => {
    api();
    rutas('/cocina', SA);
    expect(await screen.findByTestId('pagina-cocina')).toBeInTheDocument();
  });

  it('entra a /dev', async () => {
    api();
    rutas('/dev', SA);
    expect(await screen.findByTestId('pagina-dev')).toBeInTheDocument();
  });

  it('un cocina sigue sin entrar a /dev', async () => {
    api();
    rutas('/dev', COCINA);
    expect(await screen.findByTestId('pagina-cocina')).toBeInTheDocument();
  });
});

describe('superadmin · Personal de cocina', () => {
  const montar = user => { const f = api({ 'POST /api/usuarios': b => ({ status: 201, body: { id: 9, ...b } }) }); renderWith(<Personal />, { user }); return f; };

  it('solo un superadmin ve la opción de rol, con superadmin incluido', async () => {
    montar(SA);
    const rol = await screen.findByRole('combobox', { name: 'Rol' });
    expect([...rol.options].map(o => o.value)).toEqual(['mesera', 'cocina', 'dev', 'superadmin']);
  });

  it('cocina no ve la opción de rol', async () => {
    montar(COCINA);
    await screen.findByRole('heading', { name: 'Meseras' });
    expect(screen.queryByRole('combobox', { name: 'Rol' })).not.toBeInTheDocument();
  });

  it('crea con el rol elegido', async () => {
    const f = montar(SA);
    const c = within((await screen.findByRole('heading', { name: 'Meseras' })).closest('.card'));
    await userEvent.type(c.getByPlaceholderText('Nombre'), 'Jefe');
    await userEvent.type(c.getByPlaceholderText('Usuario'), 'jefe');
    await userEvent.type(c.getByPlaceholderText('Contraseña'), 'secreta123');
    await userEvent.selectOptions(c.getByRole('combobox', { name: 'Rol' }), 'superadmin');
    await userEvent.click(c.getByRole('button', { name: 'Agregar usuario' }));
    const [, o] = f.mock.calls.find(([u, o]) => u === '/api/usuarios' && o?.method === 'POST');
    expect(JSON.parse(o.body)).toEqual({ nombre: 'Jefe', usuario: 'jefe', clave: 'secreta123', rol: 'superadmin' });
  });
});
