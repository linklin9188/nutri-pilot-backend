# SKILLS.md — Aieats 全项目技能库

> 立项：2026-05-20 HKT（PROCESS.md v1.2 §13 机制落地）
> 维护方：Cowork（CEO）汇总；4 部门 CLI 在每次 response 末尾上交 LEARNED_SKILLS 段
> 用途：跨部门 / 跨时间复用工程经验，避免重复踩坑

---

## 机制概要

每个员工每完成一棒工单 → response 末尾写 `LEARNED_SKILLS`（参见 `_bridge/PROCESS.md` §13 格式）→ Cowork 读到后追加到本文件对应部门小节 → Cowork 派单给任一部门捎带 commit 本文件进 git。

去重规则：`skill_id` 重复时 → 不重写 detail，但累加 `source_ticket` 引用行。

---

## UI

> 前端 / React / Tailwind / Vite / Tailwind / lucide-react / motion / react-router-dom 范围

_（首次填充等 4 部门 TICKET-008..011 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### icon-density-cleanup-7-to-3-merge — 7 个图标精简到 3 个核心按钮
- **detail**：菜品卡片原有 7 图标（❤️ ⭕ ⇆ ✕ 😋 😐 😞）拥挤。精简策略：(a) 删 ✕ 删除合并到 ⇆ 换菜 panel 内（"换一道 / 直接不要 / 取消"3 选 1）；(b) ⭕ 打卡 + 😋😐😞 评分合并为"✅ 我做了"组合按钮（toggleEaten + 弹评分 panel 一气呵成）；(c) ❤️ vs 😋 加 tooltip 区分语义（保存 vs 算法学习）。最终 3 按钮 = 视觉密度减 57%，零功能丢失。
- **复用场景**：任何卡片 / 列表项 ≥ 5 图标都该跑此审视 — 找语义重叠 / 时序绑定 / 用户分不清的 pair 合并。
- **来源**：TELEPOT-20260520-052 (UI 卡片精简 hot-fix)

### info-strip-grep-before-add — 加新信息条前必 grep 现有页面已显示啥
- **detail**：UI 034 加营养条上方"时令小标签"未先 grep Home.tsx 头部已有节气+天气，结果用户真机看到 "☀️ 立夏 · 申时 · 小雨" 重复 2 次。教训：任何 banner / strip / 信息条 ship 前用 `grep -n` 扫 Home.tsx / 当前页面已显示什么维度信息，避免冗余。
- **复用场景**：所有 UI 派单加新信息显示元素前必跑此 grep。
- **来源**：TELEPOT-20260520-034 → 051 hot-fix §0 删除
- **再次触发**：TELEPOT-20260520-062 §B（套餐卡 CTA 信息跟 §A banner 重复，UI 选择拒做 + RATIONALE 上交 CEO，避免重复加 / 增加 review 成本）

### lucide-tree-shaking — lucide-react 图标按需 import，bundle 增长几乎为零
- **detail**：从 lucide-react import 单个具名图标（如 `import { Sun, CloudRain } from 'lucide-react'`），vite 会 tree-shake 未用图标，7 个图标只增 ~1KB minified / ~1KB gzip。无需 npm install 任何附加包。
- **复用场景**：未来加任何 lucide icon（菜品/营养/家庭成员图标等）都按此 import 法，不要 import 整个 `lucide-react`。
- **来源**：TELEPOT-20260520-WEATHER-ICON (commit 961f54d)

### sse-streaming-parser-pattern — SSE (text/event-stream) 流解析的 fetch + ReadableStream 范式
- **detail**：用 `\n\n` 切事件、`data:` 起始的行拼 payload、JSON.parse 拿 candidates[0].content.parts[0].text。末尾 buffer 不丢（不以 `\n\n` 结尾的 tail event 单独 flush）。`while reader.read` + TextDecoder { stream: true } 是标配。同一份解析器对接多个 backend：通过 extractText 多 fallback（text / token / delta / Gemini parts[0].text）容纳上游 schema 差异。
- **复用场景**：所有要消费 SSE 的前端：Gemini / OpenAI 兼容 / Claude streaming。
- **来源**：TELEPOT-20260520-021 (commit 4599797)

### graceful-stream-error-yield — async generator 里不抛异常 yield 错误信息
- **detail**：HTTP 429 / 4xx / 5xx / network throw / 空 body / mid-stream throw 都转 1 条中文用户提示后 return，上游 for-await 既不要 try/catch 也不出现 unhandled rejection。配合 `try { res = await fetch(...) } catch { yield '网络繁忙，稍后再试'; return; }` 包裹整个 stream 入口。
- **复用场景**：所有 async generator 暴露给 UI 消费时（chat / 流式搜索 / 流式生成）。错误转 yield 字符串是 UX 友好的核心模式。
- **来源**：TELEPOT-20260520-021 (commit 4599797)

