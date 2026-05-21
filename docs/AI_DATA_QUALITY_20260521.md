# AI_DATA_QUALITY — 2026-05-21 数据质量盘点

> 出品：Backend Lead，TICKET-20260521-011 §D
> 范围：`dishes` 表 924 行（`WHERE title_zh IS NOT NULL`）
> 数据快照时间：2026-05-21 23:41 HKT
> 工单要求：≥ 200 行；7 节覆盖

---

## §0 总览

- **总菜数**：924 道（pre-/post- TICKET-011 不变；本单不新增菜）
- **核心数据维度**：
  - 7 维原子营养素：98.5–99.0%（已基本到顶，剩 9–14 行边缘菜需手工补）
  - 12 wellness tag：低位 9 个跑前 0.9-14% → 跑后见 §2
  - prep_steps_json：跑前 87.0% (804/924) → 跑后见 §5
  - image_url：77.9% (720/924) — 跨课题，本单未触
  - video_url：**0%（列不存在）** — 见 §4 + Backend §F blocker

---

## §1 dishes 表 7 维原子营养素覆盖率

数据来源：`backfill-dish-atomic-nutrition.ts`（Gemini 2.5 Flash，COALESCE 模式）

| 字段          | 已填 / 924 | 覆盖率 | 缺口 | 备注 |
|---------------|-----------|--------|------|------|
| protein_g     | 915       | 99.0%  | 9    | 已基本到顶 |
| fat_g         | 915       | 99.0%  | 9    | 已基本到顶 |
| carb_g        | 915       | 99.0%  | 9    | 已基本到顶 |
| calcium_mg    | 910       | 98.5%  | 14   | 第二轮 backfill 已收尾 |
| iron_mg       | 910       | 98.5%  | 14   | 同上 |
| fiber_g       | 910       | 98.5%  | 14   | 同上 |
| vitamin_c_mg  | 910       | 98.5%  | 14   | 同上 |

**结论**：营养素维度已满足 production minimum。剩 9-14 行边缘 case（多为节庆点心 / 老菜重复 / 缺主料菜），建议**手工 spot-check + 单条补**，不再跑批量 Gemini。

---

## §2 12 wellness tag 填充率（前 / 后对比）

> 数据来源：TICKET-011 §A `fill-dish-health-tags.ts --lt=2`，
> 候选范围：142 道（`array_length(health_benefit_tags, 1) < 2` 含 NULL 23 + len=1 119）。
> Merge 模式：never overwrite，只追加 wellness tag；goal tag (high_protein/detox/etc.) 全保留。

### Pre-pass（跑前快照）

| Tag                   | hits / 924 | %     | 30% (≥277) |
|-----------------------|------------|-------|------------|
| low_sodium            | 155        | 16.8% | ❌          |
| low_sugar             | 512        | 55.4% | ✅          |
| low_purine            | 469        | 50.7% | ✅          |
| blood_tonic           | 94         | 10.2% | ❌          |
| sleep_aid             | 21         | 2.3%  | ❌          |
| yin_nourish           | 69         | 7.5%  | ❌          |
| qi_tonic              | 129        | 14.0% | ❌          |
| mood_boost            | 39         | 4.2%  | ❌          |
| anti_aging            | 65         | 7.0%  | ❌          |
| beauty                | 74         | 8.0%  | ❌          |
| anti_inflammation     | 93         | 10.1% | ❌          |
| eye_care              | 51         | 5.5%  | ❌          |

### Post-pass（§A 跑后）

跑量：142 道候选 → Updated 93 / Skipped 45（Gemini 判定无 wellness 命中）/ Errors 4（502 retry 全失败）/ Tags added 200。

| Tag                   | Pre  | Post | Δ    | Post % | 30%(≥277) | Notes |
|-----------------------|------|------|------|--------|-----------|-------|
| low_sodium            | 155  | 165  | +10  | 17.9%  | ❌        |       |
| low_sugar             | 512  | 533  | +21  | 57.7%  | ✅        |       |
| low_purine            | 469  | 493  | +24  | 53.4%  | ✅        |       |
| blood_tonic           | 94   | 133  | +39  | 14.4%  | ❌        |       |
| sleep_aid             | 21   | 21   | 0    | 2.3%   | ❌        | 候选集中无明显安神食材 |
| yin_nourish           | 69   | 85   | +16  | 9.2%   | ❌        | niche — 工单豁免 |
| qi_tonic              | 129  | 171  | +42  | 18.5%  | ❌        | 涨幅最大 |
| mood_boost            | 39   | 43   | +4   | 4.7%   | ❌        |       |
| anti_aging            | 65   | 71   | +6   | 7.7%   | ❌        |       |
| beauty                | 74   | 85   | +11  | 9.2%   | ❌        |       |
| anti_inflammation     | 93   | 109  | +16  | 11.8%  | ❌        |       |
| eye_care              | 51   | 58   | +7   | 6.3%   | ❌        |       |

