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
import zlib from 'node:zlib';
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
  /* Place search for an event's location: this stand-in, not OpenStreetMap. */
  PLACES_BASE_URL: `http://127.0.0.1:${STRATUS_PORT}`,
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
const { forgetEventRows } = await import('./events.js');
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
/* Noahgram (FOR-CONSOLE-NOAHGRAM.md). Two posts waiting (a picture and a reel), two live (one by a member, one the office wrote with a
   plain link), one the office already took down, and comments under the live one. Times are relative to now, so waiting times
   read sensibly whenever the harness is started. */
const istStamp = (msAgo) => new Date(Date.now() - msAgo + 330 * 60_000).toISOString().slice(0, 19).replace('T', ' ') + ':000';
const HOUR = 3_600_000;
const GRAM = {
  pic: '27145000000181001', reel: '27145000000181002', live: '27145000000181003', office: '27145000000181004', gone: '27145000000181005',
  cMember: '27145000000183001', cReply: '27145000000183002', cGone: '27145000000183003',
};
/* A 96x72 PNG in one flat colour that depends on the file id, so different pictures look different. */
function plainPng(seed) {
  const n = Number(String(seed).slice(-3));
  const rgb = [90 + (n * 37) % 120, 70 + (n * 91) % 140, 160 + (n * 53) % 90];
  const w = 96, h = 72;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1); raw[o] = 0; raw.set(rgb, o + 1 + x * 3); }
  const crcTable = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); t.copy(out, 4); out.writeUInt32BE(crc(t), 8 + data.length); return out; };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const gramFile = (id, name, mimeType, purpose, fileType) => ({ ROWID: id, uid: M.approved, path: '2714500000018' + id.slice(-4), fileType, extension: name.split('.').pop(), size: 2048, archived: false, CREATEDTIME: istStamp(HOUR), remoteSource: JSON.stringify({ name, mimeType, purpose }) });
tables[T.files].push(
  gramFile('27145000000182001', 'post.png', 'image/png', 'post', 1),
  gramFile('27145000000182002', 'reel.mp4', 'video/mp4', 'reel', 3),
  gramFile('27145000000182003', 'reel-still.png', 'image/png', 'post', 1),
  gramFile('27145000000182004', 'live.png', 'image/png', 'post', 1),
);
tables[T.noahGram].push(
  { ROWID: GRAM.pic, memberId: M.approved, caption: 'Sunday worship at Andheri: what a morning.', photo: 'file:27145000000182001', isApproved: false, isArchived: false, likes: 0, comments: 0, counter: 0, CREATEDTIME: istStamp(52 * HOUR) },
  { ROWID: GRAM.reel, memberId: M.office, caption: 'A short testimony from last night.', cloudflareLink: 'file:27145000000182002', videoImage: 'file:27145000000182003', addToReels: 1, isApproved: false, isArchived: false, likes: 0, comments: 0, counter: 0, CREATEDTIME: istStamp(5 * HOUR) },
  { ROWID: GRAM.live, memberId: M.approved, caption: 'Thank you for praying with us.', photo: 'file:27145000000182004', isApproved: true, isArchived: false, likes: 3, comments: 2, counter: 40, CREATEDTIME: istStamp(30 * HOUR) },
  { ROWID: GRAM.office, memberId: '', caption: 'Join us for the Christmas carol night.', photo: 'https://example.com/carols.jpg', isApproved: true, isArchived: false, likes: 9, comments: 0, counter: 120, CREATEDTIME: istStamp(80 * HOUR) },
  { ROWID: GRAM.gone, memberId: M.office, caption: 'Taken down by the office.', photo: 'file:27145000000182001', isApproved: false, isArchived: true, likes: 0, comments: 0, counter: 0, CREATEDTIME: istStamp(120 * HOUR) },
);
tables[T.comments].push(
  { ROWID: GRAM.cMember, component: 2, componentId: GRAM.live, memberId: M.office, parentId: '', content: 'Amen, praying for you all.', isArchived: false, notApproved: false, CREATEDTIME: istStamp(20 * HOUR) },
  { ROWID: GRAM.cReply, component: 2, componentId: GRAM.live, memberId: M.approved, parentId: GRAM.cMember, content: 'Thank you.', isArchived: false, notApproved: false, CREATEDTIME: istStamp(19 * HOUR) },
  { ROWID: GRAM.cGone, component: 2, componentId: GRAM.live, memberId: M.office, parentId: '', content: 'A comment already removed.', isArchived: true, notApproved: false, CREATEDTIME: istStamp(25 * HOUR) },
);
/* Reported comments (FOR-CONSOLE-REPORTS-AND-EDUCATION.md): one on a Daily Manna reported by three members (so the API has hidden it),
   with a reply, and one on the office's Noahgram post reported once. A comment with no reports, and one already removed, are not listed. */
