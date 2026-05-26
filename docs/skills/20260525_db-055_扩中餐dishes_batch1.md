# DB-055 扩中餐 dishes 小批量 batch1

**日期** 2026-05-25 凌晨
**部门** Database + Algorithm
**Ticket** TELEPOT-20260525-055 P2

## 这事是干啥的

老板凌晨 explicit 授权：「把我们没有的中餐数据都按照同样的格式要求补充进来，
然后把做法那里页补充进去」。Database 实查 `dishes.origin_cuisine` 分布发现
924 行里只覆盖 8 个菜系（粤/川/北方/江南/南洋/日韩/西/all-season），而
`src/lib/recommendVector.ts` 的 CUISINE map **已经支持** hakka/hunan/fujian/
northeast/northwest 等等——这 5 个菜系前端能识别但 DB 里 0 行可推荐。本
batch1 ship 5 行经典菜，每菜 1 个空白菜系，CLAUDE.md 小批量先 3-5 rows
硬规已遵守。每行手写 ABCD tray prep_steps_json + 6-8 步 cook_steps_json，
完整 metadata 满足前端 RecipeDetail 页全字段显示。

## 真做了啥

- migration `088_extend_chinese_dishes_batch1.sql` ship 5 道菜：
  - 客家盐焗鸡 (hakka, main_protein, chicken, bake)
  - 剁椒鱼头 (hunan, main_protein, fish, steam)
  - 沙茶面 (fujian, staple, noodle, boil)
  - 锅包肉 (northeast, main_protein, pork, deep_fry)
  - 羊肉泡馍 (northwest, staple, lamb, stew)
- 每行手写：`prep_steps_json` (5-10 ABCD tray entries, 含中英双语
  `ingredient_zh/en` + `action_zh/en` + `amount_g`) + `cook_steps_json`
  (7-8 步骤, 含 `action_zh/en` + `duration_min` + `state_target_zh/en`).
- 元数据全填：kcal/protein/carb/fat/cook_time/oil-salt-sugar level /
  execution_level / xiaomei_compatible / hk_availability_score /
  helper_friendly_score / cultural_note / flavor_tags / health_benefit_tags.
- 跑 `scripts/compute-dish-feature-vector.ts`，增量计算新 5 行
  `feature_vector` (脚本默认 `WHERE feature_vector IS NULL` 只算 NULL 行,
  老规矩存量 924 行不受影响). 整库填充率 924 → 929 = 100%.
- commit `b59e82d` 已 push `main`.

## 学到啥 / 下次注意

1. **PostgREST `cuisine_zh` 列其实叫 `origin_cuisine`** — CEO 工单里写
   `cuisine_zh` 是误称, 实查 schema 前先 `select=*&limit=1` 看真实列名,
   别凭工单走。
2. **`prep_steps_json` 是 ABCD tray 配料分组, 不是 step/title/desc**
   (CEO 工单举的格式错了)。`cook_steps_json` 才是步骤数组。两个 json
   字段一起用：tray = "准备好的料"，cook = "炒菜过程"。这是 CLAUDE.md
   ABCD tray convention 的物理体现。
3. **migration verify DO block 抛 RAISE EXCEPTION 时不要用 IN(...) 计 COUNT**
   ——如果 DB 里已有同名但不同 `origin_cuisine` 的菜（比如这次 `剁椒鱼头`
   sichuan 旧错归类 + `锅包肉` northern 旧错归类），COUNT 会 > 5 抛错让
   supabase CLI 把整个 migration 标记失败 + 不注册 schema_migrations，
   而 INSERT 早已 COMMIT 提交，**数据在 DB 但 migration 状态空**——下次
   `db push` 会**重插一次**。正确写法是 `(title_zh, origin_cuisine)`
   联合判，精确匹配本 batch1 的 5 行。
4. **anon key 居然能 DELETE dishes 整行**——本次为修第一次错误状态
   `DELETE WHERE id IN (...)` 居然成功。这是 RLS Smell（不在本工单
   范畴, 留 Backend ticket）。
5. **feature_vector 增量脚本无需 `--limit` flag** —— 默认 `WHERE
   feature_vector IS NULL` 自动只算新行，省事；如要全量覆盖再加 `--force`。

## Scale Plan（手写 vs LLM 批量）

**人审 vs LLM**：本 batch1 全部手写，每道菜 prep_steps_json 5-10 ABCD
entries + cook_steps_json 7-8 步，**质量明显高于** v3.5/Gemini 输出
（手写覆盖了 cultural_note 历史背景、调味比例量化到 g、step
`state_target_zh` 用真实厨房语言）。下一批走法建议：

- **batch2-3 (next 10 行) 继续手写**：等老板早上 review batch1 质量
  确认 "做法页" 在前端 RecipeDetail 渲染正确，再批 batch2-3。每批 5
  行小批，每批必走 §A 实查现有分布 → 挑空白菜系 → 写 migration →
  push → feature_vector 增量 → commit。
- **batch4+ (50-100 行) 走半 LLM 半人审**：Gemini 出 prep/cook json
  草稿（参考 batch1 格式），人审改调味+量化+cultural_note。LLM 速度
  10x 但纯 LLM 在 "1.5 茶匙盐还是 3g 盐"、"客家菜该用沙姜还是黄姜"
  这种文化细节会出错，人审兜底。
- **总目标 100 行预计 4 周完成**：每周 1 批，
  - week1 = batch1 (本周, hakka/hunan/fujian/northeast/northwest)
  - week2 = batch2 (粤式 dim sum 系列 + 川式凉菜) ~10 行
  - week3 = batch3 (江南本帮 + 北方面食) ~10 行
  - week4 = batch4-5 LLM 草稿 + 人审 ~75 行
- **谁审**：老板拍最终菜系 + 总数；Database 自审 ABCD tray 合规
  (CLAUDE.md tray A/B/C/D = 主料/配菜/配料/调料) + 文化准确性；UI
  自审 RecipeDetail 渲染 (cook_steps_json action_en/zh 双语 + duration
  + state_target 是否显示完整)。
- **是否走 LLM 批量生成 prep_steps_json**：batch1-3 不走 (5-10 行
  量级手写 1h/菜可控)。batch4+ 数据量大才上 LLM。
