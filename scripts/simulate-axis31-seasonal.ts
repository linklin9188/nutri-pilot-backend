/**
 * simulate-axis31-seasonal.ts — TICKET-20260520-064 §E
 *
 * 4 节气 (立春/立夏/立秋/立冬) fruit/veggie pool top 5 抽样验证 axis 31
 * 应季强化效果 (+0.40 命中 / -0.20 未命中).
 *
 * dry-run 仅 SELECT, 不写 DB. commit 留档作 axis 31 ship 时一次性 sanity check.
 *
 * 运行: npx tsx scripts/simulate-axis31-seasonal.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const SEASONALITY: Record<string, string[]> = {
  '立春': ['韭菜', '春笋', '香椿', '荠菜', '豌豆苗', '草莓'],
  '立夏': ['枇杷', '黄瓜', '番茄', '蚕豆', '樱桃', '西瓜'],
  '立秋': ['葡萄', '莲子', '板栗', '南瓜', '龙眼', '茄子'],
  '立冬': ['白菜', '萝卜', '羊肉', '山药', '鸭肉'],
};

function dishIngredientNames(d: any): string[] {
  const out = new Set<string>();
  if (d.main_ingredient) out.add(d.main_ingredient);
  const prep = d.prep_steps_json as Array<{ ingredient_zh?: string }> | null | undefined;
  if (Array.isArray(prep)) for (const step of prep) if (step?.ingredient_zh) out.add(step.ingredient_zh);
  return Array.from(out);
}

function axis31Score(dish: any, solarTermZh: string): { score: number; hits: string[] } {
  const ct = (dish.course_type ?? '') as string;
  if (ct !== 'fruit' && ct !== 'veggie_dish') return { score: 0, hits: [] };
  const list = SEASONALITY[solarTermZh] ?? [];
  if (list.length === 0) return { score: 0, hits: [] };
  const ings = dishIngredientNames(dish);
  const hits: string[] = [];
  for (const ing of ings) if (list.includes(ing)) hits.push(ing);
  return { score: hits.length >= 1 ? 0.40 : -0.20, hits };
}

async function main() {
  const conn = process.env.DIRECT_DATABASE_URL;
  if (!conn) { console.error('BLOCKER: DIRECT_DATABASE_URL 未设置'); process.exit(1); }
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows: dishes } = await c.query<any>(
      `SELECT id, title_zh, course_type, main_ingredient, prep_steps_json
       FROM dishes
       WHERE course_type IN ('fruit', 'veggie_dish') AND title_zh IS NOT NULL
       LIMIT 500`
    );
    console.log(`\n=== axis 31 fruit/veggie 应季强化 simulation (DB ${dishes.length} 道 fruit/veggie) ===\n`);

    for (const term of ['立春', '立夏', '立秋', '立冬']) {
      const scored = dishes
        .map((d: any) => ({ dish: d, axis31: axis31Score(d, term) }))
        .sort((a: any, b: any) => b.axis31.score - a.axis31.score);
      console.log(`\n──── ${term} (应季清单: ${SEASONALITY[term].join('、')}) ────`);
      // top 5
      console.log(`  TOP 5 (axis 31 +0.40 命中应季):`);
      const tops = scored.filter((s: any) => s.axis31.score > 0).slice(0, 5);
      if (tops.length === 0) {
        console.log(`    (无命中应季 — DB 缺 ${term} 食材的 fruit/veggie 菜)`);
      } else {
        tops.forEach((s: any, i: number) => {
          console.log(`    ${i + 1}. ${s.dish.title_zh.padEnd(22)} [${s.dish.course_type.padEnd(11)}] 命中: ${s.axis31.hits.join('、')}`);
        });
      }
      // 非应季 bottom 3
      const bottoms = scored.filter((s: any) => s.axis31.score < 0).slice(0, 3);
      console.log(`  BOTTOM 3 (axis 31 -0.20 非应季):`);
      bottoms.forEach((s: any, i: number) => {
        console.log(`    ${i + 1}. ${s.dish.title_zh.padEnd(22)} [${s.dish.course_type.padEnd(11)}]`);
      });
    }
    console.log('\n✅ axis 31 4 节气 simulation 完成');
  } finally {
    await c.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
