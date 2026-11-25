import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderWith } from '../test/helpers.jsx';
import { CONFIG } from '../cliente/fixtures.js';
import Shell from './Shell.jsx';
import { toast } from './toast.jsx';
import { mostrarSplash, reiniciarSplash } from './splash.jsx';
import { SoporteBoton } from './Soporte.jsx';
import { usePublicConfig } from './ConfigContext.jsx';

const conConfig = (extra = {}) => mockApi({ 'GET /api/public/config': { ...CONFIG, config: { ...CONFIG.config, ...extra } } });

describe('Shell (encabezado, colores, candado, pie)', () => {
  it('muestra el logo y el nombre del negocio de /api/public/config', async () => {
    conConfig();
    renderWith(<Shell><p>contenido</p></Shell>);
    expect(await screen.findByRole('img', { name: 'Pizzería Test' })).toHaveAttribute('src', '/assets/logo.png');
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.getAllByText('📍 Güepsa, Santander')[0]).toHaveClass('bd');
  });

  it('usa el logo y el fondo configurados', async () => {
    conConfig({ logo: 'data:image/png;base64,AAA', bg: 'data:image/jpeg;base64,BBB' });
    const { container } = renderWith(<Shell />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Pizzería Test' })).toHaveAttribute('src', 'data:image/png;base64,AAA'));
    expect(container.querySelector('#wp').style.backgroundImage).toContain('data:image/jpeg;base64,BBB');
    expect(container.querySelector('#bg').children.length).toBe(16);
  });

  it('el botón 🎨 Colores abre las paletas y cambia la paleta', async () => {
    conConfig();
    renderWith(<Shell />);
    await userEvent.click(screen.getByRole('button', { name: '🎨 Colores' }));
    expect(screen.getAllByRole('button', { name: /^Paleta / })).toHaveLength(10);
    await userEvent.click(screen.getByRole('button', { name: 'Paleta mora' }));
    expect(document.documentElement.dataset.p).toBe('mora');
    expect(screen.queryByRole('button', { name: /^Paleta / })).not.toBeInTheDocument();
  });

  it('alterna modo claro/oscuro', async () => {
    conConfig();
    renderWith(<Shell />);
    const b = screen.getByRole('button', { name: 'Modo claro u oscuro' });
    expect(b).toHaveTextContent('🌙');
    await userEvent.click(b);
    expect(document.documentElement.dataset.m).toBe('d');
    expect(b).toHaveTextContent('☀️');
  });

  it('el candado 🔒 lleva a /personal y el pie muestra los contactos', async () => {
    conConfig();
    renderWith(<Shell />);
    expect(screen.getByRole('link', { name: 'Acceso del personal' })).toHaveAttribute('href', '/personal');
    await screen.findByText(/© \d{4} Pizzería Test · Software desarrollado por/);
    expect(screen.getByRole('link', { name: '📞 3001112233' })).toHaveAttribute('href', 'tel:3001112233');
  });

  it('el pie enlaza Facebook y la ubicación en pestaña nueva', async () => {
    conConfig();
    renderWith(<Shell />);
    const fb = await screen.findByRole('link', { name: 'Facebook de Alcipizza' });
    expect(fb).toHaveAttribute('href', 'https://www.facebook.com/alcipi');
    expect(fb).toHaveAttribute('target', '_blank');
    expect(fb).toHaveAttribute('rel', 'noopener noreferrer');
    expect(fb.querySelector('svg')).toBeTruthy();
    const mapa = screen.getByRole('link', { name: 'Ver ubicación de Alcipizza en Google Maps' });
    expect(mapa).toHaveAttribute('href', 'https://maps.app.goo.gl/RMeGi2dnmzTygJXh7');
    expect(mapa).toHaveAttribute('target', '_blank');
    expect(mapa).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mapa).toHaveTextContent('Cl. 4, Guepsa, Güepsa, Santander');
    expect(mapa.querySelector('svg')).toBeTruthy();
  });

  it('en una pantalla del personal muestra el nombre y "Salir" cierra sesión', async () => {
    conConfig();
    const { auth } = renderWith(<Shell />, { route: '/cocina', user: { id: 2, usuario: 'admin', nombre: 'Cocina', rol: 'cocina' } });
    expect(screen.getByText('Cocina')).toHaveClass('bd');
    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(auth.logout).toHaveBeenCalled();
  });

  it('en la página pública con sesión ofrece "↩ Mi panel"', () => {
    conConfig();
    renderWith(<Shell />, { route: '/', user: { id: 3, usuario: 'ana', nombre: 'Ana', rol: 'mesera' } });
    expect(screen.getByRole('link', { name: '↩ Mi panel' })).toHaveAttribute('href', '/mesera');
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
  });

  it('comparte la configuración con sus hijos (usePublicConfig)', async () => {
    conConfig();
    function Hijo() { const { config, pagos } = usePublicConfig(); return <p>{config.w4} · {pagos.length}</p>; }
    renderWith(<Shell><Hijo /></Shell>);
    expect(await screen.findByText('A tu gusto test · 2')).toBeInTheDocument();
  });

  it('sin API usa los textos originales por defecto', async () => {
    mockApi({});
    function Hijo() { return <p>{usePublicConfig().config.n}</p>; }
    renderWith(<Shell><Hijo /></Shell>);
    expect(await screen.findByText('Alcipizza')).toBeInTheDocument();
  });
});

describe('toast y splash', () => {
  it('toast() muestra un aviso con la clase original', async () => {
    conConfig();
    renderWith(<Shell />);
    act(() => toast('Hola aviso'));
    expect(await screen.findByText('Hola aviso')).toHaveClass('toast');
  });

  it('sin Shell montado, toast() igual crea el aviso en el body', () => {
    toast('Aviso suelto');
    const t = [...document.querySelectorAll('.toast')].find(e => e.textContent === 'Aviso suelto');
    expect(t).toBeTruthy();
    t.remove();
  });

  it('el splash aparece una sola vez con el título de bienvenida y se cierra al tocarlo', async () => {
    reiniciarSplash();
    conConfig();
    const { unmount } = renderWith(<Shell />);
    await waitFor(() => expect(document.querySelector('#sp')).toHaveTextContent('Antojo test'));
    await userEvent.click(document.querySelector('#sp'));
    expect(document.querySelector('#sp')).toBeNull();
    unmount();
    renderWith(<Shell />);
    await screen.findByText(/Pizzería Test · Software/);
    expect(document.querySelector('#sp')).toBeNull();
  });

  it('mostrarSplash() permite a otras pantallas mostrar un mensaje', async () => {
    conConfig();
    renderWith(<Shell />);
    act(() => mostrarSplash('Bienvenida'));
    expect(document.querySelector('#sp')).toHaveTextContent('Bienvenida');
  });
});

it('SoporteBoton abre la ventana de soporte técnico', async () => {
  conConfig();
  renderWith(<Shell><SoporteBoton /></Shell>);
  await userEvent.click(screen.getByRole('button', { name: 'Soporte técnico' }));
  const md = document.querySelector('.md');
  expect(within(md).getByRole('heading', { name: 'Soporte técnico' })).toBeInTheDocument();
  expect(within(md).getByRole('link', { name: /WhatsApp · 3212292035/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573212292035\?text=/);
  await userEvent.click(within(md).getByRole('button', { name: 'Cerrar' }));
  expect(document.querySelector('.md')).toBeNull();
});
