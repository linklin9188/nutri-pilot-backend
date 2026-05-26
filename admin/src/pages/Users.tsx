import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  AdminRecentUserRow,
  AdminUserGrowthSummary,
  adminUsersGrowth,
} from '../lib/api';

/**
 * 用户增长 — TICKET TELEPOT-20260525-090 Phase 3
 *
 * 顶部:
 *   总用户 / 今日新增 / 本周新增 / 本月新增 / 试用中 / 已付费 / 试用过期 / 转化率
 * 表格: 最近 50 注册用户
 *   id 前 8 位 (脱敏) / 昵称 / tier / 试用到期 / 家乡 / 目标 / 注册时间
 *
 * 后端 endpoint: /api/admin/users-growth (复用 admin_users_view, JS 聚合).
 */

export default function Users() {
  const [summary, setSummary] = useState<AdminUserGrowthSummary | null>(null);
  const [recent, setRecent] = useState<AdminRecentUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await adminUsersGrowth();
      setSummary(r.summary);
      setRecent(r.recent ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  return (
    <AdminShell title="用户增长">
      <div className="adm-toolbar">
        <div style={{ fontSize: 12, color: '#71717a' }}>
          数据源: admin_users_view (078 migration) — service_role 全量拉
        </div>
        <div style={{ flex: 1 }} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      <div className="adm-stat-grid">
        <StatCard label="总用户" value={fmtInt(summary?.total)} />
        <StatCard label="今日新增" value={fmtInt(summary?.new_today)} />
        <StatCard label="本周新增" value={fmtInt(summary?.new_week)} />
        <StatCard label="本月新增" value={fmtInt(summary?.new_month)} />
        <StatCard label="试用中" value={fmtInt(summary?.trial_active)} />
        <StatCard label="已付费" value={fmtInt(summary?.paid_count)} />
      </div>

      <div className="adm-stat-grid" style={{ marginTop: 8 }}>
        <StatCard label="试用过期" value={fmtInt(summary?.trial_expired)} />
        <StatCard
          label="付费转化率 (paid / paid+expired)"
          value={summary
            ? `${(summary.conv_rate * 100).toFixed(1)}%`
            : '—'}
        />
      </div>

      {error && <div className="adm-error">{error}</div>}

      <section className="adm-section">
        <h2>最近 50 注册用户</h2>
        <table className="adm-table">
          <thead>
            <tr>
              <th>ID (前 8)</th>
              <th>昵称</th>
              <th>tier</th>
              <th>家乡</th>
              <th>目标</th>
              <th>试用到期</th>
              <th>注册时间</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                暂无用户
              </td></tr>
            )}
            {recent.map(u => (
              <tr key={u.id_short + (u.created_at ?? '')}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.id_short || '—'}</td>
                <td>{u.display_name ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td><TierPill value={u.tier} /></td>
                <td style={{ fontSize: 12 }}>{u.hometown ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{u.dietary_goal ?? '—'}</td>
                <td style={{ fontSize: 12, color: '#475569' }}>{fmtDate(u.trial_end_at)}</td>
                <td style={{ fontSize: 12, color: '#475569' }}>{fmtTime(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
    </div>
  );
}

function TierPill({ value }: { value: 'paid' | 'trial' | 'expired' }) {
  let cls = 'adm-pill';
  let txt = value;
  if (value === 'paid')    { cls += ' adm-pill-active';  txt = '付费'; }
  else if (value === 'trial')   { cls += ' adm-pill-pending'; txt = '试用'; }
  else                          { cls += ' adm-pill-paused';  txt = '过期'; }
  return <span className={cls}>{txt}</span>;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('zh-CN').format(Number(n));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
