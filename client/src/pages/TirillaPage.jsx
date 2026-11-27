// Página "/tirilla/:id?token=...": tirilla del pedido del cliente, que se actualiza sola hasta entregarse.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Shell from '../components/Shell.jsx';
import Recibo from '../components/Recibo.jsx';
import { toast } from '../components/toast.jsx';
import { guardarEdicion, leerTirilla } from '../cliente/tirillaLocal.js';

const FINALES = ['entregado', 'cancelado'];

/** @param {{ intervalo?: number }} p  Milisegundos entre consultas del estado (5 s). */
export default function TirillaPage({ intervalo = 5000 }) {
  return <Shell><Tirilla intervalo={intervalo} /></Shell>;
}

/** Token de la URL o, si es el mismo pedido, el guardado en este navegador. */
function tokenDe(id, q) {
  if (q) return q;
  const t = leerTirilla();
  return t && String(t.id) === String(id) ? t.token : null;
}

function Tirilla({ intervalo }) {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const token = tokenDe(id, sp.get('token'));
  const [pedido, setPedido] = useState(null);
  const [negado, setNegado] = useState(!token);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!token) { setNegado(true); return undefined; }
    let vivo = true, timer, ok = false;
    const cargar = async () => {
      try {
        const p = await api.get(`/api/pedidos/${id}?token=${encodeURIComponent(token)}`);
        if (!vivo) return;
        ok = true;
        setPedido(p);
        if (FINALES.includes(p?.estado)) return;
      } catch {
        if (!vivo) return;
        if (!ok) { setNegado(true); return; }
      }
      timer = setTimeout(cargar, intervalo);
    };
    setNegado(false);
    cargar();
    return () => { vivo = false; clearTimeout(timer); };
  }, [id, token, intervalo]);

  const recargar = async () => {
    const p = await api.get(`/api/pedidos/${id}?token=${encodeURIComponent(token)}`);
    setPedido(p);
    return p;
  };

  const cancelar = async () => {
    if (!window.confirm('¿Seguro que quieres cancelar tu pedido?')) return;
    setOcupado(true);
    try {
      setPedido(await api.post(`/api/pedidos/${id}/cancelar`, { token }));
      toast('Pedido cancelado', 'exito');
    } catch (e) {
      toast(e.message, 'error');
      if (e.status === 409) { try { await recargar(); } catch { /* sin conexión */ } }
    } finally {
      setOcupado(false);
    }
  };

  const editar = () => {
    guardarEdicion({ id: pedido.id, token, pedido });
    navigate('/');
  };

  if (negado) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '3rem auto', textAlign: 'center' }}>
        <div className="em" style={{ margin: '0 auto .6rem' }}>🔒</div>
        <h2>Solo puedes ver tu propia tirilla</h2>
        <Link className="btn" style={{ marginTop: '1rem' }} to="/">Volver al menú</Link>
      </div>
    );
  }
  if (!pedido) return <p className="sm" style={{ textAlign: 'center', margin: '3rem 0' }}>Cargando tu tirilla…</p>;
  return <Recibo pedido={pedido} onCerrar={() => navigate('/')} onCancelar={cancelar} onEditar={editar} cancelando={ocupado} />;
}