### tolerant-optional-field-render — 跨部门 schema 过渡期用 `(obj as any).field` 容忍缺字段
- **detail**：UI 渲染 Algorithm 新加的字段（如 dish.explanation.breakdown）时，老 cache / 还没跑过 explainScore 的菜品没这个字段。`const exp = (dish as any).explanation as { breakdown?: ... } | undefined` + `breakdown.length === 0` 走"暂无解释数据"占位 + 触发 `?.` optional chaining 链。**不要**让 TypeScript 强类型阻挡 UI 提前 ship —— 算法部门 ship 完，UI 老 bundle 也不崩。
- **复用场景**：任何跨部门 schema 演进期间 UI 比 backend 先 ship / 老 cache 还没 invalidate 时。Forward-compat 模式。
- **来源**：TELEPOT-20260520-056 §A（Home explanation 抽屉，commit 5154fdd）

### existing-component-discovery-before-build — 收到"加 X 组件"工单先 grep 现有，再决定 build vs reuse
- **detail**：056 §B 工单写"加 5 维营养雷达 + recharts"。`grep -rn "NutritionRadar\|Radar\|Hexagon" src/components/` 发现 NutritionRadar.tsx 已存在完整 263 行实现（6 轴 hexagon + computeHealthMetrics + buildBoostSuggestion，WeeklyMenu 已用 dark variant）。**改成 import + mount，0 新文件 0 新依赖**。原本要写 ~200 行 + npm install recharts 的工作 → 8 行 import + JSX mount 完成。
- **复用场景**：所有"加新组件"工单第一动作：`grep -rn` 搜组件名 / 关键词 / 同类 SVG。零成本 reuse 通常胜过新 build。
- **来源**：TELEPOT-20260520-056 §B（commit 041c228）

### chart-lib-vs-hand-svg-decision — 5-7 polygon 简单图表手写 SVG，复杂交互才上 recharts
- **detail**：决策树：(a) ≤ 7 个数据点 + 静态 / 简单 hover + 项目无 chart lib → 手写 SVG `<polygon>` / `<path>`（vite-native, 0 bundle 增长）。(b) ≥ 多系列 + zoom/brush/tooltip 复杂交互 → 上 recharts / chart.js（值 ~50KB gzip）。NutritionRadar 是 case (a) — 6 轴 polygon 共 ~60 行 SVG 解决，比 npm install + 学 lib API 省时间。
- **复用场景**：所有"加图表"工单先评估数据维度 + 交互复杂度，再决定 lib vs SVG。
- **来源**：TELEPOT-20260520-056 §B（NutritionRadar.tsx 手写 SVG hexagon 模板）

### bottom-sheet-modal-pattern-with-safe-area — 底部 sheet modal 配 paddingBottom env() 兜底
- **detail**：iOS Safari 底部 home indicator 占 ~34px。底部 sheet `paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 24px)"` 既保留视觉内边距，又避免内容被 home indicator 遮挡。`onClick` 点击 backdrop 关闭，sheet 本体 `onClick={e => e.stopPropagation()}` 阻止冒泡。`fixed inset-0 z-[100]` + `flex items-end justify-center` 是底部居中 sheet 模式标配。
- **复用场景**：任何底部弹起的 modal / drawer / sheet（确认对话 / 选项菜单 / 客服联系等）。
- **来源**：TELEPOT-20260520-061 §A（Settings 联系客服 sheet, commit 5382130）

### dismissable-banner-localstorage-sentinel — banner 永久关闭用 localStorage 单 key sentinel
- **detail**：β banner / 升级提示 / 公告等"看过一次就不再显示"的元素，用 `localStorage.setItem('<key>_dismissed', 'true')` 单 key 即可。useState 初始化 `() => localStorage.getItem(key) !== 'true'` 是 lazy init，只在 mount 时跑一次。Dismiss handler 同时写 storage + 改 state（state 立即 UI 卸载，storage 持久化）。Banner 跟其他顶部元素冲突时（如 safe-area），banner 自己承担 paddingTop，把其他元素的 paddingTop 改成条件性的。
- **复用场景**：所有"看过即关 + 永久不再显示"的小提示。比 cookie / IndexedDB / DB 表都轻。
- **来源**：TELEPOT-20260520-061 §B（Home β banner, commit adee15d）

### code-path-trace-as-real-machine-substitute — CLI 无浏览器时用 grep+Read 验证 UI 挂载 vs 真机
- **detail**：CLI 没法跑真机回归（无 browser / 无 emulator）。替代方法 = code-path trace：每个 verify 项找出 (a) 关键挂载点 grep（state / handler / JSX import）(b) 验证关联 import 链 (c) verify 关键 state/handler 齐全 (d) 列出 GAP/OBSERVATION 但**不擅自 hot-fix**（守 051 经验）。code-path trace 不能替代视觉/交互验证（动画 / hover / 真实点击），但能覆盖 "组件是否挂载 / state 是否齐全 / props 是否对" 等结构性问题。视觉/交互 GAP 标 OBSERVATION 不擅自 fix，等老板真机 / QA 补完。
- **复用场景**：所有 CLI 部门收到"真机回归"工单时的标准替代法。
- **来源**：TELEPOT-20260520-060 §A（8 项 trace 表）

