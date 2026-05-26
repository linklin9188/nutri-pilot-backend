# CEO Drafts — 下波工单（老板 2026-05-22 ~15:30 拍的 4 件 UI 改动）

> CEO 自己写，不动 code。等 UI 024 + Backend 021 ship 后覆盖到 telepot 文件派出。

---

## 触发条件

| 当前单 | STATUS | ship 后派 |
|---|---|---|
| UI 024 (meal_log 写入) | pending | → UI 025（本文件 §1）|
| Backend 021 (Gemini 补 3 列) | pending | → Backend 022（本文件 §2）|
| Database 021 ✅ idle | - | → Database 022（本文件 §3，与 Backend 022 协同）|

---

## §1 Draft UI 025 — onboarding Q1/Q8 + i18n 修复

### §A Q1 拼盘 → 具体菜

`src/pages/QuickSetup.tsx` Q1 `protein_main_class` options 改：

```ts
{ value: 'red_meat',   label: '红肉系',   desc: '炖牛腩 · 红烧肉 · 羊肉',  img: '/onboarding/q1_beef_stew.jpg' },   // ← 新图 by Backend 022
{ value: 'white_meat', label: '白肉系',   desc: '白切鸡 · 三杯鸡 · 鸭',    img: '/onboarding/q1_chicken_poached.jpg' },  // ← 新图 by Backend 022
{ value: 'seafood',    label: '海鲜系',   desc: '虾 · 蟹 · 鱼 · 贝',       img: '/onboarding/q1_shrimp.jpg' },           // ← 新图 by Backend 022
{ value: 'veggie',     label: '素食',     desc: '豆腐 · 蔬菜',             img: '/onboarding/q1_veg.jpg' },              // 保留
{ value: 'other',      label: '✏️ 其他',   desc: '自填',                    emoji: '✏️' },                                // 保留
```

Backend 022 §B 生 3 张新图 + ship 到 public/onboarding/。UI 025 §A 改 img 路径 + 文案。

### §B Q8 浓淡 → icon-only chip

`src/pages/QuickSetup.tsx` Q8 `oil_level` 改：

```ts
{
  id: 'oil_level',
  emoji: '🥄',
  question: '口味清淡还是浓？',
  sub: '我按这个调味重轻。',
  multi: false,
  chips: true,    // ← 新加 chip 模式
  cols: 3,
  options: [
    { value: 'rich',   emoji: '🥄🥄🥄', label: '浓郁',  desc: '重油红烧肉味' },
    { value: 'medium', emoji: '🥄🥄',   label: '中等',  desc: '日常家常' },
    { value: 'light',  emoji: '🥄',     label: '清淡',  desc: '白灼清蒸' },
    { value: 'other',  emoji: '✏️',     label: '其他',  desc: '自填' },
  ],
}
```

删 q8_oil_*.jpg 4 张图依赖（保留文件不破其他 ticket）。

### §C i18n 全 t() 包裹

grep 找所有硬编码中文字符串，按 LanguageContext `t(en, zh)` 包裹：

```
src/pages/QuickSetup.tsx       — 10 题 question/sub/desc/option label
src/pages/Home.tsx             — hero "今天吃什么" / 各 section 标题 / "出门换换口味吧"
src/components/WeekendDiningReport.tsx — "出门换换口味吧" + 数据 label
src/pages/WeeklyMenu.tsx       — 周菜单页面 hero / tab 标签
```

约 80-120 处硬编码 → 改 `t('English', '中文')` form。注意：
- **图片 src 不动**（背景图就是固定的，UI 025 §D 验证）
- **emoji 不动**（universal）
- **dish.title 走 DB 多列** — Database 022 加 title_zh_hant + title_en，UI 走 `dish.title[lang]` 或 helper

### §D verify "图片里的文字不该跟着语言改"

老板提到 "首页切换语言时图片里的文字也跟着改" — 这是 bug。
原因可能：(a) 某些"图片"实际是 SVG 含 text node 被 t() 包裹 (b) 某些 emoji 被 React render 但被 lang setting 影响。

Lead grep `<svg>` + `<img>` 找问题源头，回执 §D 说明哪些是真图（不动）+ 哪些是 SVG/text（可改）。

### §E 完工动作

