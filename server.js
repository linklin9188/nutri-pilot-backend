import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── TICKET-001 sprint 0 — admin auth state (in-memory) ─────────────────────
// Sprint 0 stores admin sessions in a Map keyed by random token. Persists
// across requests but resets on server restart (acceptable for sprint 0;
// JWT-signed tokens land in sprint 2).
//
// ADMIN_USERNAME / ADMIN_PASSWORD_HASH come from Railway env. The hash is
// sha256(password) hex-encoded so we never compare plaintext. Boss sets the
// password by running `node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASS').digest('hex'))"`
// and pasting the result into Railway env ADMIN_PASSWORD_HASH.
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are reused from edge fn env if
// already on Railway; otherwise CEO sets them once during sprint 0 deploy.
const ADMIN_USERNAME      = process.env.ADMIN_USERNAME      ?? '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '';
const SUPABASE_URL              = process.env.SUPABASE_URL              ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const adminSessions = new Map(); // token -> { username, createdAt }

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function requireAdmin(req, res, next) {
  const token = req.header('X-Admin-Token');
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.adminUsername = adminSessions.get(token).username;
  next();
}

app.post('/api/admin/login', express.json(), (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing username or password' });
  }
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH) {
    return res.status(503).json({
      error: 'admin not configured — set ADMIN_USERNAME + ADMIN_PASSWORD_HASH in Railway env',
    });
  }
  // Constant-time-ish comparison via crypto.timingSafeEqual on equal-length buffers.
  const userOk = Buffer.byteLength(username) === Buffer.byteLength(ADMIN_USERNAME)
    && crypto.timingSafeEqual(Buffer.from(username), Buffer.from(ADMIN_USERNAME));
  const passOk = (() => {
    const got = sha256Hex(password);
    if (got.length !== ADMIN_PASSWORD_HASH.length) return false;
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(ADMIN_PASSWORD_HASH));
  })();
  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { username, createdAt: Date.now() });
  res.json({ token, username });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ is_admin: true, username: req.adminUsername });
});

// ── TICKET TELEPOT-20260525-046 P1 第 4 步 — supplier admin helpers ────────
// 用 service_role key 调 Supabase REST，所有路由都 requireAdmin 守护。
// 复用 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env（与 /api/admin/stats 同）。

function sbBase() {
  return SUPABASE_URL.replace(/\/$/, '');
}
function sbHeaders(extra) {
  return {
    apikey:        SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...(extra ?? {}),
  };
}
function sbConfigured(res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({
      error: 'supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Railway env',
    });
    return false;
  }
  return true;
}
async function sbFetch(method, path, body) {
  const r = await fetch(`${sbBase()}${path}`, {
    method,
    headers: sbHeaders({
      'Content-Type': 'application/json',
      Prefer:         method === 'POST' || method === 'PATCH' ? 'return=representation' : '',
    }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {/* keep null */}
  return { ok: r.ok, status: r.status, json, text };
}

// ── Suppliers CRUD ────────────────────────────────────────────────────────
app.get('/api/admin/suppliers', requireAdmin, async (_req, res) => {
  if (!sbConfigured(res)) return;
  const r = await sbFetch('GET', '/rest/v1/suppliers?select=*&order=created_at.desc');
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ suppliers: r.json ?? [] });
});

app.post('/api/admin/suppliers', requireAdmin, express.json(), async (req, res) => {
  if (!sbConfigured(res)) return;
  const payload = pickSupplierFields(req.body ?? {});
  if (!payload.name) return res.status(400).json({ error: 'name required' });
  const r = await sbFetch('POST', '/rest/v1/suppliers', payload);
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ supplier: Array.isArray(r.json) ? r.json[0] : r.json });
});

app.patch('/api/admin/suppliers/:id', requireAdmin, express.json(), async (req, res) => {
  if (!sbConfigured(res)) return;
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const payload = pickSupplierFields(req.body ?? {});
  payload.updated_at = new Date().toISOString();
  const r = await sbFetch(
    'PATCH',
    `/rest/v1/suppliers?id=eq.${encodeURIComponent(id)}`,
    payload,
  );
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ supplier: Array.isArray(r.json) ? r.json[0] : r.json });
});