### promo-code-banner-prominent-monospace-pattern — promo code banner 的视觉权重模式
- **detail**：promo code 类 banner (β code / 邀请码 / 折扣码 / 优惠券) 视觉模板：(a) 渐变背景 + 强色边框（橙金 / 紫红 / 蓝紫，让人一眼看到）(b) emoji 标题（🎉/🎁/✨）(c) code 本身用 mono + 大字号 + letter-spacing 0.06-0.10em + 强色 + 一键复制 button (d) 复制后 1.5-2s 反馈（图标 ✓ + 文案 "已复制"）(e) 副文案提示用户**粘贴到哪里**（"粘贴到 Stripe Add promotion code 框"），避免用户复制后不知下一步。
- **复用场景**：所有 promo code / referral code / 邀请码的 banner 展示。
- **来源**：TELEPOT-20260520-062 §A（Pricing β banner, commit b3a2202）

### canvas-resize-image-to-base64-pattern — File API + canvas 客户端图片压缩到 base64
- **detail**：用户上传头像不走 Storage 时（v1 简单方案），客户端 resize 到固定边长（如 256×256）+ JPEG 0.82 quality → toDataURL('image/jpeg') → 通常 30-80KB base64，远低于 200KB 阈值。**关键**：(a) FileReader.readAsDataURL → onload 拿 src → new Image() → onload 拿真实尺寸 (b) cover-fit crop center：`const minSide = Math.min(w,h); const sx = (w-minSide)/2; const sy = (h-minSide)/2; ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 256, 256)` — 保证圆形头像不被拉伸 (c) `toDataURL('image/jpeg', 0.82)` 比 PNG 小 ~70%（PNG 适合透明 LOGO，照片用 JPEG）。
- **复用场景**：所有"客户端压缩图片到 DB text 列"方案。早期产品（< 10K 用户）比 Storage 简单很多。
- **来源**：TELEPOT-20260520-063 §A（头像上传, commit 4db3e16）

### postgrest-nested-embed-with-aliased-fk — PostgREST 嵌入查询用 !helper_id alias 解 FK ambiguity
- **detail**：`user_profiles!helper_id(display_name, avatar_b64)` 这种语法明确指定通过哪个 FK 列 join — 当目标表有多个 FK 指向同一表（或一个 FK 在源表上是显式列名）时必须 alias 才能让 PostgREST 唯一识别 join 路径。语法 `<dest_table>!<source_fk_column>(...)`，结果嵌套字段挂在 `data[i].household_members[j].user_profiles`。
- **复用场景**：所有 PostgREST 多 FK / 自引用 / 多张关联表的嵌入查询。
- **来源**：TELEPOT-20260520-063 §A（household_members → user_profiles join, commit 4db3e16）

### year-scoped-localstorage-key-for-annual-events — 年度事件的 dismiss key 含 year，避免清理 timer
- **detail**：每年都会重弹的提醒（节庆 / 生日 / 周年）的 "已读" 状态用 `<event>_<year>` 作 key。今年中秋 dismiss → key `festival_toast_zhongqiu_2026=true`；明年自动是新 key `festival_toast_zhongqiu_2027` → 不存在 → 重弹。**完全避开 "N 日后自动清理 dismiss" 这种 timer/cron 逻辑**——状态自然过期。比 "存 timestamp + delta check" 简单稳定。
- **复用场景**：任何"每年固定时间提醒一次"的 reminder。比 setTimeout / setInterval 维护成本低很多。
- **来源**：TELEPOT-20260520-063 §B（节庆 toast, commit 5dbfdee）

### email-array-join-anti-scraper-pattern — 邮箱用 .join('@') 拼接挡正则爬虫
- **detail**：`const EMAIL = ['user', 'domain.com'].join('@')` 让源代码 / minified bundle 不出现 `user@domain.com` 字面字符串。爬虫常用正则 `[a-z0-9._%+-]+@[a-z0-9.-]+` 扫源 → 拼接前的子字符串扫不到。**注意**：(a) SSR / 渲染后 HTML 还是会有 mailto link / 显示 text — 爬虫如果 eval JS 仍能拿到，本策略仅挡"懒爬虫" (b) 注释里写完整邮箱也会泄露 — minified bundle 注释会被 vite 自动去掉，但开发源码注释爬不到 GitHub repo 仍可见 (c) const 名字别叫 `EMAIL` 太显眼，叫 `SUPPORT_EMAIL` / `CONTACT` 更隐蔽。
- **复用场景**：所有"邮箱 / 电话 / API key" 等不希望被批量爬取的字符串。
- **来源**：TELEPOT-20260520-066 §B（commit 83a4ce2 + dist 0 字面命中验证）

