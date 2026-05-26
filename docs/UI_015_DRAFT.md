# UI 015 DRAFT — Onboarding v4 优化 + WeeklyMenu 5-channel 候选

> 依赖：Algorithm 016 ship (generateWeekPlan 新返回结构) + Database 012 ship (5 张家庭组合摄影图)
> CEO 时点到位后把本文件 markdown 代码块覆盖到 `_bridge/telepot_ui.md`

---

```markdown
# TELEPOT — 待执行任务（UI）

TICKET: TELEPOT-20260521-015
STATUS: pending
ISSUED_AT: 2026-05-21T23:25:00+08:00
TASK: Onboarding v4 + WeeklyMenu 5-channel 候选网格（2 块合一）
PRIORITY: 🔴 critical — 老板拍板架构变更 UI 层 / 90-120 分钟
DEPENDS_ON: Algorithm 016 ship + Database 012 ship (5 张 q0_family_*.jpg)

⚠️ 开工前 /compact
⚠️ §16 铁律：开工第一动作 update telepot_ui.md head 为 STATUS: in_progress + CURRENT_TICKET=015 + STARTED_AT

CONTEXT: |
  UI 014 8 commits 已 ship Q0 4 选项 (1/2/4/10 人)，但老板 23:20 升级要求：
  Q0 改 6 家庭组合 + 自定义；所有 11 题都加"自定义"兜底；新增 Q5 健康目标；
  Q6 后弹"预览感"toast。同时 WeeklyMenu 改 5-channel 候选网格。

  Algorithm 016 ship 后 generateWeekPlan 返回 `days[i].slots[].candidates[]`
  + `channels: ChannelTag[]` 数组。

  ============ §A. Q0 二改 — 6 家庭组合 + 自定义 ============

  src/pages/QuickSetup.tsx Q0 改：

  ```ts
  // Q0 v4: 6 家庭组合大图 + 自定义
  {
    key: 'Q0',
    question: '你家餐桌坐几个人？',
    options: [
      { value: 'solo_w_kid',   adults: 1, kids: 1, label: '1 大 1 小', desc: '单亲', image: '/onboarding/q0_solo_w_kid.jpg' },
      { value: 'couple_1kid',  adults: 2, kids: 1, label: '2 大 1 小', desc: '三口之家', image: '/onboarding/q0_couple_1kid.jpg' },
      { value: 'couple_2kids', adults: 2, kids: 2, label: '2 大 2 小', desc: '四口之家', image: '/onboarding/q0_couple_2kids.jpg' },
      { value: 'couple_3kids', adults: 2, kids: 3, label: '2 大 3 小', desc: '多孩家庭', image: '/onboarding/q0_couple_3kids.jpg' },
      { value: 'three_gen',    adults: 4, kids: 2, label: '4 大 2 小', desc: '三代同堂', image: '/onboarding/q0_three_gen.jpg' },
      { value: 'custom',       adults: 2, kids: 0, label: '自定义',   desc: 'N 大 M 小', image: '/onboarding/q0_custom.jpg' },
    ],
  }
  ```

  Custom 选项点开 → modal/inline 双数字输入：
  ```tsx
  {selectedQ0 === 'custom' && (
    <div className="flex gap-3 mt-3">
      <NumberStepper label="大人" value={adults} setValue={setAdults} min={0} max={10} />
      <NumberStepper label="孩子" value={kids} setValue={setKids} min={0} max={6} />
    </div>
  )}
  ```

  localStorage 写：
  ```ts
  localStorage.setItem('nutri_adults', String(adults));  // CEO 兼容已用 key
  localStorage.setItem('nutri_kids', String(kids));      // ditto
  localStorage.setItem('nutri_family_pattern', value);   // 新增 — 便于算法识别
  ```

  ============ §B. 全 11 题加 "✏️ 其他/自定义" 入口（元规则）============

  老板原话："所有的都有个自定义 看用户填不填即可"

  Q1-Q9 每个 option 数组末尾追加：
  ```ts
  { value: 'other', label: '✏️ 其他', desc: '自填', image: '/onboarding/q_custom_other.jpg' }
  ```

  选中 'other' 时显示文本输入框，最长 30 字。文本入 imagePrefs[`q${N}_custom`] 存
  localStorage，**算法 016 在 prefScores 学习时把自定义文本作为 freeform tag 命中
  dish.tags / dish.title 模糊匹配**（Algorithm 016 §D 已说明 prefScores 集成）。

  Q10 (过敏) 已有 "其他自填" pattern，参考 src/pages/QuickSetup.tsx line 296-338 复用。

  ============ §C. 新 Q5 — 健康目标（多选可空）============

  Q4 后插入 Q5（其他题序号后移）：

  ```ts
  {
    key: 'Q5',
    question: '有什么是身体特别想补的吗？',
    subtitle: '可不选；最多选 3 个',
    multiSelect: true, maxSelect: 3,
    options: [
      { value: 'prenatal',     emoji: '🤰', label: '备孕',  desc: '叶酸 + 优质蛋白' },
      { value: 'lactation',    emoji: '👶', label: '哺乳',  desc: '补钙 + 蛋白质' },
      { value: 'muscle_gain',  emoji: '💪', label: '增肌',  desc: '高蛋白' },
      { value: 'fat_loss',     emoji: '🥗', label: '减脂',  desc: '低油 + 高纤' },
      { value: 'low_sugar',    emoji: '🩸', label: '控糖',  desc: '糖尿病 / 餐后稳' },
      { value: 'low_sodium',   emoji: '🧂', label: '控盐',  desc: '高血压' },
      { value: 'low_purine',   emoji: '🦴', label: '控嘌呤', desc: '痛风 / 高尿酸' },
      { value: 'skip',         emoji: '⚪', label: '都行 / 跳过', desc: '没特别需求' },
    ],
  }
  ```

  写 imagePrefs.wellness_goals = string[]。Algorithm 016 detectChannels 用这个
  数据驱动 💪 weekly_补 channel。

  ============ §D. Q6 完成后弹"预览感" toast ============

  当用户完成 Q6 后（onboarding 进度过半 ~55%）：

  ```tsx
  // 静默后端预 query — 不阻塞
  const previewCount = await getDishesMatchingPrefs(imagePrefs);  // SELECT count(*)
  toast({
    type: 'success',
    title: `已为你挑出 ${previewCount} 道可能爱吃的菜 ✨`,
    body: '还有几题，最后给你定制本周菜单',
    duration: 3000,
  });
  ```

  实现细节：
  - 用 src/lib/supabase.ts `supabase.from('dishes').select('id', { count: 'exact' })`
    加 imagePrefs hard filter（protein_main_class / staple_pref / oil_level）
  - count ≥ 100 显示 "100+" 不显示真数
  - count < 30 显示 "几十" 不显示真数（避免吓到用户偏好太窄）

  ============ §E. 文案口语化（全题）============

  当前题目文案：
  - "你更喜欢吃哪种主食？" → "主食吃米还是面？"
  - "牛肉你更喜欢怎么吃？" → "牛肉爱怎么做？"
  - "蔬菜你更喜欢怎么做？" → "蔬菜爱怎么做？"

  原则：去 "你更喜欢"，去 "请"，去多余敬语。

  ============ §F. 每题加 "⏭️ 跳过 / 都行" chip ============

  Q1-Q9 每题底部加：
  ```tsx
  <button className="text-secondary text-sm mt-3" onClick={() => skipQuestion()}>
    ⏭️ 都行 / 跳过这题
  </button>
  ```
  Q10 (过敏) 不加（涉及安全，必须选）。Q0 (家庭组合) 不加（必填）。

  ============ §G. WeeklyMenu 5-channel 候选网格 ============

  Algorithm 016 ship 后 generateWeekPlan 返回结构变为：
  `days[i].slots: { mealType, candidates: { dish, channels: ChannelTag[] }[] }`

  WeeklyMenu.tsx 每餐渲染：
  ```tsx
  {weeklyMenu.days[idx].slots.map(slot => (
    <SlotSection mealType={slot.mealType}>
      {slot.candidates.map(c => (
        <CandidateCard dish={c.dish} channels={c.channels}
          selected={isSelected(c.dish.id)}
          onClick={() => togglePick(slot.mealType, c.dish.id)} />
      ))}
    </SlotSection>
  ))}
  ```

  候选数量来自 Algorithm 016: 早 3 / 午 5 / 晚 5。

  ============ §H. ChannelBadge 5 标签组件 ============

  新建 `src/components/ChannelBadge.tsx`：
  ```tsx
  const CHANNEL_META = {
    preference:     { emoji: '🌶️', label: '你的口味',   color: '#FF6B35' },
    seasonal:       { emoji: '🌿', label: '应季',       color: '#52B788' },
    solar_term:     { emoji: '🎋', label: '节气',       color: '#9D4EDD' },
    school_balance: { emoji: '🎒', label: '孩子学校补', color: '#FFB627' },
    weekly_补:      { emoji: '💪', label: '本周营养补', color: '#3A86FF' },
  };
  ```
  渲染 11px badge，每张 CandidateCard 显示 1-2 个最强标签（max channels）。

  ============ §I. 用户 pick 持久化（localStorage）============

  数据库不改（老板指令）。pick 数据：
  ```ts
  key: `nutri_picks_${weekISO}_${userId}`
  value: { [dayIdx_mealType]: dish_id[] }
  ```
  复用 swapDish hook 写 user_weekly_menus.swapped_dish_ids（已有列）。

  ============ §J. 营养雷达文案改 ============

  当前: "营养雷达 · Pro / 看本周 6 维营养摄入分布 + 智能推荐补全菜"
  改: "营养雷达 · Pro / 你选的菜单 vs 营养均衡匹配度 — 缺什么周末出门吃可以补"

  ============ §K. 不变量自检 ============

  ☑ #1 #2 #3 不触     ☑ #4 ALGO_VERSION 不动（UI 层 + Algorithm 016 已 bump v51）
  - 不动 hooks 签名 / supabase functions / migrations
  - 不改 schema (pick 存 localStorage)
  - SURGICAL only — QuickSetup.tsx + WeeklyMenu.tsx + 新建 CandidateCard.tsx + ChannelBadge.tsx + NumberStepper.tsx

  ============ §L. 完工 verify ============

  - npm run build OK
  - Chrome 真测：
    1. /setup Q0 看到 6 家庭组合大图（5 标准 + 1 自定义）
    2. Q0 选自定义 → 看到 [大人 _] [孩子 _] 双输入
    3. Q1-Q9 每题最后一个 chip 是 "✏️ 其他" 可自填
    4. Q1-Q9 底部有 "⏭️ 都行 / 跳过" 链接
    5. Q5 健康目标多选 8 chip，最多 3 个
    6. Q6 完成弹 toast "已为你挑出 N 道可能爱吃的菜 ✨"
    7. 全题文案口语化（grep "你更喜欢" 0 残留）
    8. /weekly 周一午餐看到 5 candidates + 标签
    9. 点 candidate 高亮 + localStorage 写入
    10. 营养雷达新文案显示

  ============ §M. 完工 commits（6-9 commits 分块）============

  Onboarding 块：
  - feat(onboarding): Q0 二改 — 6 家庭组合大图 + 自定义双输入
  - feat(onboarding): 全题加 "✏️ 其他/自定义" 兜底入口
  - feat(onboarding): 新 Q5 健康目标 8 chip 多选
  - feat(onboarding): Q6 后预览感 toast "已挑 N 道菜"
  - chore(onboarding): 全题文案口语化 + 跳过链接

  Weekly 块：
  - feat(weekly): CandidateCard + ChannelBadge — 5-channel 标签 + 候选网格
  - feat(weekly): pick 持久化 localStorage + swapDish 复用
  - chore(weekly): 营养雷达文案"事后展示匹配度"

  ============ ⚠️ §N. 完工报告 + §O. response 边界 ============

  PROCESS.md §15 + §16 铁律。response 4 段，禁止整合建议清单。
  完工 update telepot_ui.md head 写回 STATUS: idle + LAST_ARCHIVED 015。

  ============ 完工动作 ============

  写 telepot_response_ui.md + 清空 + osascript "UI 015 onboarding v4 + 候选网格完工"
```
