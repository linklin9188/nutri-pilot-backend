import { FormEvent, useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import {
  AdminSupplier,
  createSupplier,
  listSuppliers,
  updateSupplier,
} from '../lib/api';

/**
 * 供货商管理 — 列表 + 新增 / 编辑 + 暂停 / 激活
 * 不含 reward_voucher_per_user 字段（工单明确指出本工单不适用）
 */

type EditState =
  | { mode: 'new' }
  | { mode: 'edit'; supplier: AdminSupplier }
  | null;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'pending (待激活)' },
  { value: 'active',  label: 'active (上线中)' },
  { value: 'paused',  label: 'paused (暂停)' },
];

const API_STATUS_OPTIONS = [
  { value: 'pending_docs',   label: 'pending_docs (待文档)' },
  { value: 'docs_received',  label: 'docs_received (拿到文档)' },
  { value: 'integrated',     label: 'integrated (已接好)' },
  { value: 'live',           label: 'live (真实数据)' },
];

export default function Suppliers() {
  const [rows, setRows] = useState<AdminSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const list = await listSuppliers();
      setRows(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function togglePause(s: AdminSupplier) {
    const next = s.status === 'active' ? 'paused' : 'active';
    setBusyId(s.id);
    try {
      await updateSupplier(s.id, { status: next });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="供货商">
      <div className="adm-toolbar">
        <button className="adm-btn adm-btn-accent" onClick={() => setEdit({ mode: 'new' })}>
          + 新增供货商
        </button>
        <button className="adm-btn" onClick={reload} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>
      {error && <div className="adm-error">{error}</div>}
      <table className="adm-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>分类</th>
            <th>状态</th>
            <th>API 状态</th>
            <th>联系</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
              暂无供货商
            </td></tr>
          )}
          {rows.map(s => (
            <tr key={s.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                {s.brand_logo_url && (
                  <div style={{ fontSize: 11, color: '#94a3b8', wordBreak: 'break-all' }}>
                    {s.brand_logo_url}
                  </div>
                )}
              </td>
              <td>{s.category ?? '—'}</td>
              <td><StatusPill kind="status" value={s.status} /></td>
              <td><StatusPill kind="api" value={s.api_status} /></td>
              <td style={{ fontSize: 12 }}>
                {s.contact_whatsapp && <div>WA: {s.contact_whatsapp}</div>}
                {s.contact_url && (
                  <div style={{ color: '#94a3b8', wordBreak: 'break-all' }}>{s.contact_url}</div>
                )}
                {!s.contact_whatsapp && !s.contact_url && <span style={{ color: '#94a3b8' }}>—</span>}
              </td>
              <td className="adm-td-actions">
                <button className="adm-btn" onClick={() => setEdit({ mode: 'edit', supplier: s })}>
                  编辑
                </button>
                <button
                  className="adm-btn"
                  disabled={busyId === s.id}
                  onClick={() => togglePause(s)}
                >
                  {s.status === 'active' ? '暂停' : '激活'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && (
        <SupplierEditModal
          state={edit}
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

function StatusPill({ kind, value }: { kind: 'status' | 'api'; value: string }) {
  let cls = 'adm-pill';
  if (kind === 'status') {
    if (value === 'active') cls += ' adm-pill-active';
    else if (value === 'pending') cls += ' adm-pill-pending';
    else cls += ' adm-pill-paused';
  } else {
    if (value === 'live') cls += ' adm-pill-active';
    else if (value === 'integrated') cls += ' adm-pill-pending';
    else cls += ' adm-pill-paused';
  }
  return <span className={cls}>{value}</span>;
}

function SupplierEditModal({
  state, onClose, onSaved,
}: {
  state: NonNullable<EditState>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const initial = useMemo<Partial<AdminSupplier>>(() => {
    if (state.mode === 'edit') return { ...state.supplier };
    return {
      name: '',
      brand_logo_url: '',
      category: '',
      contact_whatsapp: '',
      contact_url: '',
      api_base_url: '',
      api_auth_type: '',
      api_status: 'pending_docs',
      status: 'pending',
    };
  }, [state]);

  const [form, setForm] = useState<Partial<AdminSupplier>>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof AdminSupplier>(k: K, v: AdminSupplier[K] | string) {
    setForm(prev => ({ ...prev, [k]: v as AdminSupplier[K] }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.name || !String(form.name).trim()) {
      setErr('名称必填');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (state.mode === 'new') {
        await createSupplier(form);
      } else {
        await updateSupplier(state.supplier.id, form);
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
          <h3>{state.mode === 'new' ? '新增供货商' : `编辑: ${state.supplier.name}`}</h3>
          <button className="adm-btn" onClick={onClose}>取消</button>
        </div>
        <form onSubmit={submit}>
          <div className="adm-modal-body">
            {err && <div className="adm-error">{err}</div>}
            <FormRow label="名称 *">
              <input
                type="text"
                value={form.name ?? ''}
                onChange={e => set('name', e.target.value)}
                required
              />
            </FormRow>
            <FormRow label="分类（如 italian / chinese / dairy）">
              <input
                type="text"
                value={form.category ?? ''}
                onChange={e => set('category', e.target.value)}
              />
            </FormRow>
            <FormRow label="品牌 logo URL">
              <input
                type="url"
                value={form.brand_logo_url ?? ''}
                onChange={e => set('brand_logo_url', e.target.value)}
                placeholder="https://…"
              />
            </FormRow>
            <FormRow label="联系 WhatsApp">
              <input
                type="text"
                value={form.contact_whatsapp ?? ''}
                onChange={e => set('contact_whatsapp', e.target.value)}
                placeholder="+852…"
              />
            </FormRow>
            <FormRow label="联系 URL（详情页 / WeChat / 邮件）">
              <input
                type="url"
                value={form.contact_url ?? ''}
                onChange={e => set('contact_url', e.target.value)}
              />
            </FormRow>
            <FormRow label="API base URL">
              <input
                type="url"
                value={form.api_base_url ?? ''}
                onChange={e => set('api_base_url', e.target.value)}
                placeholder="https://api.supplier.com/v1"
              />
            </FormRow>
            <FormRow label="API auth type（none / bearer / oauth2 / hmac）">
              <input
                type="text"
                value={form.api_auth_type ?? ''}
                onChange={e => set('api_auth_type', e.target.value)}
              />
            </FormRow>
            <FormRow label="API 状态">
              <select
                value={form.api_status ?? 'pending_docs'}
                onChange={e => set('api_status', e.target.value)}
              >
                {API_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="供货商状态">
              <select
                value={form.status ?? 'pending'}
                onChange={e => set('status', e.target.value)}
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
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