### mailto-subject-body-prefix-for-gmail-filter — mailto link 带 subject prefix 方便邮箱端 filter
- **detail**：app 客服反馈 mailto link 加固定 `subject=[Aieats β 反馈]` prefix → Gmail / Cloudflare Email Routing 端可加 filter rule "subject 含 prefix → label X"。比起客服 user 自己填 subject（什么都可能） / 不填，prefix 让分类自动化。body 同时预填 `用户ID: ${uid.slice(0,8)}` 让客服一眼看到说话人，不用 user 自己写。`encodeURIComponent()` 处理换行符 `\n` / 中文 / 特殊字符。
- **复用场景**：所有 app 端发邮件入口（客服 / 反馈 / 报 bug / 申请退款）。
- **来源**：TELEPOT-20260520-066 §C（commit 83a4ce2）

### localstorage-sliding-window-rate-limit — 滑动窗口客户端限流，N 次 / M 分钟
- **detail**：限流逻辑：(a) 存 timestamp 数组到 localStorage 一个 key (b) 每次 click 时 `arr.filter(t => NOW - t < WINDOW_MS)` 拿近窗口 timestamps (c) 数量 ≥ MAX 则 `e.preventDefault()` + 用户提示 (d) 否则 push + 写回。滑动窗口比固定窗口（"每 5 分钟整点重置"）更精确，user 无法通过踩点突破。**仅防普通用户 / 简单 bot** — 真攻击者清 localStorage / 换浏览器即破，配套服务端限流（Cloudflare / Gmail）才是真防线。
- **复用场景**：所有"防同用户疯狂点"场景（客服邮件 / 重置密码 / 提交反馈 / 发送验证码请求）。
- **来源**：TELEPOT-20260520-066 §D（commit 18d0331）

---

## Backend

> Supabase Edge Functions / Deno / Gemini proxy / Stripe webhook 范围

### background-fork-foreground-serial-parallel — 长任务 background fork + 短任务 foreground 串行 = 真并行
- **detail**：Backend 035 4 件叠加：§A cron yml push（30s）+ §B rollup 真触发（30s）+ §C 翻译批跑 35min + §D 文档同步（5min）。串行需 ~40min。员工自决：§C 翻译丢 background nohup 跑 35min，foreground 串行 §A/§B/§D 共 ~5min — 实际总耗时 ~5min 完成 foreground 4 件 + 35min 后 background 也 done。**8 倍效率提升**。
- **复用场景**：任何工单含 1 件"等待外部 API 慢响应"（Gemini 调用 / DB backfill / image 生成）+ 多件"快 commit/push"时，慢的 background，快的 foreground。
- **来源**：TELEPOT-20260520-035 (Backend never-stop 模式)

### bridge-md-gitignored — `_bridge/` 内容是 gitignored，不要 git add
- **detail**：Cowork ↔ CLI 同步用的 `_bridge/*.md`（telepot/response/PROCESS/MORNING_REPORT 等）全部被 .gitignore 排除，不能 git add 进仓库。其他 `docs/*.md` 才进 git。每次 commit 前 `git status` 看到 _bridge/ 改动是正常的（同步用），不要 stage。
- **复用场景**：所有 commit 操作前确认 git add 路径不含 `_bridge/`。
- **来源**：TELEPOT-20260520-008（Backend 三合一收尾）

### github-pat-workflow-scope-required — PAT 必须含 `workflow` scope 才能 push `.github/workflows/*.yml`
- **detail**：第一次往 repo 推 GitHub Actions workflow file 时，PAT 缺 `workflow` scope 会被 GitHub 服务端拒绝（不是 git 错误而是服务器策略）：`remote rejected — refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope`。无法绕过。**解决**：登 https://github.com/settings/tokens 编辑 PAT → 勾 `workflow` scope → 重 push。或者 web UI 在 repo 网页里建文件（不需要 PAT）。
- **复用场景**：未来任何部门首次新增 GitHub Actions 时，提前确认 PAT scope；CI/CD 设置建议把 PAT 配成 workflow + repo 两个 scope 一起开。
- **来源**：TELEPOT-20260520-022（Backend GitHub Actions cron 部署）

### defense-in-depth-schema-check-target-and-source — 写跨部门数据流脚本时，schema-check 不只 verify 源表，也要 verify 目标列
- **detail**：rollup script 已 schema-check 源表 user_feedback_helper（TICKET-014/018），但切真跑时发现 SPEC 写入目标 dishes.meta 列在生产不存在 → UPDATE 会 crash。**修法**：rollup() 顶部加 checkDishesMetaColumn() 在 PROD_GUARD 之后、SQL 之前调用。input 表查源数据存在，output 表查目标列存在 — 两次 information_schema 查询比一次 try/catch 更明确。
- **复用场景**：任何把 X 表数据汇入 Y 表的脚本，第一版就 schema-check Y 表的写入列。
- **来源**：TELEPOT-20260520-022（Backend rollup 真跑发现 dishes.meta 缺）

