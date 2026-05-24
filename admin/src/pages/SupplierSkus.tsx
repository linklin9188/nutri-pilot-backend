import { FormEvent, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  AdminSku,
  AdminSupplier,
  createSku,
  listSkus,
  listSuppliers,
  updateSku,
} from '../lib/api';

/**
 * SKU 管理 — 按 supplier 筛选下拉 + 列表 + 新增 / 编辑 + 上架/下架 toggle
 */

type EditState =
  | { mode: 'new'; supplierId?: string }
  | { mode: 'edit'; sku: AdminSku }
  | null;

export default function SupplierSkus() {
  const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
  const [supplierId, setSupplierId] = useState<string>(''); // '' = all
  const [skus, setSkus] = useState<AdminSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const supplierName = useMemo(() => {
    const m = new Map(suppliers.map(s => [s.id, s.name]));
    return (id: string) => m.get(id) ?? '(unknown)';
  }, [suppliers]);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [sup, sk] = await Promise.all([
        listSuppliers(),
        listSkus(supplierId || undefined),
      ]);
      setSuppliers(sup);
      setSkus(sk);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [supplierId]);

  async function toggleActive(s: AdminSku) {
    setBusyId(s.id);
    try {
      await updateSku(s.id, { active: !s.active });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="SKU">
      <div className="adm-toolbar">
        <label style={{ fontSize: 12, color: '#71717a' }}>按供货商筛选:</label>
        <select value={supplierId} onChange={e => setSupplierId(e.target.value)}>
          <option value="">全部 ({suppliers.length})</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          className="adm-btn adm-btn-accent"
          onClick={() => setEdit({ mode: 'new', supplierId: supplierId || undefined })}
          disabled={suppliers.length === 0}
        >
          + 新增 SKU
        </button>
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>
      {error && <div className="adm-error">{error}</div>}

      <table className="adm-table">
        <thead>
          <tr>
            <th>SKU 名</th>
            <th>供货商</th>
            <th>价格</th>
            <th>单位</th>
            <th>关键词</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {skus.length === 0 && !loading && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
              暂无 SKU
            </td></tr>
          )}
          {skus.map(s => (
            <tr key={s.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{s.sku_name}</div>
                {s.sku_external_id && (
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>ext: {s.sku_external_id}</div>
                )}
              </td>
              <td style={{ fontSize: 12 }}>{supplierName(s.supplier_id)}</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.price_hkd != null ? `HK$ ${s.price_hkd}` : '—'}
              </td>
              <td>{s.unit ?? '—'}</td>
              <td style={{ fontSize: 11, color: '#71717a', maxWidth: 240 }}>
                {(s.ingredient_keywords ?? []).join(', ') || '—'}
              </td>
              <td>
                <span className={`adm-pill ${s.active ? 'adm-pill-active' : 'adm-pill-paused'}`}>
                  {s.active ? '上架' : '下架'}
                </span>
              </td>
              <td className="adm-td-actions">
                <button className="adm-btn" onClick={() => setEdit({ mode: 'edit', sku: s })}>
                  编辑
                </button>
                <button
                  className="adm-btn"
                  disabled={busyId === s.id}
                  onClick={() => toggleActive(s)}
                >
                  {s.active ? '下架' : '上架'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && (
        <SkuEditModal
          state={edit}
          suppliers={suppliers}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            setEdit(null);
            await reload();
          }}
        />
      )}
    </AdminShell>
  );
}

