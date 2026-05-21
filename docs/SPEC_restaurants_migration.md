# SPEC — `restaurants` 表迁移：`hkRestaurants.ts` 1380 行硬编码 → DB hybrid

**Status**: DRAFT — 待 Architect/CEO 拍板后由 Database 012 真实施
**Author**: Database Lead
**Created**: 2026-05-21
**Ticket**: TELEPOT-20260521-011
**Estimated effort**: Database 实施 1 棒（25-40 min）+ Backend 数据迁移 1 棒（30-50 min）+ Frontend hybrid loader 1 棒（20-30 min）

---

## §0. 背景

`src/lib/hkRestaurants.ts` 1380 行 TS 文件硬编码 **100 家香港 + 深圳餐厅**，被两处 consumer 读取：

- `src/components/RestaurantCard.tsx`（type `HkRestaurant` + `resolveRestaurantImage()`）
- `src/lib/weeklyDiarySummary.ts`（`pickRestaurantsForNeeds()` 周末外食营养报告匹配）

老板 2026-05-21 HKT 端到端真测后强调"周末是餐厅外食推荐"产品定位。CEO 资产盘点后决定：餐厅信息搬进 DB，TS 文件保留作 FALLBACK，admin CRUD 走 service_role。

痛点：
- 米其林 / 必比登榜单年度更新需重发版
- Phase 2 餐厅合作 booking + 佣金分成需要 admin 后台
- 评价 / 营业时间等动态字段无法实时更新

---

## §1. Schema 设计

### 1.1 CREATE TABLE 草稿

```sql
-- supabase/migrations/0XX_create_restaurants.sql
BEGIN;

CREATE TABLE IF NOT EXISTS restaurants (
  -- 主键：用 slug 不用 uuid（与 hkRestaurants.ts 现有 id 字段对齐：lung_king_heen / caprice / ...）
  -- 优点：URL 友好、admin 后台可直接 typed slug、与现有 100 行 seed 0-cost 对接
  -- 缺点：手输错字风险（admin 后台需做 slug 校验），但比 uuid 重 typing 强
  id                text PRIMARY KEY,

  -- 基础展示
  name              text NOT NULL,
  cuisine           text NOT NULL,        -- 自由文本，含 ' · ' 分隔（'粤菜 · 米其林三星'），不做 enum
  blurb             text,                 -- 老板可手写一句
  signature         text,                 -- 招牌菜：'龍景軒燒鴨・鮑魚燴飯'

  -- 地理
  city              text NOT NULL CHECK (city IN ('HK', 'SZ')),
  area              text NOT NULL,        -- 不做 enum，纯文本 — 新区上线 0 migration
  -- 经纬度可选（hkRestaurants.ts 现在没有；未来周末地图需要时再 BACKFILL）
  lat               double precision,
  lng               double precision,

  -- 价格 & tier
  price_tier        text NOT NULL CHECK (price_tier IN ('$', '$$', '$$$', '$$$$')),
  michelin_tier     text CHECK (michelin_tier IN ('3★', '2★', '1★', 'Bib') OR michelin_tier IS NULL),

  -- 营养匹配（核心）— text[] 不用 jsonb，pg 数组操作（&& / @>）比 jsonb 快且 index 容易
  good_for          text[] NOT NULL DEFAULT '{}',  -- DiningTag[]: fish/shellfish/meat/...

  -- 预订路径
  phone             text,
  link              text,                 -- OpenRice / 官网 / WhatsApp 链接
  booking_url       text,                 -- Phase 2 合作专用 booking 链接（暂 NULL）

  -- 图片
  image_url         text,                 -- 若 NULL → 前端 resolveRestaurantImage() 按 cuisine 兜底

  -- Phase 2 商业字段（先建好列，避免后续二次 migration）
  commission_rate   numeric(4,3),         -- 0.000 ~ 1.000，e.g. 0.080 = 8% 佣金
  partner_status    text CHECK (partner_status IN ('none', 'pending', 'active', 'paused') OR partner_status IS NULL),

  -- 编辑 metadata
  hidden            boolean NOT NULL DEFAULT false,  -- 临时下线 / 永久退场
  source            text NOT NULL DEFAULT 'seed',    -- 'seed' / 'admin' / 'partner_signup' / 'crawl'
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 常用过滤：city 分桶 + tier 排序 + hidden 兜底
CREATE INDEX IF NOT EXISTS idx_restaurants_city_tier
  ON restaurants(city, michelin_tier)
  WHERE hidden = false;

-- good_for 数组反向查询（pickRestaurantsForNeeds 用 && 重叠）
CREATE INDEX IF NOT EXISTS idx_restaurants_good_for_gin
  ON restaurants USING gin(good_for)
  WHERE hidden = false;

-- updated_at 触发器（与 dishes 表风格一致）
CREATE OR REPLACE FUNCTION restaurants_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION restaurants_touch_updated_at();

COMMIT;
```