### jsonb-build-object-merge-vs-jsonb-set-chain — 批量塞多键到 jsonb 用 `|| jsonb_build_object(...)` 更原子
- **detail**：要给 jsonb 列同时设多个键时，`UPDATE T SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('k1', v1, 'k2', v2, ...)` 比链式 `jsonb_set(jsonb_set(..., '{k1}', ...), '{k2}', ...)` 更短、更原子、更易读。COALESCE 兜底处理原 meta 为 NULL 的情况。
- **复用场景**：所有 jsonb 列批量加键 / 状态字段（meta / config / preferences 等）。
- **来源**：TELEPOT-20260520-022（rollup 写 dishes.meta 多键）

---

## Database

> Supabase Postgres / RLS / migrations / dish seed pipeline 范围

_（首次填充等 TICKET-010 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### text-vs-uuid-fk-target — user_profiles.id 是 text，不是 uuid；FK 目标必须 text 列
- **detail**：项目用 custom auth（无 auth.users），`user_profiles.id` 是 `text`。任何指向 user_profiles 的 FK，源列必须是 `text` 而非 `uuid`。若源列原本是 uuid（如 household_members.helper_id），落地前必须先 `ALTER COLUMN TYPE text USING ::text`，否则 FK 添加失败。
- **复用场景**：任何新表加 user FK 列（user_id / employer_id / helper_id / 等）一律写 `text`，不要写 `uuid`。
- **来源**：migration 025（household_members.helper_id uuid → text + FK）+ 026（households.employer_id uuid → text）

### pg-alter-column-policy-cross-table-dep — ALTER COLUMN TYPE 必须先 DROP 所有跨表 RLS policy
- **detail**：场景：`ALTER TABLE households ALTER COLUMN employer_id TYPE text` 被 helper_reviews 表的 INSERT policy with_check 子查询 `WHERE households.employer_id = auth.uid()` 阻塞（PG 0A000 错误）。坑：同表 policy 引用易发现，**跨表 policy 子查询不容易预检**——必须查 pg_policies 全表。解决：执行顺序铁律 = DELETE 孤儿 → DROP POLICY（所有引用列的）→ ALTER COLUMN → ADD FK → CREATE POLICY (anon-first)。BEGIN...COMMIT 包裹失败时事务回滚干净可放心修正重推。
- **复用场景**：未来任何 RLS 表的列类型迁移都先跑 `SELECT policyname, tablename, qual, with_check FROM pg_policies WHERE qual LIKE '%<col>%' OR with_check LIKE '%<col>%'` 预检。
- **来源**：TELEPOT-20260519-SMELL3-B1-AND-P6（migration 025 + 026 落地）

### supabase-cli-temp-role-token-expiry — supabase db push 和 db query 走不同认证通道
- **detail**：场景：`db push` 连续 8 次 SASL auth fail (`cli_login_postgres` 临时角色 TTL 短)，但同一时刻 `db query --linked` 仍能正常跑（CREATE TABLE 备份成功）。坑：两条命令看似同源实则走不同认证路径——push 用临时角色，query 走 Management API。解决：(a) `supabase login` 交互式 OAuth 刷新 (b) `supabase login --token sbp_<personal_access_token>` 非交互可在 CLI 跑 (c) 紧急 fallback：`supabase db query --linked --file <migration.sql>` 直接执行 SQL。**禁止** UPDATE/INSERT/DELETE supabase_migrations.schema_migrations 手动登记 migration（破坏 CLI 自动登记路径）。
- **复用场景**：未来 db push 卡 SASL fail，先 try db query 验证通道是否独立可用，避免误判全失败。
- **来源**：TELEPOT-20260519-SMELL3-B1-AND-P6

### multi-row-dedup-batch-fk-migration — 4 道菜复用同一套 5 步事务零损 dedup
- **detail**：P17 4 道重复菜（054 完工）直接复用麻婆豆腐 033 方案 A 模板。每道独立 migration + 独立事务 + 独立备份 _archive_<dish>_pre_dedup_<HKT>。单道失败回滚不影响其他 3 道。756 → 748 行 dishes，**0 数据丢失**。
- **复用场景**：未来任何"多行 dedup 同一表"按此 batch 模板，每道独立事务保证隔离。
- **来源**：TELEPOT-20260520-054 (commits ae92d96/fc08c63/4755273/0a8fe68)

### pg-constraint-fk-full-audit-query — 一句 SQL 全扫 FK→某表，验证不变量
- **detail**：检查任意表是否有残留 FK 指向不该有的目标（如 auth.users）：
  ```sql
  SELECT conname, conrelid::regclass AS source_table, a.attname AS source_column
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE contype = 'f'
    AND confrelid = (SELECT oid FROM pg_class WHERE relname = '<target>' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '<schema>'));
  ```
  Aieats 项目用此 SQL 把 FK→auth.users 残留从 2 个清到 **0**（不变量 #1 最终对齐）。
- **复用场景**：任何 schema-level 不变量审计、新表加 FK 前验证、生产 schema drift 排查。
- **来源**：TELEPOT-20260520-045 §A（P15 init seed legacy FK 全面 audit）

