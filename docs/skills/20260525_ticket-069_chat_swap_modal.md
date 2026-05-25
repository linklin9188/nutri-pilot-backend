# TICKET-069 chat 改弹对话窗 + chip 中性 + 勾选今日菜换

## 1. 问题

TICKET-066 把 IntentInputBox 抽到 Home/WeeklyMenu 顶部, 输入即触发
parseIntent → saveIntentBias → clear weekly_menu_* cache → 派 nutri-prefs-changed
事件让 useWeeklyMenu 重排. 两个真实问题:

1. **chip 偏向**: 上轮 6 个 chip 里塞了"多西北菜"——只是 CEO 自己举的例子,
   不是用户中性提示. 老板纠正"chip 不要偏向", memory 已存
   `feedback_no_default_cuisine_bias.md`.

2. **交互无确认中间态**: 老板真测 #14 反馈"我说一句话 AI 就把全周菜单
   推翻了, 没机会预览也没机会选". 老板想要"弹对话窗 + AI 跟我聊 +
   我在弹窗里选今天换哪几道". 老板拍板:
   - 弹窗范围: 只换今天 (lunch + dinner, 不动下周)
   - 替换方式: A — AI 直接选 1 道换, 不让用户 3 选 1

## 2. 方法

### Phase 1: IntentInputBox 改触发器

- 删 6 个 chip 里的菜系名 "多西北菜", 换成 IntentRegenModal 原版
  6 个中性句 ("这周多吃海鲜" / "孩子怕辣，少点辣的" / "想要清淡养胃" /
  "老人多一点汤水" / "增肌期，多蛋白少碳水" / "减脂期，多蔬菜少油"),
  三语全齐.
- 删 submit 里的 parseIntent / saveIntentBias / clear cache / dispatch 链路.
  prop 改成 `onTriggerSwap?: (userIntent: string) => void`, 父组件接.

### Phase 2: ChatSwapModal 新建 (~350 行)

设计要点:
- **接 prop**: `swapDish` + `weeklyMenu` + `todayIdx` 由父组件传, 不自己
  mount useWeeklyMenu hook (否则 Home + WeeklyMenu + modal 三次 mount,
  loadFromDB 会跑 3 次).
- **UI**: bottom sheet (mobile 友好), sticky header (✨ AI 助手 + ✕),
  sticky footer ("确认换菜 (已选 N 道)" 三态按钮 灰/橙/loading),
  中间滚动区: 灰底引用 userIntent + 橙圆 AI 头像 + 今日菜单列表
  (每行 checkbox + 32x32 缩略图 + 菜名).
- **替换算法**:
  1. parseIntent(userIntent) 拿 bias (Gemini 20/day 配额)
  2. saveIntentBias(bias) 让全局生效, useWeeklyMenu 下次重排时 cache_key
     自动失效 (getIntentHash 进 hash)
  3. 对每个勾选 dish slotIdx: query dishes WHERE type=current.type AND
     id NOT IN excludeIds, limit 30 → applyIntentBias(0, d, bias) 排分
     → 取最高分 → swapDish(todayIdx, slotIdx, pick)
  4. excludeIds 累积 (含 current.id + pick.id), 防多 slot swap 时反复
     换回同一道
  5. 全 swap 完 → toast "已换 N 道, 跳菜单页..." → 1 秒后
     dispatchEvent('nutri-weekly-menu-changed') + navigate('/weekly')
- **错误**: 任一 swap 失败 → 红错误条 + 弹窗保持开, 不跳菜单页.

### Phase 3+4: Home / WeeklyMenu 接

- Home 给 useWeeklyMenu 解构补 `swapDish: weeklySwapDish`, 加
  swapModalOpen / swapIntent state, IntentInputBox 接 onTriggerSwap.
  todayIdx clamp 周末 → 0 (跟 line 432 todaySlotsByDishId 一致).
- WeeklyMenu 已经有 swapDish + todayIdx (line 600 已 clamp), 同模式接.

## 3. 标准 (对今后类似 ticket)

1. **凡 AI "批量改用户数据" 必须有 "勾选 + 确认" 中间态**, 不能输入即生效.
   Quick swap / regen / settings 应用 / 偏好导入都遵守.
2. **Modal 调下游 hook 时优先 props 接已 mount 实例**, 避免重复 mount 导致
   多次 DB query (useWeeklyMenu 一次 mount 跑 ~1.5 秒).
3. **替换池查询用 applyIntentBias(0, d, bias) 排序就够**, 不必复用全 9-axis
   scoreForWeek (它依赖 imagePrefs / familyPrefs / seasonHints / hasPregnant
   等大量 context). Quick swap 只要 bias 命中浮上来即可, "正确性"留给下次
   全周重排.
4. **chip 文案纯中性**, 不暗示菜系 / 任何偏好方向. 老板说"那只是我举例"
   = 不要把举例当 default. 复用 IntentRegenModal QUICK_SUGGESTIONS 6 句作锚.
5. **excludeIds 累积**: 多 slot 连续 swap 时, 必须累积 current.id + pick.id,
   否则第 2 slot 可能把第 1 slot 刚换走的菜又选回来.
6. **弹窗 unmount reset state**: 弹窗 useEffect([open]) 里 reset 勾选 /
   error / toast / swapping, 避免再次打开看到上次残留.

## 4. 隐藏假设 (push 前已校核)

- swapDish 接口签名: `(dayIndex, slotIndex, newDish: SupabaseDish) => Promise<void>`
  ✓ 直接接收完整 dish 对象, 不接 bias, 不内部挑候选. 因此 swap "用 bias 选 1 道"
  逻辑必须在 ChatSwapModal 里写.
- swapDish 内部已写 user_weekly_menus upsert + algo_version + cache_key.
  我们只负责"挑哪道 dish 传进去".
- saveIntentBias 立即生效: useWeeklyMenu 通过 loadIntentBias() 在 scoreForWeek
  内读取, 但只在重新生成菜单时影响; 单道 swap 时不重排, 所以 bias 主要影响
  "下次全周 regen 的菜单" 和 "我们这里手工排候选". 短期是对的.
- 临时方案 (saveIntentBias 先 + 手工 query + applyIntentBias 排) work, 因为
  applyIntentBias 是纯函数, 接 (baseScore, dish, bias) → score, 不依赖 React state.