预算 ~100-150k token（i18n 80+ 处改动 + e2e build pass）/ ~$1.5-2 USD

---

## §2 Draft Backend 022 — Gemini 图像生成 + 菜名翻译

### §A Gemini imagen / nano-banana 能力实查

WebFetch + WebSearch 实查 Gemini 2.5 当前图像生成能力（2026-05 现状）：
- 是否支持 imagen 3 / nano-banana 等
- 输入 prompt + size + style 输出 PNG/JPG 链接
- 价格 per image
- 走 gemini-proxy edge fn 是否需新加 endpoint

回执 §A 报告：能 / 不能 + 价格 + 实施方案。

### §B 生 Q0 6 张家庭组合图 + Q1 3 张具体菜图

**Q0 6 图**（家庭组合简笔画风，不必真人）：
- q0_solo_w_kid.jpg — 1 大 1 小（单亲 + 一孩）
- q0_couple_1kid.jpg — 2 大 1 小（三口）
- q0_couple_2kids.jpg — 2 大 2 小（四口）
- q0_couple_3kids.jpg — 2 大 3 小（多孩）
- q0_three_gen.jpg — 4 大 2 小（三代同堂 — 爷奶+父母+孩×2）
- q0_custom.jpg — 自定义（抽象拼图风格 emoji 示意）

prompt 统一风格："a warm hand-drawn simple cartoon illustration of a [N people] family at a round dining table, top-down view, soft watercolor wash, no faces / minimal facial detail, neutral skin tones, cozy home interior, 1200x1800 portrait orientation"

**Q1 3 图**（食物特写）：
- q1_beef_stew.jpg — 一盆炖牛腩（粤式港清，浓汤红润）
- q1_chicken_poached.jpg — 一盘白切鸡（带姜葱蘸料）
- q1_shrimp.jpg — 一盘清蒸虾（粉红虾摆盘）

prompt 风格："professional food photography, [dish name] on a ceramic plate, top-down view, natural daylight, no human hands, 1200x1200 square orientation"

如 Gemini imagen 不通 → fallback Pexels API 或老板手动从 Unsplash 下载（之前 Q0 6 图 backlog 路径）。

### §C 菜名翻译 348 × 3 语言

调 Gemini text 翻译（同 fill-wellness 模式）：
- input: dish.title (Chinese)
- output: { title_zh_hant, title_en } 写到 dishes 表（依赖 Database 022 加列）
- prompt: "Translate the Chinese dish name '[X]' to Traditional Chinese (Hong Kong style) and English. Return JSON: {title_zh_hant: '...', title_en: '...'}"

348 dishes × Gemini ~$0.005 = ~$2 USD total。

### §D 完工动作

预算 ~250-300k token + Gemini Pro 调用费 / ~$5-8 USD（含图像生成 9 张 × 较高单价）

---

## §3 Draft Database 022 — dishes 加 title_zh_hant + title_en 列

### §A migration 076

```sql
ALTER TABLE dishes
  ADD COLUMN IF NOT EXISTS title_zh_hant text,
  ADD COLUMN IF NOT EXISTS title_en text;

COMMENT ON COLUMN dishes.title_zh_hant IS '繁體中文菜名（HK/TW 用户），由 Backend 022 Gemini 翻译填入';
COMMENT ON COLUMN dishes.title_en IS 'English dish name (international users), filled by Backend 022 Gemini translation';
```

不加 NOT NULL（Backend 022 跑完前是 NULL，UI fallback 到 title）。
不加 index（菜名不做查询条件，主要 display）。

### §B verify

```bash
supabase db push --linked
# 期望 Applying 076... Finished
# SELECT title_zh_hant, title_en FROM dishes LIMIT 5; → 全 NULL（Backend 022 ship 前）
```

### §C 完工动作

5 分钟小活，预算 ~10k token / ~$0.15 USD

---

## 派单顺序（CEO 自决）

1. UI 024 ship → 派 UI 025（i18n + Q1 + Q8）
2. Backend 021 ship → 派 Database 022（先建列）→ Backend 022（再填数据 + 生图）
3. Backend 022 ship 9 张新图 → 派 UI 026（5 分钟 swap img 路径）

---

最后更新：2026-05-22 HKT 15:35
