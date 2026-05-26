import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { AdminCommissionRow, adminCommission } from '../lib/api';

/**
 * 月度 commission 汇总 — TICKET TELEPOT-20260525-090 Phase 2
 *
 * 按 supplier × 月份 聚合 status=paid 订单.
 * 列: 供应商 / 订单数 / 批发额 / 零售额 / 佣金
 * 下载 CSV 按钮 (给会计对账, 老板私密 — 含 wholesale + commission).
 *
 * 后端 endpoint: /api/admin/commission?month=YYYY-MM (默认当月)
 * 也可走 admin_monthly_commission view (migration 100 加) — 本工单先保留
 * server.js 内 JS 聚合, view 是给未来 SQL 直查 / BI 工具留口子.
 */

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function Commission() {
  const [month, setMonth] = useState<string>(currentMonthYM());
  const [rows, setRows] = useState<AdminCommissionRow[]>([]);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await adminCommission(month);
      setRows(r.suppliers ?? []);
      setTotalOrders(r.total_orders ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [month]);

  const totals = useMemo(() => {
    let wholesale = 0, retail = 0, commission = 0;
    for (const r of rows) {
      wholesale  += Number(r.total_wholesale  ?? 0);
      retail     += Number(r.total_retail     ?? 0);
      commission += Number(r.total_commission ?? 0);
    }
    return { wholesale, retail, commission };
  }, [rows]);

  function downloadCSV() {
    const header = ['月份', '供应商', '订单数', '批发额(HKD)', '零售额(HKD)', '佣金(HKD)'];
    const body = rows.map(r => [
      r.month,
      r.supplier_name,
      String(r.order_count),
      String(r.total_wholesale.toFixed(2)),
      String(r.total_retail.toFixed(2)),
      String(r.total_commission.toFixed(2)),
    ]);
    const lines = [header, ...body].map(cols =>
      cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','),
    );
    // UTF-8 BOM 让 Excel 正确识别中文
    const csv = '﻿' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission_${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell title="佣金">
      <div className="adm-toolbar">
        <button className="adm-btn" onClick={() => setMonth(shiftMonth(month, -1))}>
          ← 上月
        </button>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{month}</div>
        <button
          className="adm-btn"
          onClick={() => setMonth(shiftMonth(month, +1))}
          disabled={month >= currentMonthYM()}
        >
          下月 →
        </button>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ marginLeft: 8 }}
        />
        <div style={{ flex: 1 }} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
        <button
          className="adm-btn adm-btn-accent"
          onClick={downloadCSV}
          disabled={rows.length === 0}
        >
          下载 CSV
        </button>
      </div>

      <div className="adm-stat-grid">
        <StatCard label="本月已支付订单" value={fmtInt(totalOrders)} />
        <StatCard label="供应商数" value={fmtInt(rows.length)} />
        <StatCard label="批发总额 (HKD)" value={fmtMoney(totals.wholesale)} />
        <StatCard label="零售总额 (HKD)" value={fmtMoney(totals.retail)} />
        <StatCard label="佣金总额 (HKD)" value={fmtMoney(totals.commission)} />
        <StatCard
          label="毛利率"
          value={totals.retail > 0
            ? `${((totals.commission / totals.retail) * 100).toFixed(1)}%`
            : '—'}
        />
      </div>

      {error && <div className="adm-error">{error}</div>}

      <table className="adm-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>供应商</th>
            <th style={{ textAlign: 'right' }}>订单数</th>
            <th style={{ textAlign: 'right' }}>批发额 (HKD)</th>
            <th style={{ textAlign: 'right' }}>零售额 (HKD)</th>
            <th style={{ textAlign: 'right' }}>佣金 (HKD)</th>
            <th style={{ textAlign: 'right' }}>毛利率</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
              本月暂无已支付订单
            </td></tr>
          )}
          {rows.map(r => (
            <tr key={r.supplier_id}>
              <td style={{ fontWeight: 600 }}>{r.supplier_name}</td>
              <td style={{ textAlign: 'right' }}>{fmtInt(r.order_count)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(r.total_wholesale)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(r.total_retail)}</td>
              <td style={{ textAlign: 'right', color: '#0f766e', fontWeight: 600 }}>
                {fmtMoney(r.total_commission)}
              </td>
              <td style={{ textAlign: 'right' }}>
                {r.total_retail > 0
                  ? `${((r.total_commission / r.total_retail) * 100).toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
              <td>合计</td>
              <td style={{ textAlign: 'right' }}>{fmtInt(totalOrders)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(totals.wholesale)}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoney(totals.retail)}</td>
              <td style={{ textAlign: 'right', color: '#0f766e' }}>
                {fmtMoney(totals.commission)}
              </td>
              <td style={{ textAlign: 'right' }}>
                {totals.retail > 0
                  ? `${((totals.commission / totals.retail) * 100).toFixed(1)}%`
                  : '—'}
              </td>
            </tr>
          )}
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
