# 第 4 步供货商 Phase 2 骨架版 Edge Function（TICKET-028）

**任务**：写"实时库存查询"+ "一键下单点击记日志" 2 个 edge function，配合 Database 第 1 棒 4 表实现 Phase 2 骨架
**完工时间**：2026-05-24 22:53 HKT

## 1. 解决了什么问题

老板要 Phase 2 实时库存，但供货商没给 API 文档。Database 第 1 棒已建好"骨架表 + mock 标记"。本棒补 backend 链路：用户点"一键下单" → 后台记日志 + 返回跳转 URL；前端查库存 → 后台返 mock 数据（等供货商给 API 后切真）。

## 2. 用了什么关键方法

- **mock / live 分支用同一接口契约**：前端调 `supplier-inventory-check` 不区分背后是 mock 还是真 API，返回字段一致（`stock_count` + `is_mock` flag）。供货商接好后只需 backend 切分支，前端 0 改动。
- **TTL cache 缓**：cache 表 `ttl_seconds` 字段控制刷新频率，5 分钟内重复查走 cache，不打 supplier API。验证 cache hit：第二次相同 `sku_id` 调用返回 `cached: true` + 与第一次完全相同的 `last_synced_at`。
- **fallback 兜底**：真 API 调失败（超时 / 4xx / 5xx）→ 回 cache 现有数据，前端不会因 supplier 挂了就显示"无库存"。完全没 cache 也没 API 的极端情况，最后保底返 mock 默认 50 件。
- **CORS 全开 + JWT 关掉**：anon 用户也能调（不强制登录就能用"一键下单"）。
- **点击日志接耦**：`supplier-order-track` 只写日志 + 返跳转 URL，不解析跳转目标 — 跳转逻辑前端做（避免后台跨域抓供货商页面）。
- **RLS SELECT 拒匿名 + INSERT 真活验证靠 `RETURNING id`**：`supplier_click_log` 出于隐私 anon 不能 SELECT，所以无法通过 PostgREST 查 count 验证 INSERT；改用 `.insert(...).select("id").maybeSingle()` 拿真 UUID 当 INSERT 成功的 attestation（INSERT 失败不可能拿到 UUID）。两次调用返不同 UUID 进一步证明每次都真插。
- **嵌入查询 alias hint**：`suppliers:suppliers!supplier_skus_supplier_id_fkey(...)` 用 PostgREST FK 名 hint 明确关系来源，防 PostgREST 在多 FK 情况下选错 join（虽然当前只有 1 个 FK，提前防御）。
- **uuid 参数校验**：URL / body 接 sku_id 都先过 `UUID_RE` 正则，错的直接 400，不让到 DB query 才报错。

## 3. 下次同类任务的执行标准

- [ ] 任何"未来要接外部 API 但现在没文档"任务，**先写 mock 分支跑通整条链路**，不要等外部依赖
- [ ] 接口契约：mock / live 返回字段完全一致 + 加 `is_mock` 显式 flag，切换无感
- [ ] cache 表 TTL 字段必加（防 supplier API 滥用）
- [ ] fallback 必做：真 API 失败回 cache，cache 也没有再保底，**绝不抛 500 给前端**
- [ ] CORS 必检：前端跨域用必须 `Access-Control-Allow-Origin: *` + Methods 显式列 POST/GET/OPTIONS
- [ ] edge function 部署必加 `--no-verify-jwt`（anon-first 项目）
- [ ] 真测必跑 curl / node fetch 验证 production 真活，**不要相信"deploy 成功 = 功能正常"**
- [ ] 写日志的表 RLS 必允许 anon INSERT WITH CHECK (true)，SELECT 必禁（隐私）— 此时验证 INSERT 真活，靠 `RETURNING id` 拿真 UUID
- [ ] uuid 参数校验：前置正则 `UUID_RE`，错的 400，别让到 DB 才报错（节省一次 round-trip + 错误信息更清晰）
- [ ] 即便点击日志 INSERT 失败也仍要返跳转 URL（用户意图最重要，日志不阻塞业务）

## 4. 真测证据（production qoyuafqqkfyrqlthsvws）

```
TEST 1 (mock 首次, cache miss):
  GET /supplier-inventory-check?sku_id=635b51d8-...(Parmigiano)
  → { stock_count: 50, is_mock: true, cached: false, mock_reason: 'api_pending_docs' }

TEST 1b (mock 再次, cache hit):
  GET /supplier-inventory-check?sku_id=635b51d8-...
  → { stock_count: 50, is_mock: true, cached: true, last_synced_at: <same as TEST 1> }

TEST 2 (order track 1):
  POST /supplier-order-track { sku_id: 635b51d8-...., source_page: 'test' }
  → { ok: true, redirect_url: 'https://aieats.app/supplier-placeholder',
      log_id: 'a0ab3613-b493-4875-95bb-51f6c5c80487' }

TEST 6 (order track 2, 不同 SKU + user_id):
  POST /supplier-order-track { sku_id: 86ff75b6-... (Bonamini), source_page: 'verify-ingredients', user_id: 'test-user-002' }
  → { ok: true, redirect_url: 'https://aieats.app/supplier-placeholder',
      log_id: '5e586779-a1c7-4268-a83b-74ecf26b6b9d' }   // 新 UUID, 证明真插

TEST 4a (bad uuid): GET ?sku_id=not-a-uuid → 400 { error: 'sku_id must be a valid uuid' }
TEST 4b (not found): GET ?sku_id=00000000-0000-4000-8000-999999999999 → 404 { error: 'SKU not found' }
```
