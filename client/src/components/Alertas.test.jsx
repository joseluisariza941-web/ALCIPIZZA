import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertasProvider, emitirAlerta, useAlertas } from './Alertas.jsx';

function Botones() {
  const a = useAlertas();
  return (
    <>
      <button onClick={() => a.exito('Guardado')}>ok</button>
      <button onClick={() => a.error('Falló')}>mal</button>
      <button onClick={() => { for (let i = 1; i <= 6; i++) a.info(`Aviso ${i}`); }}>muchos</button>
    </>
  );
}
const montar = () => render(<AlertasProvider><Botones /></AlertasProvider>);

describe('Alertas', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('muestra la alerta en una región aria-live', () => {
    montar();
    act(() => screen.getByText('ok').click());
    expect(screen.getByText('Guardado')).toBeInTheDocument();
    expect(screen.getByTestId('alertas')).toHaveAttribute('aria-live', 'polite');
  });

  it('cierra sola: éxito a los 4 s y error a los 7 s', () => {
    montar();
    act(() => { screen.getByText('ok').click(); screen.getByText('mal').click(); });
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
    expect(screen.getByText('Falló')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByText('Falló')).not.toBeInTheDocument();
  });

  it('el error usa role=alert', () => {
    montar();
    act(() => screen.getByText('mal').click());
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
  });

  it('se cierra con el botón', async () => {
    montar();
    act(() => screen.getByText('ok').click());
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Cerrar alerta' }));
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument();
  });

  it('muestra como máximo 4 y descarta las más viejas', () => {
    montar();
    act(() => screen.getByText('muchos').click());
    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('Aviso 2')).not.toBeInTheDocument();
    expect(screen.getByText('Aviso 6')).toBeInTheDocument();
  });

  it('sin proveedor no hace nada ni falla', () => {
    render(<Botones />);
    act(() => screen.getByText('ok').click());
    expect(emitirAlerta('exito', 'x')).toBe(false);
  });
});