**总命中增量**：200 个 wellness tag 标签被新加入 dishes（93 道菜被实际写入）。

### 数学下限再验证

§A 跑前预测："--lt=2 范围 142 dishes，即使每道都判定为 sleep_aid 也只能加 +142 → 21+142=163 < 277"。
**实际**：sleep_aid 0 增（Gemini 在 142 候选中找不到明显的莲子/百合/桂圆菜），印证「sleep_aid 30% 不可能仅靠 NULL/short merge 达成」。
其余 8 个 niche tag 平均涨 +14（中位 yin_nourish/anti_inflammation）但 base 太低也未达 30%。

**结论**：工单 §F 验收条款明确"niche tag 可低"，§A 部分按豁免**判合格**。要让 9 个 wellness tag 全部达 30%，
**唯一路径**是 with_tags 782 道做 merge pass — 详 §7.1。

### 数学下限

让 9 个 wellness tag 全部冲到 30% (277 hits)，最难的是 **sleep_aid**（21 → 需 +256）。
TICKET-011 §A `--lt=2` 范围只 142 行，**即使每行都判定为 sleep_aid 也只能加 +142 → 163 < 277**，
所以本单交付后 sleep_aid 仍达不到 30%。完整方案需要在 with_tags 行（782 道）也跑一轮
merge pass，详 §7 next-step §7.2。

---

## §3 health_benefit_tags 数组分布（pre-pass）

数据来源：`SELECT COALESCE(array_length(health_benefit_tags,1), 0), COUNT(*)` group by。

| 长度 | 行数 | 占比  |
|------|------|-------|
| 0    | 23   | 2.5%  |
| 1    | 118  | 12.8% |
| 2    | 175  | 18.9% |
| 3    | 294  | 31.8% ← peak |
| 4    | 180  | 19.5% |
| 5    | 77   | 8.3%  |
| 6    | 39   | 4.2%  |
| 7    | 15   | 1.6%  |
| 8    | 3    | 0.3%  |

**平均 tag 数 / 菜**：~3.5（含 1.5-2.0 goal + 0-1.5 wellness）

### 所有 distinct tag 出现频次（pre-pass，top → bottom）

| Tag                | hits | 类型 |
|--------------------|------|------|
| low_sugar          | 512  | wellness (12 enum) |
| maintain           | 492  | goal |
| low_purine         | 469  | wellness |
| high_protein       | 215  | goal |
| low_sodium         | 155  | wellness |
| qi_tonic           | 129  | wellness |
| detox              | 106  | goal |
| blood_tonic        | 94   | wellness |
| anti_inflammation  | 93   | wellness |
| beauty             | 74   | wellness |
| yin_nourish        | 69   | wellness |
| anti_aging         | 65   | wellness |
| muscle_gain        | 62   | goal |
| eye_care           | 51   | wellness |
| immunity           | 45   | goal (legacy？非 12 enum) |
| mood_boost         | 39   | wellness |
| damp_clear         | 36   | TCM goal (非 12 enum) |
| nourish            | 30   | goal |
| lose_weight        | 29   | goal |
| boost_immunity     | 22   | goal (与 immunity 重复) |
| sleep_aid          | 21   | wellness |
| omega3             | 5    | goal (几乎无用) |
| fat_loss           | 1    | goal (几乎无用) |
| **节庆点心**       | 1    | **legacy CN — 漏网** |
| **暖胃**           | 1    | **legacy CN — 漏网** |
| **补气**           | 1    | **legacy CN — 漏网** |
| **补充能量**       | 1    | **legacy CN — 漏网** |

### 发现的数据 smell

1. **4 个中文 legacy tag 残留** (节庆点心 / 暖胃 / 补气 / 补充能量) — 历史种子数据漏网，
   未被 algo 消费但占数组位。建议下一单单点 SQL `UPDATE … SET health_benefit_tags = array_remove(…)` 清理。
2. **immunity vs boost_immunity 重复语义** — 一个事物两个 tag key，应统一。
3. **omega3 / fat_loss 只有 5 / 1 hit** — 实际无效用，建议下一轮 algo SPEC 时决定 deprecate 还是补全。

---

