import pg from 'pg';
import { config } from 'dotenv';
config();
const c = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const { rows: tables } = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  for (const t of tables) {
    const tn = (t as any).table_name;
    const { rows: cnt } = await c.query(`SELECT COUNT(*)::int FROM "${tn}"`);
    console.log(`\n## ${tn} (${(cnt[0] as any).count} rows)`);
    const { rows: cols } = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tn]);
    for (const col of cols) {
      const co = col as any;
      console.log(`  · ${co.column_name} : ${co.data_type}${co.is_nullable === 'NO' ? ' [NOT NULL]' : ''}${co.column_default ? ` default=${co.column_default}` : ''}`);
    }
  }
  await c.end();
})();
