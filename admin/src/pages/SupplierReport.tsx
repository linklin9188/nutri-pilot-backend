import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { supplierReport, SupplierReportRow } from '../lib/api';

/**
 * 导流报表 — 按 supplier × 当周聚合
 * - 本周 click 数
 * - unique user 数（distinct user_id，所有匿名算 1 个）
 * - 热门 SKU top 5
 * - 热门来源菜 top 5（join dishes on source_dish_id）
 */
export default function SupplierReport() {
  const [rows, setRows] = useState<SupplierReportRow[]>([]);
  const [weekStart, setWeekStart] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const r = await supplierReport();
      setRows(r.suppliers);
      setWeekStart(r.week_start_iso);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  return (
    <AdminShell title="导流报表">
      <div className="adm-toolbar">
        <div style={{ fontSize: 12, color: '#71717a' }}>
          统计区间: {weekStart ? `${weekStart.slice(0, 10)} (周一 UTC) → 现在` : '加载中…'}
        </div>
        <div style={{ flex: 1 }} />
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>
      {error && <div className="adm-error">{error}</div>}

      {rows.length === 0 && !loading && (
        <div className="adm-placeholder">本周暂无导流数据</div>
      )}

      {rows.map(r => (
        <div key={r.supplier_id} className="adm-report-supplier">
          <h3>{r.supplier_name}</h3>
          <div className="adm-report-metrics">
            <div className="adm-report-metric">
              <div className="label">本周点击</div>
              <div className="value">{r.click_count}</div>
            </div>
            <div className="adm-report-metric">
              <div className="label">独立用户</div>
              <div className="value">{r.unique_users}</div>
            </div>
          </div>
          <div className="adm-report-top">
            <div>
              <h4>热门 SKU Top 5</h4>
              {r.top_skus.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>
              ) : (
                <ol>
                  {r.top_skus.map(s => (
                    <li key={s.sku_id}>
                      {s.sku_name} <span className="count">({s.count})</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h4>热门来源菜 Top 5</h4>
              {r.top_dishes.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>
              ) : (
                <ol>
                  {r.top_dishes.map(d => (
                    <li key={d.dish_id}>
                      {d.dish_name} <span className="count">({d.count})</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      ))}
    </AdminShell>
  );
}
