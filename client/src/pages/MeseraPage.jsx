// Panel de la mesera (mesera() de la app original): tomar pedidos, historial, cobro, tirilla y WhatsApp.
// El nombre de la mesera y el botón Salir los pone <Shell> en el encabezado, como el original.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Shell from '../components/Shell.jsx';
import { carritoDesdePedido, cuerpoPedido, validarPedido } from '../personal/carrito.js';
import CobroModal from '../personal/CobroModal.jsx';
import { Historial, Recibo } from '../personal/Historial.jsx';
import { Menu, Personalizar } from '../personal/Menu.jsx';
import { avisosListos, historial } from '../personal/pedidos.js';
import { Confirmar, Ticket } from '../personal/Ticket.jsx';
import { usePolling } from '../personal/usePolling.js';
import { useToast } from '../personal/useToast.jsx';

const SIN_DATOS = { destino: '', cliente: '', direccion: '', telefono: '', celular: '' };
const CONFIG_VACIA = { config: { n: '', tel: '', mesas: 0, w2: '', w4: '', logo: null }, pagos: [], puntos: { activo: false, puntosCanje: 100, descuentoCanje: 1000 } };

/** @typedef {{tipo:'pick', plato:any} | {tipo:'conf'} | {tipo:'cobrar', pedido:any} | {tipo:'recibo', pedido:any} | null} EstadoModal */

export default function MeseraPage() {
  const { user } = useAuth();
  const { toast, aviso } = useToast();

  const [tab, setTab] = useState(/** @type {'n'|'h'} */ ('n'));
  const [menu, setMenu] = useState(/** @type {any[]} */ ([]));
  const [cfg, setCfg] = useState(CONFIG_VACIA);
  const [pedidos, setPedidos] = useState(/** @type {any[]} */ ([]));
  const [cart, setCart] = useState(/** @type {import('../personal/carrito.js').ItemCarrito[]} */ ([]));
  const [datos, setDatos] = useState(SIN_DATOS);
  const [edit, setEdit] = useState(0);
  const [modal, setModal] = useState(/** @type {EstadoModal} */ (null));
  const [enviando, setEnviando] = useState(false);
  const previos = useRef(/** @type {any[]|null} */ (null));

  useEffect(() => {
    api.get('/api/menu').then(setMenu).catch(() => aviso('No se pudo cargar el menú', 'error'));
    api.get('/api/public/config').then(r => setCfg(c => ({ config: r.config, pagos: r.pagos || [], puntos: { ...c.puntos, ...(r.puntos || {}) } }))).catch(() => {});
  }, [aviso]);

  const cargarPedidos = useCallback(async () => {
    try {
      const lista = await api.get('/api/pedidos');
      if (!Array.isArray(lista)) return;
      if (previos.current && user) avisosListos(previos.current, lista, user.id).forEach(aviso);
      previos.current = lista;
      setPedidos(lista);
    } catch { /* se reintenta en la siguiente consulta */ }
  }, [aviso, user]);
  usePolling(cargarPedidos, 5000);

  if (!user) return null;
  if (user.debeCambiarClave) return <Navigate to="/personal" replace />;

  const limpiar = () => { setCart([]); setEdit(0); setDatos(SIN_DATOS); };

  const enviar = () => {
    const error = validarPedido(cart, datos);
    if (error) return aviso(error, 'aviso');
    setModal({ tipo: 'conf' });
  };

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    const body = cuerpoPedido(cart, datos);
    try {
      const pedido = edit ? await api.put(`/api/pedidos/${edit}`, body) : (await api.post('/api/pedidos', body)).pedido;
      aviso(edit ? 'Pedido actualizado' : 'Pedido enviado a cocina', 'exito');
      limpiar();
      setModal({ tipo: 'recibo', pedido });
      cargarPedidos();
    } catch (e) {
      setModal(null);
      aviso(e.status === 409 ? 'Este pedido ya no se puede editar: cocina ya lo está preparando' : e.message, 'error');
    } finally { setEnviando(false); }
  };

  const accion = async (fn, ok) => {
    try { await fn(); if (ok) aviso(ok, 'exito'); } catch (e) { aviso(e.message, 'error'); }
    cargarPedidos();
  };

  const acciones = {
    onCobrar: o => setModal({ tipo: 'cobrar', pedido: o }),
    onTirilla: o => setModal({ tipo: 'recibo', pedido: o }),
    onEntregado: o => accion(() => api.patch(`/api/pedidos/${o.id}/estado`, { estado: 'entregado' }), 'Pedido entregado'),
    onEditar: o => {
      setEdit(o.id);
      setCart(carritoDesdePedido(o, menu));
      setDatos({ destino: o.destino, cliente: o.cliente || '', direccion: o.direccion || '', telefono: o.telefono || '', celular: o.celular || '' });
      setTab('n');
    },
  };

  const nListos = historial(pedidos, user.id).listos.length;

  return (
    <Shell>
      <div data-testid="pagina-mesera">
        <div className="tabs">
          <button className={'btn s ' + (tab === 'n' ? 'y' : '')} onClick={() => setTab('n')}>Nuevo pedido</button>
          <button className={'btn s ' + (tab === 'h' ? 'y' : '')} onClick={() => setTab('h')}>{'Historial' + (nListos ? ' 🔔' + nListos : '')}</button>
        </div>
        {tab === 'n'
          ? <div className="cols">
            <div><Menu platos={menu} onElegir={p => setModal({ tipo: 'pick', plato: p })} /></div>
            <Ticket cart={cart} datos={datos} mesas={cfg.config.mesas} edit={edit} onDatos={setDatos}
              onQuitar={i => setCart(cart.filter((_, j) => j !== i))} onEnviar={enviar} onCancelarEdicion={limpiar} />
          </div>
          : <Historial pedidos={pedidos} meseraId={user.id} {...acciones} />}
      </div>

      {modal?.tipo === 'pick' && <Personalizar plato={modal.plato} onCerrar={() => setModal(null)}
        onAgregar={item => { setCart([...cart, item]); setModal(null); }} />}
      {modal?.tipo === 'conf' && <Confirmar cart={cart} datos={datos} enviando={enviando} onConfirmar={confirmar} onVolver={() => setModal(null)} />}
      {modal?.tipo === 'cobrar' && <CobroModal o={modal.pedido} pagos={cfg.pagos} puntos={cfg.puntos} onCobrado={cargarPedidos} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'recibo' && <Recibo o={modal.pedido} config={cfg.config} pagos={cfg.pagos} onCerrar={() => setModal(null)} />}
      {toast}
    </Shell>
  );
}
