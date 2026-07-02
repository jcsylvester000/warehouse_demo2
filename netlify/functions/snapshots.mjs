import pg from 'pg';
const SLUG = process.env.WMS_WORKSPACE_SLUG || 'carease-default';
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
export const handler = async (event) => {
  if (!process.env.DATABASE_URL) return json(503, { ok: false, db: 'down', error: 'DATABASE_URL is not configured on the server.' });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const q = event.queryStringParameters || {};
    const slug = q.slug || SLUG;
    const lim = Math.min(Number(q.limit) || 20, 100);
    const r = await c.query('select id,version,note,"createdAt" from "StateSnapshot" where workspace=$1 order by version desc limit $2', [slug, lim]);
    await c.end();
    return json(200, r.rows);
  } catch (e) { try { await c.end(); } catch {} return json(500, { error: String(e.message || e) }); }
};
