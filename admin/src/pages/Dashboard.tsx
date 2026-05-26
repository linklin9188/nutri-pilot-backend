import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/AdminShell';
import { adminStats, AdminStats } from '../lib/api';

// TICKET-091: 主指标卡 (排除 seed + test 后真用户)
const REAL_STAT_CARDS: Array<{ key: keyof AdminStats; label: string; sub?: (s: AdminStats) => string }> = [
  {
    key: 'real_users',
    label: '真用户数',
    sub: s => `微信 ${fmtNum(s.wechat_real_users)} + 匿名 ${fmtNum(s.anon_users)} + 其他 ${fmtNum(s.other_real_users)}`,
  },
  { key: 'real_new_7d',       label: '本周新增 (真)' },
  { key: 'real_active_7d',    label: '本周活跃 (真)' },
  { key: 'trial_active_users', label: '试用中 (全部)' },
  { key: 'premium_users',     label: '付费用户' },
  { key: 'total_menus',       label: '累计菜单' },
];

// TICKET-091: 副指标 — seed + test (透明度低)
const SUBDUED_STAT_CARDS: Array<{ key: keyof AdminStats; label: string }> = [
  { key: 'seed_users', label: 'Seed 数据 (排除)' },
  { key: 'test_users', label: '测试号 (排除)' },
  { key: 'total_users', label: '总记录数 (含 seed+test)' },
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
    desc: '真用户 tab 默认 + category chip, 排除 seed/test 看真实业务',
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

      {/* TICKET-091 主指标 — 真用户 */}
      <div className="adm-stat-grid">
        {REAL_STAT_CARDS.map(c => (
          <div
            key={c.key}
            className={`adm-stat-card${stats ? '' : ' adm-stat-loading'}`}
          >
            <div className="adm-stat-label">{c.label}</div>
            <div className="adm-stat-value">
              {stats ? fmtNum(stats[c.key]) : '—'}
            </div>
            {stats && c.sub && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {c.sub(stats)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* TICKET-091 副指标 — seed/test 透明度低 */}
      <div className="adm-stat-grid" style={{ marginTop: 12, opacity: 0.55 }}>
        {SUBDUED_STAT_CARDS.map(c => (
          <div
            key={c.key}
            className={`adm-stat-card${stats ? '' : ' adm-stat-loading'}`}
          >
            <div className="adm-stat-label">{c.label}</div>
            <div className="adm-stat-value">
              {stats ? fmtNum(stats[c.key]) : '—'}
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

function fmtNum(n: number | null | undefined): string {
  if (n == null || typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('zh-CN').format(n);
}
