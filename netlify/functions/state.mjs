import pg from 'pg';
const SLUG = process.env.WMS_WORKSPACE_SLUG || 'carease-default';
const json = (s, b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
export const handler = async (event) => {
  if (!process.env.DATABASE_URL) return json(503, { ok: false, db: 'down', error: 'DATABASE_URL is not configured on the server.' });
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    if (event.httpMethod === 'GET') {
      const slug = (event.queryStringParameters && event.queryStringParameters.slug) || SLUG;
      const r = await c.query('select slug,label,version,state from "Workspace" where slug=$1', [slug]);
      await c.end();
      if (!r.rowCount) return json(200, { slug, label: 'Carease Warehouse', version: 0, state: null });
      const w = r.rows[0];
      return json(200, { slug: w.slug, label: w.label, version: w.version, state: w.state });
    }
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { slug = SLUG, state, label, note } = body;
      if (state == null || typeof state !== 'object') { await c.end(); return json(400, { error: 'state (object) is required' }); }
      const up = await c.query(
        `insert into "Workspace"(id,slug,label,state,version,"createdAt","updatedAt")
         values (gen_random_uuid()::text,$1,$2,$3::jsonb,1,now(),now())
         on conflict(slug) do update set state=excluded.state, version="Workspace".version+1,
           label=coalesce($2,"Workspace".label), "updatedAt"=now()
         returning version`,
        [slug, label || 'Carease Warehouse', JSON.stringify(state)]);
      const ver = up.rows[0].version;
      try {
        await c.query(
          `insert into "StateSnapshot"(id,workspace,version,state,note,"createdAt")
           values (gen_random_uuid()::text,$1,$2,$3::jsonb,$4,now())`,
          [slug, ver, JSON.stringify(state), note || null]);
      } catch {}
      await c.end();
      return json(200, { slug, version: ver });
    }
    await c.end();
    return json(405, { error: 'method not allowed' });
  } catch (e) { try { await c.end(); } catch {} return json(500, { error: String(e.message || e) }); }
};
