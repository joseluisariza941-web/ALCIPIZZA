import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import DevPage from '../pages/DevPage.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';

const DEV = { id: 1, usuario: 'dev', nombre: 'Desarrollador', rol: 'dev', activo: true, debeCambiarClave: false };
const USUARIOS = [
  DEV,
  { id: 2, usuario: 'admin', nombre: 'Cocina', rol: 'cocina', activo: true, debeCambiarClave: false },
  { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false },
  { id: 4, usuario: 'luz', nombre: 'Luz', rol: 'mesera', activo: false, debeCambiarClave: true },
];
const FUTURO = new Date(Date.now() + 30 * 864e5).toISOString();

function montar(rutas = {}, sub = { activa: true, hasta: FUTURO }) {
  const f = mockApi({
    'GET /api/auth/csrf': { csrfToken: 't' },
    'GET /api/public/config': { config: {}, pagos: [], abierto: true, suscripcionActiva: true },
    'GET /api/suscripcion': sub,
    'GET /api/usuarios': USUARIOS,
    'PUT /api/suscripcion': b => ({ activa: true, hasta: FUTURO, ...b }),
    ...rutas,
  });
  const r = renderWith(<Routes><Route path="/dev/*" element={<DevPage />} /><Route path="/personal" element={<div>login</div>} /></Routes>, { route: '/dev', user: DEV });
  return { f, ...r, u: userEvent.setup() };
}

const llamadas = (f, metodo, url) => f.mock.calls.filter(([u, o]) => u === url && (o?.method || 'GET') === metodo).map(([, o]) => JSON.parse(o.body || 'null'));
const tarjeta = nombre => within(screen.getByRole('heading', { name: nombre }).closest('.card'));
const fila = nombre => within(screen.getByRole('group', { name: nombre }));

describe('DevPage · suscripción', () => {
  it('muestra el estado y el vencimiento', async () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Opciones de desarrollador' })).toBeInTheDocument();
    expect(await screen.findByText('🟢 ACTIVA')).toHaveClass('bd');
    expect(screen.getByText(/^Vence:/)).toBeInTheDocument();
  });

  it('vencida o apagada se muestra INACTIVA', async () => {
    montar({}, { activa: true, hasta: '2020-01-01T00:00:00.000Z' });
    expect(await screen.findByText('🔴 INACTIVA')).toBeInTheDocument();
  });

  it('activar / renovar suma un año y desactivar la apaga', async () => {
    const { u, f } = montar();
    await screen.findByText('🟢 ACTIVA');
    await u.click(screen.getByRole('button', { name: 'Activar / renovar 1 año' }));
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/suscripcion')).toHaveLength(1));
    const [b] = llamadas(f, 'PUT', '/api/suscripcion');
    expect(b.activa).toBe(true);
    expect(Date.parse(b.hasta) - Date.parse(FUTURO)).toBe(365 * 864e5);

    await u.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/suscripcion')).toHaveLength(2));
    expect(llamadas(f, 'PUT', '/api/suscripcion')[1]).toEqual({ activa: false });
  });

  it('cambia la fecha "hasta"', async () => {
    const { u, f } = montar();
    await screen.findByText('🟢 ACTIVA');
    const fecha = screen.getByLabelText('Vence el');
    await u.clear(fecha);
    await u.type(fecha, '2027-12-31');
    await u.click(screen.getByRole('button', { name: 'Guardar fecha' }));
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/suscripcion')).toHaveLength(1));
    expect(llamadas(f, 'PUT', '/api/suscripcion')[0]).toEqual({ hasta: new Date(2027, 11, 31, 23, 59, 59).toISOString() });
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado');
  });
});

