# TICKET-066 P0 — chat 主入口统一 "说话换菜单" (产品重构)

## 问题

老板真测 #12 反馈 chat 设计混乱. CEO 实查 codebase, 发现 3 个独立 AI 入口职责重叠又
互相藏:

1. **悬浮 chat FAB** (`Home.tsx:2155-2174`) → 跳 `/chat?mode=today` 全屏对话.
   裸 chat icon 无文字 label, 用户猜不出按下去干啥, 点开是多轮对话 (ChatAgent),
   场景模糊.
2. **IntentRegenModal 弹窗** (`Home.tsx:2102` + `WeeklyMenu.tsx:1336`) → 文字框 +
   parseIntent + bias 重排, 真正"说话换菜单"的入口, 却藏在 "今天还想吃……" 按钮
   后面要先发现.
3. **`/ai-pilot` 页面** (`AIPilot.tsx`) → 第 33-79 行是硬编码 mock demo,
   完全没接 backend. 半成品.

3 个入口 = 3 个"大概能 AI"的位置, 用户无法形成单一心智模型, 老板真测找不到
"说话调菜单"的真入口.

## 方法

老板拍板方案 1: **chat 唯一 use case = "说话换菜单"**, 不做泛用多轮对话主推.

1. 抽 `src/components/IntentInputBox.tsx` 通用组件 (~251 行):
   - 圆角白底输入框 (52px / 16 圆角 / 1.5px primary 描边)
   - 左 ✨ AI icon (auto_awesome 橙 #FF5A1F)
   - 三语 placeholder (zh / en / tl, 走 `useLanguage().t3`)
   - 右"发送"小按钮 (loading → spinner)
   - 下方 6 chip 横滑 (多西北菜 / 少辣 / 清淡养胃 / 多海鲜 / 增肌期 / 减脂期)
   - 3 秒自动 dismiss toast (成功黑底 / 失败红底)
   - `variant: 'home' | 'weekly'` — Home 浅底白框, WeeklyMenu 深底半透白框
   - 提交逻辑复用原 IntentRegenModal: `extractClientOverrides` (头数 / 餐时) +
     `parseIntent` (Gemini 软偏好) + `saveIntentBias` + clear
     `weekly_menu_*` cache + 派 `nutri-prefs-changed` 让 `useWeeklyMenu` 重算
2. Home 顶部 (Hi 昵称 chip 后, Editorial header 前) 插入
   `<IntentInputBox variant="home" onSuccess={regenerateWeekly} />`
3. WeeklyMenu hero 后 (Day Tabs 前) 插入 `<IntentInputBox variant="weekly" />`
4. **删** Home 悬浮 chat FAB (2155-2174) + 原 "今天还想吃……" 按钮 (1939-1977) +
   `<IntentRegenModal>` 调用 + `intentModalOpen` state + IntentRegenModal import
5. **删** WeeklyMenu "📝 重新生成" 按钮 + `<IntentRegenModal>` 调用 +
   `intentOpen` state + IntentRegenModal import
6. **App.tsx** `/ai-pilot` route 改 `<Navigate to="/" replace />` (route 保留
   backward compat, AIPilot.tsx 文件留作历史 mock 参考不删)
7. `IntentRegenModal.tsx` 文件本身不删 (仅作历史 fallback; 全 project grep 已
   无 import)
8. `/chat` ChatAgent 路由 + 文件不动 (多轮对话能力保留, 不主推)

## 标准

今后凡新 AI 入口必须遵守:

1. **1 个文字 label + 1 个明确 use case** — 不要裸 icon, 不要 "AI 助手 / 智能
   什么" 这种泛标签. 写人能秒懂的具体动作 (e.g. "说说你想吃什么")
2. **入口位置明显** — 不要藏在二级 modal 里, 主路径就放 Home 顶部
3. **单一职责, 不模糊定位** — 不要"对话框啥都能做". chat 主入口 = 改菜单,
   多轮对话另开 ChatAgent (高级用户专属)
4. **mock demo 不上 production** — `AIPilot.tsx` 这种 33-79 行硬编码假对话
   是反例, 上 production 前必须接 backend 或下线
5. **复用 quickfix 模式** — 同样的 6 chip + Gemini 解析, Home/WeeklyMenu 双场
   景 1 个组件 (variant prop 切风格), 不要每页各自抄一份
