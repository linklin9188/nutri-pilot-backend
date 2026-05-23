import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminMe, adminStats, AdminMe, AdminStats } from '../lib/api';
import { clearAdminSession, getAdminUsername } from '../lib/auth';

const STAT_CARDS: Array<{ key: keyof AdminStats; label: string }> = [
  { key: 'total_users',        label: '总用户数' },
  { key: 'trial_active_users', label: '试用中' },
  { key: 'premium_users',      label: '付费用户' },
  { key: 'new_users_7d',       label: '本周新增' },
  { key: 'active_users_7d',    label: '本周活跃' },
  { key: 'total_menus',        label: '累计菜单' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meR = await adminMe();
        if (cancelled) return;
        if (!meR.is_admin) {
          clearAdminSession();
          navigate('/login');
          return;
        }
        setMe(meR);
        const s = await adminStats();
        if (!cancelled) setStats(s);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  function onLogout() {
    clearAdminSession();
    navigate('/login');
  }

  return (
    <div className="adm-shell">
      <header className="adm-header">
        <h1>Aieats 运营后台</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="adm-meta">
            管理员: {me?.username ?? getAdminUsername() ?? '—'}
          </span>
          <button onClick={onLogout}>退出</button>
        </div>
      </header>
      <main className="adm-main">
        {error && <div className="adm-error">{error}</div>}
        <div className="adm-stat-grid">
          {STAT_CARDS.map(c => (
            <div
              key={c.key}
              className={`adm-stat-card${stats ? '' : ' adm-stat-loading'}`}
            >
              <div className="adm-stat-label">{c.label}</div>
              <div className="adm-stat-value">
                {stats ? formatNumber(stats[c.key]) : '—'}
              </div>
            </div>
          ))}
        </div>
        <section className="adm-section">
          <h2>用户列表</h2>
          <div className="adm-placeholder">
            sprint 1 (TICKET-002) 上线 — 表格 + 搜索 + 筛选
          </div>
        </section>
      </main>
    </div>
  );
}

function formatNumber(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('zh-CN').format(n);
}