function SkuEditModal({
  state, suppliers, onClose, onSaved,
}: {
  state: NonNullable<EditState>;
  suppliers: AdminSupplier[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initial = useMemo<Partial<AdminSku>>(() => {
    if (state.mode === 'edit') {
      return { ...state.sku };
    }
    return {
      supplier_id: state.supplierId ?? suppliers[0]?.id ?? '',
      sku_name: '',
      sku_image_url: '',
      price_hkd: null,
      unit: '',
      order_url: 'https://aieats.app/supplier-placeholder',
      ingredient_keywords: [],
      inventory_check_endpoint_path: '',
      sku_external_id: '',
      active: true,
    };
  }, [state, suppliers]);

  const [form, setForm] = useState<Partial<AdminSku>>(initial);
  const [keywordsText, setKeywordsText] = useState<string>(
    Array.isArray(initial.ingredient_keywords) ? initial.ingredient_keywords.join(', ') : '',
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof AdminSku>(k: K, v: AdminSku[K] | string | number | null) {
    setForm(prev => ({ ...prev, [k]: v as AdminSku[K] }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.sku_name || !String(form.sku_name).trim()) {
      setErr('SKU 名必填');
      return;
    }
    if (!form.supplier_id) {
      setErr('供货商必选');
      return;
    }
    const keywords = keywordsText.split(',').map(s => s.trim()).filter(Boolean);
    const payload: Partial<AdminSku> = {
      ...form,
      ingredient_keywords: keywords,
    };
    setSaving(true);
    setErr(null);
    try {
      if (state.mode === 'new') {
        await createSku(payload);
      } else {
        await updateSku(state.sku.id, payload);
      }
      await onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="adm-modal-back" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h3>{state.mode === 'new' ? '新增 SKU' : `编辑: ${state.sku.sku_name}`}</h3>
          <button className="adm-btn" onClick={onClose}>取消</button>
        </div>
        <form onSubmit={submit}>
          <div className="adm-modal-body">
            {err && <div className="adm-error">{err}</div>}
            <FormRow label="供货商 *">
              <select
                value={form.supplier_id ?? ''}
                onChange={e => set('supplier_id', e.target.value)}
                disabled={state.mode === 'edit'}
              >
                <option value="">— 请选择 —</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {state.mode === 'edit' && (
                <div className="adm-hint">编辑模式下不允许变更供货商</div>
              )}
            </FormRow>
            <FormRow label="SKU 名 *">
              <input
                type="text"
                value={form.sku_name ?? ''}
                onChange={e => set('sku_name', e.target.value)}
                required
              />
            </FormRow>
            <FormRow label="SKU 图片 URL">
              <input
                type="url"
                value={form.sku_image_url ?? ''}
                onChange={e => set('sku_image_url', e.target.value)}
              />
            </FormRow>
            <FormRow label="价格 (HKD)">
              <input
                type="number"
                step="0.01"
                value={form.price_hkd ?? ''}
                onChange={e => {
                  const v = e.target.value;
                  set('price_hkd', v === '' ? null : Number(v));
                }}
              />
            </FormRow>
            <FormRow label="单位（如 100g / 500ml / 1 件）">
              <input
                type="text"
                value={form.unit ?? ''}
                onChange={e => set('unit', e.target.value)}
              />
            </FormRow>
            <FormRow label="下单 URL *">
              <input
                type="url"
                value={form.order_url ?? ''}
                onChange={e => set('order_url', e.target.value)}
                required
              />
            </FormRow>
            <FormRow label="食材关键词（逗号分隔，前端用于匹配菜谱）">
              <textarea
                rows={2}
                value={keywordsText}
                onChange={e => setKeywordsText(e.target.value)}
                placeholder="帕马森, 帕玛森, Parmesan, Parmigiano"
              />
            </FormRow>
            <FormRow label="库存查询 endpoint path">
              <input
                type="text"
                value={form.inventory_check_endpoint_path ?? ''}
                onChange={e => set('inventory_check_endpoint_path', e.target.value)}
                placeholder="/api/inventory/{sku_id}"
              />
            </FormRow>
            <FormRow label="SKU 外部 ID（供货商系统内的 ID）">
              <input
                type="text"
                value={form.sku_external_id ?? ''}
                onChange={e => set('sku_external_id', e.target.value)}
              />
            </FormRow>
            <FormRow label="上架">
              <select
                value={form.active ? 'true' : 'false'}
                onChange={e => set('active', e.target.value === 'true')}
              >
                <option value="true">true (上架)</option>
                <option value="false">false (下架)</option>
              </select>
            </FormRow>
          </div>
          <div className="adm-modal-foot">
            <button type="button" className="adm-btn" onClick={onClose} disabled={saving}>
              取消
            </button>
            <button type="submit" className="adm-btn adm-btn-accent" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="adm-form-row">
      <label>{label}</label>
      {children}
    </div>
  );
}
