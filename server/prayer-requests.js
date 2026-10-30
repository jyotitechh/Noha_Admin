/* Prayer requests members send from the Noah app, read from and decided in
   Catalyst's `prayerRequest` table (the console used to show sample data here).

   What the table holds: memberId, type, content, isApproved (+ approvedBy/On),
   prayerCount, urgentCount, reportedCount, closed (+ closedBy/On), isArchived.
   What it does not hold, and what this does about it:
     - a category, so every request shows as "Prayer request";
     - an "anonymous" flag, so none is anonymous (the office sees the name);
     - a decline reason, so a decline is kept in the audit log, not for the member;
     - a Declined state. A request the office turns down is archived
       (isArchived = true, isApproved = 0), which the app already hides.

   `type` is the audience and the Catalyst developer has not said which number is
   which (DATA_DICTIONARY_TIER1.md marks it ENUM?). Only EVERYONE_TYPE reaches the
   open wall; any other value is treated as prayer warriors only, so a wrong guess
   narrows the audience and never widens it. Set PRAYER_TYPE_EVERYONE to change it. */

import { io } from './noah-schema.js';
import { listMembers } from './store.js';

const TABLE = 'tbl:prayerRequest';
export const EVERYONE_TYPE = Number(process.env.PRAYER_TYPE_EVERYONE ?? 1);

const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const asDate = (v) => {
  if (!v) return null;
  /* Catalyst stores datetimes in UTC as 'YYYY-MM-DD HH:mm:ss'. */
  const d = new Date(String(v).replace(' ', 'T').slice(0, 19) + 'Z');
  return Number.isNaN(+d) ? null : d;
};
const stampNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const stateOf = (r) => (asBool(r.isArchived) ? 'Declined' : asBool(r.isApproved) ? 'Approved' : 'Pending');

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
    category: 'Prayer request',
    text: String(r.content ?? '').trim(),
    everyone: Number(r.type) === EVERYONE_TYPE,
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
  await io.update(TABLE, [patch]);
  forgetPrayerRequests();
  return { ...row, ...patch };
}

export async function prayerRequestById(id) {
  const [rows, people] = await Promise.all([raw(), peopleByKey()]);
  const row = rows.find((r) => String(r.ROWID) === String(id));
  return row ? shape(row, people) : null;
}