### plpgsql-updated-at-trigger-pattern — BEFORE UPDATE FOR EACH ROW 自动维护 updated_at 列
- **detail**：表需要 updated_at 列在每次 UPDATE 时自动跳，前端不维护时间字段。**Pattern**：`CREATE OR REPLACE FUNCTION update_<table>_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;` 然后 `CREATE TRIGGER <table>_updated_at_trigger BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION ...`。验证：INSERT 时 created_at = updated_at；UPDATE 后 updated_at > created_at。每张表用独立 FUNCTION 名避免共享时 DROP 影响其他表。`$$...$$` dollar-quoted 必须用（migration push 测试 OK）。
- **复用场景**：所有需要 updated_at 自动维护的表（chat_sessions / user_profiles / household_members 等）。
- **来源**：TELEPOT-20260520-020（chat_sessions 028 表）

### hardcoded-map-to-db-inverse-direction-choice — 硬编码 {K: V[]} map 迁 DB 按"UNIQUE 主键 + 查询模式"选行向
- **detail**：场景：`useWeeklyMenu.ts` `INGREDIENT_SEASONALITY = {节气: [食材...]}` 24 行 map 迁 DB 表有两种 shape：(A) 一行一节气，ingredients text[] (24 行宽 array)；(B) 一行一食材，solar_terms text[] (63 行窄 array)。最终选 B 依据：(1) UNIQUE 主键自然落在"食材名"（每食材唯一 category / peak_solar_term 元数据）；(2) Algorithm 查询模式是"今天节气 X，哪些食材应季？" → `SELECT WHERE 'X' = ANY(solar_terms)`，对 array 用 GIN index 比 24 行展开 array 取 ANY 更顺；(3) 未来扩展（peak / notes）按食材附挂更自然。复用：硬编码 `{K: V[]}` 迁 DB 时先问"主键应该是 K 还是 V？" 答错就要重做表。
- **复用场景**：所有"map 类静态数据迁 DB"的方向决策。
- **来源**：TELEPOT-20260520-065（047 ingredient_seasonality 表）

### migration-include-all-when-out-of-order-numbering — 本地 migration 编号小于远端最新时用 --include-all 补齐
- **detail**：场景：本地写 047/048，但远端已 push 049（另一部门越界写的）。`supabase db push --linked` 直接拒绝："Found local migration files to be inserted before the last migration on remote"。根因：supabase CLI 默认按时序推，发现"过去"未推的 migration 时拒绝（防覆盖远端）。解法：加 `--include-all` 显式确认"我知道有过去 migration 要补，按字典序补齐"。副作用预判：047/048 是纯 CREATE TABLE + INSERT，对 049 已建的表零依赖、零冲突。若 047/048 触及 049 已有的对象（如 ALTER 049 表）就要警惕。
- **复用场景**：多部门并行写 migration 必看 `ls migrations/` 头尾，编号撞了用 `--include-all` 修。
- **来源**：TELEPOT-20260520-065

---

## Algorithm

> generateWeekPlan / scoreForWeek / prefScores / 9-axis 范围

_（首次填充等 TICKET-011 完工后由 Cowork 汇总；目前已知一条种子经验：）_

### algo-version-double-column — 算法变更必须双列 stale（algo_version + cache_key）
- **detail**：单列 `algo_version` 只能捕获算法本体变动；但 cuisine / eating / intent / dpd 这些非算法维度变动后，旧 cache 仍会被命中。Migration 024 加双列，前端 SELECT 取回两列任一不匹配 → 强制 stale → 重生成。
- **复用场景**：未来任何"缓存语义变化"都按此双列模式，单列不够用。
- **来源**：migration 024 + Smell 4 改造（SPEC_algo_version_migration.md）

### explainScore-api-pattern — 评分 API 返回中文 reason breakdown，黑盒变透明
- **detail**：scoreForWeek 内部计算 9+ axis 加分但默认只返 final score。新增 explainScore(dish, ctx) 返回 { score, breakdown: AxisHit[] }，每条 AxisHit 含 axis name / score_delta / **中文 reason**（"立夏宜清淡 +0.30 / 你最近喜欢川菜 +0.42"）。UI 加抽屉直接显示给用户 — 信任度 + 付费意愿都涨。
- **复用场景**：所有黑盒推荐算法（电商商品 / 内容流 / 菜单 / 音乐）都该有同款 explainScore — 用户能看到推荐理由 = 算法透明 = 信任。
- **来源**：TELEPOT-20260520-055（Algorithm Day 13）

