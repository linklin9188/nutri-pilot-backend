# SPEC — UI 072 Freemium Gate 重构

> 等 UI 071 完工归档后立即派给 UI 部门覆盖 telepot_ui.md。
> 老板拍板 2026-05-21 00:55 HKT。

## 老板原话

> 应该是采购页面，可以看到，但是用户不可以点击一键采购和一键导出。未来我们
> 上线后就可以有这个 pro 功能，实现一键采购供应商直接发货。一周菜单也是，
> 不是 pro 用户只能看今天和明天。不能看到雷达和一周菜单。

## 产品原则（freemium with progressive disclosure）

- 免费用户**看得到** Pro 功能的存在（产生欲望）
- 但**点不了 / 翻不到** （要付钱解锁）
- 不在 onboarding / Home 多次推广 Pro（已删 Settings ProToolbox + UI 072 删 /verify 强制跳转）

## 派单内容（4 件）

### §A. VerifyIngredients.tsx — 删强制跳转 + button 级 Pro gate

1. 删除 line 423-429 整段强制 navigate('/pricing')：
   ```js
   // 删除 ↓
   if (!subLoading && !isPro) navigate('/pricing', { replace: true });
   ```

2. "一键采购"按钮（grep 找到位置）：
   - 视觉：button 右上角加 Pro chip 「🌟 Pro」
   - onClick：if (!isPro) → 弹 `<ProGate />` modal（已有组件，复用）
   - Pro 用户：正常执行 — 现状 placeholder（功能待开发）+ TODO 注释：
     "未来对接供应商一键直发"

3. "一键导出"按钮：同样模式
   - 视觉 Pro chip
   - onClick gate

### §B. WeeklyMenu.tsx — freemium day-window + 雷达 Pro

1. **day window**：
   - 找出渲染 7 天菜单的位置
   - 包裹：`{(isPro || dayIdx <= todayIdx + 1) && <DayCard ... />}`
   - 非 Pro 第 3-7 天（todayIdx+2 到 todayIdx+6）→ 替换为 blur overlay card：
     ```
     <ProGatePreview>
       🌟 解锁未来 5 天菜单
       Pro 用户提前看到全周排菜，提早采购备料
     </ProGatePreview>
     ```

2. **营养雷达**：
   - 现有 `<NutritionRadarCard />` 整个包裹 `{isPro ? <NutritionRadarCard /> : <RadarPreview />}`
   - `<RadarPreview>` 显示一个 placeholder card：
     ```
     🌟 营养雷达 · Pro
     看本周 6 维营养摄入分布
     + 智能推荐补全菜
     [升级解锁 →]
     ```

3. UI 071 §B 加的"按差距推荐补全 section" → 仅 isPro 渲染（已在 071 工单
   补丁标注，确认实施）

### §C. Settings.tsx — MembershipCard 精简

- 当前 MembershipCard 是橙色大 CTA 推广
- 改为**纯状态卡**：
  - 已是 Pro：「✨ Pro 会员 · 月度/年度 · 到期 YYYY-MM-DD」+ 小"管理订阅"链接
  - 试用中：「免费试用 · 剩 X 天 · 看看 Pro →」（橙色但小，不是大块）
  - 试用过期：「免费版 · 升级 Pro 解锁全部 →」（橙色 CTA 但精简）
- 删大块推广文案 + emoji 装饰

### §D. Home.tsx — 删试用内嵌 Pro 推广卡

- 保留：试用过期 D7+ 顶部一次性 banner（用户可关 → localStorage 记忆）
- 删除：Home 主流程中嵌入的 Pro 大 CTA（如有，grep `MembershipCard` / `升级` 看）

### §E. 复用 ProGate 组件 — 标准化 paywall 弹窗

- `src/components/ProGate.tsx` 已有
- 所有 button-level gate 复用这个组件
- ProGate 内容：3 句话 + Pricing 跳转 CTA + 关闭按钮

## 完工 verify

1. 免费用户 /verify 能看到页面（不跳转）+ "一键采购" / "一键导出" button 显示 Pro chip + 点击弹 ProGate
2. 免费用户 /weekly 只能看今天 + 明天 day card，第 3-7 天是 blur preview + CTA
3. 免费用户 /weekly 看不到营养雷达，看到 placeholder + CTA
4. Pro 用户：所有功能正常解锁
5. Settings MembershipCard 精简（不再大块橙色推广）

## 硬性约束

- 不变量 #1: 不加 FK→auth.users（不动 schema）
- 不变量 #2: 前端不直连 Gemini
- 不变量 #4: 算法改动 bump ALGO_VERSION — **本棒不动算法**，不 bump
- SURGICAL only
- **永久禁止现金奖励字眼**（feedback_no_cash_rewards_ever）

## Commit 拆分

- fix(verify): 删强制 Pro 跳转 + 按钮级 paywall (一键采购 / 一键导出)
- feat(weekly): freemium day window (今+明 免费, 3-7 天 Pro)
- feat(weekly): 营养雷达 Pro gate + placeholder card
- refactor(settings): MembershipCard 精简为状态卡 (删推广)
- chore(home): 删 Home 内嵌 Pro 推广 (保留过期 banner)

预计 30-40 分钟 ship。

## CEO 派单时机

- UI 071 完工归档 → telepot_ui.md idle
- CEO 自动派 UI 072 = 把本 SPEC 内容写进 telepot_ui.md
- 老板敲 process telepot 启动