### 1.2 字段对齐表（`hkRestaurants.ts` → DB）

| TS interface 字段 | DB 列            | 类型         | NULL? | 备注                                    |
|------------------|------------------|--------------|-------|----------------------------------------|
| `id`             | `id`             | `text PK`    | NO    | slug，与现有 100 行 seed 1:1            |
| `name`           | `name`           | `text`       | NO    |                                        |
| `cuisine`        | `cuisine`        | `text`       | NO    | 含 ' · ' 分隔的混合文本                 |
| `good_for`       | `good_for`       | `text[]`     | NO    | `DEFAULT '{}'` 防 NULL 数组             |
| `area`           | `area`           | `text`       | NO    | 不做 enum                              |
| `city`           | `city`           | `text`       | NO    | `CHECK IN ('HK','SZ')`                 |
| `price_tier`     | `price_tier`     | `text`       | NO    | `CHECK IN ('$','$$','$$$','$$$$')`     |
| `michelin`       | `michelin_tier`  | `text`       | YES   | 列名加 `_tier` 防与"米其林指南"歧义     |
| `signature`      | `signature`      | `text`       | YES   |                                        |
| `blurb`          | `blurb`          | `text`       | YES   |                                        |
| `link`           | `link`           | `text`       | YES   |                                        |
| `phone`          | `phone`          | `text`       | YES   | 含 '+852' 国家码原样存                  |
| `image_url`      | `image_url`      | `text`       | YES   |                                        |
| `hidden`         | `hidden`         | `boolean`    | NO    | `DEFAULT false`                        |
| **（新增）**     | `lat / lng`      | `double`     | YES   | 暂全 NULL                              |
| **（新增）**     | `booking_url`    | `text`       | YES   | Phase 2                                |
| **（新增）**     | `commission_rate`| `numeric`    | YES   | Phase 2                                |
| **（新增）**     | `partner_status` | `text`       | YES   | Phase 2                                |
| **（新增）**     | `source`         | `text`       | NO    | `DEFAULT 'seed'`                       |
| **（新增）**     | `created_at`     | `timestamptz`| NO    | `DEFAULT now()`                        |
| **（新增）**     | `updated_at`     | `timestamptz`| NO    | `DEFAULT now()` + trigger              |

### 1.3 与现有表的关联

- **暂不关联**任何现有表。`user_profiles` 没有"收藏餐厅"功能；`dishes` 的菜与餐厅没关系。
- 未来若做"用户收藏餐厅"或"周末选定餐厅"，再加 `user_restaurant_favorites(user_id text, restaurant_id text)` 关联表（**FK 目标必须是 `user_profiles(id)` 不是 `auth.users`**，硬不变量 #1）。
- 不做 cuisine → dishes 关联：cuisine 是自由文本不是 enum，跟 `dishes.origin_cuisine` 的 enum 值不一一对应。

---

## §2. RLS Policy 草稿

`restaurants` 表是**公开数据**（餐厅信息谁都能看），写入只允许后端 service_role：