## §4 video_url 灌入数量 + 按 channel 分布

### ⚠️ Blocker — 列尚未创建

`information_schema.columns WHERE table_name='dishes' AND column_name IN ('video_url','video_lang','video_platform')` 返回 0 行。

工单 §B 前提（"Database 012 已 push migration 加 video_url/lang/platform 3 列"）**未达成**：

- Database 部门最新 ticket = TELEPOT-20260521-011 (restaurants 表迁移 SPEC)，与 video_url 无关
- `grep -rn "video_url|video_lang|video_platform" supabase/migrations/` 全程 0 命中

**Backend 已就绪**：UPDATE SQL（用 YouTube search deeplink 兜底，**不是**真 video URL）写在 `_bridge/telepot_backend.md` §B 工单文本里，列一旦 push 即可直接跑。

**Backend §F blocker §B**：等 Database 部门下一单 push migration 加 3 列（建议 nullable text，不带 NOT NULL，不带 default），Backend 拿到 column 后 1 次 UPDATE 即可灌入。

---

## §5 prep_steps_json 覆盖率

数据来源：`gen-dish-steps-claude.ts`（Claude Haiku 4.5，4D 框架）

### Pre-pass

| 字段             | 已填 | 缺  | 覆盖率 |
|------------------|------|-----|--------|
| prep_steps_json  | 804  | 120 | 87.0%  |

### NULL 行按 course_type 分布（120 道）

| course_type    | NULL 数 |
|----------------|---------|
| main_protein   | 80      |
| veggie_dish    | 24      |
| staple         | 7       |
| soup           | 6       |
| dessert        | 3       |

### Post-pass（§C 跑后）

| 字段             | 已填 | 缺  | 覆盖率 | 增量 |
|------------------|------|-----|--------|------|
| prep_steps_json  | 895  | 29  | **96.86%** ✅ | +91 |

**Pass rate**: 91/120 写入 = 75.8%（剩 21 batch JSON parse fail + 8 row-level skip — 4D 8k token cap 已知问题，
脚本 header 即注明 BATCH=3 是为这条收敛的，但仍偶发触顶。下一轮 batch=2 重试可吃下大部分残）。

### Residual NULL 行（29 道）

| course_type    | NULL 数 |
|----------------|---------|
| main_protein   | 15      |
| veggie_dish    | 8       |
| staple         | 4       |
| dessert        | 2       |

**结论**：96.86% 已超工单 §F 95% 门槛。剩余 29 道可下一单 `--batch=2 --limit=29` 一次性收尾。

---

## §6 image_url 覆盖率

| 字段       | 已填 | 缺  | 覆盖率 |
|------------|------|-----|--------|
| image_url  | 720  | 204 | 77.9%  |

### NULL 行 top 5 course_type

| course_type    | NULL 数 |
|----------------|---------|
| main_protein   | 120     |
| staple         | 29      |
| veggie_dish    | 28      |
| dessert        | 14      |
| soup           | 13      |

**说明**：image_url 灌入不在 TICKET-011 范围（属未来 Image 部门工单），此处仅盘点。
204 道缺图主要来自新种入的 main_protein（120 道），建议下一轮派 Image 部门
用 Gemini Imagen / DALL-E 批量生成（按主料 cluster 8 道一组节省成本）。

---

## §7 next-step 候选清单（按 ROI 排序）

> 严格 **盘点视角**，不是 CEO 决策建议。CEO 自行决定是否派单。

### §7.1 P0 — 12 wellness tag 9 个 with_tags merge pass

**说明**：TICKET-011 §A 只覆盖 `array_length<2` (142 dishes)，with_tags 782 道
未跑 wellness merge — 这是 sleep_aid/yin_nourish 等 5 个 niche tag 冲 30% 的唯一通路。

**预估**：
- 范围：782 道 with_tags
- ETA：~130 分钟（782 × 10s/dish 含 retry）
- 成本：Gemini ~$0.05 / Opus ~$3.5
- 命中率：以 §A pre-/post-pass 推算，预计每个 niche tag 多加 100-200 hits

### §7.2 P1 — Database 加 video_url/lang/platform 3 列

**说明**：本单 §B 阻塞。一旦 Database push migration，Backend 一条 SQL UPDATE
即可灌入 ~600 道（按工单 SQL：lunch/dinner × 红/白/海鲜肉 + 港粤汤）。

### §7.3 P1 — 4 个 legacy CN tag 清理 + immunity / boost_immunity 合并

**说明**：单条 SQL 修，5 分钟工时。可与下一单 §A merge pass 一起捎带。