### ingredient-seasonality-map-24-solar-terms — 60+ 食材 × 24 节气覆盖
- **detail**：INGREDIENT_SEASONALITY map 把每个食材绑到 1-2 个节气（如"枇杷"→ ['立夏', '小满']）。scoreForWeek axis 28 命中应季食材 +0.10/个，3+ 命中再 bonus +0.15，cap 单菜最高 +0.5（避免一道菜命中 5 个食材压制其他 axis）。
- **复用场景**：任何"季节性偏好"推荐（季节性服装 / 旅游目的地 / 体育活动）都用此 map × 节气模式。
- **来源**：TELEPOT-20260520-053 (commit 3ee3eb9 + 715f7e4，ALGO_VERSION v43)

### cross-week-dedup-reroll-window — last N weeks 出现 ≥M 次 reroll
- **detail**：阶段 3 同周内 dedup 3 天窗口外，阶段 4 加跨周 dedup — 拉 user_weekly_menus 最近 4 周 dish_ids，统计每个 dish 频次，generateWeekPlan 抽样时 reroll if recent_4week_count >= 4。CROSS_WEEK_FATIGUE_THRESHOLD 可配置。
- **复用场景**：任何长周期推荐系统避免"审美疲劳"。music playlist / news feed / 商品推荐都该有。
- **来源**：TELEPOT-20260520-043 §A (commit e3da6a9)

---

## CrossCutting

> 跨部门通用 / 工程文化 / 工具链 范围

### cowork-dispatch-mobile-desktop-sync — Cowork 手机 ↔ desktop 单线程同步通过 Dispatch beta
- **detail**：2026 年 Anthropic 推的 Cowork beta 子功能"Dispatch" — 开启后整个 Cowork 对话变成跨设备 single thread，手机派任务给 Mac，Mac 跑完推送回手机。要求：Pro/Max plan + Mac Claude desktop app 最新版 + iOS/Android Claude app 最新版 + Mac 不能休眠。在 Cowork 左侧栏点"Dispatch" → "Get started" → 开"Give Claude access to your files" + "Keep your computer awake" → "Finish setup"。
- **复用场景**：老板出门 / 路上 / 床上想跟 CEO 对话或派任务，不用回 Mac 桌面。
- **来源**：TELEPOT-20260520-DISPATCH-DISCOVERY（CEO 凭过时记忆说"做不到"，老板纠正，WebSearch 文档确认能做）

### no-stale-intel-for-external-products — 涉及外部产品 / 工具能力必先 WebSearch 官方文档
- **detail**：训练截止日期之后的产品演进（Anthropic Claude / Cowork / Code / Stripe / Supabase / Railway / Gemini / lucide-react / vite / GitHub Actions 等）凭记忆答会过时。**绝对规则**：凡用户问"X 能不能做 / X 怎么落地"涉及外部产品，**强制 WebSearch 官方文档**先验证再答。否定判断（"做不到"/"不可行"）有额外门槛 —— 若信息基于 > 6 个月前的知识，**必须查**。
- **复用场景**：所有 CEO / 员工角色，涉及外部产品能力的回答都先 verify。MORNING_REPORT 加"今日已 verify 外部信息"段显式声明依据。
- **来源**：TELEPOT-20260520-DISPATCH-DISCOVERY（同上事件，沉淀为跨项目纪律）

### never-stop-with-workorder-pool — 工单池储备永不空，员工任一 idle 立即追派
- **detail**：CEO 监工 4 部门时维护"下一波候选工单"储备清单（项目永远有 P 立项 / 数据 backfill / 用户体验打磨 / 真机回归 / 文档 / 测试）。任一员工完工进 idle → 从清单 pop 一个立即派出。整个 sprint 阶段 commit 节奏 50+/day，wall clock × 4 比 1 部门串行高效。
- **复用场景**：任何"加速 sprint"模式都用此储备策略 — 避免"等下一棒"自我设限。
- **来源**：feedback_never_stop_without_command（2026-05-20 立项）

### workorder-context-pct-self-report — 工单 §E 强制员工 response 末尾报告 context %
- **detail**：CEO 没法直接看员工 status bar，但派工单时加 §E "completing context %" 强制要求 — 员工 response 末尾必须写 `CONTEXT_USAGE_AT_COMPLETION: X%`。CEO 通过 response 知道每个员工的 context 健康度。≥ 70% 员工自跑 dump-before-compact 铁律。
- **复用场景**：所有"远程监工"场景 — 把"间接监测"转成员工主动汇报，让 CEO 看不到的指标变可见。
- **来源**：HKT 15:05 立项（057/056/058 工单 §E 落地）

### multi-tab-staggered-launch — 分批 1 分钟错开敲触发词避免 Anthropic burst rate limit
- **detail**：4 部门 warp tab 同时敲 `process telepot` → Anthropic 短时间 4 倍请求 → 服务端 burst rate limit。修复：分批启动，每个 tab 间隔 ~1 分钟。Anthropic burst 限流的恢复时间 ~1-5 分钟，错开启动天然避开。
- **复用场景**：所有"多 worker 并发"场景（不止 Claude）— gradual rollout 比 thundering herd 更稳。
- **来源**：HKT 15:10-15:12 两次 rate limit 后立项 LESSON 13 → SKILL 复用化

