/* The console's data, read from and written to Catalyst.

   One place that knows both shapes: the console's field names on one side,
   the Catalyst tables on the other. Routes call these functions and never
   touch Catalyst directly.

   Falls back to the in-memory seed when Catalyst is not configured, so the
   console still runs with no credentials. Which one is in use is printed at
   boot and returned by GET /api/health.

   FILTERING HAPPENS IN NODE, not in the database, because a self client
   cannot be granted a ZCQL scope (see the note in catalyst.js). That is fine
   for hundreds of rows and wrong for tens of thousands. When this moves into
   Catalyst functions, the filters move into ZCQL there and these functions
   keep their signatures. */

import { getRows, insert, update, configured } from './catalyst.js';
import { loadRegistrations, loadMembers, surveyTables, approveInNoah, returnVideoInNoah, rejectInNoah, canEnterApp, createRegistrationInNoah, patchRegistrationInNoah } from './noah-schema.js';
import { db, audit as memAudit } from './db.js';

/* Table ids. Empty by default — set CATALYST_TABLE_* in .env.local for the
   project you are connecting to. Nothing is hard-coded, so the server cannot
   quietly reconnect to an old project. */
export const TABLES = {
  Staff: process.env.CATALYST_TABLE_STAFF || '',
  Registrations: process.env.CATALYST_TABLE_REGISTRATIONS || '',
  Members: process.env.CATALYST_TABLE_MEMBERS || '',
  AuditLog: process.env.CATALYST_TABLE_AUDITLOG || '',
};

export const live = () => configured();

/* Which project's shape we are reading.
     'noah'  the Catalyst developer's normalised schema (noah-backend)
     'flat'  the four flat tables this console created itself
   Set CATALYST_SCHEMA=noah in .env.local for noah-backend. */
export const schema = () => (process.env.CATALYST_SCHEMA || 'flat').toLowerCase();
export const isNoah = () => live() && schema() === 'noah';
export { surveyTables, canEnterApp };
export const source = () => (live() ? 'catalyst' : 'memory');

/* ---------- shaping ----------
   Catalyst returns strings for everything and its own ROWID. The console
   wants Dates and its own id field, so translate here and nowhere else. */

const asDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const digits = (v) => String(v || '').replace(/\D/g, '');

const toRegistration = (r) => ({
  rowId: r.ROWID,
  id: r.regId,
  mobile: r.mobile,
  salutation: r.salutation || '',
  firstName: r.firstName, middleName: r.middleName || '', lastName: r.lastName,
  fullName: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
  email: r.email || '',
  gender: r.gender || '', dob: asDate(r.dob), marital: r.marital || '',
  reference: r.reference || '',
  line1: r.line1 || '', line2: r.line2 || '',
  city: r.city || '', region: r.region || '', country: r.country || '', pin: r.pin || '',
  idType: r.idType || '', idNumber: r.idNumber || '', idFile: r.idFile || '', idSizeKb: 0,
  photoFile: r.photoFile || '', photoSizeKb: 0,
  agreed: asBool(r.agreed),
  declarationLang: r.declarationLang || 'en',
  declarationVersion: r.declarationVersion || '',
  signature: r.signature || '', signedOn: asDate(r.signedOn),
  videoFile: r.videoFile || '', videoSecs: Number(r.videoSecs || 0),
  videoAttempt: Number(r.videoAttempt || 1),
  state: r.state,
  at: asDate(r.submittedAt) || asDate(r.CREATEDTIME),
  decidedAt: asDate(r.decidedAt), decidedBy: r.decidedBy || '',
  remark: r.remark || '', memberId: r.memberId || null,
  /* The office's three manual checks are not stored yet; they last for the
     life of the review. Add columns when they need to survive a reload. */
  checks: {
    idReadable: null, photoMatchesId: null, videoAudible: null,
    nameMatchesSignature: true, ageOver18: true, duplicateMobile: false,
  },
  script: '',
});

const toMember = (m) => ({
  rowId: m.ROWID,
  id: m.memberId,
  name: m.name,
  first: String(m.name || '').split(' ')[0],
  last: String(m.name || '').split(' ').slice(-1)[0],
  mobile: m.mobile, email: m.email || '',
  g: m.gender === 'female' ? 'F' : 'M',
  age: m.dob ? Math.floor((Date.now() - +asDate(m.dob)) / 31557600000) : 0,
  loc: m.loc || '', cell: null, pastor: null,
  status: m.status, partner: false, kid: false,
  joined: asDate(m.joinedOn) || asDate(m.CREATEDTIME),
  lang: m.lang || 'en', address: m.address || '',
  photo: 'Approved', crm: 'Pending', lastActive: null,
  fromRegistration: m.fromRegistration || undefined,
});