```sql
-- 同 migration 接续
BEGIN;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

-- 读：所有 anon / authenticated 都可见 SELECT（hidden=false 由前端过滤，DB 不强约束）
-- 故意不把 hidden=false 写进 USING — admin 端需要看 hidden 的行
CREATE POLICY restaurants_read_all ON restaurants
  FOR SELECT
  USING (true);

-- 写：anon-first 模型 → 不开任何 INSERT/UPDATE/DELETE policy
-- service_role 自动 bypass RLS，admin 后台用 service_role 客户端即可
-- 不加 INSERT/UPDATE/DELETE policy 等于 anon/authenticated 写入直接被拒（默认 deny）

COMMIT;
```

**关键决策**（CEO 2026-05-21 已决）：
- 不引入 `user_profiles.role='admin'` 列（当前 schema 没有 role 字段，加列会触发跨表 ripple）。
- admin CRUD 走 **service_role 后端**：要么 Supabase Studio 直连、要么未来 admin 后台 edge function 用 `SUPABASE_SERVICE_ROLE_KEY`。
- 前端 anon key 永远只能 SELECT，物理上拒绝写入。

**与硬不变量对齐**：
- #1 不加 FK→auth.users ✓（无 FK）
- #2 不直连 Gemini ✓（无 Gemini）
- #3 Stripe 白名单未触 ✓
- #4 ALGO_VERSION 不动 ✓（不影响周菜单算法）

---

## §3. 数据迁移策略

### 3.1 三选项对比

| 方案 | 描述                                              | 优点                       | 缺点                            |
|-----|---------------------------------------------------|----------------------------|--------------------------------|
| A   | 一次性脚本读 TS 倒 100 行进 DB，TS 文件保留作 fallback | 实施简单                 | 双 source of truth，需协调更新 |
| B   | 删 TS 文件，所有读取走 DB                         | schema 单一真相            | offline / DB 故障时 0 餐厅      |
| C ⭐| DB 优先 + TS FALLBACK（hybrid，与 INGREDIENT_SEASONALITY 同模式） | 容错 + 单飞升级            | 代码复杂度 +1（loader 缓存层） |

**SPEC 推荐方案 C — hybrid**。理由：
1. 与项目已有 `INGREDIENT_SEASONALITY` hybrid loader 模式一致（user 已熟悉）
2. DB 故障 / 网络慢时前端不空屏
3. 单元测试时不需要 mock DB，TS fallback 自然就是测试 fixture
4. admin 后台改 DB 立即生效，但 TS 文件年度同步一次保持兜底新鲜（手工 `scripts/sync-restaurants-from-db.ts`）

### 3.2 一次性数据迁移脚本（Backend 012 实施）

```ts
// scripts/_oneshot-seed-restaurants.ts （跑完即删，按 CLAUDE.md "oneshot 跑完即删"）
import { Client } from 'pg';
import { HK_RESTAURANTS } from '../src/lib/hkRestaurants';

const client = new Client({ connectionString: process.env.DIRECT_DATABASE_URL });
await client.connect();

let inserted = 0, skipped = 0;
for (const r of HK_RESTAURANTS) {
  const result = await client.query(
    `INSERT INTO restaurants
      (id, name, cuisine, blurb, signature, city, area, price_tier, michelin_tier,
       good_for, phone, link, image_url, hidden, source)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'seed')
     ON CONFLICT (id) DO NOTHING`,
    [
      r.id, r.name, r.cuisine, r.blurb ?? null, r.signature ?? null,
      r.city, r.area, r.price_tier, r.michelin ?? null,
      r.good_for, r.phone ?? null, r.link ?? null, r.image_url ?? null,
      r.hidden ?? false,
    ]
  );
  result.rowCount === 1 ? inserted++ : skipped++;
}
console.log(`inserted=${inserted} skipped=${skipped} total=${HK_RESTAURANTS.length}`);
await client.end();
```

