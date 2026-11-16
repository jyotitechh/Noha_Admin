/* Praise reports members send from the Noah app: testimonies of what God has done.
   Read from and decided in Catalyst's `praiseReport` table (the console used to show
   sample data under the name PRAISE, which is not a table in the project).

   What the table holds: memberId, memberName, phoneNumber, email, text (the testimony),
   videoLink, photo1 to photo5, location, comment, isComplete, isFeatured, isClosed,
   isArchived, created / updated (+ By). It has no "approved" column and the Catalyst
   developer has not said what each flag means, so the console uses, and the API should
   use the same:

     waiting    isComplete not true and isArchived not true
     published  isComplete = true          (the office has checked it; it may be shown)
     rejected   isArchived = true          (never shown; nothing is deleted)
     featured   isFeatured = true          (a published one the office puts first)

   The reason for a rejection goes to the audit log, as for prayer requests: `comment`
   may be the member's own words, so it is shown, never overwritten.

   The Noah API has no praise routes yet (16 Nov 2026), so the app cannot send one and
   the table is empty: see docs/FOR-API-PRAISE.md. */

import { io } from './noah-schema.js';
import { listMembers } from './store.js';

const TABLE = 'tbl:praiseReport';
const PHOTOS = ['photo1', 'photo2', 'photo3', 'photo4', 'photo5'];

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const asDate = (v) => {
  if (!v) return null;
  /* `created` is UTC 'YYYY-MM-DD HH:mm:ss'; CREATEDTIME is Catalyst's own, in IST with milliseconds. */
  const s = String(v);
  const ist = /:\d{3}$/.test(s);
  const d = new Date(s.slice(0, 19).replace(' ', 'T') + (ist ? '+05:30' : 'Z'));
  return Number.isNaN(+d) ? null : d;
};
const stampNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const stateOf = (r) => (asBool(r.isArchived) ? 'Rejected' : asBool(r.isComplete) ? 'Published' : 'Pending');

let cache = null;
let cacheAt = 0;
const TTL = 30_000;
export const forgetPraise = () => { cache = null; };

async function raw() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  cache = await io.getRows(TABLE, { max: 3000 });
  cacheAt = Date.now();
  return cache;
}

async function peopleByKey() {
  const by = new Map();
  for (const m of await listMembers({})) {
    by.set(String(m.rowId), m);
    if (m.id) by.set(String(m.id), m);
  }
  return by;
}

function shape(r, people) {
  const who = people.get(String(r.memberId));
  const photos = PHOTOS.map((k) => String(r[k] ?? '').trim()).filter(Boolean);
  return {
    id: String(r.ROWID),
    memberRowId: r.memberId ? String(r.memberId) : '',
    member: who?.id ?? (r.memberId ? String(r.memberId) : ''),
    name: String(r.memberName ?? '').trim() || who?.name || 'A member',
    mobile: String(r.phoneNumber ?? '').trim() || who?.mobile || '',
    email: String(r.email ?? '').trim(),
    text: String(r.text ?? '').trim(),
    videoLink: String(r.videoLink ?? '').trim(),
    photos: photos.length,
    /* A link is shown as it is; null means a stored file, fetched through /api/praise/:id/photo/:n. */
    photoUrls: photos.map((v) => (/^https:\/\//i.test(v) ? v : null)),
    location: String(r.location ?? '').trim(),
    comment: String(r.comment ?? '').trim(),
    featured: asBool(r.isFeatured),
    closed: asBool(r.isClosed),
    state: stateOf(r),
    at: asDate(r.created) ?? asDate(r.CREATEDTIME) ?? new Date(),
    likes: 0,
  };
}

export async function listPraise({ state, search } = {}) {
  const [rows, people] = await Promise.all([raw(), peopleByKey()]);
  let out = rows.map((r) => shape(r, people));
  if (state) out = out.filter((r) => r.state === state);
  if (search) {
    const s = String(search).toLowerCase();
    out = out.filter((r) => [r.text, r.name, r.mobile, r.member, r.location, r.id].some((v) => String(v || '').toLowerCase().includes(s)));
  }
  return out.sort((a, b) => +a.at - +b.at);
}

export async function praiseById(id) {
  const [rows, people] = await Promise.all([raw(), peopleByKey()]);
  const row = rows.find((r) => String(r.ROWID) === String(id));
  return row ? shape(row, people) : null;
}

/** One photo's stored value (a link, or a files ROWID), 1 to 5. */
export async function praisePhoto(id, n) {
  const row = (await raw()).find((r) => String(r.ROWID) === String(id));
  return row ? String(row[PHOTOS[n - 1]] ?? '').trim() : '';
}

/** Publish or reject one waiting report. */
export async function decidePraise(id, publish, { byRowId } = {}) {
  const row = (await raw()).find((r) => String(r.ROWID) === String(id));
  if (!row) return null;
  const patch = { ROWID: String(row.ROWID), updated: stampNow() };
  if (byRowId) patch.updatedBy = String(byRowId);
  if (publish) { patch.isComplete = true; patch.isArchived = false; } else { patch.isArchived = true; patch.isFeatured = false; }
  await io.update(TABLE, patch);
  forgetPraise();
  return { ...row, ...patch };
}

/** Put a published report first on the praise wall, or take it off. */
export async function featurePraise(id, featured, { byRowId } = {}) {
  const row = (await raw()).find((r) => String(r.ROWID) === String(id));
  if (!row) return null;
  const patch = { ROWID: String(row.ROWID), isFeatured: !!featured, updated: stampNow() };
  if (byRowId) patch.updatedBy = String(byRowId);
  await io.update(TABLE, patch);
  forgetPraise();
  return { ...row, ...patch };
}