function pickSupplierFields(body) {
  const out = {};
  const keys = [
    'name', 'brand_logo_url', 'category', 'contact_whatsapp', 'contact_url',
    'api_base_url', 'api_auth_type', 'api_status', 'status',
  ];
  for (const k of keys) {
    if (k in body) {
      const v = body[k];
      out[k] = v === '' ? null : v;
    }
  }
  return out;
}

// ── Supplier SKUs CRUD ────────────────────────────────────────────────────
app.get('/api/admin/skus', requireAdmin, async (req, res) => {
  if (!sbConfigured(res)) return;
  const supplierId = String(req.query.supplier_id ?? '').trim();
  const q = supplierId
    ? `/rest/v1/supplier_skus?select=*&supplier_id=eq.${encodeURIComponent(supplierId)}&order=created_at.desc`
    : `/rest/v1/supplier_skus?select=*&order=created_at.desc`;
  const r = await sbFetch('GET', q);
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ skus: r.json ?? [] });
});

app.post('/api/admin/skus', requireAdmin, express.json(), async (req, res) => {
  if (!sbConfigured(res)) return;
  const payload = pickSkuFields(req.body ?? {});
  if (!payload.sku_name) return res.status(400).json({ error: 'sku_name required' });
  if (!payload.supplier_id) return res.status(400).json({ error: 'supplier_id required' });
  if (!payload.order_url) payload.order_url = 'https://aieats.app/supplier-placeholder';
  if (!Array.isArray(payload.ingredient_keywords)) payload.ingredient_keywords = [];
  if (typeof payload.active !== 'boolean') payload.active = true;
  const r = await sbFetch('POST', '/rest/v1/supplier_skus', payload);
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ sku: Array.isArray(r.json) ? r.json[0] : r.json });
});

app.patch('/api/admin/skus/:id', requireAdmin, express.json(), async (req, res) => {
  if (!sbConfigured(res)) return;
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const payload = pickSkuFields(req.body ?? {});
  payload.updated_at = new Date().toISOString();
  const r = await sbFetch(
    'PATCH',
    `/rest/v1/supplier_skus?id=eq.${encodeURIComponent(id)}`,
    payload,
  );
  if (!r.ok) return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
  res.json({ sku: Array.isArray(r.json) ? r.json[0] : r.json });
});

function pickSkuFields(body) {
  const out = {};
  const passthrough = [
    'supplier_id', 'sku_name', 'sku_image_url', 'unit', 'order_url',
    'inventory_check_endpoint_path', 'sku_external_id',
  ];
  for (const k of passthrough) {
    if (k in body) {
      const v = body[k];
      out[k] = v === '' ? null : v;
    }
  }
  if ('price_hkd' in body) {
    const n = Number(body.price_hkd);
    out.price_hkd = Number.isFinite(n) ? n : null;
  }
  if ('ingredient_keywords' in body) {
    const v = body.ingredient_keywords;
    out.ingredient_keywords = Array.isArray(v)
      ? v.map(s => String(s).trim()).filter(Boolean)
      : [];
  }
  if ('active' in body) {
    out.active = !!body.active;
  }
  return out;
}

