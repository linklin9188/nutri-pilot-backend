import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import CategoryChip from '../components/CategoryChip';
import {
  AdminRealUserRow,
  AdminRealUsersFilter,
  AdminRecentUserRow,
  AdminUserGrowthSummary,
  adminUsersGrowth,
  adminUsersReal,
} from '../lib/api';

/**
 * 用户增长 — TICKET TELEPOT-20260525-090 Phase 3 + TICKET TELEPOT-20260526-091
 *
 * 老板真测 #27 发现 94 总用户里 33% 是 seed/test 污染. 091 加:
 *   - 顶部 tab: 真用户 (default) / 微信 / 匿名 / 其他真实 / Seed / 测试号 / 全部
 *   - summary 默认展示真用户指标, seed/test 透明度低显示
 *   - 列表加 category chip
 *
 * 数据流:
 *   - 'all' tab → /api/admin/users-growth recent[] (最近 50, 含分类)
 *   - 其他 tab  → /api/admin/users-real?category=<x> (最多 200, 排除/筛选 seed)
 */

type ViewKey = 'all_real' | 'wechat_real' | 'anon' | 'other_real' | 'seed' | 'test' | 'all';

const TAB_LABELS: Record<ViewKey, string> = {
  all_real:    '真用户',
  wechat_real: '微信',
  anon:        '匿名',
  other_real:  '其他真实',
  seed:        'Seed',
  test:        '测试号',
  all:         '全部 (最近 50)',
};

export default function Users() {
  const [summary, setSummary] = useState<AdminUserGrowthSummary | null>(null);
  const [recent, setRecent] = useState<AdminRecentUserRow[]>([]);   // 'all' tab
  const [realRows, setRealRows] = useState<AdminRealUserRow[]>([]); // 非 all tab
  const [view, setView] = useState<ViewKey>('all_real');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reloadGrowth() {
    try {
      const r = await adminUsersGrowth();
      setSummary(r.summary);
      setRecent(r.recent ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }

  async function reloadReal(cat: AdminRealUsersFilter) {
    try {
      const r = await adminUsersReal(cat);
      setRealRows(r.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      // summary 永远拉 (顶部卡需要)
      const p1 = reloadGrowth();
      // 当前 view 数据
      const p2 = view === 'all' ? Promise.resolve() : reloadReal(view);
      await Promise.all([p1, p2]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  // 当前列表展示数据 (按 tab 切)
  const currentRows = useMemo(() => {
    if (view === 'all') return recent;
    return realRows;
  }, [view, recent, realRows]);

  // tab 计数 (从 summary 取)
  const tabCounts: Record<ViewKey, number | null> = {
    all_real:    summary?.real_total ?? null,
    wechat_real: summary?.wechat_real ?? null,
    anon:        summary?.anon_count ?? null,
    other_real:  summary?.other_real ?? null,
    seed:        summary?.seed_count ?? null,
    test:        summary?.test_count ?? null,
    all:         summary?.total ?? null,
  };

  return (
    <AdminShell title="用户增长">
      <div className="adm-toolbar">
        <div style={{ fontSize: 12, color: '#71717a' }}>
          数据源: admin_users_view + user_profiles.wechat_openid (091 加分类) — service_role
        </div>
        <div style={{ flex: 1 }} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {/* TICKET-091: 顶部主指标 = 真用户 */}
      <div className="adm-stat-grid">
        <StatCard
          label="真用户数"
          value={fmtInt(summary?.real_total)}
          sub={summary
            ? `微信 ${fmtInt(summary.wechat_real)} + 匿名 ${fmtInt(summary.anon_count)} + 其他 ${fmtInt(summary.other_real)}`
            : undefined}
        />
        <StatCard label="今日新增 (真)" value={fmtInt(summary?.real_new_today)} />
        <StatCard label="本周新增 (真)" value={fmtInt(summary?.real_new_week)} />
        <StatCard label="本月新增 (真)" value={fmtInt(summary?.real_new_month)} />
        <StatCard label="试用中 (真)" value={fmtInt(summary?.real_trial_active)} />
        <StatCard label="付费 (真)" value={fmtInt(summary?.real_paid_count)} />
      </div>

      <div className="adm-stat-grid" style={{ marginTop: 8 }}>
        <StatCard label="试用过期 (真)" value={fmtInt(summary?.real_trial_expired)} />
        <StatCard
          label="付费转化率 (真)"
          value={summary && summary.real_conv_rate != null
            ? `${(summary.real_conv_rate * 100).toFixed(1)}%`
            : '—'}
        />
      </div>

      {/* TICKET-091: seed + test 单独一行, 透明度低 */}
      <div className="adm-stat-grid" style={{ marginTop: 8, opacity: 0.55 }}>
        <StatCard label="Seed 数据 (排除)" value={fmtInt(summary?.seed_count)} />
        <StatCard label="测试号 (排除)" value={fmtInt(summary?.test_count)} />
        <StatCard label="总记录数 (含 seed+test)" value={fmtInt(summary?.total)} />
      </div>

      {error && <div className="adm-error">{error}</div>}

      <section className="adm-section">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {(Object.keys(TAB_LABELS) as ViewKey[]).map(k => {
            const active = view === k;
            const cnt = tabCounts[k];
            return (
              <button
                key={k}
                onClick={() => setView(k)}
                style={{
                  padding: '6px 12px',
                  border:  '1px solid ' + (active ? '#0f172a' : '#e2e8f0'),
                  background: active ? '#0f172a' : '#fff',
                  color:      active ? '#fff'    : '#0f172a',
                  borderRadius: 8,
                  cursor:    'pointer',
                  fontSize:  13,
                  fontWeight: active ? 600 : 500,
                }}
              >
                {TAB_LABELS[k]}{cnt != null ? ` (${cnt})` : ''}
              </button>
            );
          })}
        </div>

        <table className="adm-table">
          <thead>
            <tr>
              <th>ID (前 8)</th>
              <th>昵称</th>
              <th>分类</th>
              <th>tier</th>
              <th>家乡</th>
              <th>目标</th>
              <th>试用到期</th>
              <th>注册时间</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                暂无用户
              </td></tr>
            )}
            {currentRows.map(u => (
              <tr key={u.id_short + (u.created_at ?? '')}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.id_short || '—'}</td>
                <td>{u.display_name ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td><CategoryChip category={u.category} /></td>
                <td><TierPill value={u.tier} /></td>
                <td style={{ fontSize: 12 }}>{u.hometown ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{u.dietary_goal ?? '—'}</td>
                <td style={{ fontSize: 12, color: '#475569' }}>{fmtDate(u.trial_end_at)}</td>
                <td style={{ fontSize: 12, color: '#475569' }}>{fmtTime(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {view !== 'all' && currentRows.length >= 200 && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
            显示前 200 行 (按 created_at desc), 完整数据请直接查 DB.
          </div>
        )}
      </section>
    </AdminShell>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function TierPill({ value }: { value: 'paid' | 'trial' | 'expired' }) {
  let cls = 'adm-pill';
  let txt: string = value;
  if (value === 'paid')         { cls += ' adm-pill-active';  txt = '付费'; }
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
