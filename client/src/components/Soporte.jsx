// Botón flotante 🛠️ y ventana de soporte técnico (soporte() original). Úsalo dentro de <Shell>.
import { useState } from 'react';
import Modal from './Modal.jsx';
import IconoWhatsApp from './IconoWhatsApp.jsx';
import { usePublicConfig } from './ConfigContext.jsx';

/** @param {{ onClose: () => void }} p */
export function SoporteModal({ onClose }) {
  const { config } = usePublicConfig();
  return (
    <Modal>
      <div className="card" style={{ maxWidth: 380, width: '92%', textAlign: 'center' }}>
        <div className="em" style={{ margin: '0 auto .6rem' }}>🛠️</div>
        <h2>Soporte técnico</h2>
        <p className="sm" style={{ margin: '.5rem 0 1rem' }}>¿Algo no funciona? Escríbele al ING. José Luis Ariza.</p>
        <div style={{ display: 'grid', gap: '.6rem' }}>
          <a className="btn wa" target="_blank" rel="noopener noreferrer"
            href={`https://wa.me/573212292035?text=${encodeURIComponent('Hola, necesito soporte técnico con el sistema de ' + config.n)}`}>
            <IconoWhatsApp /> WhatsApp · 3212292035
          </a>
          <a className="btn y" href={`mailto:joseluisariza941@gmail.com?subject=${encodeURIComponent('Soporte técnico - ' + config.n)}`}>✉️ joseluisariza941@gmail.com</a>
        </div>
        <button className="btn s" style={{ marginTop: '1rem' }} onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}

export function SoporteBoton() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button className="fab" aria-label="Soporte técnico" title="Soporte técnico" onClick={() => setAbierto(true)}>🛠️</button>
      {abierto && <SoporteModal onClose={() => setAbierto(false)} />}
    </>
  );
}
