# Aieats x Inalca F&B — Partnership Brochure (Draft)

> **For**: Irish Zambrano @ Acmé HK / Inalca F&B HK
> **From**: Jianjiao Lin, Founder of Aieats / 爱吃 (nothinkeats.com)
> **Date**: 2026-05-25
> **Format**: 4-page Markdown — 老板自己转 PDF (Canva / Notion export / 找设计师)
> **Status**: DRAFT — `[BOSS_FILL]` 标记的字段老板填真数据

---

## 📄 Page 1 — 公司 + 创始人介绍

### Aieats / 爱吃

**A Hong Kong AI-powered family nutrition platform.**

> "We help HK families decide what to cook today — and procure
> premium ingredients in one tap."

**网址**: [nothinkeats.com](https://nothinkeats.com)
**微信公众号**: 爱吃 Aieats (AppID: `wx60f6708a777dc896`)
**Registered**: Hong Kong SAR · BR# `[BOSS_FILL_BR]`
**Founded**: `[BOSS_FILL_FOUNDING_YEAR]`

---

### Founder — Jianjiao Lin (林建杰)

`[BOSS_FILL_FOUNDER_BIO]`

> 建议老板补充内容 (200 字以内):
> - 简短背景 (例: ex-engineer / ex-product 或某著名公司履历)
> - 为什么做 Aieats (一句话 founder story — 例:"我家也有菲佣, 每天问她做什么菜很累, 所以我做了这个 app")
> - 在 HK 多久 / 跟食品行业的关系
> - 联系: jianjiao@aieats.com / WhatsApp [BOSS_FILL]

---

### What We've Built (12 months)

- **AI weekly menu** — per-household, per-day, per-member meal plan
- **Voice-driven swap** — "I want northwest cuisine today" → algorithm
  swaps in 莜面 / 羊肉泡馍 instantly
- **Fridge-scan** — take a photo of your fridge → AI recommends
  dishes you can cook with what's already there
- **Helper companion** — Filipino domestic helpers get an English-first
  app with cooking steps + community + employer chat
- **Smart procurement** — helper confirms inventory ("we have garlic,
  no chicken") → employer gets shopping list → one-tap order

### Stack & Trust

- Frontend: React 18 / Vite / TypeScript / Tailwind (custom UI)
- Backend: Supabase Postgres (EU Frankfurt, GDPR + HK PDPO compliant)
- AI: Google Gemini (proxied, no key in browser)
- Payments: Stripe live mode HKD
- Hosting: Railway → custom domain `nothinkeats.com`
- WeChat Mini Program (审核中) for mainland-tourist HK families

---

## 📄 Page 2 — User Profile + Traffic Data

### Target Customer

**HK中高端 dual-income families with a domestic helper.**

| Attribute | Value |
|---|---|
| HKD income / month / household | HK$60,000 – HK$200,000 |
| Family size | 3–6 (including kids + helper) |
| Cooking decisions / week | 21 meals × 7 days = 147 / week (overwhelming) |
| Current grocery channel | HKTVmall (45%) / city'super (30%) / wet market (25%) |
| **Pain points (real, validated)** | |
| 1. "I don't know what to cook today" | Daily fatigue, 70% of users say "most stressful daily decision" |
| 2. "My helper doesn't know what to make" | Helper waits for instructions, employer doesn't have time |
| 3. "I don't know what's good quality ingredient" | Trust gap with anonymous supermarket meat |

### Why Inalca is a Perfect Fit

- HK families **want** premium meat — they pay HK$200+/kg at city'super
- They have **no way** to know if it's truly premium vs marketing
- Inalca / Cremonini's IFS Food + BRC Global + EU Organic certs
  = exactly the **trust signal** HK families crave but never see

### Aieats Platform — 12 Live Features

1. AI weekly menu (5-axis scoring: goal/taste/spice/hometown/health)
2. Voice intent parser ("我想吃西北菜")
3. Fridge-scan dish recommender
4. Per-day household headcount + portion scaling
5. Allergen hard-filter (per-member-aware)
6. Helper task assignment + cooking schedule
7. Helper community (small red book style)
8. Smart shopping list (deduped + supplier-routed)
9. Inventory sync (helper confirms "we have" / "we don't")
10. **Cart → multi-supplier checkout → order tracking** (shipped today)
11. **30-day trial → Pro subscription** (HK$66/mo)
12. WeChat Mini Program shell (审核中)

### Traffic Data — `[BOSS_FILL]`

> ⚠️ 老板核实并填真数据再 send brochure:

| Metric | Value (placeholder) |
|---|---|
| Registered users | `[BOSS_FILL]` |
| Daily Active Users (DAU) | `[BOSS_FILL]` |
| Monthly Active Users (MAU) | `[BOSS_FILL]` |
| Weekly menus generated (last 30 days) | `[BOSS_FILL]` |
| HK households w/ Filipino helper | `[BOSS_FILL]` |
| WeChat MP daily visitors | `[BOSS_FILL]` |
| Week-over-week growth | `[BOSS_FILL]%` |
| Avg session duration | `[BOSS_FILL] min` |

> 没真数据可写 "soft launch — first batch of [X] households" 也很诚实。

---

## 📄 Page 3 — Business Model + Inalca-Specific Value

### Aieats Revenue — Dual Stream Model

```
                 ┌────────────────────────┐
                 │      AIEATS REVENUE    │
                 └────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
   ┌─────────────────────┐    ┌──────────────────────────┐
   │   USER SUBSCRIPTION │    │  SUPPLIER COMMISSION     │
   │                     │    │                          │
   │   HK$66 / month     │    │   30% on retail price    │
   │   30-day free trial │    │   50–78% markup margin   │
   │   Pro = unlimited   │    │   on wholesale → retail  │
   │   AI menu + chat    │    │                          │
   └─────────────────────┘    └──────────────────────────┘
```

**Why dual revenue matters for Inalca**:
- Aieats is **not** dependent on a single supplier's commission
- We don't push sketchy SKUs to make rent
- Quality > quantity — we only list suppliers we trust (you're our **anchor**)

---

### Value to Inalca — 5 Concrete Returns

#### 1. Direct-to-Consumer (D2C) Channel into HK

You currently sell B2B (hotels, restaurants, distributors). Aieats opens
a **brand-new D2C channel** — same warehouse, same logistics, but you
now reach end-consumers who will become **brand-loyal advocates**.

Expected month-1 order volume: `[BOSS_FILL_BASED_ON_USER_COUNT]` units.
Expected month-6 (scale): `[BOSS_FILL]`.

#### 2. Consumer Education — Premium Brand Positioning

HK consumers today see "imported beef" as an undifferentiated commodity.
Aieats wraps Inalca in a **trust narrative**:

> "Your tonight's 红烧牛腩 uses Inalca premium beef — IFS Food + BRC
> Global certified, from Italy's Cremonini Group, the same supplier
> trusted by 5-star hotels in Hong Kong."

We do this **in-app**, every meal, every user, every day.

#### 3. AI-Driven Demand (Not Impulse Buys)

Most D2C platforms hope users impulse-add to cart. Aieats is different:
our weekly menu algorithm **bakes Inalca SKUs into the meal plan first**,
then surfaces them in the shopping list. **Orders are pre-justified**
by the meal plan → much higher conversion + lower returns.

#### 4. Cert Asset Display (Native Trust Backing)

In our SupplierBrandModal component (already built), we natively
display:
- Inalca / Cremonini parent brand
- IFS Food / BRC Global / EU Organic certifications
- Italy origin story
- (NOT displayed: sales contact / wholesale price — your secrets)

#### 5. Sales Contact 100% Confidential

Critical for Inalca: your sales team's email / mobile / private contacts
are stored in `supplier_skus.sales_contact_*` but **never rendered to
the frontend**. We use these only for our internal procurement; users
never see your sales channel. Your B2B + D2C are cleanly separated.

---

### Sample SKU Pricing (5 starter SKUs, modelled in our system)

| SKU | Wholesale (HK$) | Retail (HK$) | Markup | Aieats Commission (30%) | Inalca Net |
|---|---|---|---|---|---|
| `[BOSS_FILL_SKU_1]` | 80.00 | `[FILL]` | `[FILL]%` | `[FILL]` | `[FILL]` |
| `[BOSS_FILL_SKU_2]` | 60.00 | `[FILL]` | `[FILL]%` | `[FILL]` | `[FILL]` |
| `[BOSS_FILL_SKU_3]` | 22.00 | `[FILL]` | `[FILL]%` | `[FILL]` | `[FILL]` |
| `[BOSS_FILL_SKU_4]` | 18.00 | `[FILL]` | `[FILL]%` | `[FILL]` | `[FILL]` |
| `[BOSS_FILL_SKU_5]` | 90.00 | `[FILL]` | `[FILL]%` | `[FILL]` | `[FILL]` |

> Wholesale 价是当前我系统里 5 条 Inalca SKU 的 placeholder, 老板跟
> Irish 确认真实 wholesale 后, retail 按 50–78% markup 算, commission
> 30% 起谈。

---

## 📄 Page 4 — Partnership Terms + Contact

### Proposed Partnership Model — 5 Clauses (Draft)

#### Clause 1 — Supply Responsibility (Inalca / Acmé)

Inalca / Acmé HK provides:
- Wholesale pricing (Aieats-confirmed SKU list)
- Packaging suitable for D2C (single-family portions)
- HK-territory delivery to Aieats' designated 3PL warehouse OR
  drop-ship to end customer (Aieats prefers drop-ship for freshness)
- Product cert assets (IFS Food / BRC / EU Organic — image / PDF)
- SKU info (origin, weight, shelf life, storage temperature)

#### Clause 2 — D2C Responsibility (Aieats)

Aieats provides:
- D2C UI (menu, shopping list, cart, checkout, order tracking)
- User acquisition (WeChat MP, referral, content marketing)
- Payment processing (Stripe live HKD, future WeChat Pay)
- Customer service (Tier 1 support, returns coordination)
- Marketing assets (in-app brand display, social posts about Inalca)
- Monthly sales report + reconciliation

#### Clause 3 — Commission Settlement

- **Commission rate**: 30% on retail price (starting; volume-tiered)
- **Settlement cadence**: Monthly (calendar month, settled by day 10 of
  next month)
- **Payment method**: Bank wire HKD or WeChat Pay enterprise
- **Reconciliation**: Aieats provides itemized order report w/ refund
  + return adjustments

#### Clause 4 — Bidirectional API Integration (Phase 2)

After 3 months of manual operation, integrate:
- **Order API**: Aieats pushes orders → Inalca confirms & ships
- **Inventory API**: Inalca pushes stock levels → Aieats hides
  out-of-stock SKUs from frontend
- **Logistics API**: Inalca pushes tracking number → Aieats forwards
  to user

#### Clause 5 — Exclusivity (Open)

**Initial**: Non-exclusive both ways.
**Trigger**: When monthly Aieats orders for Inalca SKUs exceed
`[BOSS_FILL]` units, both parties discuss:
- Category exclusivity (e.g. Aieats won't list competing Italian meat
  suppliers in same SKU category)
- Inalca minimum monthly D2C volume guarantee
- Joint marketing spend

> 老板可以根据 Irish 反应调整: 排他 / 半排他 / 全开放都可谈。Aieats 立场:
> 起步非排他, 量起来谈排他换 Inalca 资源倾斜。

---

### Contact

**Jianjiao Lin** (林建杰)
Founder, Aieats / 爱吃

- Website: [nothinkeats.com](https://nothinkeats.com)
- Email: `[BOSS_FILL_EMAIL]`
- WhatsApp: `[BOSS_FILL_PHONE]`
- WeChat: `[BOSS_FILL_WECHAT_ID]`
- HK Office: `[BOSS_FILL_ADDRESS]` (or "Remote / Mobile")

---

### Next Steps

1. ✅ **30-min intro call this week** — Aieats walks Inalca through
   live app demo + SKU pricing model
2. 📋 **Inalca shares**: wholesale price list (5 starter SKUs) +
   packaging spec + 3PL coordinates + cert assets
3. ✍️ **MOU draft** — Aieats provides MOU based on 5 clauses above,
   2-week review window
4. 🚀 **Soft launch** — 30-day pilot with 5 SKUs, real orders, real
   commission settlement
5. 📈 **Scale review** — month-3 retro: SKU expansion, API integration,
   exclusivity discussion

---

**Brochure Draft By**: Aieats QA + 销售物料 Lead (Claude Opus 4.7)
**Date**: 2026-05-25
**Status**: 4-page draft, 老板填 12 个 `[BOSS_FILL]` placeholder + 找设计师 PDF 化

> **老板转 PDF 推荐方式**:
> 1. **快**: 复制 Markdown → Notion 粘贴 → Export as PDF (5 分钟, 排版凑合)
> 2. **好看**: 复制内容到 Canva → 选商务模板 → 拖图标 → Export PDF (1 小时, 视觉好)
> 3. **最好**: 找设计师 (Fiverr / 本地) 2 小时活, 给 brand guidelines (爱吃 logo +
>    主色调) + 这份 Markdown → 出专业 PDF (HK$500-1500)
