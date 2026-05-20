/**
 * test-feedback-loop.ts — 数据飞轮真闭环 e2e 验证（TICKET-20260520-031 §A）
 *
 * 完整链路：
 *   user_feedback_helper INSERT 10 条
 *     → 模拟 useFeedbackEngine.consumeRatings 同等逻辑
 *     → user_preference_scores UPSERT
 *     → prefscores_training_log INSERT
 *     → 模拟 scoreForWeek 学习段（sigmoid weight × usagePower）
 *     → 对比 spicy/light 菜的分差
 *     → DELETE 全部测试数据
 *
 * 运行：
 *   npx ts-node scripts/test-feedback-loop.ts
 *
 * 前置条件（任一不满足脚本会早退并打印 BLOCKER）：
 *   - .env 含 DIRECT_DATABASE_URL（pg 直连）
 *   - user_feedback_helper 表存在（Database 016/027 落地后）
 *   - user_preference_scores 表存在
 *   - prefscores_training_log 表存在
 *   - dishes 表 ≥ 1 道含 flavor_tags=['spicy'] 的菜 + ≥ 1 道 ['light']
 *
 * 本脚本是 regression suite —— commit 进 scripts/ 留档；production 操作员可
 * 在本地 npx ts-node 跑验证。CI 默认不跑（避免污染 production DB）。
 *
 * Cleanup 保证：try / finally 块保证即使中途失败也 DELETE 测试数据。
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const TEST_USER = 'test_loop_user_e2e';

// ── 镜像 useFeedbackEngine consumeRatings 的同等逻辑（hook 不能在脚本里
//    调用，因为是 React hook）。规则严格按 TICKET-015 §A：
//    rating_good +1.0 / rating_okay 0 / rating_bad -0.5；COUNTER_CAP=25。
const RATING_WEIGHT: Record<string, number> = {
  rating_good: 1.0,
  rating_okay: 0,
  rating_bad: -0.5,
};
const COUNTER_CAP = 25;

const FLAVOR_COL: Record<string, string> = {
  light: 'pref_light', spicy: 'pref_spicy', sweet: 'pref_sweet',
  salty: 'pref_salty', sour: 'pref_sour', seafood: 'pref_seafood',
  veggie: 'pref_veggie',
};

// 模拟 useWeeklyMenu.usagePower (cnt^1.5 power curve)
function usagePower(n: number): number {
  if (!n) return 0;
  const sign = n >= 0 ? 1 : -1;
  return sign * Math.pow(Math.abs(n), 1.5) * 0.05;
}

// 模拟 useWeeklyMenu.scoreForWeek 学习段 sigmoid weight
function sigmoidWeight(prefScores: Record<string, number>): number {
  const n = Object.values(prefScores).filter(v => typeof v === 'number' && v !== 0).length;
  return 0.35 + 1.15 * (1 - Math.exp(-n / 15));
}

function step(n: number, label: string) {
  console.log(`\n[Step ${n}/8] ${label}`);
}

async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) {
    console.error('BLOCKER: DIRECT_DATABASE_URL 未设置（.env 缺）');
    process.exit(1);
  }

  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();

  let stepFailed = '';
  try {
    // ── Step 1: pick 5 spicy dishes + 3 light dishes + 2 neutral ────────
    step(1, '挑选 spicy / light / neutral 测试菜');
    const { rows: spicyDishes } = await c.query<{ id: string; title_zh: string }>(
      `SELECT id, title_zh FROM dishes
       WHERE 'spicy' = ANY(flavor_tags) AND meal_type IN ('lunch','dinner','all')
       LIMIT 5`
    );
    const { rows: lightDishes } = await c.query<{ id: string; title_zh: string }>(
      `SELECT id, title_zh FROM dishes
       WHERE 'light' = ANY(flavor_tags) AND NOT ('spicy' = ANY(flavor_tags))
         AND meal_type IN ('lunch','dinner','all')
       LIMIT 3`
    );
    const { rows: neutralDishes } = await c.query<{ id: string; title_zh: string }>(
      `SELECT id, title_zh FROM dishes
       WHERE NOT ('spicy' = ANY(coalesce(flavor_tags, '{}'::text[])))
         AND NOT ('light' = ANY(coalesce(flavor_tags, '{}'::text[])))
       LIMIT 2`
    );
    console.log(`  spicy: ${spicyDishes.length} / light: ${lightDishes.length} / neutral: ${neutralDishes.length}`);
    if (spicyDishes.length < 5 || lightDishes.length < 3 || neutralDishes.length < 2) {
      stepFailed = 'Step 1: 测试菜池不足（spicy×5 / light×3 / neutral×2 需要全满）';
      return;
    }

    // ── Step 2: INSERT 10 条 user_feedback_helper ───────────────────────
    step(2, 'INSERT 10 条 user_feedback_helper');
    const insertRows: Array<[string, string, string]> = [
      ...spicyDishes.map(d => [TEST_USER, d.id, 'rating_good'] as [string, string, string]),
      ...lightDishes.map(d => [TEST_USER, d.id, 'rating_bad'] as [string, string, string]),
      ...neutralDishes.map(d => [TEST_USER, d.id, 'rating_okay'] as [string, string, string]),
    ];
    const insertValues = insertRows
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
      .join(', ');
    const flatParams = insertRows.flat();
    await c.query(
      `INSERT INTO user_feedback_helper (user_id, dish_id, feedback_type) VALUES ${insertValues}`,
      flatParams,
    );
    console.log(`  INSERT 完成: ${insertRows.length} 条`);

    // ── Step 3: 模拟 consumeRatings (镜像 useFeedbackEngine 逻辑) ───────
    step(3, '模拟 consumeRatings → 聚合 → upsert prefScores');
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { rows: feedbacks } = await c.query<{ dish_id: string; feedback_type: string }>(
      `SELECT dish_id, feedback_type FROM user_feedback_helper
       WHERE user_id = $1 AND created_at >= $2
         AND feedback_type IN ('rating_good','rating_okay','rating_bad')`,
      [TEST_USER, since.toISOString()],
    );

    // dishId → cumulative weight
    const dishWeights = new Map<string, number>();
    for (const fb of feedbacks) {
      const w = RATING_WEIGHT[fb.feedback_type] ?? 0;
      if (w === 0 || !fb.dish_id) continue;
      dishWeights.set(fb.dish_id, (dishWeights.get(fb.dish_id) ?? 0) + w);
    }

    // 拉 dish tags
    const dishIds = Array.from(dishWeights.keys());
    const { rows: dishes } = await c.query<{ id: string; flavor_tags: string[] }>(
      `SELECT id, flavor_tags FROM dishes WHERE id = ANY($1::uuid[])`,
      [dishIds],
    );

    // 聚合 tag 增量
    const tagDelta: Record<string, number> = {};
    for (const d of dishes) {
      const w = dishWeights.get(d.id) ?? 0;
      for (const tag of (d.flavor_tags ?? [])) {
        const col = FLAVOR_COL[tag];
        if (col) tagDelta[col] = (tagDelta[col] ?? 0) + w;
      }
    }

    // UPSERT user_preference_scores（按列名动态构造）
    const cols = Object.keys(tagDelta);
    if (cols.length === 0) {
      stepFailed = 'Step 3: tag 聚合为空（dish.flavor_tags 全空？）';
      return;
    }
    const setClause = cols.map(col => `${col} = GREATEST(-${COUNTER_CAP}, LEAST(${COUNTER_CAP}, COALESCE(user_preference_scores.${col}, 0) + EXCLUDED.${col}))`).join(', ');
    const insertCols = ['user_id', ...cols].join(', ');
    const insertPlaceholders = ['$1', ...cols.map((_, i) => `$${i + 2}`)].join(', ');
    const params = [TEST_USER, ...cols.map(col => tagDelta[col])];
    await c.query(
      `INSERT INTO user_preference_scores (${insertCols}) VALUES (${insertPlaceholders})
       ON CONFLICT (user_id) DO UPDATE SET ${setClause}`,
      params,
    );
    console.log(`  tag deltas:`, tagDelta);

    // ── Step 4: 验证 user_preference_scores ───────────────────────────
    step(4, '验证 prefScores spicy > 0 且 light < 0');
    const { rows: scoreRows } = await c.query<Record<string, any>>(
      `SELECT * FROM user_preference_scores WHERE user_id = $1`,
      [TEST_USER],
    );
    const scoreRow = scoreRows[0] ?? {};
    const spicyScore = scoreRow.pref_spicy ?? 0;
    const lightScore = scoreRow.pref_light ?? 0;
    console.log(`  pref_spicy=${spicyScore} / pref_light=${lightScore}`);
    if (!(spicyScore > 0 && lightScore < 0)) {
      stepFailed = `Step 4 FAIL: expected spicy>0 && light<0, got spicy=${spicyScore} light=${lightScore}`;
      return;
    }

    // ── Step 5: INSERT prefscores_training_log（feedback_count=10）─────
    step(5, 'INSERT prefscores_training_log');
    const deltaSummary = Object.entries(tagDelta)
      .filter(([, d]) => d !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5)
      .map(([col, d]) => `${col} ${d > 0 ? '+' : ''}${d.toFixed(2)}`)
      .join(' / ');
    await c.query(
      `INSERT INTO prefscores_training_log (user_id, feedback_count, delta_summary)
       VALUES ($1, $2, $3)`,
      [TEST_USER, feedbacks.length, deltaSummary || '(no non-zero tag deltas)'],
    );
    console.log(`  log inserted: feedback_count=${feedbacks.length} delta_summary="${deltaSummary}"`);

    // ── Step 6: scoreForWeek 模拟 — spicy 菜分数对比 ──────────────────
    step(6, 'scoreForWeek 模拟 spicy 菜学习段加分');
    const prefScores: Record<string, number> = scoreRow;
    const weight = sigmoidWeight(prefScores);
    const spicyBoost = usagePower(spicyScore) * 0.6 * weight;
    console.log(`  sigmoid weight=${weight.toFixed(3)}（n=${Object.values(prefScores).filter(v => typeof v === 'number' && v !== 0).length} signals）`);
    console.log(`  spicy 菜学习段加分 = usagePower(${spicyScore}) × 0.6 × weight = ${spicyBoost.toFixed(4)}`);
    if (!(spicyBoost > 0)) {
      stepFailed = `Step 6 FAIL: spicy boost expected > 0, got ${spicyBoost}`;
      return;
    }

    // ── Step 7: scoreForWeek 模拟 — light 菜降分 ─────────────────────
    step(7, 'scoreForWeek 模拟 light 菜学习段降分');
    const lightBoost = usagePower(lightScore) * 0.6 * weight;
    console.log(`  light 菜学习段加分 = usagePower(${lightScore}) × 0.6 × weight = ${lightBoost.toFixed(4)}`);
    if (!(lightBoost < 0)) {
      stepFailed = `Step 7 FAIL: light boost expected < 0, got ${lightBoost}`;
      return;
    }

    console.log('\n✅ Step 1-7 全部 PASS');
  } catch (err) {
    stepFailed = `EXCEPTION: ${(err as Error).message}`;
  } finally {
    // ── Step 8: cleanup ───────────────────────────────────────────────
    step(8, 'cleanup — DELETE 测试数据');
    try {
      await c.query(`DELETE FROM user_feedback_helper WHERE user_id = $1`, [TEST_USER]);
      await c.query(`DELETE FROM user_preference_scores WHERE user_id = $1`, [TEST_USER]);
      await c.query(`DELETE FROM prefscores_training_log WHERE user_id = $1`, [TEST_USER]);
      console.log('  cleanup OK');
    } catch (cleanupErr) {
      console.error('  cleanup 失败:', (cleanupErr as Error).message);
    }
    await c.end();

    if (stepFailed) {
      console.error(`\n❌ BLOCKER: ${stepFailed}`);
      process.exit(1);
    } else {
      console.log('\n✅ e2e 8/8 全部 PASS');
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