跑完 verify：
```sql
SELECT count(*), count(*) FILTER (WHERE michelin_tier IS NOT NULL) AS michelin,
       count(*) FILTER (WHERE city='HK') AS hk, count(*) FILTER (WHERE city='SZ') AS sz
FROM restaurants;
-- 期望：100 / 米其林+必比登行数 / 港 50ish / 深 50ish
```

---

## §4. 前端 hybrid loader 改造

### 4.1 `src/lib/hkRestaurants.ts` 改造点

```ts
// 现状（line 115）：
export const HK_RESTAURANTS: HkRestaurant[] = [...100 行 hardcoded...];

// 改造后：
const HARDCODED_FALLBACK: HkRestaurant[] = [...100 行 hardcoded...];  // 保留原内容
export let HK_RESTAURANTS: HkRestaurant[] = HARDCODED_FALLBACK;       // 初始 = fallback

let loadPromise: Promise<void> | null = null;
export async function ensureRestaurantsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('hidden', false);
      if (!error && data && data.length > 0) {
        HK_RESTAURANTS = data.map(toHkRestaurant);  // DB 行映射回 type
      }
      // 若 error 或 0 行 → 保留 HARDCODED_FALLBACK
    } catch {
      // network / supabase 故障 → 保留 HARDCODED_FALLBACK
    }
  })();
  return loadPromise;
}

function toHkRestaurant(row: any): HkRestaurant {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine,
    blurb: row.blurb ?? undefined,
    signature: row.signature,
    city: row.city,
    area: row.area,
    price_tier: row.price_tier,
    michelin: row.michelin_tier,
    good_for: row.good_for ?? [],
    phone: row.phone ?? undefined,
    link: row.link ?? undefined,
    image_url: row.image_url ?? undefined,
    hidden: row.hidden,
  };
}
```

### 4.2 App 启动时 fire-and-forget 触发加载

```ts
// src/App.tsx 或 src/main.tsx：
import { ensureRestaurantsLoaded } from './lib/hkRestaurants';
ensureRestaurantsLoaded();  // 不 await — 首屏不等
```

### 4.3 Consumer 0 改动

- `RestaurantCard.tsx`：仍 import `HkRestaurant` type + `resolveRestaurantImage()` — 不动
- `weeklyDiarySummary.ts`：仍 call `pickRestaurantsForNeeds()` — 不动（该函数内部读 `HK_RESTAURANTS` mutable export）
- 唯一注意：`pickRestaurantsForNeeds` 现在闭包读的是 `let` 而非 `const`，TS 严格模式 OK，无类型错误

---

## §5. Rollback 策略

### 5.1 DOWN migration（与 UP 同 commit 写好）

```sql
-- supabase/migrations/0XX_create_restaurants.down.sql （手工 rollback 用）
BEGIN;

DROP TRIGGER IF EXISTS trg_restaurants_updated_at ON restaurants;
DROP FUNCTION IF EXISTS restaurants_touch_updated_at();
DROP TABLE IF EXISTS restaurants;

COMMIT;
```

### 5.2 出问题时操作流程

1. 前端先 deploy 一版"强制 fallback"（注释掉 `ensureRestaurantsLoaded()` 调用 → HK_RESTAURANTS 永远是 HARDCODED_FALLBACK）
2. 跑 DOWN migration DROP TABLE
3. 用户**0 感知**（TS fallback 还在，100 家餐厅照样展示）

**这是 hybrid 方案的最大好处**：DB 是新增的"加分项"，DROP TABLE 不破坏前端 baseline 体验。

### 5.3 数据备份

实施前 Database 012 棒手工跑：
```sql
COPY restaurants TO '/tmp/restaurants_backup_YYYYMMDD.csv' WITH (FORMAT CSV, HEADER);
```
出问题恢复 CSV 即可。

---

## §6. 估时

