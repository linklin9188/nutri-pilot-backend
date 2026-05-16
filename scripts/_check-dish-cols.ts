import pg from 'pg';
import { config } from 'dotenv';
config();
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='dishes' ORDER BY ordinal_position`);
  r.rows.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));
  await db.end();
})();
