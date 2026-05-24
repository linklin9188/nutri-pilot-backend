import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { adminMe } from '../lib/api';
import { clearAdminSession, getAdminUsername } from '../lib/auth';

/**
 * Shared layout for all post-login admin pages.
 * - header (title + logout)
 * - nav tabs (Dashboard / Suppliers / SKUs / Report)
 * - main content slot
 *
 * Also performs the adminMe() check so each page doesn't re-implement
 * "kick to /login if token invalid". 401 in api.ts already handles that
 * for any subsequent call, but this gives a fast path on initial mount.
 */
export default function AdminShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(getAdminUsername());
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await adminMe();
        if (cancelled) return;
        if (!me.is_admin) {
          clearAdminSession();
          navigate('/login');
          return;
        }
        setUsername(me.username);
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : '加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function onLogout() {
    clearAdminSession();
    navigate('/login');
  }

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <h1>Aieats 运营后台{title ? ` · ${title}` : ''}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="adm-meta">
            管理员: {username ?? '—'}
          </span>
          <button onClick={onLogout}>退出</button>
        </div>
      </header>
      <nav className="adm-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          概览
        </NavLink>
        <NavLink to="/suppliers" className={({ isActive }) => (isActive ? 'active' : '')}>
          供货商
        </NavLink>
        <NavLink to="/skus" className={({ isActive }) => (isActive ? 'active' : '')}>
          SKU
        </NavLink>
        <NavLink to="/report" className={({ isActive }) => (isActive ? 'active' : '')}>
          导流报表
        </NavLink>
      </nav>
      <main className="adm-main">
        {bootError && <div className="adm-error">{bootError}</div>}
        {children}
      </main>
    </div>
  );
}