| 阶段 | 部门 | 实施 | 预计 |
|-----|------|------|-----|
| §1 + §2 | Database 012 | 写 migration UP + RLS + index + trigger，push 远端，verify schema | 25-40 min |
| §3.2 | Backend XXX | 写 `_oneshot-seed-restaurants.ts`，跑一次，verify count=100，删脚本 | 30-50 min |
| §4 | Frontend XXX | `hkRestaurants.ts` 加 `ensureRestaurantsLoaded()` + App.tsx fire-and-forget | 20-30 min |
| 端到端 | CEO | 验证 admin 改 DB → 30 秒内前端刷新看到改动 | 10 min |

**总计**：单棒约 1.5-2 小时（不含 admin 后台 — Phase 2 才做）。

---

## §7. 风险 & Open Questions

### 7.1 已识别风险

| 风险 | 概率 | 影响 | 缓解 |
|-----|------|-----|-----|
| 100 行 seed 跑完 cuisine 文本带 emoji / 特殊字符导致 PG encoding 报错 | 低 | 中 | 脚本里 try/catch 单行，失败的行 log，继续跑剩余 |
| RLS `restaurants_read_all USING (true)` 暴露 hidden 行给前端 | 低 | 低 | 前端 `eq('hidden', false)` 过滤，DB 不做强约束（admin 端要看 hidden 行） |
| 数据漂移：DB 改了 admin 不知道，TS fallback 老化 | 中 | 低 | 季度跑 `scripts/sync-restaurants-from-db.ts` 重生成 TS fallback |
| Phase 2 商业字段 (`commission_rate`, `partner_status`) 提前建好但用不上，schema 噪音 | 低 | 极低 | 接受 — 加列比后续 migration 简单 |
| `good_for` text[] gin index 在 100 行规模下 over-engineering | 低 | 极低 | 100 行其实不需要 index；预留给 Phase 3 扩到 500-1000 家 |

### 7.2 待 Architect / CEO 拍板的 open questions

1. **primary key**：slug (text) vs uuid — SPEC 推荐 slug。是否同意？
2. **`good_for` 字段**：text[] vs jsonb — SPEC 推荐 text[]（pg && 操作快、index 简单）
3. **Phase 2 商业字段**：是否提前建好 `commission_rate / partner_status / booking_url`？SPEC 推荐是
4. **admin 权限模型**：service_role only vs `user_profiles.role` 字段。SPEC 按 CEO §A 2 已决方向（service_role only）
5. **TS fallback 同步频率**：季度手工 / 月度手工 / 永不同步（DB 出问题就接受 100 行老 data）— SPEC 推荐季度
6. **lat/lng**：暂全 NULL，未来 BACKFILL 来源？老板手工 / Google Maps API / OpenRice 抓取 — SPEC 暂不解决

### 7.3 不在本 SPEC 范围

- admin 后台 UI（另立 SPEC）
- Phase 2 booking 流程（另立 SPEC，需要支付 + 库存 + cancellation policy）
- 用户收藏餐厅 / 周末选定餐厅状态（需要 `user_restaurant_*` 关联表，另立 SPEC）
- 餐厅评价 / 用户 review（明显大功能，独立 SPEC）
- 米其林榜单年度同步自动化（手工先跑通，证实需求后再自动化）

---

## §8. 实施 checklist（Database 012 接棒时按此跑）

- [ ] 起 migration 文件 `supabase/migrations/0XX_create_restaurants.sql`（编号实查 `ls supabase/migrations/ | tail -3` 决定）
- [ ] UP migration：CREATE TABLE + 2 indexes + 1 trigger + ENABLE RLS + 1 policy
- [ ] `supabase db push --linked` 后 `information_schema.columns` 实查 24 列全在
- [ ] `pg_indexes` 实查 2 个 index 存在
- [ ] RLS policy `pg_policies` 实查 `restaurants_read_all` 存在
- [ ] 1 commit：`db(migration): create restaurants table with RLS + indexes (SPEC 011)`
- [ ] 不 trigger 数据迁移 — 等 Backend 012 接力跑 seed 脚本
- [ ] response 报告：migration 编号 / push 结果 / schema verify

---

**End of SPEC**.
