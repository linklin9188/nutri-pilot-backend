import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  AdminOrderRange,
  AdminOrderRow,
  AdminOrderStatus,
  adminOrders,
} from '../lib/api';

/**
 * 订单列表 — TICKET TELEPOT-20260525-090 Phase 1
 *
 * 顶部 4 卡: 订单数 / 总营业 / 总佣金 / 平均客单
 * 筛选: status (all/pending_payment/paid/...) + range (today/week/month/all)
 * 表格: 订单号 / userId(短) / status / 总额 / 佣金(老板私密) / 收货人 / Stripe 链接
 *
 * 注意: commission_total_hkd 是老板私密字段, 前端用户层从来不渲染, 但 admin 后台可见.
 */

const STATUS_OPTIONS: Array<{ value: AdminOrderStatus; label: string }> = [
  { value: 'all',             label: '全部状态' },
  { value: 'pending_payment', label: '待支付' },
  { value: 'paid',            label: '已支付' },
  { value: 'preparing',       label: '备货中' },
  { value: 'shipped',         label: '已发货' },
  { value: 'delivered',       label: '已送达' },
  { value: 'cancelled',       label: '已取消' },
  { value: 'refunded',        label: '已退款' },
];

const RANGE_OPTIONS: Array<{ value: AdminOrderRange; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'week',  label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'all',   label: '全部' },
];

export default function Orders() {
  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  const [status, setStatus] = useState<AdminOrderStatus>('all');
  const [range, setRange] = useState<AdminOrderRange>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await adminOrders({ status, range, limit: 200 });
      setRows(r.orders ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status, range]);

  const stats = useMemo(() => {
    const count = rows.length;
    let totalRevenue = 0;
    let totalCommission = 0;
    for (const r of rows) {
      totalRevenue    += Number(r.total_hkd ?? 0);
      totalCommission += Number(r.commission_total_hkd ?? 0);
    }
    const avg = count > 0 ? totalRevenue / count : 0;
    return { count, totalRevenue, totalCommission, avg };
  }, [rows]);

  return (
    <AdminShell title="订单">
      <div className="adm-stat-grid">
        <StatCard label="订单数" value={fmtInt(stats.count)} />
        <StatCard label="总营业 (HKD)" value={fmtMoney(stats.totalRevenue)} />
        <StatCard label="总佣金 (HKD, 老板私密)" value={fmtMoney(stats.totalCommission)} />
        <StatCard label="平均客单 (HKD)" value={fmtMoney(stats.avg)} />
      </div>

      <div className="adm-toolbar" style={{ marginTop: 12 }}>
        <select value={status} onChange={e => setStatus(e.target.value as AdminOrderStatus)}>
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={range} onChange={e => setRange(e.target.value as AdminOrderRange)}>
          {RANGE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {error && <div className="adm-error">{error}</div>}

      <table className="adm-table">
        <thead>
          <tr>
            <th>订单号</th>
            <th>用户 ID</th>
            <th>状态</th>
            <th style={{ textAlign: 'right' }}>总额</th>
            <th style={{ textAlign: 'right' }}>佣金</th>
            <th>条目</th>
            <th>收货人</th>
            <th>下单时间</th>
            <th>Stripe</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
              当前筛选无订单
            </td></tr>
          )}
          {rows.map(o => (
            <tr key={o.id}>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {o.order_number ?? o.id.slice(0, 8)}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {(o.user_id ?? '').slice(0, 8)}
              </td>
              <td><OrderStatusPill value={o.status} /></td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(o.total_hkd)}</td>
              <td style={{ textAlign: 'right', color: '#0f766e', fontWeight: 600 }}>
                {fmtMoney(o.commission_total_hkd)}
              </td>
              <td>{o.items_count}</td>
              <td style={{ fontSize: 12 }}>
                {o.delivery_contact_name ?? '—'}
                {o.delivery_contact_phone && (
                  <div style={{ color: '#94a3b8' }}>{o.delivery_contact_phone}</div>
                )}
              </td>
              <td style={{ fontSize: 12, color: '#475569' }}>{fmtTime(o.created_at)}</td>
              <td style={{ fontSize: 12 }}>
                {o.stripe_session_id ? (
                  <a
                    href={`https://dashboard.stripe.com/payments/${encodeURIComponent(o.stripe_session_id)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0ea5e9' }}
                  >
                    查看
                  </a>
                ) : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function OrderStatusPill({ value }: { value: string }) {
  let cls = 'adm-pill';
  if (value === 'paid' || value === 'delivered') cls += ' adm-pill-active';
  else if (value === 'pending_payment' || value === 'preparing' || value === 'shipped') cls += ' adm-pill-pending';
  else cls += ' adm-pill-paused';
  return <span className={cls}>{value}</span>;
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('zh-CN').format(n);
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
