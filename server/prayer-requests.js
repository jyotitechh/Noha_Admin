/* Prayer requests members send from the Noah app, read from and decided in
   Catalyst's `prayerRequest` table (the console used to show sample data here).

   What the table holds: memberId, type, content, isApproved (+ approvedBy/On),
   prayerCount, urgentCount, reportedCount, closed (+ closedBy/On), isArchived.
   What it does not hold, and what this does about it:
     - an "anonymous" flag, so none is anonymous (the office sees the name);
     - a decline reason: it goes to the member through the Noah API's decide call, and is kept in the audit log;
     - a Declined state of its own. The Noah API declines with isApproved = 2; a request this console declines without it
       (no Noah API connected) is archived (isArchived = true, isApproved = 0), which the app already hides.

   `type` packs the category and the audience: category * 10 + audience, with audience 1 = everyone (the open prayer wall) and
   0 = prayer warriors only. Read off the live table against what the Noah API reports for the same requests
   (GET /admin/prayer-requests): 11 Healing for everyone, 21 Family for everyone, 31 Guidance for everyone, 30 Guidance for
   prayer warriors, 40 Thanksgiving for prayer warriors, 51 Other for everyone. The console used to treat only the number 1 as
   "everyone", so every real request showed as "Prayer warriors".

   The app limits a request to 300 characters; the `content` column holds 10,000, which is the limit on the office's side. */

import { io } from './noah-schema.js';
import { listMembers } from './store.js';

const TABLE = 'tbl:prayerRequest';

/** The most the office may write in a request: the size of the `content` column. The app's 300 is the member's limit only. */
export const TEXT_MAX = 10000;

/** The category numbers (the tens digit of `type`), with the words the app uses. */
const CATEGORIES = { 1: 'Healing', 2: 'Family', 3: 'Guidance', 4: 'Thanksgiving', 5: 'Other' };
export const CATEGORY_NAMES = Object.values(CATEGORIES);
const categoryNumber = (name) => Number(Object.keys(CATEGORIES).find((k) => CATEGORIES[k] === name));
const audienceOf = (type) => Number(type) % 10;
/** Everyone (the open wall) is audience 1. Anything else is prayer warriors only, so a number not known narrows the audience. */
export const isEveryone = (type) => audienceOf(type) === 1;
const categoryOf = (type) => CATEGORIES[Math.floor(Number(type) / 10) % 10] || 'Prayer request';
/** `type` with the audience changed and the category (and anything above it) kept. Null when the audience digit is one this does not know. */
export const typeWithAudience = (type, everyone) => {
  const t = Number(type);
  if (!Number.isFinite(t) || ![0, 1].includes(audienceOf(t))) return null;
  return t - audienceOf(t) + (everyone ? 1 : 0);
};

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const asDate = (v) => {
  if (!v) return null;
  /* Catalyst stores datetimes in UTC as 'YYYY-MM-DD HH:mm:ss'. */
  const d = new Date(String(v).replace(' ', 'T').slice(0, 19) + 'Z');
  return Number.isNaN(+d) ? null : d;
};
const stampNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/* isApproved: 0 waiting, 1 approved, 2 declined (the Noah API's decline). Archived is how this console declined one before. */
export const stateOf = (r) => (asBool(r.isArchived) || Number(r.isApproved) === 2 ? 'Declined' : asBool(r.isApproved) ? 'Approved' : 'Pending');

/* The table can hold a few thousand rows once the app is in use, and the badge
   asks often. A short cache keeps that from spending the Data Store allowance;
   a decision clears it. */
let cache = null;
let cacheAt = 0;
const TTL = 30_000;
export const forgetPrayerRequests = () => { cache = null; };

async function raw() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  cache = await io.getRows(TABLE, { max: 3000 });
  cacheAt = Date.now();
  return cache;
}

/** Member rowId and memberId -> the person, for names and mobile numbers. */
async function peopleByKey() {
  const people = await listMembers({});
  const by = new Map();
  for (const m of people) {
    by.set(String(m.rowId), m);
    if (m.id) by.set(String(m.id), m);
  }
  return by;
}

function shape(r, people) {
  const who = people.get(String(r.memberId));
  const by = people.get(String(r.approvedBy));
  const at = asDate(r.createdOn) ?? asDate(r.CREATEDTIME) ?? new Date();
  const state = stateOf(r);
  return {
    id: String(r.ROWID),
    category: categoryOf(r.type),
    text: String(r.content ?? '').trim(),
    everyone: isEveryone(r.type),
    anonymous: false,
    memberName: who?.name ?? '',
    mobile: who?.mobile ?? '',
    mannaId: null,
    at,
    state,
    decidedBy: state === 'Pending' ? '' : (by?.name ?? (r.approvedBy ? 'The office' : '')),
    remark: '',
    prayedBy: Number(r.prayerCount) || 0,
    urgent: Number(r.urgentCount) || 0,
    reported: Number(r.reportedCount) || 0,
    closed: asBool(r.closed),
    language: r.contentLanguage ?? null,
  };
}

export async function listPrayerRequests({ state, search } = {}) {
  const [rows, people] = await Promise.all([raw(), peopleByKey()]);
  let out = rows.map((r) => shape(r, people));
  if (state) out = out.filter((r) => r.state === state);
  if (search) {
    const s = String(search).toLowerCase();
    out = out.filter((r) => [r.text, r.memberName, r.mobile, r.id].some((v) => String(v || '').toLowerCase().includes(s)));
  }
  return out.sort((a, b) => +a.at - +b.at);
}

export async function pendingPrayerRequests() {
  return (await listPrayerRequests({ state: 'Pending' }));
}