### ceo-ack-in-workorder-pattern — CEO 在工单文件追加 ACK_FROM_CEO 段批准员工方案，不写新工单
- **detail**：员工 blocked 等 CEO 决策（如 033 麻婆豆腐 CASCADE 风险）。常规做法是 CEO 重写 telepot 工单覆盖原内容。**更优做法**：在原工单文件末尾追加 `ACK_FROM_CEO: 批准方案 A` 段 — 保留员工原 response 推荐内容 + 不破坏工单上下文 + 员工下次扫到立即继续推。这是 single-thread async approval pattern。
- **复用场景**：任何"员工提议方案 → CEO 批准 → 员工继续"的异步审批流。
- **来源**：TELEPOT-20260520-033 §B（麻婆豆腐 dedup CEO ACK）

### telepot-bidirectional-inbox — `process telepot` 双向触发词 + TICKET 显式去重
- **detail**：Cowork ↔ CLI 经 `_bridge/telepot_<dept>.md` (CLI inbox) + `_bridge/telepot_response_<dept>.md` (Cowork inbox) 一对一通信。`process telepot` 双向通用触发词。去重靠 TICKET ID 比对，不靠 mtime（mtime 会被编辑器误改）。完工后 telepot_<dept>.md 必须清空为 idle 态。
- **复用场景**：任何"远程 watch / 文件桥" 通信模式都参考此 SOP，避免重跑 / 弹窗 / 状态混乱。
- **来源**：`_bridge/PROCESS.md` v1.0 + v1.1 + v1.2

### no-bash-for-loop-in-claude-code-cli — Claude Code CLI 禁 bash 循环避免审批弹窗
- **detail**：Claude Code CLI 默认安全机制会把 `for f in ...; do ... done` 这种 shell variable expansion 判为 "simple_expansion" 触发审批弹窗。即使 `--dangerously-skip-permissions` 装了也可能因 tab 重启失效。员工要扫多个文件用 Read / Glob，禁用 bash for 循环。
- **复用场景**：所有跨多文件批量扫描都用 Read/Glob 工具，不用 bash for 循环。
- **来源**：凌晨 Architect 误弹窗事故 + PROCESS.md v1.1 §8 反弹窗铁律

### telepot-ticket-process-checklist-complete-read — cat telepot 工单必须读完整个"完工动作"清单到底
- **detail**：场景：员工 cat 工单后只看 §A/§B/§C 主体跳过末尾增补段，结果漏了 PROCESS.md v1.2 新加的 §12 清空工单 + §13 LEARNED_SKILLS 强制段。坑：CEO 在工单尾部追加的新规则没读到 → 完工不合规 → 第二轮 cat 时才识别要补完工。复用：员工 cat 工单时**逐行读到 EOF**，特别留意"完工动作"段是否引用了新的 PROCESS.md 版本号（v1.2 / v1.3 等），所有 §N 章节项必须打勾。
- **复用场景**：所有员工每次 `process telepot` 时读 telepot_<dept>.md 必须读到文件末尾，不能跳过尾部 SOP 增量。
- **来源**：TELEPOT-20260520-011（Algorithm 补完工事故）

### table-rename-follow-with-grep-verify — 跨部门表重命名跟随：grep 列全 → 逐点 Edit → 收尾 grep 零残留
- **detail**：场景：Database 改飞轮表名 user_feedback → user_feedback_helper，UI/Backend/Algorithm 多个文件的 SELECT/INSERT/注释 / docstring 都要跟。坑：用 `sed -i` 简单替换会误中包含 substring 的新表名（user_feedback_helper），所以必须**逐点 Edit**。步骤：(a) `grep -n "user_feedback" <file>` 列全命中；(b) 分类（代码字符串 / 段落标题 / 注释 / catch reason）后单点 Edit；(c) 收尾 `grep` 一次确认只剩新名无旧名残留。注释里的"老表名"也要清掉，**不留旧痕**。
- **复用场景**：所有跨部门重命名 / 迁移工单（schema rename / API rename / 角色 rename）。
- **来源**：TELEPOT-20260520-019（Algorithm 表名跟随）

### cross-dept-shape-decouple-via-schema-check — 依赖 DB 表先 schema-check 容错路径，避免上线时序硬耦合
- **detail**：场景：Backend rollup script 写好时 Database 027 表还没上线（或者表名待定）。坑：硬 SELECT 会 42P01 (relation does not exist) 直接 crash。解决：脚本入口先跑 `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1` 检查关键列，缺列就输出友好 "SCHEMA NOT READY: <table>(<col>) — 请确认 Database TICKET-XXX 已落地" 并 graceful exit。这样 Backend 部门可以**先于 Database 完工**，互不阻塞；表上线后 re-run 自动走真路径。
- **复用场景**：所有跨部门、跨 service 的 DB 表 / API endpoint 依赖。先 schema/health-check 容错，再业务逻辑。
- **来源**：TELEPOT-20260520-014 + TELEPOT-20260520-018（Backend rollup dry-run）