### §7.4 P2 — main_protein 120 道缺图 + 204 道总缺图

**说明**：Image 部门工单范围，Backend 仅提供 SQL 抽样列表。预估 Gemini Imagen 批量
$10-15，时间 1-2 小时（按 batch 8 + retry）。

### §7.5 P3 — 9-14 行边缘营养素手工补

**说明**：剩余的 9 道 protein/fat/carb + 14 道 calcium/iron/fiber/vitC NULL 行，
建议手工 spot-check 不再跑批量（Gemini 已多次判定 N/A）。

### §7.6 P3 — omega3 / fat_loss tag deprecate 决策

**说明**：两个 tag 全 dataset 总命中 6 个，建议在下一次 ALGO_VERSION bump
窗口决定保留还是 deprecate。属算法 / 产品 SPEC 范畴，Backend 仅 surface 现状。

---

## §8 不变量自检

- ✅ 不变量 #1：本单 0 加 FK→`auth.users`
- ✅ 不变量 #2：Gemini 全部走 `gemini-proxy` (endpoint='health_tag') 而非直连
- ✅ 不变量 #3：Stripe 价格白名单 0 触
- ✅ 不变量 #4：`ALGO_VERSION` 不动（保持 v37）

---

## §9 数据来源与可复现 SQL

```sql
-- §1 营养素覆盖
SELECT
  SUM((protein_g IS NOT NULL)::int) AS protein_g_filled,
  SUM((fat_g     IS NOT NULL)::int) AS fat_g_filled,
  SUM((carb_g    IS NOT NULL)::int) AS carb_g_filled,
  SUM((calcium_mg IS NOT NULL)::int) AS calcium_mg_filled,
  SUM((iron_mg    IS NOT NULL)::int) AS iron_mg_filled,
  SUM((fiber_g    IS NOT NULL)::int) AS fiber_g_filled,
  SUM((vitamin_c_mg IS NOT NULL)::int) AS vitamin_c_mg_filled,
  COUNT(*) AS total
FROM dishes WHERE title_zh IS NOT NULL;

-- §2 12 wellness tag hits
SELECT
  SUM(('low_sodium'    = ANY(health_benefit_tags))::int) AS low_sodium,
  SUM(('low_sugar'     = ANY(health_benefit_tags))::int) AS low_sugar,
  SUM(('low_purine'    = ANY(health_benefit_tags))::int) AS low_purine,
  SUM(('blood_tonic'   = ANY(health_benefit_tags))::int) AS blood_tonic,
  SUM(('sleep_aid'     = ANY(health_benefit_tags))::int) AS sleep_aid,
  SUM(('yin_nourish'   = ANY(health_benefit_tags))::int) AS yin_nourish,
  SUM(('qi_tonic'      = ANY(health_benefit_tags))::int) AS qi_tonic,
  SUM(('mood_boost'    = ANY(health_benefit_tags))::int) AS mood_boost,
  SUM(('anti_aging'    = ANY(health_benefit_tags))::int) AS anti_aging,
  SUM(('beauty'        = ANY(health_benefit_tags))::int) AS beauty,
  SUM(('anti_inflammation' = ANY(health_benefit_tags))::int) AS anti_inflammation,
  SUM(('eye_care'      = ANY(health_benefit_tags))::int) AS eye_care
FROM dishes WHERE title_zh IS NOT NULL;

-- §3 数组长度分布
SELECT COALESCE(array_length(health_benefit_tags, 1), 0) AS len, COUNT(*) AS n
FROM dishes WHERE title_zh IS NOT NULL GROUP BY len ORDER BY len;

-- §3 所有 distinct tag 频次
SELECT t AS tag, COUNT(*) AS n
FROM dishes, unnest(health_benefit_tags) t
WHERE title_zh IS NOT NULL
GROUP BY t ORDER BY n DESC;

-- §4 video_url 列存在性
SELECT column_name FROM information_schema.columns
WHERE table_name='dishes' AND column_name IN ('video_url','video_lang','video_platform');

-- §5 prep_steps_json 覆盖
SELECT SUM((prep_steps_json IS NOT NULL)::int) AS filled, COUNT(*) AS total
FROM dishes WHERE title_zh IS NOT NULL;

-- §6 image_url 覆盖
SELECT SUM((image_url IS NOT NULL)::int) AS filled, COUNT(*) AS total
FROM dishes WHERE title_zh IS NOT NULL;
```

---

报告版本：v1（pre-/in-pass，§2/§5 待 §A/§C 完工填）
最终版本：v2（post-pass，在 commit 中加 final 数字）