/** Approve or decline one request. Returns the shaped row, or null if not found. */
export async function decidePrayerRequest(id, decision, { byRowId } = {}) {
  const rows = await raw();
  const row = rows.find((r) => String(r.ROWID) === String(id));
  if (!row) return null;
  const patch = { ROWID: String(row.ROWID), updatedOn: stampNow() };
  if (byRowId) patch.updatedBy = String(byRowId);
  if (decision === 'Approved') {
    patch.isApproved = 1;
    patch.isArchived = false;
    patch.approvedOn = stampNow();
    if (byRowId) patch.approvedBy = String(byRowId);
  } else {
    patch.isApproved = 0;
    patch.isArchived = true;
  }
  await io.update(TABLE, patch);
  forgetPrayerRequests();
  return { ...row, ...patch };
}

/**
 * Change what an approved or waiting request says, or who may see it. `text` is the new wording; `everyone` true puts it on the
 * open prayer wall, false keeps it to prayer warriors. Anything not given is left as it is. Returns the shaped row, null when
 * there is no such request; throws { code } for text that is empty or too long, or an audience code that is not understood.
 */
export async function editPrayerRequest(id, { text, everyone } = {}, { byRowId } = {}) {
  const rows = await raw();
  const row = rows.find((r) => String(r.ROWID) === String(id));
  if (!row) return null;
  const patch = { ROWID: String(row.ROWID) };
  if (text !== undefined) {
    const t = String(text).trim();
    if (!t) throw Object.assign(new Error('A prayer request cannot be empty.'), { code: 'empty' });
    if (t.length > TEXT_MAX) throw Object.assign(new Error(`That is ${t.length.toLocaleString('en-IN')} characters. The most a request can hold is ${TEXT_MAX.toLocaleString('en-IN')}.`), { code: 'too_long' });
    patch.content = t;
  }
  if (everyone !== undefined) {
    const type = typeWithAudience(row.type, !!everyone);
    if (type === null) throw Object.assign(new Error('This request has an audience setting the console does not recognise, so it cannot be changed here.'), { code: 'unknown_audience' });
    patch.type = type;
  }
  if (Object.keys(patch).length === 1) return shapeNow(row);
  patch.updatedOn = stampNow();
  if (byRowId) patch.updatedBy = String(byRowId);
  await io.update(TABLE, patch);
  forgetPrayerRequests();
  return shapeNow({ ...row, ...patch });
}

const shapeNow = async (row) => shape(row, await peopleByKey());

/**
 * A prayer request written by the office, for the member it is from (the office's own member record, or whoever it is
 * written on behalf of). `category` is one of CATEGORY_NAMES, `everyone` the open prayer wall or prayer warriors only, and
 * `publish` approves it at once, so it is on its wall straight away; otherwise it waits in the inbox like a member's.
 * Returns the shaped row; throws { code } for text that is empty or too long, a category that is not known, or no member.
 */
export async function createPrayerRequest({ text, category = 'Other', everyone = false, publish = true, memberId } = {}, { byRowId } = {}) {
  const t = String(text ?? '').trim();
  if (!t) throw Object.assign(new Error('Write the prayer request first.'), { code: 'empty' });
  if (t.length > TEXT_MAX) throw Object.assign(new Error(`That is ${t.length.toLocaleString('en-IN')} characters. The most a request can hold is ${TEXT_MAX.toLocaleString('en-IN')}.`), { code: 'too_long' });
  const cat = categoryNumber(category);
  if (!cat) throw Object.assign(new Error('Pick one of the categories: ' + CATEGORY_NAMES.join(', ') + '.'), { code: 'bad_category' });
  const from = String(memberId || byRowId || '').trim();
  if (!from) throw Object.assign(new Error('Pick the member this prayer request is from.'), { code: 'no_member' });
  const people = await peopleByKey();
  if (!people.has(from)) throw Object.assign(new Error('That member is not on the register.'), { code: 'no_member' });

  const now = stampNow();
  const row = {
    memberId: from, type: cat * 10 + (everyone ? 1 : 0), content: t, contentLanguage: 1,
    isApproved: publish ? 1 : 0, closed: false, isArchived: false,
    prayerCount: 0, urgentCount: 0, reportedCount: 0, createdOn: now,
    ...(publish ? { approvedOn: now } : {}),
    ...(byRowId ? { createdBy: String(byRowId), ...(publish ? { approvedBy: String(byRowId) } : {}) } : {}),
  };
  await io.insert(TABLE, row);
  forgetPrayerRequests();
  /* Catalyst's answer to an insert is not trusted for the id (see noah-schema.js): find the row just made. */
  const made = (await raw())
    .filter((r) => String(r.memberId) === from && String(r.content ?? '').trim() === t && Number(r.type) === row.type)
    .sort((a, b) => String(b.CREATEDTIME).localeCompare(String(a.CREATEDTIME)))[0];
  return shape(made || { ...row, ROWID: '' }, people);
}

/** Members matching what was typed (name, or part of a mobile number), for choosing who a request is from. */
export async function findPeople(q = '') {
  const s = String(q).trim().toLowerCase();
  const digits = s.replace(/\D/g, '');
  const all = (await listMembers({})).filter((m) => m.name && m.name !== '(not registered yet)');
  const hit = s ? all.filter((m) => m.name.toLowerCase().includes(s) || (digits.length >= 3 && String(m.mobile || '').replace(/\D/g, '').includes(digits))) : all;
  return hit.slice(0, 20).map((m) => ({ id: String(m.rowId), name: m.name, mobile: m.mobile || '' }));
}

export async function prayerRequestById(id) {
  const [rows, people] = await Promise.all([raw(), peopleByKey()]);
  const row = rows.find((r) => String(r.ROWID) === String(id));
  return row ? shape(row, people) : null;
}
