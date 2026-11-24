import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/styles.css'; // los estilos originales, sin cambios
import { paletasCss, ThemeProvider } from './theme/useTheme.js';
import { AuthProvider } from './auth/AuthContext.jsx';
import App from './App.jsx';

document.getElementById('ps').textContent = paletasCss;

createRoot(document.getElementById('app')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