const REPORTED = { manna: '27145000000184001', cManna: '27145000000185001', cMannaReply: '27145000000185002', cPost: '27145000000185003', cClean: '27145000000185004', cRemoved: '27145000000185005' };
(tables['tbl:dailyMana'] ||= []).push({ ROWID: REPORTED.manna, title: 'Faith that moves mountains', comments: 3 });
tables[T.comments].push(
  { ROWID: REPORTED.cManna, component: 1, componentId: REPORTED.manna, memberId: M.office, parentId: '', content: 'A rude comment under the Manna.', flagged: 3, hide: 1, isArchived: false, notApproved: false, createdOn: new Date(Date.now() - 30 * HOUR).toISOString().slice(0, 19).replace('T', ' '), CREATEDTIME: istStamp(30 * HOUR) },
  { ROWID: REPORTED.cMannaReply, component: 1, componentId: REPORTED.manna, memberId: M.approved, parentId: REPORTED.cManna, content: 'Please be kind.', flagged: 0, hide: 0, isArchived: false, notApproved: false, createdOn: new Date(Date.now() - 29 * HOUR).toISOString().slice(0, 19).replace('T', ' '), CREATEDTIME: istStamp(29 * HOUR) },
  { ROWID: REPORTED.cPost, component: 2, componentId: GRAM.office, memberId: M.approved, parentId: '', content: 'Buy cheap watches here.', flagged: 1, hide: 0, isArchived: false, notApproved: false, createdOn: new Date(Date.now() - 6 * HOUR).toISOString().slice(0, 19).replace('T', ' '), CREATEDTIME: istStamp(6 * HOUR) },
  { ROWID: REPORTED.cClean, component: 1, componentId: REPORTED.manna, memberId: M.office, parentId: '', content: 'Thank you for this word.', flagged: 0, hide: 0, isArchived: false, notApproved: false, CREATEDTIME: istStamp(10 * HOUR) },
  { ROWID: REPORTED.cRemoved, component: 1, componentId: REPORTED.manna, memberId: M.office, parentId: '', content: 'Already removed.', flagged: 4, hide: 1, isArchived: true, notApproved: false, CREATEDTIME: istStamp(40 * HOUR) },
);
/* Who reported them: component 3 is a Manna comment, 4 a Noahgram comment. */
(tables['tbl:flaggedComponentStats'] ||= []).push(
  { ROWID: '27145000000186001', memberId: M.approved, component: 3, componentId: REPORTED.cManna, created: new Date(Date.now() - 29 * HOUR).toISOString().slice(0, 19).replace('T', ' ') },
  { ROWID: '27145000000186002', memberId: M.boss, component: 3, componentId: REPORTED.cManna, created: new Date(Date.now() - 28 * HOUR).toISOString().slice(0, 19).replace('T', ' ') },
  { ROWID: '27145000000186003', memberId: M.pastor, component: 3, componentId: REPORTED.cManna, created: new Date(Date.now() - 27 * HOUR).toISOString().slice(0, 19).replace('T', ' ') },
  { ROWID: '27145000000186004', memberId: M.office, component: 4, componentId: REPORTED.cPost, created: new Date(Date.now() - 6 * HOUR).toISOString().slice(0, 19).replace('T', ' ') },
);
/* Who the fake Noah API has told about a Noahgram decision. */
const gramTold = [];

