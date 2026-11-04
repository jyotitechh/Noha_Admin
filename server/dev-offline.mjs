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
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const PORT = process.env.PORT || '4300';
const NOAH_PORT = process.env.NOAH_PORT || '4301';
const STRATUS_PORT = process.env.STRATUS_PORT || '4302';
const KEY = 'offline-admin-key';

/* Set BEFORE anything imports catalyst.js, which reads the environment once.
   The real credentials in .env.local are overridden so nothing is ever signed
   with them. Values set here win, but one left empty (the no-key run) would be filled in from .env.local, so the file is
   pointed at nothing: offline never reads the real one. */
Object.assign(process.env, {
  CATALYST_ENV_FILE: resolve(tmpdir(), 'ksm-offline-no-env-file'),
  PORT,
  CATALYST_SCHEMA: 'noah',
  CATALYST_PROJECT_ID: 'offline',
  CATALYST_ORG_ID: 'offline',
  CATALYST_CLIENT_ID: 'offline',
  CATALYST_CLIENT_SECRET: 'offline',
  CATALYST_REFRESH_TOKEN: 'offline',
  NOAH_API_BASE: `http://127.0.0.1:${NOAH_PORT}`,
  NOAH_ADMIN_API_KEY: process.env.OFFLINE_NO_KEY ? '' : KEY,
  /* Pictures dropped on a content form go to a Stratus bucket; this is the stand-in for it. */
  ...(process.env.OFFLINE_NO_STRATUS ? { STRATUS_BUCKET: '' } : {
    STRATUS_BUCKET: 'offline-bucket',
    STRATUS_BASE_URL: `http://127.0.0.1:${STRATUS_PORT}`,
    CATALYST_ACCOUNTS_HOST: `http://127.0.0.1:${STRATUS_PORT}`,
  }),
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

const { S, T, tables, reset, seed, makeReady, setOutage, removeTable, restoreTable, contentTableId } = await import('./fake-catalyst.mjs');
const { forgetTables } = await import('./content.js');
reset(seed());
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* ---------- a stand-in for the Noah API, from ADMIN_INTEGRATION.md ---------- */

const find = (id) => tables[T.appRegistrations].find((r) => r.ROWID === id);

/* Requests members have filed from Me > Family. Four pending: a child under 18 and a brother who is a member (both for
   Anand), a sister and a mother who have not joined yet; plus two already decided, so the status filter has something to show. */
const { M } = await import('./fake-catalyst.mjs');
const { resolveChange, normStatus } = await import('./change-fields.js');
let idSeq = 27145000000190000;
const nextId = () => String(++idSeq);
const familyRequests = [
  { id: '100596000000071001', state: 'Pending', relation: 'daughter', kid: true, name: 'Hannah Rao', gender: 'female', dob: '2018-03-09', mobile: null, note: '', requesterId: M.approved, existingMemberId: null, at: '2026-11-01T10:00:00.000Z' },
  { id: '100596000000071002', state: 'Pending', relation: 'brother', kid: false, name: 'Fr Thomas', gender: 'male', dob: null, mobile: '+919000000100', note: 'My younger brother', requesterId: M.approved, existingMemberId: M.pastor, at: '2026-11-02T08:30:00.000Z' },
  { id: '100596000000071003', state: 'Pending', relation: 'sister', kid: false, name: 'Maria Varghese', gender: 'female', dob: null, mobile: '+919000000999', note: '', requesterId: M.boss, existingMemberId: null, at: '2026-11-02T12:00:00.000Z' },
  { id: '100596000000071006', state: 'Pending', relation: 'mother', kid: false, name: 'Grace Member', gender: 'female', dob: null, mobile: '+919000000777', note: '', requesterId: M.office, existingMemberId: null, at: '2026-11-02T15:00:00.000Z' },
  { id: '100596000000071004', state: 'Approved', relation: 'spouse', kid: false, name: 'Old Member', gender: 'male', dob: null, mobile: '+919000000778', note: '', requesterId: M.approved, existingMemberId: M.office, at: '2026-10-20T09:00:00.000Z' },
  { id: '100596000000071005', state: 'Cancelled', relation: 'other', kid: false, name: 'Someone', gender: null, dob: null, mobile: '+919000000888', note: '', requesterId: M.boss, existingMemberId: null, at: '2026-10-25T09:00:00.000Z' },
];
/* Registrations whose member the fake Noah API has already told. */
const told = new Set();
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

  /* A content table leaves the project, or comes back. */
  if (req.method === 'POST' && path === '/_fake/table') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { table, present } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (present === false) removeTable(table); else restoreTable(table);
    forgetTables();
    return send(res, 200, { ok: true, id: contentTableId(table) || null });
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

  /* ADMIN_INTEGRATION.md: notify tells the member about a decision ALREADY stored, once. A decision
     made through the API tells them at the time, so it is recorded here and asking again says so. */
  if (req.method === 'POST' && (m = path.match(/^\/admin\/registrations\/(\d+)\/notify$/))) {
    const r = find(m[1]);
    if (!r) return err(res, 404, 'registration_not_found', 'No such registration.');
    if (r.status === 'pending' || r.status === 'draft') return err(res, 409, 'not_decided', 'There is no decision to tell them about.');
    if (told.has(m[1])) return send(res, 200, { id: r.ROWID, status: r.status, alreadySent: true });
    told.add(m[1]);
    return send(res, 200, { id: r.ROWID, status: r.status, notified: { pushed: 1, emailed: false } });
  }

  if (req.method === 'POST' && (m = path.match(/^\/admin\/registrations\/(\d+)\/(approve|reject|return-video)$/))) {
    const r = find(m[1]);
    if (!r) return err(res, 404, 'registration_not_found', 'No such registration.');
    /* "A registration can be decided once. A second call returns 409." */
    if (r.status !== 'pending') return err(res, 409, 'not_pending', 'Already decided.');
    told.add(m[1]);

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
  /* ADMIN_INTEGRATION.md, "Profile change requests": the list, and the decision that writes the member's column in the
     right format and sends the member a push. The harness applies a value with the console's own map. */
  if (req.method === 'GET' && path === '/admin/profile-requests') {
    const want = url.searchParams.get('status') || 'pending';
    const name = (id) => { const x = tables[T.members].find((m) => m.ROWID === String(id)); return x ? [x.firstName, x.lastName].filter(Boolean).join(' ') : null; };
    return send(res, 200, {
      requests: tables[T.appChangeRequests].filter((r) => normStatus(r.status) === want).map((r) => ({
        id: r.ROWID, memberRowId: r.memberRowId, memberName: name(r.memberRowId), fieldId: r.fieldId,
        oldValue: r.oldValue ?? '', newValue: r.newValue ?? '', status: normStatus(r.status), note: r.note || '',
        createdAt: new Date(String(r.CREATEDTIME).slice(0, 19).replace(' ', 'T') + '+05:30').toISOString(),
        ...(r.fieldId === 'photo' ? { newFileUrl: '/admin/files/' + r.newValue, oldFileUrl: r.oldValue ? '/admin/files/' + r.oldValue : null } : {}),
      })),
    });
  }
  if (req.method === 'POST' && (m = path.match(/^\/admin\/profile-requests\/(\d+)\/decide$/))) {
    const r = tables[T.appChangeRequests].find((x) => x.ROWID === m[1]);
    if (!r) return err(res, 404, 'request_not_found', 'No such request.');
    if (normStatus(r.status) !== 'pending') return err(res, 409, 'not_pending', 'Already decided.');
    if (!['approve', 'reject'].includes(body.decision)) return err(res, 400, 'bad_decision', 'Decide approve or reject.');
    if (body.decision === 'approve') {
      if (r.fieldId === 'phone1') return err(res, 409, 'change_by_hand', 'This is the sign-in number.');
      const mem = tables[T.members].find((x) => x.ROWID === String(r.memberRowId));
      const plan = resolveChange(r.fieldId, r.newValue, mem);
      if (plan.error) return err(res, 422, 'invalid_value', plan.error);
      for (const p of plan.parts) mem[p.column] = p.value;
      r.status = 'approved';
    } else {
      r.status = 'rejected';
      r.note = body.note || '';
    }
    r.reviewedAt = stamp();
    S.clearCache();
    return send(res, 200, { id: r.ROWID, status: r.status, notified: { pushed: 1 } });
  }

  /* ADMIN_INTEGRATION.md, "Family requests": the inbox, and the decision that links both accounts (or adds a child). */
  if (req.method === 'GET' && path === '/admin/family-requests') {
    const want = url.searchParams.get('state') || 'Pending';
    const mem = (id) => tables[T.members].find((x) => x.ROWID === String(id));
    const nameOf = (x) => (x ? [x.firstName, x.lastName].filter(Boolean).join(' ') : null);
    return send(res, 200, {
      requests: familyRequests.filter((r) => r.state === want).map((r) => {
        const who = mem(r.requesterId);
        const there = r.existingMemberId ? mem(r.existingMemberId) : null;
        return {
          ...r,
          requesterName: nameOf(who), requesterMobile: who ? `${who.countryCode}${who.mobileNumber1}` : null,
          existingMemberName: nameOf(there),
        };
      }),
    });
  }
  if (req.method === 'POST' && (m = path.match(/^\/admin\/family-requests\/(\d+)\/decide$/))) {
    const r = familyRequests.find((x) => x.id === m[1]);
    if (!r) return err(res, 404, 'family_request_not_found', 'No such family request.');
    if (r.state !== 'Pending') return err(res, 409, 'not_pending', 'Already decided.');
    if (!['Approved', 'Rejected'].includes(body.decision)) return err(res, 400, 'bad_decision', 'Decide Approved or Rejected.');
    r.state = body.decision;
    r.remark = body.remark || '';
    if (body.decision === 'Approved') {
      const me = tables[T.members].find((x) => x.ROWID === String(r.requesterId));
      if (r.kid) {
        const [first, ...rest] = r.name.split(' ');
        const kidId = nextId();
        tables[T.kids].push({ ROWID: kidId, id: kidId, firstName: first, lastName: rest.join(' '), gender: r.gender === 'male' ? 1 : 2, dateOfBirth: `${r.dob} 00:00:00`, archived: false });
        const linkId = nextId();
        tables[T.kidsConnect].push({ ROWID: linkId, id: linkId, kidId, memberId: r.requesterId, relationship: 9, isArchived: false });
      } else {
        const other = body.memberId || r.existingMemberId;
        if (other) {
          /* One row, both directions: A2B is what B is to A, B2A what A is to B. */
          const code = { spouse: 1, son: 2, daughter: 3, father: 4, mother: 5, brother: 6, sister: 7, other: 8 }[r.relation];
          const male = Number(me?.gender) === 1;
          const back = { 1: 1, 8: 8, 2: male ? 4 : 5, 3: male ? 4 : 5, 4: male ? 2 : 3, 5: male ? 2 : 3, 6: male ? 6 : 7, 7: male ? 6 : 7 }[code];
          const id = nextId();
          tables[T.membersRelations].push({ ROWID: id, id, memberIdA: r.requesterId, memberIdB: String(other), relationshipA2B: code, relationshipB2A: back, isArchived: false });
        }
      }
    }
    S.clearCache();
    return send(res, 200, { id: r.id, state: r.state, notified: { pushed: 2, emailed: false } });
  }
  /* ADMIN_SETUP.md: POST /admin/members/:id/roles { pastor?, admin? }, only what changes. */
  if (req.method === 'POST' && (m = path.match(/^\/admin\/members\/(\d+)\/roles$/))) {
    const mem = tables[T.members].find((x) => x.ROWID === m[1]);
    if (!mem) return err(res, 404, 'member_not_found', 'No such member.');
    if ('pastor' in body) mem.memberType = body.pastor ? 'pastor' : 'member';
    if ('admin' in body) {
      const u = tables[T.users].find((x) => x.ROWID === String(mem.userId));
      if (u) u.is_admin = !!body.admin;
    }
    S.clearCache();
    return send(res, 200, { id: mem.ROWID, pastor: mem.memberType === 'pastor' });
  }
  err(res, 404, 'not_found', 'No such endpoint.');
}).listen(Number(NOAH_PORT), '127.0.0.1');

/* ---------- a stand-in for the Stratus bucket ----------
   PUT <bucket>/<key> with Authorization: Zoho-oauthtoken, as Catalyst documents it; GET serves it back,
   as a public bucket would. */
const stored = new Map();
http.createServer(async (req, res) => {
  const key = new URL(req.url, 'http://x').pathname;
  /* Also stands in for accounts.zoho.in: an upload signs in to Catalyst first, and the real one is refused here. */
  if (key === '/oauth/v2/token') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ access_token: 'offline-access-token', expires_in: 3600 }));
  }
  if (req.method === 'GET') {
    const f = stored.get(key);
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f.type });
    return res.end(f.buf);
  }
  if (req.method === 'PUT') {
    const chunks = []; for await (const c of req) chunks.push(c);
    if (!/^Zoho-oauthtoken /.test(req.headers.authorization || '')) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"access_forbidden"}'); }
    if (stored.has(key)) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end('{"error":"key_already_exists"}'); }
    stored.set(key, { buf: Buffer.concat(chunks), type: req.headers['content-type'] || 'application/octet-stream' });
    res.writeHead(200); return res.end();
  }
  res.writeHead(405); res.end();
}).listen(Number(STRATUS_PORT), '127.0.0.1');

/* ---------- the real server, on the fake ---------- */

await import('./index.js');
console.log(`  Offline: fake Catalyst + ${process.env.OFFLINE_NO_KEY ? 'NO Noah API key (fallback path)' : `fake Noah API on :${NOAH_PORT}`}`);
console.log(`  Nothing here can reach the internet.\n`);
