import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/AuthContext.jsx';
import ClientePage from './pages/ClientePage.jsx';
import TirillaPage from './pages/TirillaPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MeseraPage from './pages/MeseraPage.jsx';
import CocinaPage from './pages/CocinaPage.jsx';
import DevPage from './pages/DevPage.jsx';

// Rutas exportadas aparte para poder probarlas con MemoryRouter.
export const appRoutes = [
  <Route key="cliente" path="/" element={<ClientePage />} />,
  <Route key="tirilla" path="/tirilla/:id" element={<TirillaPage />} />,
  <Route key="login" path="/personal" element={<LoginPage />} />,
  <Route key="mesera" path="/mesera/*" element={<RequireRole roles={['mesera']}><MeseraPage /></RequireRole>} />,
  <Route key="cocina" path="/cocina/*" element={<RequireRole roles={['cocina', 'superadmin']}><CocinaPage /></RequireRole>} />,
  <Route key="dev" path="/dev/*" element={<RequireRole roles={['dev', 'superadmin']}><DevPage /></RequireRole>} />,
  <Route key="resto" path="*" element={<Navigate to="/" replace />} />,
];

export default function App() {
  return <Routes>{appRoutes}</Routes>;
}