const toStaff = (s) => ({
  rowId: s.ROWID,
  id: s.ROWID,
  email: s.email, name: s.name, title: s.title || '',
  role: s.role, status: s.status,
  lastIn: asDate(s.lastSignedInAt),
  from: asDate(s.CREATEDTIME), to: null, mfa: false,
  locs: ['All locations'], overrides: [],
});

const toAudit = (a) => ({
  id: a.ROWID,
  at: asDate(a.at) || asDate(a.CREATEDTIME),
  actor: a.actor, role: a.role || '',
  action: a.action, mod: a.module || '', rec: a.record || '',
  before: a.beforeJson ? safeJson(a.beforeJson) : null,
  after: a.afterJson ? safeJson(a.afterJson) : null,
  remark: a.remark || '', ip: a.ip || '', live: true,
});

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const asDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/* ---------- staff ---------- */

/* noah-backend has no Staff table — console sign-in is not part of that
   project yet, so staff come from the seed even when Catalyst is connected.
   Member data is live; who may look at it is still local. */
const hasStaffTable = () => live() && !!TABLES.Staff;

export async function staffByEmail(email) {
  const wanted = String(email).toLowerCase();
  if (!hasStaffTable()) return db.STAFF.find((s) => s.email?.toLowerCase() === wanted) || null;
  const rows = await getRows(TABLES.Staff);
  const hit = rows.find((r) => String(r.email || '').toLowerCase() === wanted);
  return hit ? toStaff(hit) : null;
}

export async function allStaff() {
  if (!hasStaffTable()) return db.STAFF;
  const rows = await getRows(TABLES.Staff);
  return rows.map(toStaff).sort((a, b) => a.name.localeCompare(b.name));
}

export async function markSignedIn(rowId) {
  if (!hasStaffTable()) return;
  await update(TABLES.Staff, { ROWID: rowId, lastSignedInAt: nowStamp() });
}

/* ---------- registrations ---------- */

export async function listRegistrations({ state, search } = {}) {
  if (!live()) {
    let rows = db.REGISTRATIONS;
    if (state) rows = rows.filter((r) => r.state === state);
    return rows;
  }
  let rows = isNoah()
    ? await loadRegistrations()
    : (await getRows(TABLES.Registrations)).map(toRegistration);
  if (state) rows = rows.filter((r) => r.state === state);
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter((r) =>
      [r.fullName, r.mobile, r.email, r.city, r.id].some((v) => String(v || '').toLowerCase().includes(s)));
  }
  /* Oldest first: the queue is worked in the order people have waited. */
  return rows.sort((a, b) => +a.at - +b.at);
}

export async function registrationById(regId) {
  if (!live()) return db.REGISTRATIONS.find((r) => r.id === regId) || null;
  if (isNoah()) {
    /* Ids are strings and compared as strings: a Catalyst ROWID does not
       survive being a Number. */
    return (await loadRegistrations()).find((r) => String(r.id) === String(regId)) || null;
  }
  const rows = await getRows(TABLES.Registrations);
  const hit = rows.find((r) => r.regId === regId);
  return hit ? toRegistration(hit) : null;
}

export async function registrationByMobile(mobile) {
  const wanted = digits(mobile);
  if (!live()) {
    return db.REGISTRATIONS
      .filter((r) => digits(r.mobile) === wanted)
      .sort((a, b) => b.at - a.at)[0] || null;
  }
  const rows = isNoah() ? await loadRegistrations() : (await getRows(TABLES.Registrations)).map(toRegistration);
  return rows.filter((r) => digits(r.mobile) === wanted).sort((a, b) => +b.at - +a.at)[0] || null;
}

let seq = 0;
const nextRegId = () => 'REG-' + Date.now().toString(36).toUpperCase() + (++seq);

export async function createRegistration(value) {
  if (!live()) return null;
  /* noah-backend spreads a registration across five tables. */
  if (isNoah()) return createRegistrationInNoah(value);

  const regId = nextRegId();
  await insert(TABLES.Registrations, {
    regId,
    mobile: value.mobile,
    salutation: value.salutation || '',
    firstName: value.firstName, middleName: value.middleName || '', lastName: value.lastName,
    email: value.email || '', gender: value.gender || '',
    dob: asDay(value.dob),
    marital: value.marital || '', reference: value.reference || '',
    line1: value.line1 || '', line2: value.line2 || '',
    city: value.city || '', region: value.region || '',
    country: value.country || '', pin: value.pin || '',
    idType: value.idType || '', idNumber: value.idNumber || '',
    idFile: value.idFile || '', photoFile: value.photoFile || '',
    agreed: !!value.agreed,
    declarationLang: value.declarationLang || 'en',
    declarationVersion: value.declarationVersion || '2026.09',
    signature: value.signature || '', signedOn: nowStamp(),
    videoFile: value.videoFile || '', videoSecs: Number(value.videoSecs || 0),
    videoAttempt: 1,
    state: 'pending',
    submittedAt: nowStamp(),
  });
  return regId;
}