/* Registrations whose member the fake Noah API has already told. */
const told = new Set();
/* Events the fake Noah API has already announced. */
const announced = new Set();
/* The door, per event: when the one test pass was admitted, and the audit trail. */
const doorState = {};
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

  /* How many rows a fake table holds, for tests that check something was removed. */
  if (req.method === 'GET' && path === '/_fake/count') return send(res, 200, { count: (tables['tbl:' + url.searchParams.get('table')] || []).length });

  /* Who the fake Noah API told about a Noahgram decision, as { post, type } in order. */
  if (req.method === 'GET' && path === '/_fake/noahgram-told') return send(res, 200, { told: gramTold });

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

  /* Put rows straight into a NOAH table (by name, e.g. 'events', 'passes'), for tests that need bookings. */
  if (req.method === 'POST' && path === '/_fake/insert') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const { table, rows } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const list = (tables[`tbl:${table}`] ||= []);
    for (const r of rows || []) list.push({ CREATEDTIME: '2026-11-10 10:00:00', ...r, ROWID: String(r.ROWID) });
    S.clearCache();
    forgetEventRows();
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
    /* A Noahgram picture is a real (small, plain) PNG, so the screen can be seen showing one. Everything else is marker text. */
    if (meta.purpose === 'post' && meta.mimeType === 'image/png') return send(res, 200, plainPng(f.ROWID), { 'content-type': 'image/png' });
    return send(res, 200, Buffer.from(`FAKE-${meta.purpose || 'file'}-BYTES`), { 'content-type': meta.mimeType || 'application/octet-stream' });
  }

  /* ADMIN_INTEGRATION.md: notify tells the member about a decision ALREADY stored, once. A decision
     made through the API tells them at the time, so it is recorded here and asking again says so. */
  /* `announce` is the newer name (FOR-CONSOLE-REJECTED-REGISTRATIONS.md); the live API still has only `notify` (13 Nov 2026). */
  if (req.method === 'POST' && (m = path.match(/^\/admin\/registrations\/(\d+)\/(?:notify|announce)$/))) {
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
      /* FOR-CONSOLE-REJECTED-REGISTRATIONS.md: the member's message is kept in notifications, the note after a fixed sentence. */
      if (m[2] === 'reject') {
        (tables['tbl:notifications'] ||= []).push({
          ROWID: String(27145000000190000 + tables['tbl:notifications'].length), type: 'registration_rejected',
          notifiable_type: 'Member', notifiable_id: String(r.memberRowId),
          /* CREATEDTIME is IST in Catalyst. */
          CREATEDTIME: new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 19).replace('T', ' ') + ':000',
          data: JSON.stringify({ title: 'Please correct your registration', body: `Some of your details need to be corrected. Open the Noah app, make the changes and submit your registration again. ${body.note || ''}`.trim() }),
        });
      }
    }
    S.clearCache();
    return send(res, 200, { id: r.ROWID, status: r.status, notified: { pushed: 0, emailed: true } });
  }
  /* ADMIN_INTEGRATION.md, "Profile change requests": the list, and the decision that writes the member's column in the
     right format and sends the member a push. The harness applies a value with the console's own map. */
  if (req.method === 'GET' && path === '/admin/profile-requests') {
    const want = url.searchParams.get('status') || 'pending';
    /* The live Noah function answers 500 "Something went wrong. Try again." for status=rejected (checked 4 Nov 2026), while
       pending and approved work. The console must keep working when that happens, so the fake does the same. */
    if (want === 'rejected') return err(res, 500, 'server_error', 'Something went wrong. Try again.');
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
  /* FOR-CONSOLE-NOAHGRAM.md: the posts waiting, and the decision that makes one live (or archives it) and tells the author. */
  if (req.method === 'GET' && path === '/admin/noahgram/pending') {
    const nameOf = (id) => { const x = tables[T.members].find((mm) => mm.ROWID === String(id)); return x ? [x.firstName, x.lastName].filter(Boolean).join(' ') : null; };
    return send(res, 200, {
      posts: tables[T.noahGram].filter((p) => !p.isApproved && !p.isArchived).map((p) => ({
        id: p.ROWID, memberId: p.memberId, author: { id: p.memberId, name: nameOf(p.memberId), photo: null },
        caption: p.caption, isReel: !!p.addToReels, file: p.addToReels ? p.cloudflareLink : p.photo,
        createdAt: new Date(String(p.CREATEDTIME).slice(0, 19).replace(' ', 'T') + '+05:30').toISOString(),
      })),
    });
  }
  if (req.method === 'POST' && (m = path.match(/^\/admin\/noahgram\/posts\/(\d+)\/decide$/))) {
    const p = tables[T.noahGram].find((x) => x.ROWID === m[1]);
    if (!p) return err(res, 404, 'post_not_found', 'No such post.');
    if (!['approve', 'reject'].includes(body.decision)) return err(res, 400, 'bad_decision', 'Decide approve or reject.');
    if (p.isArchived) return err(res, 409, 'not_pending', 'That post is already down.');
    if (body.decision === 'approve') {
      if (p.isApproved) return err(res, 409, 'not_pending', 'That post is already live.');
      p.isApproved = true;
      gramTold.push({ post: p.ROWID, type: 'noahgram_post_approved' });
    } else {
      p.isApproved = false; p.isArchived = true; p.rejectNote = body.note || '';
      gramTold.push({ post: p.ROWID, type: 'noahgram_post_rejected', note: body.note || '' });
    }
    S.clearCache();
    return send(res, 200, { id: p.ROWID, approved: !!p.isApproved, archived: !!p.isArchived, notified: { pushed: 1 } });
  }
  /* Noah backend README, "Telling members about a new event". An event is announced once; 3 approved members match, 2 have a phone. */
  const eventsTable = () => tables['tbl:events'] || [];
  const publishMs = (e) => new Date(String(e.publishDateTime || '').replace(' ', 'T').slice(0, 19) + '+05:30').getTime();
  const announceOne = (e, force) => {
    if (e.isArchived === true || e.isArchived === 'true') return { error: [409, 'event_archived', 'archived'] };
    if (e.isInvisible === true || e.hideFromPublic === true) return { error: [409, 'event_hidden', 'hidden'] };
    if (publishMs(e) > Date.now()) return { error: [409, 'not_published_yet', 'not published yet', { publishAt: new Date(publishMs(e)).toISOString() }] };
    if (announced.has(e.ROWID) && !force) return { ok: { alreadySent: true } };
    announced.add(e.ROWID);
    return { ok: { event: { id: e.ROWID, name: e.name }, members: 3, notified: 2 } };
  };
  if (req.method === 'POST' && path === '/admin/events/announce-due') {
    const hours = Math.min(24, Math.max(1, Number(body.hours) || 24));
    const due = eventsTable().filter((e) => publishMs(e) <= Date.now() && publishMs(e) > Date.now() - hours * 3600_000 && !announced.has(e.ROWID));
    const done = due.map((e) => ({ e, r: announceOne(e, false) })).filter((x) => x.r.ok?.event);
    return send(res, 200, { announced: done.length, events: done.map((x) => x.e.ROWID) });
  }
  if (req.method === 'POST' && (m = path.match(/^\/admin\/events\/(\d+)\/announce$/))) {
    const e = eventsTable().find((x) => x.ROWID === m[1]);
    if (!e) return err(res, 404, 'event_not_found', 'No such event.');
    const r = announceOne(e, body.force === true);
    if (r.error) return send(res, r.error[0], { error: { code: r.error[1], message: r.error[2], ...(r.error[3] || {}) } });
    return send(res, 200, r.ok);
  }
  /* EVENTS-QR-CONTRACT.md: one booking per event, reference KS-TEST-1, token KSP1.<pass>.sig */
  if ((m = path.match(/^\/admin\/events\/(\d+)\/(scan|attendance|attendance\/export|attendance\/audit|attendance\/correct)$/))) {
    const [, eventId, what] = m;
    const ev = eventsTable().find((x) => x.ROWID === eventId);
    if (!ev) return err(res, 404, 'event_not_found', 'No such event.');
    const st = (doorState[eventId] ||= { admittedAt: null, trail: [] });
    const member = { id: M.approved, name: 'Anand Rao', number: 'M0001', photoFileId: null };
    const pass = { id: '900' + eventId.slice(-6), reference: 'KS-TEST-1', bookedAt: '2026-11-10T10:00:00.000Z', attendedAt: st.admittedAt };
    const base = { event: { id: eventId, name: ev.name, start: ev.startTimeUtc || null }, pass, member };
    if (what === 'scan') {
      const ok = body.token === `KSP1.${pass.id}.sig` || body.reference === 'KS-TEST-1';
      if (!ok) return send(res, 200, { result: 'invalid', ok: false, message: 'Invalid QR: this QR code is not recognised.' });
      if (st.admittedAt) return send(res, 200, { result: 'already_scanned', ok: false, message: 'Already Scanned: this member has already been marked present.', ...base });
      if (!body.confirm) return send(res, 200, { result: 'valid', ok: true, message: 'Valid Pass: entry verified successfully.', ...base });
      st.admittedAt = new Date().toISOString();
      st.trail.unshift({ at: st.admittedAt, action: body.token ? 'admit_qr' : 'admit_reference', result: 'admitted', staff: { id: body.staffId || null, name: req.headers['x-admin-name'] || '' }, deviceRef: body.deviceRef || null, reason: null, passId: pass.id, member: { id: member.id, name: member.name } });
      return send(res, 200, { result: 'admitted', ok: true, message: 'Admitted: attendance has been recorded.', ...base, pass: { ...pass, attendedAt: st.admittedAt } });
    }
    if (what === 'attendance') {
      const inn = st.admittedAt ? 1 : 0;
      return send(res, 200, { event: { id: eventId, name: ev.name, start: ev.startTimeUtc || null, scanningOpen: true }, registered: 1, confirmed: 1, checkedIn: inn, notYetArrived: 1 - inn, cancelled: 0, attendancePercent: inn * 100, capped: false, recent: st.admittedAt ? [{ at: st.admittedAt, manual: false, member: { id: member.id, name: member.name } }] : [] });
    }
    if (what === 'attendance/export') {
      res.writeHead(200, { 'content-type': 'text/csv' });
      return res.end(`Reference,Member number,Name,Status,Booked at,Scanned at,Scanned by (staff id)\nKS-TEST-1,M0001,Anand Rao,${st.admittedAt ? 'Present' : 'Booked'},2026-11-10T10:00:00Z,${st.admittedAt || ''},\n`);
    }
    if (what === 'attendance/audit') return send(res, 200, { trail: st.trail });
    if (what === 'attendance/correct') {
      if (String(body.reason || '').trim().length < 3) return err(res, 400, 'reason_required', 'A reason is required.');
      st.admittedAt = body.action === 'present' ? new Date().toISOString() : null;
      st.trail.unshift({ at: new Date().toISOString(), action: body.action === 'present' ? 'correct_present' : 'correct_absent', result: 'ok', staff: { id: body.staffId || null, name: req.headers['x-admin-name'] || '' }, deviceRef: null, reason: body.reason, passId: pass.id, member: { id: member.id, name: member.name } });
      return send(res, 200, { ok: true, pass: { ...pass, attendedAt: st.admittedAt } });
    }
  }
  if (req.method === 'GET' && path === '/admin/diagnostics/events') {
    return send(res, 200, { events: eventsTable().slice(-10).map((e) => {
      const f = (() => { try { return JSON.parse(e.filters || '{}'); } catch { return {}; } })();
      const notes = [];
      if (f.forPastor || f.forLeader || f.forVip || f.forPrayerWarrior) notes.push('Only for some roles: an ordinary member does not see it.');
      if (!e.passRequired) notes.push('No pass is needed, so it cannot be booked.');
      return { id: e.ROWID, name: e.name, shownToMembers: !e.isArchived && !e.isInvisible && !e.hideFromPublic, notes };
    }) });
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
    if ('scanner' in body) {
      const u = tables[T.users].find((x) => x.ROWID === String(mem.userId));
      if (u) u.is_employee = !!body.scanner;
    }
    S.clearCache();
    const u = tables[T.users].find((x) => x.ROWID === String(mem.userId));
    return send(res, 200, { id: mem.ROWID, pastor: mem.memberType === 'pastor', roles: [mem.memberType === 'pastor' && 'pastor', u?.is_employee && 'scanner'].filter(Boolean) });
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
  /* A stand-in for "what is at this point" (Nominatim's /reverse): always a hall in Dadar. */
  if (key === '/reverse') {
    const sp = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ osm_type: 'way', osm_id: 2001, lat: sp.get('lat'), lon: sp.get('lon'), name: 'Dadar Community Hall', display_name: 'Dadar Community Hall, Dadar West, Mumbai, Maharashtra, India', address: { suburb: 'Dadar West', city: 'Mumbai', state: 'Maharashtra', country: 'India' } }));
  }
  /* A stand-in for the map search (Nominatim's /search). */
  if (key === '/search') {
    const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').toLowerCase();
    const all = [
      { osm_type: 'node', osm_id: 1001, lat: '19.018', lon: '72.843', name: 'Dadar', display_name: 'Dadar, Mumbai, Maharashtra, India', address: { suburb: 'Dadar', city: 'Mumbai', state: 'Maharashtra', country: 'India' } },
      { osm_type: 'way', osm_id: 1002, lat: '19.119', lon: '72.846', name: 'Andheri East Community Hall', display_name: 'Andheri East Community Hall, Andheri East, Mumbai, Maharashtra, 400069, India', address: { suburb: 'Andheri East', city: 'Mumbai', state: 'Maharashtra', country: 'India' } },
      { osm_type: 'node', osm_id: 1003, lat: '18.520', lon: '73.856', name: 'Pune', display_name: 'Pune, Pune District, Maharashtra, India', address: { city: 'Pune', state: 'Maharashtra', country: 'India' } },
    ].filter((p) => p.display_name.toLowerCase().includes(q));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(all));
  }
  if (req.method === 'GET') {
    const f = stored.get(key);
    if (!f) { res.writeHead(404); return res.end(); }
    /* PRIVATE_BUCKET=1: a bucket that takes uploads and refuses every public read. */
    if (process.env.OFFLINE_PRIVATE_BUCKET) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"status":403,"code":"access_forbidden"}'); }
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
