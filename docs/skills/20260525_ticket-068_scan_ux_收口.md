# TICKET-068 拍冰箱 UX 收口 — 勾选 + 看菜单 + 跳 weekly

## 问题

TICKET-062 (commit c8c0443) 把"拍冰箱 6 道菜"接到了 `user_weekly_menus`
upsert, 但 UX 收口漏了:

- 每张菜卡右下角橙小 pill `+ 加今日 晚餐` (11px 字, fontSize 太小, 老板真测
  #13 完全没看到)
- 用户得**逐道**点 + 按钮才加入今日菜单
- 加完弹窗**不自动关**, **不跳菜单页** — 用户拍完看到 6 道菜以为流程结束,
  根本不知道还要点 + 按钮 + 进 /weekly 页
- 真测原话: "扫一扫拍照后没有跳转到生成的菜单页面, 我去哪里能看到菜单?"

根因: AI 生成多个推荐时把"批量提交 + 跳查看"的收口动作下放给了用户操作,
而用户对"+ pill"的 affordance 没感知, 流程到此断了。

## 方法

老板拍板方案 1, 一次性把"挑哪几道 → 加入 → 跳查看"折叠成一气呵成:

1. **加 state**: `scanSelectedIds: Set<string>` (default 空 = 全部 unchecked,
   让用户从 0 开始选, 主动表态) + `scanBulkAdding: boolean` 防双击
2. **菜卡左上加 32x32 橙色 checkbox** (absolute 定位, `pl-12` 给卡内文留位):
   - 未选 = 白底 + 橙描边
   - 选中 = 实心橙 + 白 ✓ icon + 卡边框转橙 (双重 affordance)
   - 删掉原右下角"+ pill"
3. **底部 sticky 大按钮** (w-full h-14, 16px 字, 橙色), 三态文案:
   - 0 选: `请勾选至少 1 道菜` (disabled 灰色)
   - N 选: `看菜单 (已选 N 道)` (橙色 active)
   - 加入中: `加入中...` (橙色 0.7 opacity)
4. **handleBulkAddAndGo** 一次性干 4 件事:
   - 按 dish.course_type 分组成 lunch / dinner (无值默认 dinner)
   - 每个 slot 一次 read + 去重 + upsert (复用 062 cache_key + algo_version 口径)
   - dispatch `nutri-weekly-menu-changed`
   - toast `已加入 N 道, 跳菜单页...` → 1 秒后 `navigate('/weekly')`
5. **关弹窗时 reset** 提到 IIFE 顶部 `closeAndReset()`, 背景点击 + close 按钮
   共用一个 handler, 避免下次开还残留上轮菜 / 勾选 / 错误

## 标准

今后凡"AI 生成多个推荐/草稿"必须有"一键 commit + 跳查看"的收口动作:

- 不能让用户对每个 item 单独执行子动作 (隐蔽 affordance + N 次点击 = 用户
  根本不会做)
- 收口动作必须是**底部 sticky 主按钮** (≥56px 高, 主色, 字号 ≥16px), 不能
  是右下角小 pill
- 按钮文案三态必须明示当前进度: "请先选 X" / "确认 X (N 项)" / "处理中"
- commit 成功后必须**自动跳到查看页**, 不让用户自己摸"下一步在哪里"
- 关弹窗必须 reset 所有临时 state, 避免下次开的状态泄露
- 三语 zh/en/tl 都要齐, 用 `t3(en, zh, tl)`
