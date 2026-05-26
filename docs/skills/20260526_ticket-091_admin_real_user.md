# TICKET-091 admin 真用户分类 + 排除 seed/test (2026-05-26)

## 1. 问题

老板真测 #27 进 admin 后台看到 94 总用户、78 trial / 2 paid / 16 expired,
但实查最近 50 注册里发现严重污染:

- 31 hash 假名 (display_name = id 前 8 位, 2026-05-24 03:27 同一秒批量 seed)
- 8 测试号 (Link / Link🥇 / ika×2 / 测试雇主 / Maria×2 / link)
- 11 匿名用户 (display_name='匿名用户')
- 0 真实姓名用户

也就是说 ~39/94 (41%) 是非业务数据, 老板看 admin 完全看不出真实增长.
"94 总用户" 这个数字让老板乐观判断错误.

## 2. 方法

**核心思路**: 在 server 层加 `classifyUser(u)` 统一分类函数, 5 类:
`seed / test / wechat_real / anon / other_real`. 三处 admin endpoint 统一调用,
admin UI 加 tab + chip + 透明度区分.

**不动 DB schema** — admin_users_view 不加 wechat_openid 列 (避免 migration).
改在 server.js 里多查一次 `user_profiles?select=id,wechat_openid` 字典 join 内存.

**分类规则** (server.js classifyUser):
1. `seed`: name.length===8 && name===id.slice(0,8) && created_at startsWith
   '2026-05-24T03:27' — 严格三重条件锁定批量插入 seed, 避免误伤真用户.
2. `test`: name in {Link, Link🥇, ika, Ika, link, 测试雇主} 或 Maria*/测试* 前缀.
3. `wechat_real`: wechat_openid IS NOT NULL — 微信扫码强信号.
4. `anon`: 没 wechat + name='' 或 '匿名用户'.
5. `other_real`: 有 name 但非 wechat 也非 seed/test (历史真注册).

**3 个 endpoint 改动**:
- `/api/admin/stats` — 加 8 个 real_* 字段 (real_users / wechat_real_users /
  anon_users / other_real_users / seed_users / test_users / real_new_7d /
  real_active_7d). 旧字段保留兼容.
- `/api/admin/users-growth` — recent[] 每条加 category; summary 加 13 个真用户
  break-down 字段 (real_total / real_paid_count / real_conv_rate 等).
- `/api/admin/users-real` (NEW) — query `category=all_real|wechat_real|anon|
  other_real|seed|test|all`, 最多返 200 行.

**UI 改动**:
- `CategoryChip` 组件 (5 颜色: 绿=微信, 蓝=其他真实, 灰=匿名, 黄=seed, 红=测试).
- Users.tsx 加 7 tab (真用户 default, 微信/匿名/其他真实/Seed/测试号/全部),
  顶部主指标 = 真用户, seed/test 单独一行透明度 0.55.
- Dashboard.tsx 主指标 6 卡换成 real_users + real_new_7d + real_active_7d,
  seed/test 副指标 3 卡透明度 0.55.

## 3. 标准

**今后凡 admin 数据展示, 必须区分**:

1. **真用户** (微信扫码 / 匿名访问 / 历史真注册) — 主指标, 100% 不透明展示;
2. **测试号** (团队亲手注册) — 副指标, 透明度 ≤ 0.6, 明确"已排除";
3. **Seed / 演示数据** — 副指标, 透明度 ≤ 0.6, 标注批量插入时间戳;
4. **总数** (含污染) — 副指标, 用于交叉验证, 不作主决策依据.

**Seed 识别**: 必须三重条件 (name pattern + name=id 前缀 + created_at 时间窗),
单一条件容易误伤. 历史 seed 批次需提前在 server 端记录时间窗.

**新加 admin 数据 endpoint 规则**:
- 不要直接返 raw user_profiles 全字段 (PII 风险), 返之前 anonymize id (前 8 位).
- summary + recent 拆开返, summary 已分类计数, recent 带 category 字段.
- 任何分类逻辑集中在 server 一个 helper (`classifyUser`), 不在多处分叉.

**不变量自检通过**:
- 不动 user_profiles schema (只 SELECT wechat_openid 已存在列)
- 不动 ALGO_VERSION (admin 后台, 不触算法)
- 不动 dishes / orders / 其他业务
- vite build + build:admin 都通过
- server.js node --check 语法 OK
