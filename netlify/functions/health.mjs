import pg from 'pg';
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
export const handler = async () => {
  if (!process.env.DATABASE_URL) return json(503, { ok: false, db: 'down', error: 'DATABASE_URL is not configured on the server.' });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try { await c.connect(); await c.query('select 1'); await c.end(); return json(200, { ok: true, db: 'up' }); }
  catch (e) { try { await c.end(); } catch {} return json(503, { ok: false, db: 'down', error: String(e.message || e) }); }
};