// ── 导流报表 — 按 supplier × 当周聚合 ────────────────────────────────────
// 返回:
//   suppliers: [{ supplier_id, supplier_name, click_count, unique_users,
//                 top_skus: [{ sku_id, sku_name, count }],
//                 top_dishes: [{ dish_id, dish_name, count }] }]
//   week_start_iso: ISO（本周一 00:00 UTC）
app.get('/api/admin/supplier-report', requireAdmin, async (_req, res) => {
  if (!sbConfigured(res)) return;
  try {
    // 本周一 00:00 UTC
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun
    const daysSinceMon = (dow + 6) % 7;
    const monday = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMon,
      0, 0, 0, 0,
    ));
    const weekStartIso = monday.toISOString();

    const [suppliersR, skusR, clicksR] = await Promise.all([
      sbFetch('GET', '/rest/v1/suppliers?select=id,name'),
      sbFetch('GET', '/rest/v1/supplier_skus?select=id,sku_name,supplier_id'),
      sbFetch(
        'GET',
        `/rest/v1/supplier_click_log?select=user_id,sku_id,source_dish_id,clicked_at&clicked_at=gte.${encodeURIComponent(weekStartIso)}`,
      ),
    ]);
    if (!suppliersR.ok || !skusR.ok || !clicksR.ok) {
      return res.status(502).json({
        error: `supabase fetch failed: suppliers=${suppliersR.status} skus=${skusR.status} clicks=${clicksR.status}`,
      });
    }
    const suppliers = suppliersR.json ?? [];
    const skus = skusR.json ?? [];
    const clicks = clicksR.json ?? [];

    const skuById = new Map(skus.map(s => [s.id, s]));
    const skusBySupplier = new Map();
    for (const s of skus) {
      if (!skusBySupplier.has(s.supplier_id)) skusBySupplier.set(s.supplier_id, new Set());
      skusBySupplier.get(s.supplier_id).add(s.id);
    }

    // 取所有用到的 dish_id → name
    const dishIds = Array.from(new Set(
      clicks.map(c => c.source_dish_id).filter(Boolean),
    ));
    let dishById = new Map();
    if (dishIds.length) {
      const inList = dishIds.map(id => `"${id}"`).join(',');
      const dr = await sbFetch(
        'GET',
        `/rest/v1/dishes?select=id,title&id=in.(${inList})`,
      );
      if (dr.ok && Array.isArray(dr.json)) {
        dishById = new Map(dr.json.map(d => [d.id, d.title]));
      }
    }

    const out = suppliers.map(sup => {
      const skuSet = skusBySupplier.get(sup.id) ?? new Set();
      const supClicks = clicks.filter(c => c.sku_id && skuSet.has(c.sku_id));
      const click_count = supClicks.length;
      const userSet = new Set();
      let anonCount = 0;
      for (const c of supClicks) {
        if (c.user_id) userSet.add(c.user_id);
        else anonCount = 1; // 所有匿名算 1 个
      }
      const unique_users = userSet.size + anonCount;

      const bySku = new Map();
      const byDish = new Map();
      for (const c of supClicks) {
        if (c.sku_id) bySku.set(c.sku_id, (bySku.get(c.sku_id) ?? 0) + 1);
        if (c.source_dish_id) byDish.set(c.source_dish_id, (byDish.get(c.source_dish_id) ?? 0) + 1);
      }
      const top_skus = Array.from(bySku.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([sku_id, count]) => ({
          sku_id,
          sku_name: skuById.get(sku_id)?.sku_name ?? '(unknown)',
          count,
        }));
      const top_dishes = Array.from(byDish.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([dish_id, count]) => ({
          dish_id,
          dish_name: dishById.get(dish_id) ?? '(unknown)',
          count,
        }));

      return {
        supplier_id: sup.id,
        supplier_name: sup.name,
        click_count,
        unique_users,
        top_skus,
        top_dishes,
      };
    });

    res.json({ suppliers: out, week_start_iso: weekStartIso });
  } catch (e) {
    console.error('[/api/admin/supplier-report]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({
      error: 'supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Railway env',
    });
  }
  try {
    const u = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/admin_users_view?select=is_premium,is_trial_active,created_at,last_active_at,menu_count`;
    const r = await fetch(u, {
      headers: {
        apikey:        SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => r.statusText);
      return res.status(502).json({ error: `supabase ${r.status}: ${t.slice(0, 200)}` });
    }
    const rows = await r.json();
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86_400_000;
    let total_users        = 0;
    let trial_active_users = 0;
    let premium_users      = 0;
    let new_users_7d       = 0;
    let active_users_7d    = 0;
    let total_menus        = 0;
    for (const row of rows) {
      total_users += 1;
      if (row.is_premium)      premium_users      += 1;
      if (row.is_trial_active) trial_active_users += 1;
      total_menus += typeof row.menu_count === 'number' ? row.menu_count : 0;
      const created = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (Number.isFinite(created) && created > sevenDaysAgo) new_users_7d += 1;
      const lastActive = row.last_active_at ? new Date(row.last_active_at).getTime() : NaN;
      if (Number.isFinite(lastActive) && lastActive > sevenDaysAgo) active_users_7d += 1;
    }
    res.json({
      total_users,
      trial_active_users,
      premium_users,
      new_users_7d,
      active_users_7d,
      total_menus,
    });
  } catch (e) {
    console.error('[/api/admin/stats]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── TICKET TELEPOT-20260525-090 P0 — 订单 / commission / 用户增长 ─────────
// 老板内部后台用. 全部 requireAdmin + service_role 拉数, 直接返回 JSON.
// 注意: orders.commission_total_hkd + order_items.commission_hkd 是老板私密,
// 前端用户层屏蔽, 但 admin 后台可见 (这就是要看的).

// 订单列表 — query: status, range (today/week/month/all), limit
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  if (!sbConfigured(res)) return;
  try {
    const status = String(req.query.status || 'all');
    const range  = String(req.query.range  || 'week');
    const limit  = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 500);

    let q = `/rest/v1/orders?select=id,order_number,user_id,status,subtotal_hkd,delivery_fee_hkd,total_hkd,commission_total_hkd,delivery_address,delivery_contact_name,delivery_contact_phone,created_at,paid_at,stripe_session_id&order=created_at.desc&limit=${limit}`;
    if (status && status !== 'all') {
      q += `&status=eq.${encodeURIComponent(status)}`;
    }
    if (range && range !== 'all') {
      const now = Date.now();
      let since = 0;
      if (range === 'today') since = now - 86_400_000;
      else if (range === 'week')  since = now - 7  * 86_400_000;
      else if (range === 'month') since = now - 30 * 86_400_000;
      if (since > 0) {
        q += `&created_at=gte.${encodeURIComponent(new Date(since).toISOString())}`;
      }
    }
    const r = await sbFetch('GET', q);
    if (!r.ok) {
      return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
    }
    const orders = r.json ?? [];

    // items_count: 单独再拉一次 order_items count by order_id (避免 PostgREST 嵌入坑)
    let itemsCountMap = new Map();
    if (orders.length > 0) {
      const ids = orders.map(o => `"${o.id}"`).join(',');
      const ir = await sbFetch(
        'GET',
        `/rest/v1/order_items?select=order_id,qty&order_id=in.(${ids})`,
      );
      if (ir.ok && Array.isArray(ir.json)) {
        for (const row of ir.json) {
          itemsCountMap.set(row.order_id, (itemsCountMap.get(row.order_id) ?? 0) + 1);
        }
      }
    }
    const withCounts = orders.map(o => ({ ...o, items_count: itemsCountMap.get(o.id) ?? 0 }));
    res.json({ orders: withCounts });
  } catch (e) {
    console.error('[/api/admin/orders]', e);
    res.status(500).json({ error: e.message });
  }
});

// commission 月汇总 — 按 supplier × 月份 聚合 status=paid 订单
// query: month (YYYY-MM, default 当月)
app.get('/api/admin/commission', requireAdmin, async (req, res) => {
  if (!sbConfigured(res)) return;
  try {
    const now = new Date();
    const monthStr = String(req.query.month || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
    if (!/^\d{4}-\d{2}$/.test(monthStr)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    const [y, m] = monthStr.split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const monthEnd   = new Date(Date.UTC(y, m,     1, 0, 0, 0, 0));
    const sinceIso = monthStart.toISOString();
    const untilIso = monthEnd.toISOString();

    // 1) 拉 paid 订单 (paid_at 在月内)
    const ordersR = await sbFetch(
      'GET',
      `/rest/v1/orders?select=id&status=eq.paid&paid_at=gte.${encodeURIComponent(sinceIso)}&paid_at=lt.${encodeURIComponent(untilIso)}`,
    );
    if (!ordersR.ok) {
      return res.status(502).json({ error: `supabase orders ${ordersR.status}: ${(ordersR.text || '').slice(0, 200)}` });
    }
    const orderIds = (ordersR.json ?? []).map(o => o.id);

    // 2) 拉对应 order_items
    let items = [];
    if (orderIds.length > 0) {
      const inList = orderIds.map(id => `"${id}"`).join(',');
      const itemsR = await sbFetch(
        'GET',
        `/rest/v1/order_items?select=order_id,sku_id,qty,unit_retail_price_hkd,unit_wholesale_price_hkd,subtotal_hkd,commission_hkd&order_id=in.(${inList})`,
      );
      if (!itemsR.ok) {
        return res.status(502).json({ error: `supabase order_items ${itemsR.status}: ${(itemsR.text || '').slice(0, 200)}` });
      }
      items = itemsR.json ?? [];
    }

    // 3) 拉所有 SKU + supplier 字典
    const [skusR, suppliersR] = await Promise.all([
      sbFetch('GET', '/rest/v1/supplier_skus?select=id,supplier_id,sku_name'),
      sbFetch('GET', '/rest/v1/suppliers?select=id,name'),
    ]);
    if (!skusR.ok || !suppliersR.ok) {
      return res.status(502).json({ error: `supabase dict fetch failed: skus=${skusR.status} suppliers=${suppliersR.status}` });
    }
    const skuById = new Map((skusR.json ?? []).map(s => [s.id, s]));
    const supplierById = new Map((suppliersR.json ?? []).map(s => [s.id, s]));

    // 4) 按 supplier 聚合
    const bySupplier = new Map();
    for (const it of items) {
      const sku = skuById.get(it.sku_id);
      const supplierId = sku?.supplier_id ?? '__unknown__';
      const supplierName = supplierById.get(supplierId)?.name ?? '(未知供应商)';
      const cur = bySupplier.get(supplierId) ?? {
        supplier_id:      supplierId,
        supplier_name:    supplierName,
        order_ids:        new Set(),
        total_wholesale:  0,
        total_retail:     0,
        total_commission: 0,
      };
      cur.order_ids.add(it.order_id);
      cur.total_wholesale  += Number(it.unit_wholesale_price_hkd ?? 0) * Number(it.qty ?? 0);
      cur.total_retail     += Number(it.subtotal_hkd ?? 0);
      cur.total_commission += Number(it.commission_hkd ?? 0);
      bySupplier.set(supplierId, cur);
    }
    const rows = Array.from(bySupplier.values())
      .map(r => ({
        month:            monthStr,
        supplier_id:      r.supplier_id,
        supplier_name:    r.supplier_name,
        order_count:      r.order_ids.size,
        total_wholesale:  Math.round(r.total_wholesale  * 100) / 100,
        total_retail:     Math.round(r.total_retail     * 100) / 100,
        total_commission: Math.round(r.total_commission * 100) / 100,
      }))
      .sort((a, b) => b.total_commission - a.total_commission);

    res.json({
      month:           monthStr,
      total_orders:    orderIds.length,
      suppliers:       rows,
    });
  } catch (e) {
    console.error('[/api/admin/commission]', e);
    res.status(500).json({ error: e.message });
  }
});

// 用户增长 — 汇总指标 + 最近 50 注册
app.get('/api/admin/users-growth', requireAdmin, async (_req, res) => {
  if (!sbConfigured(res)) return;
  try {
    // 复用 admin_users_view (078 已建) 拉 list, 然后 JS 聚合
    const r = await sbFetch(
      'GET',
      '/rest/v1/admin_users_view?select=id,display_name,created_at,is_premium,is_trial_active,trial_end_at,hometown_cuisine,dietary_goal',
    );
    if (!r.ok) {
      return res.status(502).json({ error: `supabase ${r.status}: ${(r.text || '').slice(0, 200)}` });
    }
    const rows = r.json ?? [];
    const now = Date.now();
    const oneDayAgo   = now - 86_400_000;
    const sevenDaysAgo = now - 7  * 86_400_000;
    const thirtyDaysAgo = now - 30 * 86_400_000;

    let total = 0;
    let new_today = 0;
    let new_week  = 0;
    let new_month = 0;
    let trial_active = 0;
    let paid_count = 0;
    let trial_expired = 0;
    for (const row of rows) {
      total += 1;
      const created = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (Number.isFinite(created)) {
        if (created > oneDayAgo)    new_today += 1;
        if (created > sevenDaysAgo) new_week  += 1;
        if (created > thirtyDaysAgo) new_month += 1;
      }
      if (row.is_premium) paid_count += 1;
      else if (row.is_trial_active) trial_active += 1;
      else trial_expired += 1;
    }
    // 转化率 = paid / (paid + expired)，过滤 trial 中（还没结果）
    const denom = paid_count + trial_expired;
    const conv_rate = denom > 0 ? paid_count / denom : 0;

    // 最近 50 注册 (按 created_at desc, anonymize: 只 id 前 8 位 + display_name + created + tier)
    const recent = rows
      .slice() // copy
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 50)
      .map(row => ({
        id_short:      String(row.id ?? '').slice(0, 8),
        display_name:  row.display_name ?? null,
        created_at:    row.created_at,
        trial_end_at:  row.trial_end_at,
        tier:          row.is_premium ? 'paid'
                       : row.is_trial_active ? 'trial'
                       : 'expired',
        hometown:      row.hometown_cuisine ?? null,
        dietary_goal:  row.dietary_goal ?? null,
      }));

    res.json({
      summary: {
        total,
        new_today,
        new_week,
        new_month,
        trial_active,
        paid_count,
        trial_expired,
        conv_rate: Math.round(conv_rate * 1000) / 1000,
      },
      recent,
    });
  } catch (e) {
    console.error('[/api/admin/users-growth]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── WeChat JSSDK signature (Railway-hosted, fixed-IP) ──────────────────────
// Supabase Edge Function egress rotates IPs (54.x/18.x AWS pool), which is
// incompatible with WeChat MP's single-IP allowlist. Railway has a stable
// outbound IP, so the JSSDK signature endpoint lives here instead.

const APPID     = process.env.WECHAT_APPID     ?? '';
const APPSECRET = process.env.WECHAT_APPSECRET ?? '';

const wechatCache = {
  accessToken: null,
  accessExpiresAt: 0,
  jsapiTicket: null,
  ticketExpiresAt: 0,
};

async function getWxAccessToken() {
  if (wechatCache.accessToken && Date.now() < wechatCache.accessExpiresAt) {
    return wechatCache.accessToken;
  }
  const u = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`;
  const r = await fetch(u);
  const j = await r.json();
  if (j.errcode) throw new Error(`wx access_token errcode ${j.errcode}: ${j.errmsg}`);
  wechatCache.accessToken = j.access_token;
  wechatCache.accessExpiresAt = Date.now() + Math.max(60, j.expires_in - 300) * 1000;
  return j.access_token;
}

