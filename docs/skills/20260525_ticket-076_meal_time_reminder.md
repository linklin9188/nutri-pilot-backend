# TICKET-076 — 用餐时间设定 + 备菜时间反推 + Web Notification 提醒

## 问题

智能菜单缺时间维度: 老板痛点 #19 — "既然是智能菜单, 那么用户应该可以设定吃饭的时间,
这样也就可以根据我们今天的菜单, 设定菲佣开始备菜的时间? 然后给菲佣做饭的提醒?".

具体断点:
- dish.cook_time_min DB 已有但只用来填 §2 任务卡 ETA, 没反推任何"开做时间"
- user_profiles 没有"用餐时间"列, 雇主无处声明开饭时间
- HelperHome 不知道"现在该不该开始做菜", 菲佣全凭经验
- 浏览器 Notification API 完全没接, 后台用户错过备菜

## 方法

5 phase 端到端:

1. **DB (migration 091)**: `user_profiles` 加 `lunch_time time DEFAULT '12:00:00'` +
   `dinner_time time DEFAULT '19:00:00'`. 默认值不调研直接拍板 (CEO 拍板, 老用户读
   DEFAULT 即可, 不强制重填).

2. **Settings UI (employer only)**: 在"做饭辅助"卡前插一张"用餐时间"卡, 2 个 type=time
   input + 保存按钮. fetch user_profiles 时多 select 两列, DB 'HH:MM:SS' UI 'HH:MM',
   slice(0,5) 读 + ':00' 写.

3. **lib/cookSchedule.ts**: 复用 TICKET-075 已 ship 的 `loadEmployerTodayMenu()` 拿
   今日菜单, 按 meal 分桶, 用 max(cook_time_min) (并行做菜假设 — sum 太晚) +
   PREP_BUFFER 15min 反推 startCookTime / startPrepTime. 早饭不算 (中国家庭多预备 or
   外食, 提醒意义有限).

4. **HelperHome 时间卡**: 在 §1 hero 后加橙色 "今日做菜计划" 卡, lunch / dinner 各一
   栏显示 开饭/开做/备菜 3 时间; §2 任务卡每道菜旁加"X 分钟后做"/"现在做"红色 badge
   (urgent = ≤30min 或已过点).

5. **Web Notification**: 探测 typeof Notification; default 状态时卡里显"开启做饭提醒"
   橙按钮 (Chrome 禁自动 prompt, 必须用户点); granted 后用 setInterval(60s) 比对
   nowStr === startCookTime 推通知; tag 防同分钟重弹; unsupported/denied graceful
   degrade 只显 UI 不挂.

## 标准

今后凡涉"时间/提醒"的功能, 必须 3 件齐:

1. **用户可设** — DB 加列 + Settings 卡, 不要硬编码默认值 (中国 12:00/19:00, 印度
   13:00/20:30 不同, 默认值 ≠ 用户值, 总要可改).
2. **算法可读** — 抽 lib (本 ticket cookSchedule.ts) 而非散在 UI; 上下游复用 +
   单测友好.
3. **提醒 graceful degrade** — Notification API 不是处处支持 (iOS Safari 直到
   PWA 才有, 旧浏览器更没), 必须 typeof 探测 + unsupported/denied 双 fallback,
   不要让 UI 因 API 缺失白屏.

副产物经验:

- `setInterval` + Notification + `tag` 已经能 cover 90% 前台/锁屏场景, 真后台用
  service worker 更稳但不是 MVP 必需. 老板 #19 没要 PWA, 这版够用.
- 并行做菜 max() 不是 sum() 是关键 — 直觉是 sum 但现实菲佣 3 锅同开, sum 会
  推荐"15:00 就开做晚饭"明显错.
- 备菜固定 15min 是 CEO 拍板, 没做 dish-level prep_time 列 (要加列 + AI 估算 +
  全量 backfill 太重, 留下个 ticket 真需要再加).
