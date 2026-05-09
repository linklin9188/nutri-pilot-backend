/**
 * Migration: convert enum array columns → TEXT[], add is_vegan column
 *
 * Before: flavor_tags taste_preference[], health_benefit_tags diet_goal[]
 * After:  flavor_tags TEXT[],             health_benefit_tags TEXT[]
 *         + is_vegan BOOLEAN DEFAULT false
 *
 * Run: npx tsx scripts/migrate-tags-to-text.ts
 */
import pg from 'pg';
import { config } from 'dotenv';
config();

const client = new pg.Client({
  connectionString: process.env.DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('🔗 Connected');

  // 1. Convert flavor_tags: taste_preference[] → TEXT[]
  await client.query(`
    ALTER TABLE dishes
      ALTER COLUMN flavor_tags TYPE TEXT[]
      USING flavor_tags::TEXT[]
  `);
  console.log('✅ flavor_tags → TEXT[]');

  // 2. Convert health_benefit_tags: diet_goal[] → TEXT[]
  await client.query(`
    ALTER TABLE dishes
      ALTER COLUMN health_benefit_tags TYPE TEXT[]
      USING health_benefit_tags::TEXT[]
  `);
  console.log('✅ health_benefit_tags → TEXT[]');

  // 3. Add is_vegan column (if not exists)
  await client.query(`
    ALTER TABLE dishes
      ADD COLUMN IF NOT EXISTS is_vegan BOOLEAN NOT NULL DEFAULT false
  `);
  console.log('✅ is_vegan BOOLEAN column added');

  // 4. Auto-mark existing dishes: if main_ingredient is veggie/tofu/mushroom
  //    AND no meat keywords in title → set is_vegan = true
  const { rowCount: autoMarked } = await client.query(`
    UPDATE dishes
    SET is_vegan = true
    WHERE main_ingredient IN ('veggie', 'tofu', 'mushroom')
      AND title_zh NOT ILIKE ANY(ARRAY[
        '%肉%','%鸡%','%鸭%','%猪%','%牛%','%羊%','%鱼%','%虾%',
        '%蟹%','%贝%','%蚌%','%蛤%','%蚝%','%海鲜%','%腊%','%火腿%',
        '%培根%','%香肠%','%鱿%','%章鱼%','%鳗%','%带鱼%','%鲤%',
        '%三文鱼%','%金枪%','%鳕%','%排骨%','%蛋%'
      ])
  `);
  console.log(`✅ Auto-marked ${autoMarked} existing dishes as is_vegan=true`);

  // Verify
  const { rows } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_vegan) AS vegan,
      COUNT(*) FILTER (WHERE NOT is_vegan) AS non_vegan,
      COUNT(*) AS total
    FROM dishes
  `);
  console.log('\n📊 Vegan breakdown:');
  console.log(`   Total: ${rows[0].total}  |  Vegan: ${rows[0].vegan}  |  Non-vegan: ${rows[0].non_vegan}`);

  await client.end();
  console.log('\n✅ Migration complete — tags are now flexible TEXT arrays');
}

main().catch(err => { console.error(err); process.exit(1); });
