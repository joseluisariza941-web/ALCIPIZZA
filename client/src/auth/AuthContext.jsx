import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, resetCsrf } from '../api.js';

/**
 * @typedef {{ id:number, usuario:string, nombre:string, rol:'dev'|'cocina'|'mesera', debeCambiarClave?:boolean }} Usuario
 * @typedef {{ user: Usuario|null, loading:boolean, login:(usuario:string, clave:string)=>Promise<Usuario>,
 *   logout:()=>Promise<void>, refresh:()=>Promise<void>, setUser:(u:Usuario|null)=>void }} Auth
 */

/** @type {import('react').Context<Auth>} */
export const AuthContext = createContext(/** @type {any} */ (null));
export const useAuth = () => useContext(AuthContext);

/** Panel de inicio de cada rol. */
export const INICIO = { cocina: '/cocina', mesera: '/mesera', dev: '/dev' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(/** @type {Usuario|null} */ (null));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setUser((await api.get('/api/auth/me')).user); } catch { setUser(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (usuario, clave) => {
    const { user: u } = await api.post('/api/auth/login', { usuario, clave });
    resetCsrf(); // la sesión se regenera: nuevo token
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } finally { resetCsrf(); setUser(null); }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>{children}</AuthContext.Provider>;
}

/** Deja pasar solo a los roles indicados; si no, al login o al panel propio. */
export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.debeCambiarClave) return <Navigate to="/personal" replace />;
  if (!roles.includes(user.rol)) return <Navigate to={INICIO[user.rol] || '/'} replace />;
  return children;
}
