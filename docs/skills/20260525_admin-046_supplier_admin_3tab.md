# 第 4 步供应商 Admin 第 4 棒：3 tab 后台（TICKET TELEPOT-20260525-046）

**任务**：在 admin/ 后台加 3 个 tab — Suppliers 管理 / SKUs 管理 / 导流报表。
**完工时间**：2026-05-25 HKT

## 1. 解决了什么问题

第 1-3 棒（Database 建表 + Backend edge fn + UI 直供 chip）跑完后，
供货商数据只能靠 SQL 直接改。老板要的"看见报表 / 改 SKU / 暂停供货商"
都没 UI。这棒把 admin/ 那个 sprint 0 留下的"用户列表 placeholder"位置
扩出去，加 3 个 tab 复用同一套 auth gate + service_role key 通道，让
运营不下 SQL 就能管全套供货商数据 + 看本周导流。

## 2. 用了什么关键方法

- **server.js 集中所有 admin API**：admin/ 是纯 React SPA，没有 Node
  端。所有 supplier CRUD endpoint 全部塞 server.js，复用 sprint 0 的
  `requireAdmin` middleware + `SUPABASE_SERVICE_ROLE_KEY` env，不动
  edge function（edge fn 用 anon key 跑前端流量，admin 必须用 service
  role 才能读 status=pending 的供货商）。
- **抽 sbFetch / sbHeaders / sbConfigured 三件套 helper**：6 个 admin
  REST endpoint 全部走同一套 PostgREST 调用模板，错误信息统一格式
  `supabase 502: <body slice>`，方便前端定位是哪一步挂了。
- **新建 AdminShell 共享布局**：原来 Dashboard 自己写 header + main，
  3 tab 各自再抄就乱了。提到 components/AdminShell.tsx 里：header +
  4 个 NavLink tab + main slot，每个 page 一行套上就有完整 chrome，
  同时 adminMe() 校验权限的逻辑也只写一次。
- **报表的"匿名当 1 人"规则做在 server 端**：`supplier_click_log.user_id`
  是 nullable（匿名用户也允许下单）。server 端聚合时 `userSet` 收非空
  user_id 的 distinct，再加 `anonCount`（任一空 user_id 行存在就 +1）。
  前端拿到的就是直接能展示的整数，不用再过滤。
- **当周 = 周一 00:00 UTC**：`(getUTCDay() + 6) % 7` 算今天距周一的天
  数，零依赖 dayjs。前端展示 `weekStartIso.slice(0, 10)` 即可。
- **关键词 text[] 用逗号串输入**：前端表单存 `keywordsText` state（字
  符串），保存时 split + trim + filter Boolean 转回数组。比单独的
  tag input 控件简单 10 倍，运营也好理解。

## 3. 沉下来给下次同类问题用的经验

- **admin 加新表的最短链路**：① server.js 抄 sbFetch 三件套写 GET/POST/
  PATCH 3 个 endpoint ② api.ts 加 interface + 3 个 fn ③ pages/ 新建一
  个文件套 AdminShell ④ App.tsx 加 Route + AdminShell.tsx 加 NavLink。
  Sprint 0 留的脚手架够撑下去，30 分钟内能加 1 个新管理 tab。
- **修改全表的列时一定走 pickXxxFields 白名单**：直接 `req.body` 透传
  给 PostgREST 等于把 `id` / `created_at` / 未来加的 sensitive 字段也
  允许前端改。每个 endpoint 写 pickSupplierFields / pickSkuFields 显
  式列出白名单，新加字段必须主动加进去，安全 by-default。
- **NavLink v7 className 必须用函数**：react-router-dom 7.x 不再支持
  `<NavLink activeClassName>` 写法，全部统一成
  `className={({ isActive }) => isActive ? 'active' : ''}`。
- **报表"top 5 join dishes"避免 PostgREST 嵌入**：本来想用 `?select=
  source_dish_id,dishes(title)` 一次拉。但 `supplier_click_log →
  dishes` 的 FK 有 `ON DELETE SET NULL`，被删的 dish 会留下 NULL，
  PostgREST 嵌入对 null FK 行为不稳。改成两步：先聚合拿到 distinct
  dish_id list，再 `id=in.(uuid1,uuid2,…)` 拉 title 字典回填。可控
  且 N+1 友好（永远只 2 次 round-trip，无论 click 多少行）。
- **真测路径**：本地 `npm run dev:admin` 跑 vite dev server 在 3100；
  生产是 Railway 拉 `dist-admin/` + Express 在 `/admin/*` serve。本地
  调 server.js endpoint 需要同时启 Express（`node server.js`，3000），
  vite proxy 走 `same-origin` fetch（admin/api.ts 里 BASE='')，所以
  本地开发要么也 build 后用 Express serve，要么在 vite.config.ts 加
  proxy `/api → http://localhost:3000`。生产一切 same-origin 不存在
  这个问题。
