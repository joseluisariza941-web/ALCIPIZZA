import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AlertasProvider } from '../components/Alertas.jsx';
import { toast } from '../components/toast.jsx';
import { toastError, exito } from './toast.js';
import { mockApi } from '../test/helpers.jsx';
import Surtidores from './Surtidores.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('las acciones disparan alertas', () => {
  it('toast() y toastError() salen como alertas cuando el proveedor está montado', () => {
    render(<AlertasProvider><span /></AlertasProvider>);
    act(() => exito('Plato creado'));
    expect(screen.getByRole('status')).toHaveTextContent('Plato creado');
    act(() => toastError(new Error('Sin stock')));
    expect(screen.getByRole('alert')).toHaveTextContent('Sin stock');
    act(() => toast('Hola'));
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('crear un surtidor muestra la alerta de éxito', async () => {
    mockApi({
      'GET /api/auth/csrf': { csrfToken: 't' },
      'GET /api/surtidores': [],
      'POST /api/surtidores': { status: 201, body: { id: 1 } },
    });
    render(<MemoryRouter><AlertasProvider><Surtidores /></AlertasProvider></MemoryRouter>);
    const u = userEvent.setup();
    const nombre = await screen.findByPlaceholderText(/nombre/i);
    await u.type(nombre, 'Coca Cola');
    await u.click(screen.getByRole('button', { name: /agregar|crear|guardar/i }));
    await waitFor(() => expect(screen.getByTestId('alertas')).toHaveTextContent('Surtidor creado'));
  });

  it('un error del servidor al crear muestra la alerta de error con su mensaje', async () => {
    mockApi({
      'GET /api/auth/csrf': { csrfToken: 't' },
      'GET /api/surtidores': [],
      'POST /api/surtidores': { status: 409, body: { error: 'Ese surtidor ya existe' } },
    });
    render(<MemoryRouter><AlertasProvider><Surtidores /></AlertasProvider></MemoryRouter>);
    const u = userEvent.setup();
    await u.type(await screen.findByPlaceholderText(/nombre/i), 'Coca Cola');
    await u.click(screen.getByRole('button', { name: /agregar|crear|guardar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese surtidor ya existe');
  });
});