async function getWxJsapiTicket() {
  if (wechatCache.jsapiTicket && Date.now() < wechatCache.ticketExpiresAt) {
    return wechatCache.jsapiTicket;
  }
  const token = await getWxAccessToken();
  const u = `https://api.weixin.qq.com/cgi-bin/ticket/getticket?type=jsapi&access_token=${token}`;
  const r = await fetch(u);
  const j = await r.json();
  if (j.errcode !== 0) throw new Error(`wx jsapi_ticket errcode ${j.errcode}: ${j.errmsg}`);
  wechatCache.jsapiTicket = j.ticket;
  wechatCache.ticketExpiresAt = Date.now() + Math.max(60, j.expires_in - 300) * 1000;
  return j.ticket;
}

app.post('/api/wechat-jssdk-signature', express.json(), async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'missing url' });
    }
    if (!url.startsWith('https://nothinkeats.com/')) {
      return res.status(400).json({ error: 'url whitelist: nothinkeats.com only' });
    }
    const ticket = await getWxJsapiTicket();
    const nonceStr = crypto.randomBytes(8).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = crypto.createHash('sha1').update(raw).digest('hex');
    res.json({ appId: APPID, timestamp, nonceStr, signature, url });
  } catch (e) {
    console.error('[wechat-jssdk-signature]', e);
    res.status(500).json({ error: e.message });
  }
});

