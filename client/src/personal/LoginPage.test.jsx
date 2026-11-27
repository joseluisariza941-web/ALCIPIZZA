import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ApiError } from '../api.js';
import LoginPage from '../pages/LoginPage.jsx';
import { mockApi, renderWith } from '../test/helpers.jsx';

const rutas = (
  <Routes>
    <Route path="/personal" element={<LoginPage />} />
    <Route path="/mesera" element={<div>panel mesera</div>} />
    <Route path="/cocina" element={<div>panel cocina</div>} />
    <Route path="/dev" element={<div>panel dev</div>} />
  </Routes>
);

const ANA = { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera', activo: true, debeCambiarClave: false };

async function escribir(usuario, clave) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Usuario'), usuario);
  await u.type(screen.getByLabelText('Contraseña'), clave);
  return u;
}

describe('LoginPage', () => {
  it('muestra el formulario original del acceso del personal', () => {
    renderWith(rutas, { route: '/personal' });
    expect(screen.getByRole('heading', { name: 'Acceso del personal' })).toBeInTheDocument();
    expect(screen.getByText('Meseras, cocina y desarrollador entran por aquí.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('Enter en la contraseña entra con el usuario en minúsculas y va al panel del rol', async () => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    auth.login.mockResolvedValue(ANA);
    const u = await escribir('  ANA ', 'secreta123');
    await u.keyboard('{Enter}');
    expect(auth.login).toHaveBeenCalledWith('ana', 'secreta123');
    expect(await screen.findByText('panel mesera')).toBeInTheDocument();
  });

  it('el botón Entrar también envía', async () => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    auth.login.mockResolvedValue({ ...ANA, rol: 'dev' });
    const u = await escribir('dev', 'x');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('panel dev')).toBeInTheDocument();
  });

  it.each([
    ['401', new ApiError(401, 'Usuario o contraseña incorrectos', {}), 'Usuario o contraseña incorrectos'],
    ['423 con mensaje del servidor', new ApiError(423, 'Bloqueado 15 minutos por el servidor', { code: 'BLOQUEADO' }), 'Bloqueado 15 minutos por el servidor'],
    ['423 sin mensaje', new ApiError(423, 'Error 423', {}), /bloqueada temporalmente.*unos minutos/i],
    ['429', new ApiError(429, 'x', { code: 'LIMITE' }), /demasiados intentos/i],
    ['suscripción inactiva', new ApiError(403, 'x', { code: 'SUSPENDIDO' }), /suscripción.*inactiva/i],
    ['sin conexión', new TypeError('Failed to fetch'), /sin conexión/i],
    ['500', new ApiError(500, 'Error interno', {}), /error inesperado/i],
  ])('muestra un aviso con role=alert: %s', async (_n, err, texto) => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    auth.login.mockRejectedValue(err);
    const u = await escribir('ana', 'mala');
    await u.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(texto);
    expect(screen.queryByText('panel mesera')).not.toBeInTheDocument();
  });

  it('el aviso del 401 no revela si el usuario existe', async () => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    auth.login.mockRejectedValue(new ApiError(401, 'x', {}));
    const u = await escribir('nadie', 'x');
    await u.keyboard('{Enter}');
    expect((await screen.findByRole('alert')).textContent).not.toMatch(/no existe|no encontrado|inexistente/i);
  });

  it('deshabilita el botón y dice "Entrando…" mientras envía', async () => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    let soltar;
    auth.login.mockReturnValue(new Promise(r => { soltar = r; }));
    const u = await escribir('ana', 'x');
    await u.click(screen.getByRole('button', { name: 'Entrar' }));
    const b = await screen.findByRole('button', { name: 'Entrando…' });
    expect(b).toBeDisabled();
    soltar(ANA);
    expect(await screen.findByText('panel mesera')).toBeInTheDocument();
  });

  it('avisa si la sesión expiró (marca de api.js) y la borra', async () => {
    sessionStorage.setItem('alci:sesion-expirada', '1');
    renderWith(rutas, { route: '/personal' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró, vuelve a entrar');
    expect(sessionStorage.getItem('alci:sesion-expirada')).toBeNull();
  });

  it('pide usuario y contraseña antes de enviar', async () => {
    const { auth } = renderWith(rutas, { route: '/personal' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }));
    expect(auth.login).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el usuario y la contraseña');
  });

  it('con sesión abierta redirige al panel', async () => {
    renderWith(rutas, { route: '/personal', user: { ...ANA, rol: 'cocina' } });
    expect(await screen.findByText('panel cocina')).toBeInTheDocument();
  });

  describe('cambio de contraseña obligatorio', () => {
    it('tras entrar con debeCambiarClave no deja pasar sin cambiarla y luego va al panel', async () => {
      const f = mockApi({ 'GET /api/auth/csrf': { csrfToken: 't' }, 'POST /api/auth/cambiar-clave': { ok: true } });
      const { auth } = renderWith(rutas, { route: '/personal' });
      auth.login.mockResolvedValue({ ...ANA, debeCambiarClave: true });
      const u = await escribir('ana', 'temporal1');
      await u.keyboard('{Enter}');

      expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument();
      expect(screen.queryByText('panel mesera')).not.toBeInTheDocument();

      await u.type(screen.getByLabelText('Contraseña actual'), 'temporal1');
      await u.type(screen.getByLabelText('Nueva contraseña'), 'corta');
      await u.type(screen.getByLabelText('Repite la nueva contraseña'), 'corta');
      await u.click(screen.getByRole('button', { name: 'Guardar y entrar' }));
      expect(await screen.findByRole('status')).toHaveTextContent('al menos 8');
      expect(f.mock.calls.some(([url]) => url === '/api/auth/cambiar-clave')).toBe(false);

      await u.clear(screen.getByLabelText('Nueva contraseña'));
      await u.type(screen.getByLabelText('Nueva contraseña'), 'nuevaClave9');
      await u.clear(screen.getByLabelText('Repite la nueva contraseña'));
      await u.type(screen.getByLabelText('Repite la nueva contraseña'), 'nuevaClave9{Enter}');

      expect(await screen.findByText('panel mesera')).toBeInTheDocument();
      const [, opts] = f.mock.calls.find(([url]) => url === '/api/auth/cambiar-clave');
      expect(JSON.parse(opts.body)).toEqual({ actual: 'temporal1', nueva: 'nuevaClave9' });
      expect(auth.setUser).toHaveBeenCalledWith({ ...ANA, debeCambiarClave: false });
    });

    it('si la sesión ya existe con debeCambiarClave muestra el cambio en vez de redirigir', async () => {
      renderWith(rutas, { route: '/personal', user: { ...ANA, debeCambiarClave: true } });
      expect(await screen.findByRole('heading', { name: 'Cambia tu contraseña' })).toBeInTheDocument();
    });

    it('muestra el error del servidor (contraseña actual incorrecta)', async () => {
      mockApi({ 'GET /api/auth/csrf': { csrfToken: 't' }, 'POST /api/auth/cambiar-clave': { status: 401, body: { error: 'La contraseña actual no es correcta' } } });
      renderWith(rutas, { route: '/personal', user: { ...ANA, debeCambiarClave: true } });
      const u = userEvent.setup();
      await u.type(screen.getByLabelText('Contraseña actual'), 'mala');
      await u.type(screen.getByLabelText('Nueva contraseña'), 'nuevaClave9');
      await u.type(screen.getByLabelText('Repite la nueva contraseña'), 'nuevaClave9');
      await u.click(screen.getByRole('button', { name: 'Guardar y entrar' }));
      expect(await screen.findByRole('status')).toHaveTextContent('La contraseña actual no es correcta');
      await waitFor(() => expect(screen.queryByText('panel mesera')).not.toBeInTheDocument());
    });
  });
});