describe('DevPage · accesos', () => {
  it('lista cocina y meseras sin mostrar contraseñas', async () => {
    montar();
    await screen.findByRole('group', { name: 'Ana' });
    expect(tarjeta('Administración de cocina').getByRole('group', { name: 'Cocina' })).toBeInTheDocument();
    expect(tarjeta('Meseras').getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Ana', 'Luz']);
    expect(fila('Ana').getByLabelText('Usuario')).toHaveValue('ana');
    expect(fila('Ana').getByLabelText('Nueva contraseña')).toHaveValue('');
    expect(screen.queryByRole('group', { name: 'Desarrollador' })).not.toBeInTheDocument();
    expect(fila('Luz').getByRole('button', { name: 'Activar acceso' })).toBeInTheDocument();
  });

  it('guarda el nombre al salir del campo y no deja valores vacíos', async () => {
    const { u, f } = montar({ 'PUT /api/usuarios/3': b => ({ ...USUARIOS[2], ...b }) });
    const nombre = (await screen.findByRole('group', { name: 'Ana' })).querySelector('input');
    await u.clear(nombre);
    await u.tab();
    expect(await screen.findByRole('status')).toHaveTextContent('No puede quedar vacío');
    expect(nombre).toHaveValue('Ana');
    expect(llamadas(f, 'PUT', '/api/usuarios/3')).toHaveLength(0);

    await u.clear(nombre);
    await u.type(nombre, 'Ana María');
    await u.tab();
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/usuarios/3')).toEqual([{ nombre: 'Ana María' }]));
    expect(await screen.findByText('Guardado')).toBeInTheDocument();
  });

  it('el usuario se guarda en minúsculas y avisa si ya existe', async () => {
    const { u, f } = montar({ 'PUT /api/usuarios/3': { status: 409, body: { error: 'Ya existe' } } });
    const usuario = (await screen.findByRole('group', { name: 'Ana' })) && fila('Ana').getByLabelText('Usuario');
    await u.clear(usuario);
    await u.type(usuario, 'LUZ');
    await u.tab();
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/usuarios/3')).toEqual([{ usuario: 'luz' }]));
    expect(await screen.findByRole('status')).toHaveTextContent('Ese usuario ya existe');
    expect(usuario).toHaveValue('ana');
  });

  it('escribe una contraseña nueva (mínimo 8) sin mostrar la anterior', async () => {
    const { u, f } = montar({ 'PUT /api/usuarios/3': USUARIOS[2] });
    await screen.findByRole('group', { name: 'Ana' });
    const clave = fila('Ana').getByLabelText('Nueva contraseña');
    expect(clave).toHaveAttribute('type', 'password');
    await u.type(clave, 'corta');
    await u.tab();
    expect(await screen.findByRole('status')).toHaveTextContent('al menos 8');
    await u.clear(clave);
    await u.type(clave, 'nuevaClave9');
    await u.tab();
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/usuarios/3')).toEqual([{ clave: 'nuevaClave9' }]));
    await waitFor(() => expect(clave).toHaveValue(''));
  });

  it('activa o desactiva un acceso', async () => {
    const { u, f } = montar({ 'PUT /api/usuarios/4': { ...USUARIOS[3], activo: true } });
    await screen.findByRole('group', { name: 'Luz' });
    await u.click(fila('Luz').getByRole('button', { name: 'Activar acceso' }));
    await waitFor(() => expect(llamadas(f, 'PUT', '/api/usuarios/4')).toEqual([{ activo: true }]));
  });

  it('quita un acceso tras confirmar', async () => {
    const { u, f } = montar({ 'DELETE /api/usuarios/3': { ok: true } });
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await screen.findByRole('group', { name: 'Ana' });
    await u.click(fila('Ana').getByRole('button', { name: 'Quitar' }));
    expect(confirmar).toHaveBeenCalledWith('¿Quitar a Ana?');
    expect(f.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
    await u.click(fila('Ana').getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(f.mock.calls.some(([url, o]) => url === '/api/usuarios/3' && o?.method === 'DELETE')).toBe(true));
  });

  it('agrega una mesera y un acceso de cocina', async () => {
    const { u, f } = montar({ 'POST /api/usuarios': b => ({ status: 201, body: { id: 9, ...b } }) });
    await screen.findByRole('group', { name: 'Ana' });
    const m = within(tarjeta('Meseras').getByRole('button', { name: 'Agregar mesera' }).closest('.fg'));
    await u.click(m.getByRole('button', { name: 'Agregar mesera' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Datos incompletos o usuario repetido');

    await u.type(m.getByPlaceholderText('Nombre'), 'Sara');
    await u.type(m.getByPlaceholderText('Usuario'), 'ANA');
    await u.type(m.getByPlaceholderText('Contraseña'), 'claveSara1');
    await u.click(m.getByRole('button', { name: 'Agregar mesera' }));
    expect(screen.getByRole('status')).toHaveTextContent('Datos incompletos o usuario repetido');

    await u.clear(m.getByPlaceholderText('Usuario'));
    await u.type(m.getByPlaceholderText('Usuario'), 'Sara');
    await u.click(m.getByRole('button', { name: 'Agregar mesera' }));
    await waitFor(() => expect(llamadas(f, 'POST', '/api/usuarios')).toEqual([{ nombre: 'Sara', usuario: 'sara', clave: 'claveSara1', rol: 'mesera' }]));
    await waitFor(() => expect(m.getByPlaceholderText('Nombre')).toHaveValue(''));

    const c = within(tarjeta('Administración de cocina').getByRole('button', { name: 'Agregar acceso de cocina' }).closest('.fg'));
    await u.type(c.getByPlaceholderText('Nombre'), 'Cocina 2');
    await u.type(c.getByPlaceholderText('Usuario'), 'cocina2');
    await u.type(c.getByPlaceholderText('Contraseña'), 'claveCocina');
    await u.click(c.getByRole('button', { name: 'Agregar acceso de cocina' }));
    await waitFor(() => expect(llamadas(f, 'POST', '/api/usuarios')[1]).toEqual({ nombre: 'Cocina 2', usuario: 'cocina2', clave: 'claveCocina', rol: 'cocina' }));
  });
});

describe('Paneles del personal con cambio de clave pendiente', () => {
  it('redirigen al acceso del personal', async () => {
    mockApi({});
    renderWith(<Routes><Route path="/dev/*" element={<DevPage />} /><Route path="/personal" element={<div>login</div>} /></Routes>,
      { route: '/dev', user: { ...DEV, debeCambiarClave: true } });
    expect(await screen.findByText('login')).toBeInTheDocument();
  });
});