// Debug helper — returns Railway's current egress IP so CEO can add it to
// WeChat MP IP whitelist. Safe to expose: no secrets, just shows what
// ifconfig.me sees.
app.get('/api/_egress-ip', async (_req, res) => {
  try {
    const r = await fetch('https://ifconfig.me/ip');
    const ip = (await r.text()).trim();
    res.json({ egress_ip: ip, note: 'Add to WeChat MP IP whitelist' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// TICKET-20260524-024 §B — persist HTML5 geolocation coordinates that the
// browser captured after the user granted GPS permission. Front-end calls
// this after navigator.geolocation.getCurrentPosition() resolves.
//
// POST /api/user/location
//   headers: X-User-Id: <uuid>
//   body:    { lat: number, lng: number, gps_accepted_at?: string ISO }
//
// Stored on user_profiles.location_lat / location_lng / gps_accepted_at.
app.post('/api/user/location', express.json({ limit: '1kb' }), async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'supabase not configured' });
  }
  const userId = String(req.header('X-User-Id') ?? '').trim();
  if (!userId) return res.status(400).json({ error: 'X-User-Id header required' });

  const { lat, lng, gps_accepted_at } = req.body ?? {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat / lng must be numbers' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'lat / lng out of range' });
  }

  const acceptedAt = (typeof gps_accepted_at === 'string' && gps_accepted_at)
    ? gps_accepted_at
    : new Date().toISOString();

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        apikey:        SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':'application/json',
        Prefer:        'return=minimal',
      },
      body: JSON.stringify({
        location_lat:    lat,
        location_lng:    lng,
        gps_accepted_at: acceptedAt,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('[/api/user/location]', r.status, t.slice(0, 200));
      return res.status(502).json({ error: `supabase ${r.status}` });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/user/location]', e);
    res.status(500).json({ error: e.message });
  }
});

