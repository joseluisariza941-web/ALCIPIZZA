import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { SoporteBoton } from '../components/Soporte.jsx';
import { usePedidos } from '../cocina/usePedidos.js';
import Pedidos from '../cocina/Pedidos.jsx';
import Inventario from '../cocina/Inventario.jsx';
import Surtidores from '../cocina/Surtidores.jsx';
import Comidas from '../cocina/Comidas.jsx';
import Reporte from '../cocina/Reporte.jsx';
import Personal from '../cocina/Personal.jsx';
import Ajustes from '../cocina/Ajustes.jsx';
import Promociones from '../cocina/Promociones.jsx';
import Clientes from '../cocina/Clientes.jsx';
import { fijarSonido } from '../cocina/sonido.js';
import { api } from '../api.js';

const TABS = [['', 'Pedidos'], ['inventario', 'Inventario'], ['surtidores', 'Surtidores'], ['comidas', 'Comidas'],
  ['promociones', 'Promociones'], ['clientes', 'Clientes'], ['reporte', 'Reporte'], ['personal', 'Personal'], ['ajustes', 'Ajustes']];

/** Panel de cocina (administración) con las pestañas del original. */
export default function CocinaPage() {
  const { pedidos, recargar } = usePedidos();
  const nav = useNavigate();
  useEffect(() => { api.get('/api/config').then(c => fijarSonido(c?.sonido)).catch(() => {}); }, []);
  const actual = useLocation().pathname.replace(/^\/cocina\/?/, '').split('/')[0];
  const act = pedidos.filter(o => o.estado === 'nuevo' || o.estado === 'preparando').length;

  return (
    <Shell>
      <main className="wrap" data-testid="pagina-cocina">
        <div className="tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={`btn s ${actual === k ? 'y' : ''}`} onClick={() => nav(k ? `/cocina/${k}` : '/cocina')}>
              {k === '' && act ? `${l} (${act})` : l}
            </button>
          ))}
        </div>
        <Routes>
          <Route index element={<Pedidos pedidos={pedidos} recargar={recargar} />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="surtidores" element={<Surtidores />} />
          <Route path="comidas" element={<Comidas />} />
          <Route path="promociones" element={<Promociones />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="reporte" element={<Reporte />} />
          <Route path="personal" element={<Personal />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/cocina" replace />} />
        </Routes>
        <SoporteBoton />
      </main>
    </Shell>
  );
}
