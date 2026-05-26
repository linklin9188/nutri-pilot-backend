import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/AdminShell';
import { adminStats, AdminStats } from '../lib/api';

const STAT_CARDS: Array<{ key: keyof AdminStats; label: string }> = [
  { key: 'total_users',        label: '总用户数' },
  { key: 'trial_active_users', label: '试用中' },
  { key: 'premium_users',      label: '付费用户' },
  { key: 'new_users_7d',       label: '本周新增' },
  { key: 'active_users_7d',    label: '本周活跃' },
  { key: 'total_menus',        label: '累计菜单' },
];

// TICKET-090 Phase 3 — 3 入口卡, 链到新页
const ENTRY_CARDS: Array<{ to: string; title: string; desc: string }> = [
  {
    to: '/orders',
    title: '订单管理',
    desc: '订单列表 + 营业额 / 佣金 / 客单 顶部卡, 按 status + 时间筛',
  },
  {
    to: '/commission',
    title: '月度佣金',
    desc: '按供应商汇总, 含批发 / 零售 / 佣金, 一键导 CSV 给会计',
  },
  {
    to: '/users',
    title: '用户增长',
    desc: '今日 / 本周 / 本月新增, 试用 vs 付费 vs 过期, 最近 50 注册',
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await adminStats();
        if (!cancelled) setStats(s);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <AdminShell title="概览">
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
        <h2>运营入口</h2>
        <div className="adm-stat-grid">
          {ENTRY_CARDS.map(e => (
            <Link
              key={e.to}
              to={e.to}
              className="adm-stat-card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                cursor: 'pointer',
                transition: 'box-shadow 120ms ease',
              }}
            >
              <div className="adm-stat-label" style={{ color: '#0f172a', fontWeight: 600 }}>
                {e.title} →
              </div>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.5 }}>
                {e.desc}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}

function formatNumber(n: number): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('zh-CN').format(n);
}