// Serve static assets with long cache (they are content-hashed by Vite)
app.use('/assets', express.static(path.join(__dirname, 'dist/assets'), {
  maxAge: '1y',
  immutable: true,
}));

// All other static files (favicon, manifest, etc.) — no cache
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: 0,
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));

// TICKET-001 sprint 0 — admin app static assets + SPA fallback. Must come
// BEFORE the main SPA catch-all so /admin/* doesn't fall through to index.html
// of the main user-facing app. dist-admin/ is built by `npm run build:admin`
// and ignored from git (build artifact).
app.use('/admin', express.static(path.join(__dirname, 'dist-admin'), {
  maxAge: 0,
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist-admin', 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'dist-admin', 'index.html'));
});

// TICKET-035 §C — explicit MP_verify route as belt-and-suspenders defense.
// 微信 MP_verify files: 名 = MP_verify_<hash>.txt, 内容 = <hash> (no newline).
// 即便 dist/ 漏 copy (build cache stale / Railway deploy 滞后) 也能正确返回.
// 仅在 express.static 上方 dist/ 真有文件时此路由不触发 (static 优先匹配).
app.get('/MP_verify_:hash.txt', (req, res) => {
  res.type('text/plain').send(req.params.hash);
});
// 老板原话: 微信有时只回简化 hash.txt 无 MP_verify_ 前缀. 加 regex 防意外抢
// 其他真静态 .txt (公司 robots.txt 等), 仅匹配 8-32 char 字母数字 hash.
app.get('/:hash.txt', (req, res, next) => {
  const hash = req.params.hash;
  if (/^[a-zA-Z0-9]{8,32}$/.test(hash)) {
    return res.type('text/plain').send(hash);
  }
  next();
});

// TICKET-035 §B — SPA fallback with path-extension guard.
// 老板 22:50 报: 微信小程序后台点「校验」报"校验文件验证失败" — 实查 server
// catch-all `app.get('*')` 把所有未匹配 GET 都返回 index.html, 微信拿到 HTML
// 而非纯文本 hash → 校验 fail.
// 修复: URL 含文件扩展名 (e.g. .txt .xml .json) 且不是 /api/ → 404 (这些应该
// 由 express.static 已 serve, 走到这一步说明 dist/ 缺该文件; 404 比 HTML
// 错误内容好, 让客户端知道 file not found).
// SPA 路由 (/about /weekly /setup 等) 无扩展名 → 仍正常 sendFile index.html.
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (path.extname(req.path) && !req.path.startsWith('/api/')) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Nutri-Pilot running on http://0.0.0.0:${PORT}`);
});