/** Patch a registration. `reg` must carry the rowId from a read. */
export async function patchRegistration(reg, patch) {
  if (!live()) return;
  /* The two schemas name these columns differently, and in noah-backend
     TABLES.Registrations is empty anyway — the ids live in NOAH_TABLES. */
  if (isNoah()) return patchRegistrationInNoah(reg, patch);
  await update(TABLES.Registrations, { ROWID: reg.rowId, ...patch });
}

/** Approve, in whichever schema is connected. */
export async function approveRegistration({ registration, staffName, loc, remark }) {
  if (isNoah()) return approveInNoah({ registration, staffName, remark });
  const member = await createMember({ reg: registration, loc });
  await patchRegistration(registration, {
    state: 'approved',
    decidedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    decidedBy: staffName,
    memberId: member.id,
    remark: remark || '',
  });
  return member;
}

/** Reject, in whichever schema is connected. Only the new schema has it. */
export async function rejectRegistration({ registration, remark }) {
  if (isNoah()) return rejectInNoah({ registration, remark });
  await patchRegistration(registration, { state: 'rejected', remark });
  return { state: 'rejected' };
}

/** Send the video back, in whichever schema is connected. */
export async function returnVideo({ registration, staffName, remark }) {
  if (isNoah()) return returnVideoInNoah({ registration, remark });
  await patchRegistration(registration, {
    state: 'videoReturned',
    decidedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    decidedBy: staffName,
    remark,
    videoAttempt: (registration.videoAttempt || 1) + 1,
  });
  return { state: 'videoReturned' };
}

/* ---------- members ---------- */

export async function memberByMobile(mobile) {
  const wanted = digits(mobile);
  if (!live()) return db.MEMBERS.find((m) => digits(m.mobile) === wanted) || null;
  const rows = isNoah() ? await loadMembers() : (await getRows(TABLES.Members)).map(toMember);
  return rows.find((m) => digits(m.mobile) === wanted) || null;
}

export async function listMembers({ search, loc, status } = {}) {
  if (!live()) return db.MEMBERS;
  let rows = isNoah() ? await loadMembers() : (await getRows(TABLES.Members)).map(toMember);
  if (loc) rows = rows.filter((m) => m.loc === loc);
  if (status) rows = rows.filter((m) => m.status === status);
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter((m) =>
      [m.name, m.mobile, m.email, m.id].some((v) => String(v || '').toLowerCase().includes(s)));
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createMember({ reg, loc }) {
  const memberId = 'NH-' + (104000 + (Date.now() % 100000));
  if (!live()) return { id: memberId, name: reg.fullName, loc };
  await insert(TABLES.Members, {
    memberId,
    mobile: reg.mobile,
    name: reg.fullName,
    email: reg.email || '',
    gender: reg.gender || '',
    dob: asDay(reg.dob),
    loc: loc || reg.city || '',
    address: [reg.line1, reg.line2, reg.city, reg.pin].filter(Boolean).join(', ').slice(0, 255),
    lang: reg.declarationLang || 'en',
    status: 'Active',
    joinedOn: nowStamp(),
    fromRegistration: reg.id,
  });
  return { id: memberId, name: reg.fullName, loc: loc || reg.city };
}

/* ---------- audit ---------- */

export async function writeAudit({ actor, role, action, module, record, before, after, remark, ip }) {
  /* noah-backend has no AuditLog table. Keep the entry in memory rather than
     failing the decision over it — losing the approval because the log could
     not be written would be the wrong trade. The console shows the in-memory
     log and says where it is kept.

     Writing it was also throwing outside the caller's try/catch, which left
     approvals hanging with no reply. */
  if (!live() || !TABLES.AuditLog) {
    return memAudit(actor, role, action, module, record, before, after, remark);
  }
  await insert(TABLES.AuditLog, {
    actor, role: role || '', action, module: module || '', record: String(record || ''),
    beforeJson: before ? JSON.stringify(before).slice(0, 9000) : null,
    afterJson: after ? JSON.stringify(after).slice(0, 9000) : null,
    remark: remark || '', at: nowStamp(), ip: ip || '',
  });
}

export async function listAudit() {
  if (!live() || !TABLES.AuditLog) return db.AUD;
  const rows = await getRows(TABLES.AuditLog);
  return rows.map(toAudit).sort((a, b) => +b.at - +a.at).slice(0, 200);
}
