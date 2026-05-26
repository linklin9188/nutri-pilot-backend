# CEO 下一波 draft 工单（2026-05-23 老板离开期间整理）

> 老板回来一次性 1 句话拍板派哪些。CEO 已 draft 完整，覆盖 telepot 即派。

---

## §1 Backend 023 — vitamin_d 补 fill（解 Algorithm 021 §B 暴的 22.1% 短板）

**触发**：Algorithm 021 §B audit 发现 vitamin_d_iu 仅 22.1% 填充（其他列 87.7-98.5%）— 跟 5-channel 💪 channel"本周补维 D" 直接相关，老用户经常被推荐到这个但 dish 无数据。

**任务**：
- 跑 fill-dish-3-micronutrients.ts 针对 vitamin_d_iu IS NULL 的 dishes（约 720 道）
- Gemini judge：哪些 dish 物理上合理含 vitamin D（鱼 / 蛋黄 / 蘑菇 / 强化牛奶）vs 物理上无 vitD（蔬菜 / 米饭 / 大部分肉）
- 目标：填充率 ≥ 60%（不强求 90% — 大部分中餐 dish 本就无 vitD）

预算 ~80-120k token + Gemini Pro / ~$1.5-2 USD

依赖：Backend 022 §C ship 后（Backend tab 解锁）

---

## §2 Algorithm 023 — schema-reader CI check（防 column shape mismatch 再 ship）

**触发**：Algorithm 021 §B 暴 P0：reader 路径与 DB schema 长期偏差（atomic_nutrition jsonb vs 独立列）。Algorithm 022 已修，但需 CI 防再犯。

**任务**：
- scripts/algo-quality-sim.ts 加 pre-flight check：
  - 实查 `information_schema.columns` 看 dishes 表有哪些列
  - 对比 NUTRIENT_COLUMN_MAP 7 个映射 → 找不存在的列 fail sim
  - 对比 reader 期望的 jsonb path → 找 schema 偏差 fail sim
- CI 跑 `npm run sim` 时如 fail → block PR

预算 ~50-80k token / ~$1

依赖：Algorithm 022 P0 ship 后

---

## §3 UI 029 — dish.title 多列接（菜单真多语言）

**触发**：Backend 022 §C 翻译 348 dish × 2 语言（zh-Hant + en）ship 后，UI 切到 dish.title[lang] 路径。

**任务**：
- src/lib/dishTitleI18n.ts helper：`getDishTitle(dish, lang)`
  - lang='zh' → dish.title
  - lang='zh-Hant' → dish.title_zh_hant ?? dish.title
  - lang='en' → dish.title_en ?? dish.title
- Home.tsx / WeeklyMenu.tsx / DishCard.tsx 等所有 dish.title 直接读处切到 getDishTitle
- 切语言时菜单 dish 名字真切换（不再硬编码简中）

预算 ~50-70k token / ~$1

依赖：Backend 022 §C ship

---

## §4 UI 030 — Home + WeeklyMenu i18n 45 处（i18n 第 3 轮）

**触发**：UI 025 §C scope defer 的剩余 45 处。UI 026 已做 QuickSetup 50+，剩 Home 30 + WeeklyMenu 15。

**任务**：
- src/pages/Home.tsx 所有硬编码中文（hero / section 标题 / 各 chip / toast）t() 包裹
- src/pages/WeeklyMenu.tsx 所有 hero / tab / 弹窗 t() 包裹
- 沿用 UI 026 模式 — sibling EN dict + render-time picker

预算 ~60-90k token / ~$1.2

独立可派

---

## §5 Database 023 — Smell 3 B-1（老板拍 A 后派）

详 `docs/SMELL3_RISK.md`。30-45 分钟，5 大风险有缓解。

---

## §6 Backend 023 第二议题 — Lottie 微动画素材（如老板未来后悔选 D）

老板 5-23 ~08:30 拍 A+D（接受静态 + CSS 微动）。如真用起来觉得 D 不够"活"，CEO 立项：
- WebFetch Lottie Free animations
- 找 6-9 个免费 family illustration / food prep 短动画
- 替换 Q0 6 张 + Q1 3 张静态图
- 预算 $0-200（视 Lottie 商用 license）

暂留 backlog，老板回来真测 UI 028 ship 后体验决定。

---

## §7 派单顺序（CEO 自决）

老板回来 + 当前 3 部门 ship 后立即派：

1. Backend 022 §C 翻译 ship → UI 029 派
2. Algorithm 022 P0 ship → Algorithm 023 派
3. UI 028 ship → UI 030 派
4. Database 023 等老板拍 A
5. Backend 023 vitamin_d 补 fill 派（与 Backend 022 §C 串行）

3-4 单本周末可串行 ship 完。
