/* The whole server, with no Catalyst and no Noah API behind it.

     npm run dev:offline            the Noah API fake is on     (the real path)
     OFFLINE_NO_KEY=1 npm run dev:offline   no admin key         (the fallback)

   Then point any suite at it:

     node server/contract-test.mjs http://localhost:4300
     node server/test-full-journey.mjs http://localhost:4300
     node server/test-roles.mjs http://localhost:4300

   Why it exists: Catalyst's Data Store free tier ran out once, and every live
   suite spends hundreds of fetches. This runs the same routes, store and
   schema code against an in-memory copy of the tables (fake-catalyst.mjs) and
   a stand-in for the Noah API built from ADMIN_INTEGRATION.md — so the whole
   chain can be checked for nothing.

   It cannot prove Catalyst accepts a given column, or that the real Noah API
   behaves like the stand-in. That is what the live suites and
   `npm run check:schema` are for, when there is allowance to spend.

   SAFETY: every outbound request to anywhere but this machine is refused, so a
   mistake here cannot reach the real project or send a member an email. */

import http from 'node:http';

const PORT = process.env.PORT || '4300';
const NOAH_PORT = process.env.NOAH_PORT || '4301';
const KEY = 'offline-admin-key';

/* Set BEFORE anything imports catalyst.js, which reads the environment once.
   The real credentials in .env.local are overridden so nothing is ever signed
   with them. */
Object.assign(process.env, {
  PORT,
  CATALYST_SCHEMA: 'noah',
  CATALYST_PROJECT_ID: 'offline',
  CATALYST_ORG_ID: 'offline',
  CATALYST_CLIENT_ID: 'offline',
  CATALYST_CLIENT_SECRET: 'offline',
  CATALYST_REFRESH_TOKEN: 'offline',
  NOAH_API_BASE: `http://127.0.0.1:${NOAH_PORT}`,
  NOAH_ADMIN_API_KEY: process.env.OFFLINE_NO_KEY ? '' : KEY,
});
delete process.env.ADMIN_PASSPHRASE;

/* Refuse the outside world. */
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return Promise.reject(new Error(`offline: blocked a request to ${host}`));
  }
  return realFetch(url, init);
};

const { S, T, tables, reset, seed, makeReady, setOutage } = await import('./fake-catalyst.mjs');
reset(seed());
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* ---------- a stand-in for the Noah API, from ADMIN_INTEGRATION.md ---------- */

const find = (id) => tables[T.appRegistrations].find((r) => r.ROWID === id);
const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isBuf ? 'application/octet-stream' : 'application/json', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
};
const err = (res, status, code, message) => send(res, status, { error: { code, message } });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  /* A control hook for tests only: change a row in the fake Catalyst, as if the
     office had edited it there. This process exists only for the offline
     harness, on 127.0.0.1, with no real data behind it. */
  /* Catalyst starts, or stops, refusing every read. */
  if (req.method === 'POST' && path === '/_fake/outage') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { message } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    setOutage(message || null);
    S.clearCache();
    return send(res, 200, { ok: true });
  }

  /* "The Catalyst developer added the columns": a content table starts accepting writes. */
  if (req.method === 'POST' && path === '/_fake/ready') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { table } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    return makeReady(table) ? send(res, 200, { ok: true }) : err(res, 404, 'no_such_table', 'No such content table in the fake.');
  }

  if (req.method === 'POST' && path === '/_fake/patch') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { table, rowId, set } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const row = (tables[T[table]] || []).find((r) => r.ROWID === String(rowId));
    if (!row) return err(res, 404, 'no_such_row', 'No such row in the fake.');
    Object.assign(row, set);
    S.clearCache();
    return send(res, 200, { ok: true });
  }

  if (req.headers['x-admin-key'] !== KEY) return err(res, 401, 'invalid_admin_key', 'The admin key is not valid.');

  let body = {};
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { /* empty */ }
  }

  let m;
  if (req.method === 'GET' && path === '/admin/registrations') {
    const want = url.searchParams.get('status');
    return send(res, 200, tables[T.appRegistrations].filter((r) => !want || r.status === want)
      .map((r) => ({ id: r.ROWID, status: r.status, memberId: r.memberRowId })));
  }
  if (req.method === 'GET' && (m = path.match(/^\/admin\/registrations\/(\d+)$/))) {
    const r = find(m[1]);
    return r ? send(res, 200, { id: r.ROWID, status: r.status, memberId: r.memberRowId }) : err(res, 404, 'registration_not_found', 'No such registration.');
  }
  if (req.method === 'GET' && (m = path.match(/^\/admin\/files\/(\d+)$/))) {
    const f = tables[T.files].find((x) => x.ROWID === m[1]);
    if (!f) return err(res, 404, 'file_not_found', 'No such file.');
    let meta = {}; try { meta = JSON.parse(f.remoteSource); } catch { /* none */ }
    return send(res, 200, Buffer.from(`FAKE-${meta.purpose || 'file'}-BYTES`), { 'content-type': meta.mimeType || 'application/octet-stream' });
  }

  if (req.method === 'POST' && (m = path.match(/^\/admin\/registrations\/(\d+)\/(approve|reject|return-video)$/))) {
    const r = find(m[1]);
    if (!r) return err(res, 404, 'registration_not_found', 'No such registration.');
    /* "A registration can be decided once. A second call returns 409." */
    if (r.status !== 'pending') return err(res, 409, 'not_pending', 'Already decided.');

    r.reviewedAt = stamp();
    r.reviewNote = body.note || '';
    if (m[2] === 'approve') {
      r.status = 'approved';
      /* What ADMIN.md §4 says the API does besides the registration. */
      const mem = tables[T.members].find((x) => x.ROWID === String(r.memberRowId));
      if (mem) { mem.isUnVerified = false; mem.verifiedOn = stamp(); }
      if (body.profileVerified) { r.profileVerified = true; r.profileVerifiedAt = stamp(); }
    } else {
      r.status = m[2] === 'reject' ? 'rejected' : 'videoReturned';
    }
    S.clearCache();
    return send(res, 200, { id: r.ROWID, status: r.status, notified: { pushed: 0, emailed: true } });
  }
  err(res, 404, 'not_found', 'No such endpoint.');
}).listen(Number(NOAH_PORT), '127.0.0.1');

/* ---------- the real server, on the fake ---------- */

await import('./index.js');
console.log(`  Offline: fake Catalyst + ${process.env.OFFLINE_NO_KEY ? 'NO Noah API key (fallback path)' : `fake Noah API on :${NOAH_PORT}`}`);
console.log(`  Nothing here can reach the internet.\n`);
