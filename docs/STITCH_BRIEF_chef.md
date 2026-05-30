# Google Stitch UI 设计指令 — 爱吃主厨 /chef

> 用法:打开 Google Stitch,把下面【全局风格】先设好,再把每个【屏幕】的 prompt
> 一个一个贴进去生成。每段都是可直接粘贴的英文 prompt(Stitch 对英文 prompt 效果最好),
> 下面附中文说明。生成后老板挑稿,我们再按稿实现。
>
> 设计目标:agent-first 对话式,不是传统堆 tab 的 app。移动端优先。

---

## 全局风格 (Style — 先设这个)

**English (paste to Stitch style/theme):**
> A warm, premium mobile cooking-assistant chat app. Dark theme, near-black background (#0a0a0a) with warm orange accent (#FF5A1F) and soft green success accent (#25D366). Rounded cards (16px radius), generous spacing, large readable Chinese type, friendly chef persona. Feels like chatting with a personal chef, not a database. Subtle food imagery. Mobile portrait, iOS-like.

**中文说明:** 暖色、高级感的对话式做饭助手。暗色近黑底 + 暖橙主色 + 柔绿成功色。
大圆角卡片、留白充足、中文大字号、亲切主厨人设。像在跟私人主厨聊天,不像数据库。

---

## 屏幕 1 — 主对话屏 (核心,最重要)

**English (paste to Stitch):**
> A mobile chat screen titled "爱吃主厨 / Aieats Chef" with a small "经典版" (classic) toggle in the top-right. The body is a vertical chat conversation:
> - A chef avatar bubble greeting: "晚上好🌙 今晚想吃点什么?"
> - A user bubble (right-aligned, orange): "想吃椒盐鸡"
> - A chef bubble: "这道你点名了,给你端上来 👇"
> - A featured DISH CARD: large food photo on top, dish name "椒盐鸡翼", a row of small badges [🤖小美可做] [📺有视频] [👩‍🍳菲佣会做], meta line "⏱25min · 🔥210kcal · 🌶微辣 脆香", and a tag "家人爱吃 · 先生 女儿". A primary orange button "加入今晚".
> - A chef bubble: "也给你配了 2 道牛肉热门 👇" followed by a HORIZONTAL SCROLL of 2 smaller dish cards (番茄牛腩, 黑椒牛柳).
> Bottom area: a horizontally scrolling row of ingredient chips [🥩牛肉][🐟鱼][🍗鸡][🦆鸭鹅][🥬菜], then a text input field "想吃啥直接告诉我…" with a 🧊 fridge icon button and an orange send ↑ button.

**中文说明:** 这是改版的心脏。顶部标题+右上"经典版"切回旧 app。主体是对话流:主厨问候→
用户说"想吃椒盐鸡"→主厨端出精准命中的大菜卡(图+名+3 个保命标+营养味道+家人爱吃)+
一键"加入今晚"→再横滑配 2 道食材热门。底部:食材 chip 横滑 + 自由输入框 + 冰箱图标 + 发送。

---

## 屏幕 2 — 下单回执 (点"加入今晚"后)

**English (paste to Stitch):**
> Same chat screen, showing a success confirmation card after adding a dish. A green-accented chef bubble: "好嘞,椒盐鸡翼今晚的菜 👍" followed by two info lines with icons: "🛒 鸡翼/椒盐 已加进采购清单,建议明早下单" and "👩‍🍳 阿May 那边已经能看到怎么做了". Below it three pill buttons in a row: [再点一道] [看今日菜单] [看采购清单].

**中文说明:** 拍板后的"接住感"。绿色成功气泡 + 两行回执(采购已加、菲佣可见)+ 三个后续按钮。
这屏体现产品灵魂:点一道菜,采购和菲佣同时被打通。

---

## 屏幕 3 — 食材选择态 (点食材 chip / 冰箱)

**English (paste to Stitch):**
> The chat screen after tapping the 🥩 beef chip. A user bubble "🥩 牛肉". A chef bubble "牛肉的话,这几道最受欢迎,都好做 👇". Then a vertical list of 4-6 dish cards, each: small thumbnail photo, dish name, badges [🤖小美可做]/[👩‍🍳菲佣会做], cook time, and a small "加入今晚" button. The cards should feel ranked by popularity. A "🧊 冰箱里有什么?" entry at top lets the user type multiple ingredients they already have.

**中文说明:** 食材→热门做法列表(下厨房式)。点牛肉,出 4-6 道按热门排序的牛肉菜,
每张带能做标+做饭时间+快速加入。顶部"冰箱里有什么"可多选已有食材。

---

## 屏幕 4 — 菜品详情 (点卡片展开)

**English (paste to Stitch):**
> A dish detail card/sheet sliding up: large hero food photo, dish name "椒盐鸡翼", flavor tags (🌶微辣, 脆香), a nutrition strip (protein / carb / fat / kcal as small stats), badges [🤖小美可做][📺有视频][👩‍🍳菲佣会做], and two actions: a heart "收藏" and a primary "加入今晚". Clean, appetizing, mobile bottom-sheet style.

**中文说明:** 点菜卡弹出的详情底卡。大图+菜名+味道标+营养条+能做标+收藏/加入两个动作。

---

## 给 Stitch 的总说明 (可放在项目描述里)

**English:**
> App name: 爱吃主厨 (Aieats Chef). A conversational, agent-first home-cooking assistant for employers (families) and their domestic helpers. The employer chats "what to eat today", picks by ingredient or names a dish, gets a few cookable family-loved dishes with pre-set steps, taps one into today's menu — which auto-syncs the shopping list (one day ahead) and shows the helper exactly what to cook with steps and video. Warm, premium, chat-first, mobile. Not a tab-heavy app.

**中文:** 一句话给 Stitch:面向雇主家庭+菲佣的对话式做饭助手,雇主聊"今天想吃什么"→
按食材/菜名拿到几道能做的家人爱吃菜(预设步骤)→ 一键进今日菜单 → 自动同步采购(提前一天)
+ 菲佣看到怎么做。暖色、高级、对话优先、移动端,不是堆 tab 的 app。

---

## 出稿后怎么接

Stitch 出的设计稿 → 老板挑定 → 我按稿改 ChefAgent.tsx(P0 先把"加入今晚"真写菜单的闭环接通,
见 PLAN_chef_revamp.md §5)。Stitch 只定"长什么样",数据/逻辑全复用现有引擎。
