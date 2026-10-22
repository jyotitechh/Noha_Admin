/* Reading and writing the `noah-backend` Catalyst project.

   The office's own schema (nodi_schema.sql) replaced the first one. What the
   console needs from it:

     users             the login: number, countryCode, is_admin, otp…
     members           who they are — names, email, address, ID numbers,
                       photo, memberType, isUnVerified. 104 columns is
                       Catalyst's limit, so the rest are in…
     membersExtra      one row per member, membersExtra.id = members.ROWID:
                       the role flags, connectedPastor / connectedLeader
     appRegistrations  the review record: status, declaration, video, files
     files             one row per upload: uid, path, fileType, remoteSource

   A registration is therefore appRegistrations + members + membersExtra +
   files, joined in Node. There is no ZCQL (see catalyst.js), so the tables
   are fetched whole. Fine at this size; it belongs in a Catalyst function with
   real queries before this carries thousands of members.

   ── The rules that matter ────────────────────────────────────────────────

   ACCESS. The app lets someone in when `appRegistrations.status = 'approved'`.
   A member the office verified in its own system (`isUnVerified = false`) who
   has no registration row also counts. NEVER `members.status`: it is a
   boolean now, true for everyone, and says nothing about approval.

   A phone number that has only asked for an OTP already has a `users` row, a
   `members` row and a `draft` registration. A row existing is not approval.

   DECISIONS go through the Noah API (noah-api.js), which also notifies the
   member. The functions here that write a decision are the fallback for when
   the API key is not set, and they are loud about it.

   IDS. A ROWID is past Number.MAX_SAFE_INTEGER: keep it a string, and never
   take it from an insert response (Catalyst sends it unquoted there). */

import {
  getRows, getRow, update, insert, remove, listTables, listColumns,
} from './catalyst.js';
import { MEMBER_FIELDS, fieldByName, checkValue } from './member-fields.js';

/* ---------- finding the tables ----------

   Table ids are different in every Catalyst project, and the project has been
   rebuilt twice, so none is written down here. A table is named by what it is
   called, and its id is looked up from the project's own table list the first
   time it is needed.

   `NOAH_TABLES.members` is therefore not an id but a reference, 'tbl:members'.
   Every call goes through `io`, which turns a reference into the id. (The
   offline fake never needs the id at all: it keys its tables by the reference.)

   The list is fetched once and kept; it is fetched again only when a name is
   missing (someone has just created that table), and not more than once in 30
   seconds. Listing tables is not a Data Store fetch. */

const TABLE_NAMES = [
  'users', 'members', 'membersExtra', 'userTokens', 'files', 'deviceTokens', 'notifications',
  'threads', 'threadUserConnect', 'threadMessages', 'appRegistrations', 'appChangeRequests',
];

const REF = 'tbl:';
let tableIds = null;      /* Map name -> id, as of the last time it was listed */
let tableIdsAt = 0;
let listing = null;

/** Look the project's tables up (again, when `force`). */
export async function resolveTables(force = false) {
  if (tableIds && !force) return tableIds;
  if (!listing) {
    listing = io.listTables()
      .then((all) => {
        tableIds = new Map(all.map((t) => [t.name, String(t.id)]));
        tableIdsAt = Date.now();
        return tableIds;
      })
      .finally(() => { listing = null; });
  }
  return listing;
}

/** Forget what was listed, so the next call asks again. For tests and `--refresh`. */
export const forgetTables = () => { tableIds = null; tableIdsAt = 0; };

/** Is a table by this name in the project? Only knows once the list was read. */
export const tableExists = (name) => !!tableIds?.has(name);

/** A reference (or an id) -> the id Catalyst wants. */
export async function tableId(ref) {
  const s = String(ref ?? '');
  if (!s.startsWith(REF)) return s;
  const name = s.slice(REF.length);
  let map = await resolveTables();
  if (!map.has(name) && Date.now() - tableIdsAt > 30_000) map = await resolveTables(true);
  const id = map.get(name);
  if (!id) throw new Error(`The Catalyst project has no table called "${name}". Check CATALYST_PROJECT_ID, or ask the Catalyst developer.`);
  return id;
}

/* Every Catalyst call goes through this object, not straight to the imports.
   The schema logic — joins, the access gate, roles, the shape of a decision —
   is where the mistakes are, and testing it should not need the network or
   spend Catalyst's Data Store allowance. A test swaps these for an in-memory
   copy of the tables (see test-schema-offline.mjs). */
export const io = {
  getRows: async (ref, opts) => getRows(await tableId(ref), opts),
  getRow: async (ref, rowId) => getRow(await tableId(ref), rowId),
  update: async (ref, rows) => update(await tableId(ref), rows),
  insert: async (ref, rows) => insert(await tableId(ref), rows),
  remove: async (ref, rowIds) => remove(await tableId(ref), rowIds),
  listColumns: async (ref) => listColumns(await tableId(ref)),
  listTables,
};

/* The tables, as references. `npm run check:schema` confirms each exists and has
   the columns this code uses. */
export const NOAH_TABLES = Object.fromEntries(TABLE_NAMES.map((n) => [n, REF + n]));

/* Who may sign in to THIS console, and as what. The office's schema has no
   place for it: users.is_admin / is_super_admin are two flags, and the console
   has ten roles. So it is one small table of its own, `consoleStaff`, which
   `npm run catalyst:columns --apply` creates if the project has room for it
   (see docs/CONSOLE-ACCESS.md).

   A getter: CATALYST_TABLE_CONSOLE_STAFF (an id) wins when set, since the table
   may have another name; otherwise it is there once a table called consoleStaff
   exists in the project. Absent, the screens say so rather than failing. */
Object.defineProperty(NOAH_TABLES, 'consoleStaff', {
  enumerable: true,
  get: () => process.env.CATALYST_TABLE_CONSOLE_STAFF || (tableExists('consoleStaff') ? REF + 'consoleStaff' : ''),
});
const T = NOAH_TABLES;

/* ---------- small readers ---------- */

const digits = (s) => String(s ?? '').replace(/\D/g, '');
const same = (a, b) => a != null && b != null && String(a) === String(b);

/* Booleans come back as true/false, or "true"/"false" from an insert. */
const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const isFalse = (v) => v === false || v === 'false' || v === 0 || v === '0';

/* Two clocks. Columns the app writes are UTC; Catalyst's own CREATEDTIME and
   MODIFIEDTIME are IST. Reading one as the other is 5½ hours wrong, which is
   enough to put "waiting 5 hours" on someone who has just registered. */
function parseWhen(v, zone) {
  if (!v) return null;
  const s = String(v).trim().replace(' ', 'T').slice(0, 19);
  const d = new Date((s.length === 10 ? s + 'T00:00:00' : s) + zone);
  return Number.isNaN(+d) ? null : d;
}
const utc = (v) => parseWhen(v, 'Z');
const ist = (v) => parseWhen(v, '+05:30');

/* Catalyst date columns want YYYY-MM-DD. The validator hands back a Date, and
   String(date).slice(0, 10) quietly gives "Sun Jun 2", which Catalyst rejects
   with "date value expected". */
const asDay = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10);
};

/** Catalyst wants 'YYYY-MM-DD HH:mm:ss', and the app writes UTC. */
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const GENDER = { 1: 'male', 2: 'female', 3: 'other' };
const genderOf = (g) => GENDER[Number(g)] || '';
const genderCode = (g) => ({ male: 1, m: 1, female: 2, f: 2, other: 3 }[String(g || '').toLowerCase()] ?? null);

/** Pull the staff name back out of a note like "Approved by Anitha Varghese". */
const decidedByFrom = (note) => {
  const m = String(note || '').match(/^(?:Approved|Returned|Decided) by (.+?)\.?$/i);
  return m ? m[1].trim() : '';
};

/* ---------- phone numbers ----------

   There is no `phoneKey` any more: a number is `countryCode` + `mobileNumber1`
   on members, `countryCode` + `number` on users. */

const COUNTRY_CODES = new Set([
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '39', '40', '41', '43', '44', '45', '46',
  '47', '48', '49', '52', '54', '55', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84',
  '86', '90', '91', '92', '93', '94', '95', '98', '212', '234', '254', '880', '960', '961', '962',
  '963', '964', '965', '966', '968', '971', '972', '973', '974', '975', '977',
]);

/** '+91 95631 16482' → { cc: '91', number: '9563116482' }. */
export function splitPhone(mobile) {
  const d = digits(mobile);
  for (const n of [3, 2, 1]) {
    const cc = d.slice(0, n);
    if (COUNTRY_CODES.has(cc) && d.length - n >= 6) return { cc, number: d.slice(n) };
  }
  return { cc: d.slice(0, 2), number: d.slice(2) };
}

const phoneOf = (m, user) => {
  const number = digits(m?.mobileNumber1) || digits(user?.number);
  const cc = digits(m?.countryCode) || digits(user?.countryCode);
  return number ? '+' + cc + number : '';
};

/* ---------- ID numbers ----------

   The member row has a column per ID type. The type the member used is
   `appRegistrations.idProofType`. */

const ID_TYPES = [
  { column: 'aadharNo', label: 'Aadhaar', keys: ['aadhaar', 'aadhar'] },
  { column: 'panNo', label: 'PAN', keys: ['pan'] },
  { column: 'passportNumber', label: 'Passport', keys: ['passport'] },
  { column: 'voterId', label: 'Voter ID', keys: ['voterid', 'voter'] },
  { column: 'drivingLicense', label: 'Driving licence', keys: ['drivinglicence', 'drivinglicense', 'dl'] },
  { column: 'emiratesID', label: 'Emirates ID', keys: ['emiratesid', 'emirates'] },
];
const flat = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const idTypeFor = (declared) => ID_TYPES.find((t) => t.keys.includes(flat(declared)));

function idFrom(member, declaredType) {
  const byDeclared = idTypeFor(declaredType);
  if (byDeclared && member[byDeclared.column]) {
    return { idType: byDeclared.label, idNumber: member[byDeclared.column] };
  }
  const filled = ID_TYPES.find((t) => member[t.column]);
  return filled
    ? { idType: filled.label, idNumber: member[filled.column] }
    : { idType: byDeclared?.label || declaredType || '', idNumber: '' };
}

/* ---------- registration status ---------- */

const STATES = {
  draft: 'draft', pending: 'pending', approved: 'approved',
  rejected: 'rejected', videoreturned: 'videoReturned',
};
/** Their five statuses, as the console spells them. Anything else is a draft. */
const stateOf = (s) => STATES[String(s || '').toLowerCase()] || 'draft';

/* ---------- one read, shared ----------

   A registration needs five tables and the member register needs most of the
   same ones, so they are fetched together and cached for a few seconds: a
   page load is one round of fetches, not one per screen. Anything that
   writes clears it. The generation counter stops a fetch that was already in
   flight when a write happened from being cached as if it were fresh. */

let snap = null;
let snapAt = 0;
let inflight = null;
let generation = 0;
/* How long what was read is kept. A refresh reads five tables, and Catalyst's
   free tier is 10,000 fetches a month for the whole account (the app, the Noah
   API and this console share it), so reading on every click is how the last
   project ran out. A minute by default; a decision made here clears it at
   once, and the Refresh button (POST /api/refresh) clears it on demand. The new
   registrations an app sends in are seen after at most this long. */
const CACHE_MS = (Number(process.env.CONSOLE_CACHE_SECONDS) || 60) * 1000;

export const clearCache = () => { snap = null; crSnap = null; generation += 1; };

async function snapshot() {
  if (snap && Date.now() - snapAt < CACHE_MS) return snap;
  if (inflight) return inflight;

  const started = generation;
  inflight = (async () => {
    const [regs, members, extras, files, users] = await Promise.all([
      io.getRows(T.appRegistrations), io.getRows(T.members), io.getRows(T.membersExtra),
      io.getRows(T.files), io.getRows(T.users),
    ]);
    const value = { regs, members, extras, files, users };
    if (generation === started) { snap = value; snapAt = Date.now(); }
    return value;
  })().finally(() => { inflight = null; });

  return inflight;
}

/* The newest registration per member. A member can have more than one (a
   draft, then a resubmission), and the newest is the one that counts. */
const when = (r) => +(utc(r.submittedAt) || ist(r.CREATEDTIME) || 0);
function latestRegByMember(regs) {
  const out = new Map();
  for (const r of regs) {
    const k = String(r.memberRowId);
    if (!out.has(k) || when(r) > when(out.get(k))) out.set(k, r);
  }
  return out;
}

const fileMeta = (f) => {
  if (!f) return null;
  let meta = {};
  try { meta = typeof f.remoteSource === 'string' ? JSON.parse(f.remoteSource) : (f.remoteSource || {}); } catch { /* not JSON */ }
  return {
    rowId: String(f.ROWID),
    storeId: f.path ? String(f.path) : null,
    name: meta.name || '',
    mimeType: meta.mimeType || '',
    bytes: Number(f.size || 0),
  };
};

/** One registration row by its ROWID, without joining anything. */
export async function registrationCore(rowId) {
  const row = await io.getRow(T.appRegistrations, rowId);
  if (!row) return null;
  return {
    rowId: String(row.ROWID),
    memberRowId: String(row.memberRowId),
    rawStatus: row.status,
    state: stateOf(row.status),
    id: String(row.ROWID),
  };
}

/** Everything the console needs for the registration queue, joined up. */
export async function loadRegistrations() {
  const { regs, members, files, users } = await snapshot();

  const memberById = new Map(members.map((m) => [String(m.ROWID), m]));
  const userById = new Map(users.map((u) => [String(u.ROWID), u]));
  const fileById = new Map(files.map((f) => [String(f.ROWID), f]));

  /* A member's uploads by kind, newest first: fileType 1 photo, 2 ID, 3 video. */
  const uploads = new Map();
  for (const f of files) {
    if (asBool(f.archived)) continue;
    const key = `${f.uid}:${f.fileType}`;
    if (!uploads.has(key)) uploads.set(key, []);
    uploads.get(key).push(f);
  }
  for (const list of uploads.values()) list.sort((a, b) => +ist(b.CREATEDTIME) - +ist(a.CREATEDTIME));

  const pick = (explicitId, uid, type) =>
    fileById.get(String(explicitId)) || uploads.get(`${uid}:${type}`)?.[0] || null;

  return regs.map((r) => {
    const m = memberById.get(String(r.memberRowId)) || {};
    const uid = String(r.memberRowId);

    const idFile = fileMeta(pick(r.idProofFileId, uid, 2));
    const photo = fileMeta(pick(m.photo, uid, 1));
    const video = fileMeta(pick(r.videoFileId, uid, 3));

    const { idType, idNumber } = idFrom(m, r.idProofType);
    const fullName = [m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ');
    const [refName = '', , refPhone = ''] = String(m.referBy || '').split('|');
    const dob = utc(m.dateOfBirth);

    return {
      rowId: String(r.ROWID),
      memberRowId: uid,
      id: String(r.ROWID),
      /* Their raw status, kept visible rather than translated away. */
      rawStatus: r.status,
      state: stateOf(r.status),

      mobile: phoneOf(m, userById.get(String(m.userId))),
      salutation: m.salutation || '',
      firstName: m.firstName || '', middleName: m.middleName || '', lastName: m.lastName || '',
      fullName: fullName || '(name not given yet)',
      email: m.emailId1 || '',
      gender: genderOf(m.gender),
      dob,
      marital: m.maritalStatus || '',
      reference: refName,
      referencePhone: refPhone,

      line1: m.address || '', line2: m.area || '',
      city: m.city || '', region: m.state || '',
      country: m.country || '', pin: m.pincode || '',
      nationality: r.nationality || '',

      idType, idNumber,
      idFile: idFile?.name || '',
      idSizeKb: Math.round((idFile?.bytes || 0) / 1024),
      photoFile: photo?.name || '',
      photoSizeKb: Math.round((photo?.bytes || 0) / 1024),

      agreed: asBool(r.declarationAccepted),
      declarationLang: r.declarationLanguage || '',
      declarationVersion: '',
      signature: r.signatureText || '',
      signedOn: utc(r.declarationAcceptedAt),

      videoFile: video?.name || '',
      videoSecs: Number(r.videoSeconds || 0),
      /* One video file per recording, so the count is the attempt number. */
      videoAttempt: Math.max(1, uploads.get(`${uid}:3`)?.length || 0),

      at: utc(r.submittedAt) || ist(r.CREATEDTIME),
      decidedAt: utc(r.reviewedAt),
      /* appRegistrations records no reviewer, so the name is written into
         `reviewNote` on approval and read back out here. */
      decidedBy: decidedByFrom(r.reviewNote),
      remark: r.reviewNote || '',
      memberId: uid,
      /* The number the office's own system knows them by. */
      officeMemberId: m.memberId || '',

      checks: {
        idReadable: null, photoMatchesId: null, videoAudible: null,
        nameMatchesSignature:
          !!r.signatureText && r.signatureText.trim().toLowerCase() === fullName.trim().toLowerCase(),
        ageOver18: dob ? (Date.now() - +dob) / 31557600000 >= 18 : true,
        duplicateMobile: false,
      },
      script: '',

      /* `files` ROWIDs: what GET /admin/files/:id on the Noah API takes. */
      fileIds: {
        idProof: idFile?.rowId || null,
        photo: photo?.rowId || null,
        video: video?.rowId || null,
      },
      /* The Catalyst File Store ids (`files.path`), for a direct download when
         the Noah API key is not set. */
      storeIds: {
        idProof: idFile?.storeId || null,
        photo: photo?.storeId || null,
        video: video?.storeId || null,
      },
    };
  });
}

/** The member register, for the Membership screen. */
export async function loadMembers() {
  const { regs, members, extras, users } = await snapshot();

  const latest = latestRegByMember(regs);
  const userById = new Map(users.map((u) => [String(u.ROWID), u]));
  const extraOf = new Map(extras.map((x) => [String(x.id), x]));
  const nameOf = new Map(members.map((m) => [
    String(m.ROWID), [m.firstName, m.middleName, m.lastName].filter(Boolean).join(' '),
  ]));

  return members.map((m) => {
    const reg = latest.get(String(m.ROWID));
    const x = extraOf.get(String(m.ROWID)) || {};
    const user = userById.get(String(m.userId)) || {};
    const name = nameOf.get(String(m.ROWID));

    const officeVerified = isFalse(m.isUnVerified);
    /* The registration decides. With none, the office's own verification does. */
    const approval = reg ? stateOf(reg.status) : (officeVerified ? 'approved' : 'none');
    const archived = asBool(m.archived);
    const blocked = archived || asBool(user.archived);

    /* Never default to Active: 'Active' here means the office approved them. */
    const status = archived ? 'Archived' : ({
      approved: 'Active', pending: 'Pending', videoReturned: 'Video returned',
      rejected: 'Rejected', draft: 'Not approved', none: 'Not approved',
    }[approval]);

    const dob = utc(m.dateOfBirth);
    return {
      id: m.memberId || String(m.ROWID),
      rowId: String(m.ROWID),
      userRowId: m.userId ? String(m.userId) : null,
      name: name || '(not registered yet)',
      first: m.firstName || '', last: m.lastName || '',
      mobile: phoneOf(m, user),
      email: m.emailId1 || '',
      g: Number(m.gender) === 2 ? 'F' : 'M',
      age: dob ? Math.floor((Date.now() - +dob) / 31557600000) : 0,
      loc: m.city || '',
      cell: x.connectedLeader ? nameOf.get(String(x.connectedLeader)) || null : null,
      pastor: x.connectedPastor ? nameOf.get(String(x.connectedPastor)) || null : null,
      status,
      /* The approval state, not `members.status`. Kept under the old name so
         screens that show Catalyst's own word still have one. */
      rawStatus: approval,
      approval,
      approved: approval === 'approved',
      officeVerified,
      archived,
      blocked,
      isAdmin: asBool(user.is_admin) || asBool(user.is_super_admin),
      memberType: m.memberType || null,
      partner: asBool(x.isPartner), kid: asBool(m.isKid),
      joined: utc(m.dateOfJoining) || ist(m.CREATEDTIME),
      lang: m.language || 'en',
      address: [m.address, m.city, m.pincode].filter(Boolean).join(', '),
      photo: m.photo ? 'Approved' : 'None',
      crm: 'Pending', lastActive: null,
    };
  });
}

/** May the app open for this person?

    Deliberately strict: it needs positive evidence of approval. The cost of
    guessing wrong is letting a stranger into the congregation's app.

      - archived, or a blocked login       → never
      - a registration exists              → only if it says 'approved'
      - none, but the office verified them → yes (`isUnVerified = false`)
      - anything else                      → no

    `members.status` is not consulted. It is true for everybody. */
export function canEnterApp(member, registration) {
  if (member?.blocked) return false;
  if (registration) return stateOf(registration.rawStatus ?? registration.status) === 'approved';
  return !!member && member.officeVerified === true;
}

/* ---------- the app writing in ----------

   A registration submitted from the console's mock of the app has to land in
   the same tables the real app's registration does:

     users → members → membersExtra → (fields on members) → appRegistrations

   The real Flutter app talks to the Noah API, not to this. This stays so the
   registration journey can be tested end to end without it. */

/** The `users` row for a number, or a new one. Looks first: nothing here
    enforces one row per number any more. */
async function findOrCreateUser(cc, number) {
  const find = async () => (await io.getRows(T.users))
    .find((u) => digits(u.countryCode) === cc && digits(u.number) === number);

  const existing = await find();
  if (existing) return existing;

  await io.insert(T.users, { number, countryCode: '+' + cc, is_member: true });
  const fresh = await find();
  if (!fresh) throw new Error('The login row was created but could not be read back.');
  return fresh;
}

/** `membersExtra` for a member, created when missing. `id` is the member's
    ROWID — that is how the two are joined. */
async function ensureExtra(memberRowId) {
  const find = async () => (await io.getRows(T.membersExtra)).find((x) => same(x.id, memberRowId));
  const existing = await find();
  if (existing) return existing;

  await io.insert(T.membersExtra, { id: String(memberRowId), form_submit: false, video_consent_submit: 0 });
  clearCache();
  const fresh = await find();
  if (!fresh) throw new Error('The extra row was created but could not be read back.');
  return fresh;
}

/** The members row for a number, or create the user, member and extra rows. */
export async function findOrCreateMember(mobile, details = {}) {
  const { cc, number } = splitPhone(mobile);
  if (!number) throw new Error('That is not a mobile number.');

  const user = await findOrCreateUser(cc, number);

  const findMember = async () => {
    const all = await io.getRows(T.members);
    return all.find((m) => same(m.userId, user.ROWID))
      || all.find((m) => digits(m.countryCode) === cc && digits(m.mobileNumber1) === number);
  };

  let member = await findMember();
  if (!member) {
    await io.insert(T.members, {
      userId: String(user.ROWID),
      countryCode: '+' + cc,
      mobileNumber1: number,
      /* Not verified until the office says so. */
      isUnVerified: true,
      isKid: false,
      archived: false,
    });
    /* DO NOT use the ROWID from the insert response. Catalyst returns it
       unquoted there, so JSON.parse makes it a Number, and a Catalyst ROWID is
       past Number.MAX_SAFE_INTEGER — the last digits come back wrong, and as a
       foreign key it fails with an error that never mentions rounding. Reading
       the row back gives the id as a quoted string, intact. */
    member = await findMember();
    if (!member) throw new Error('The member row was created but could not be read back.');
    /* Rows the app creates carry id = ROWID. */
    await io.update(T.members, { ROWID: String(member.ROWID), id: String(member.ROWID) });
  }

  await ensureExtra(member.ROWID);

  const fields = {
    ...(details.firstName !== undefined ? { firstName: details.firstName } : {}),
    ...(details.middleName !== undefined ? { middleName: details.middleName } : {}),
    ...(details.lastName !== undefined ? { lastName: details.lastName } : {}),
    ...(details.email ? { emailId1: details.email } : {}),
    ...(genderCode(details.gender) ? { gender: genderCode(details.gender) } : {}),
    ...(asDay(details.dob) ? { dateOfBirth: asDay(details.dob) } : {}),
    ...(details.marital ? { maritalStatus: details.marital } : {}),
    ...(details.salutation ? { salutation: details.salutation } : {}),
    ...(details.reference ? { referBy: details.reference } : {}),
  };
  if (Object.keys(fields).length) {
    await io.update(T.members, { ROWID: String(member.ROWID), ...fields });
  }

  clearCache();
  return String(member.ROWID);
}

/**
 * Store a registration submitted from the app.
 * Returns the new appRegistrations ROWID, which is the id the console shows.
 */
export async function createRegistrationInNoah(v) {
  const memberRowId = await findOrCreateMember(v.mobile, v);
  if (!memberRowId) throw new Error('Could not create the member row for this number.');

  /* step 2 (address) and step 3 (the ID number) are columns of the member */
  const idColumn = idTypeFor(v.idType)?.column;
  await io.update(T.members, {
    ROWID: memberRowId,
    address: v.line1 || '',
    area: v.line2 || '',
    city: v.city || '',
    state: v.region || '',
    country: v.country || '',
    pincode: v.pin || '',
    ...(idColumn && v.idNumber ? { [idColumn]: v.idNumber } : {}),
  });

  const now = stamp();
  const row = {
    memberRowId,
    /* `pending` is the queue the office works from. */
    status: 'pending',
    submittedAt: now,
    nationality: v.country || '',
    idProofType: String(v.idType || '').toLowerCase(),
    signatureText: v.signature || '',
    declarationAccepted: !!v.agreed,
    declarationAcceptedAt: now,
    declarationLanguage: v.declarationLang || 'en',
    videoSeconds: Number(v.videoSecs || 0) || null,
    videoLanguage: v.declarationLang || 'en',
    profileVerified: false,
  };

  /* A number that has asked for an OTP already has a `draft` registration.
     Fill that in rather than leaving an empty draft beside a second row. */
  const mine = (await io.getRows(T.appRegistrations))
    .filter((r) => same(r.memberRowId, memberRowId))
    .sort((a, b) => when(b) - when(a));
  const draft = mine.find((r) => stateOf(r.status) === 'draft');

  if (draft) {
    await io.update(T.appRegistrations, { ROWID: String(draft.ROWID), ...row });
    clearCache();
    return String(draft.ROWID);
  }

  await io.insert(T.appRegistrations, row);
  clearCache();

  /* Same precision trap as above: read the row back. */
  const fresh = (await io.getRows(T.appRegistrations))
    .filter((r) => same(r.memberRowId, memberRowId))
    .sort((a, b) => when(b) - when(a))[0];
  if (!fresh) throw new Error('The registration was created but could not be read back.');
  return String(fresh.ROWID);
}

/* ---------- member roles ----------

   A member's roles are spread over two tables: `memberType` on members, and
   the flags on membersExtra. The rest of the console sees one merged row. */

/** The member's roles as one row, or null when there is no such member. */
export async function memberRolesRow(memberRowId, { create = false } = {}) {
  if (create) await ensureExtra(memberRowId);
  const { members, extras } = await snapshot();
  const m = members.find((x) => same(x.ROWID, memberRowId));
  if (!m) return null;
  const x = extras.find((e) => same(e.id, memberRowId));
  return { ...(x || {}), memberType: m.memberType ?? null, memberRowId: String(m.ROWID) };
}

/** Apply a set of role changes. `memberType` belongs to members; everything
    else is a flag on membersExtra. */
export async function patchMemberRoles(memberRowId, patch) {
  const { memberType, ...flags } = patch;

  if ('memberType' in patch) {
    await io.update(T.members, { ROWID: String(memberRowId), memberType });
  }
  if (Object.keys(flags).length) {
    const extra = await ensureExtra(memberRowId);
    await io.update(T.membersExtra, { ROWID: String(extra.ROWID), ...flags });
  }
  clearCache();
  return memberRolesRow(memberRowId);
}

/** Everyone's roles, keyed by member row id, for the list screens. */
export async function allMemberRoles() {
  const { members, extras } = await snapshot();
  const extraOf = new Map(extras.map((x) => [String(x.id), x]));
  const out = new Map();
  for (const m of members) {
    out.set(String(m.ROWID), {
      ...(extraOf.get(String(m.ROWID)) || {}),
      memberType: m.memberType ?? null,
      memberRowId: String(m.ROWID),
    });
  }
  return out;
}

/* ---------- decisions, written straight to the tables ----------

   THESE ARE THE FALLBACK. Decisions belong to the Noah API, which also sends
   the email and the push; editing the tables does neither, and the member is
   left on the waiting screen with no idea. The routes call these only when
   NOAH_ADMIN_API_KEY is not set, and say so in the reply.

   What the API itself does, per ADMIN.md §4, is the shape of each. */

/** Approve: the registration, and the member as the office's tools see them. */
export async function approveInNoah({ registration, staffName, remark }) {
  const at = stamp();

  /* The member first. Access follows the registration, so a member marked
     verified whose registration still says pending is simply not let in yet —
     recoverable. The reverse is not: approved, but the office's own tools
     still show them unverified. */
  await io.update(T.members, {
    ROWID: String(registration.memberRowId),
    isUnVerified: false,
    verifiedOn: at,
  });
  await io.update(T.appRegistrations, {
    ROWID: String(registration.rowId),
    status: 'approved',
    reviewedAt: at,
    reviewNote: remark || `Approved by ${staffName}`,
    profileVerified: true,
    profileVerifiedAt: at,
  });

  clearCache();
  /* `id` as well as `memberRowId`: the same value here, but the contract and
     the app both ask for `id`. */
  return {
    id: String(registration.memberRowId),
    memberRowId: String(registration.memberRowId),
    status: 'approved',
    roles: ['member'],
  };
}

/** Send the video back. Only the registration changes. */
export async function returnVideoInNoah({ registration, remark }) {
  await io.update(T.appRegistrations, {
    ROWID: String(registration.rowId),
    status: 'videoReturned',
    reviewedAt: stamp(),
    reviewNote: remark,
  });
  clearCache();
  return { status: 'videoReturned', remark };
}

/** Reject. Only the registration changes. */
export async function rejectInNoah({ registration, remark }) {
  await io.update(T.appRegistrations, {
    ROWID: String(registration.rowId),
    status: 'rejected',
    reviewedAt: stamp(),
    reviewNote: remark,
  });
  clearCache();
  return { status: 'rejected', remark };
}

/** The member side of an approval, when the API has already decided.

    The API sets `isUnVerified = false` and `verifiedOn` itself. This only
    mends it if that did not land, so the office's own tools do not show an
    approved member as unverified. A repair, never the normal path. */
export async function activateMemberOnly(memberRowId) {
  await io.update(T.members, {
    ROWID: String(memberRowId),
    isUnVerified: false,
    verifiedOn: stamp(),
  });
  clearCache();
  return { memberRowId: String(memberRowId), status: 'approved' };
}

/* Translate a console-shaped patch into appRegistrations' columns.

   The console speaks `state`, `videoSecs`, `remark`; the table has `status`,
   `videoSeconds`, `reviewNote`. Passing the console's names straight through
   made Catalyst reject the whole request — which is how a re-recorded video
   came to hang instead of saving. Unrecognised fields are dropped, because one
   unknown column fails the entire write and takes the good fields with it. */
export async function patchRegistrationInNoah(registration, patch) {
  const out = { ROWID: String(registration.rowId) };

  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case 'state':
        out.status = v;
        if (v === 'pending') {
          out.submittedAt = patch.submittedAt || stamp();
          /* The reason it came back is spent once they act on it. */
          out.reviewNote = '';
        }
        break;
      case 'videoSecs': out.videoSeconds = Number(v) || null; break;
      case 'remark': out.reviewNote = v; break;
      case 'submittedAt': out.submittedAt = v; break;
      case 'decidedAt': out.reviewedAt = v; break;
      case 'profileVerified': out.profileVerified = v; break;
      /* `videoFile` is a filename from the app. The file itself is a `files`
         row, and writing a name into videoFileId would put a name where an id
         belongs. */
      default: break;
    }
  }

  await io.update(T.appRegistrations, out);
  clearCache();
  return out;
}

/* ---------- housekeeping ---------- */

/** Row counts for the tables the console uses, for the survey screen. */
export async function surveyTables() {
  const out = [];
  for (const name of Object.keys(NOAH_TABLES)) {
    if (!NOAH_TABLES[name]) continue; /* an optional table that is not set */
    try {
      const rows = await io.getRows(NOAH_TABLES[name], { max: 1000 });
      out.push({ table: name, rows: rows.length, sample: rows[0] ?? null });
    } catch (err) {
      out.push({ table: name, rows: null, error: err.message });
    }
  }
  return out.sort((a, b) => (b.rows ?? -1) - (a.rows ?? -1));
}

/* Columns this code reads or writes, per table. `check:schema` looks for each
   in a real row. If the Catalyst developer renames one, this says which. */
export const EXPECTED_COLUMNS = {
  users: ['number', 'countryCode', 'is_member', 'is_admin', 'is_super_admin', 'archived'],
  members: [
    'id', 'userId', 'countryCode', 'mobileNumber1', 'isUnVerified', 'verifiedOn', 'memberId',
    'salutation', 'firstName', 'middleName', 'lastName', 'emailId1', 'gender', 'dateOfBirth',
    'emailId2', 'anniversaryDate', 'maritalStatus', 'referBy', 'address', 'area', 'city', 'state', 'country', 'pincode',
    'corrAddress', 'corrArea', 'corrCity', 'corrState', 'corrCountry', 'corrPincode',
    'religion', 'motherTongue', 'educationDetail', 'employedIn', 'commLanguage',
    'aadharNo', 'panNo', 'passportNumber', 'voterId', 'drivingLicense', 'emiratesID',
    'photo', 'archived', 'isKid', 'memberType', 'dateOfJoining', 'language',
  ],
  membersExtra: [
    'id', 'isChurchMember', 'isLeader', 'isPrayerWarrior', 'isPartner', 'isPassScan',
    'isBusCoordinator', 'isTranslator', 'isAvailableForMatrimony', 'isVIPMember', 'isBaptised',
    'allowRewards', 'isBlockedFromComment', 'isAlertList', 'alertListComment',
    'connectedPastor', 'connectedLeader', 'form_submit', 'video_consent_submit',
  ],
  files: ['uid', 'path', 'extension', 'size', 'fileType', 'remoteSource', 'archived', 'uploadedAt', 'isPublic'],
  appChangeRequests: ['memberRowId', 'fieldId', 'oldValue', 'newValue', 'status', 'note', 'reviewedByRowId', 'reviewedAt'],
  consoleStaff: ['memberRowId', 'role', 'status', 'title', 'grantedBy', 'grantedAt', 'lastSignedInAt'],
  appRegistrations: [
    'memberRowId', 'status', 'reviewNote', 'reviewedAt', 'submittedAt', 'nationality',
    'idProofType', 'idProofFileId', 'signatureText', 'declarationAccepted',
    'declarationAcceptedAt', 'declarationLanguage', 'videoFileId', 'videoSeconds',
    'videoBytes', 'videoLanguage', 'videoConsentState', 'profileVerified', 'profileVerifiedAt',
  ],
};

/** Does each table exist, and does it have every column this code uses?

    Asks Catalyst for the table's columns, not for a row, so an empty table is
    checked as well as a full one. Costs no Data Store fetches. */
export async function verifySchema() {
  const live = await io.listTables(); /* always fresh: this is the check */
  const byName = new Map(live.map((t) => [t.name, String(t.id)]));
  const liveIds = new Set(live.map((t) => String(t.id)));
  const report = [];

  for (const name of Object.keys(EXPECTED_COLUMNS)) {
    const ref = NOAH_TABLES[name];
    /* consoleStaff is optional until the table is created. */
    if (!ref && name === 'consoleStaff') {
      report.push({ table: name, id: null, exists: false, optional: true, missing: [], checked: false });
      continue;
    }
    const id = byName.get(name) ?? (name === 'consoleStaff' ? process.env.CATALYST_TABLE_CONSOLE_STAFF : null);
    const exists = !!id && (byName.has(name) || liveIds.has(String(id)));
    const entry = { table: name, id: id || null, exists, missing: [], checked: false };
    if (exists) {
      try {
        const have = new Set((await io.listColumns(ref || id)).map((c) => c.name));
        entry.columns = have.size;
        entry.missing = EXPECTED_COLUMNS[name].filter((c) => !have.has(c));
        entry.checked = true;
      } catch (err) { entry.error = err.message; }
    }
    report.push(entry);
  }
  /* Tables the code uses that have no list of expected columns still must exist. */
  for (const name of TABLE_NAMES) {
    if (!(name in EXPECTED_COLUMNS)) report.push({ table: name, id: byName.get(name) || null, exists: byName.has(name), missing: [], checked: false });
  }
  return report;
}

/* ---------- who may sign in to the console ----------

   Staff are members. A member becomes console staff in one of two ways:

     1. The OFFICE flagged their login `users.is_super_admin` in its own system.
        They are a super administrator, and the console cannot change that: it
        is the office's flag, and the app reads it too.

     2. A super administrator gave them a role here. That is a row in the
        console-staff table: which member, which of the console's roles, and
        whether the access is Active, Suspended or Revoked.

   Either way the person is identified by their MOBILE NUMBER, the same one they
   register with in the Noah app, so there is nothing new to remember.

   `users.is_admin` is deliberately NOT read. The app uses it to pick who answers
   the "church office" chat (the oldest such user), so treating every console
   user as one would quietly change who members are talking to. */

/** Digits only, with the country code: '+91 98765 43210' -> '919876543210'.
    A bare ten-digit number is taken as Indian, which is what people type. */
export function mobileKey(input) {
  const raw = String(input ?? '').trim();
  const d = digits(raw);
  if (!raw.startsWith('+') && d.length === 10) return '91' + d;
  return d;
}

const memberFullName = (m) =>
  [m?.firstName, m?.middleName, m?.lastName].filter(Boolean).join(' ') || '(no name yet)';

/** Is there a console-staff table to read and write? */
export const consoleStaffEnabled = () => !!T.consoleStaff;

/* A console role the table may carry. Anything else is ignored on the way in:
   a typo in a Catalyst row must not become a role nobody defined. */
const readRole = (r, allowed) => (allowed.includes(String(r)) ? String(r) : null);

/**
 * Every staff identity Catalyst knows of, as the console's Staff screen and
 * sign-in need them. `allowedRoles` is the list of role ids the console defines.
 */
export async function loadStaffDirectory(allowedRoles) {
  const { members, users } = await snapshot();
  const memberById = new Map(members.map((m) => [String(m.ROWID), m]));
  const memberOfUser = new Map(members.map((m) => [String(m.userId), m]));
  const out = [];
  const seen = new Set(); /* member row ids already listed */

  const base = (m, user) => {
    const archived = asBool(m?.archived) || asBool(user?.archived);
    return {
      memberRowId: m ? String(m.ROWID) : null,
      userRowId: user ? String(user.ROWID) : (m?.userId ? String(m.userId) : null),
      name: m ? memberFullName(m) : '(no member row yet)',
      email: m?.emailId1 || '',
      /* Every address on the member row, lower-cased, for signing in by email. */
      emails: [m?.emailId1, m?.emailId2].map((e) => String(e || '').trim().toLowerCase()).filter(Boolean),
      mobile: phoneOf(m, user),
      mobileKey: mobileKey(phoneOf(m, user)),
      blocked: archived,
      mfa: false, locs: ['All locations'], overrides: [], to: null,
    };
  };

  /* 1. The office's own super-admin flag. */
  for (const u of users) {
    if (!asBool(u.is_super_admin)) continue;
    const m = memberOfUser.get(String(u.ROWID));
    out.push({
      ...base(m, u),
      id: `flag-${u.ROWID}`,
      rowId: null,
      title: 'Super administrator (set by the office)',
      role: 'super',
      status: asBool(u.archived) ? 'Blocked' : 'Active',
      from: ist(u.CREATEDTIME), lastIn: null,
      source: 'catalyst-flag',
      grantedBy: 'the office',
    });
    if (m) seen.add(String(m.ROWID));
  }

  /* 2. Roles given from the console. */
  if (consoleStaffEnabled()) {
    const rows = await io.getRows(T.consoleStaff);
    for (const r of rows) {
      const mid = String(r.memberRowId ?? '');
      const m = memberById.get(mid);
      if (!m || seen.has(mid)) continue; /* an office flag outranks a row */
      const role = readRole(r.role, allowedRoles);
      if (!role) continue;
      const user = users.find((x) => same(x.ROWID, m.userId));
      const b = base(m, user);
      const status = b.blocked ? 'Blocked' : (r.status || 'Active');
      out.push({
        ...b,
        id: String(r.ROWID),
        rowId: String(r.ROWID),
        title: r.title || '',
        role,
        status,
        from: utc(r.grantedAt) || ist(r.CREATEDTIME),
        lastIn: utc(r.lastSignedInAt),
        source: 'catalyst',
        grantedBy: r.grantedBy || '',
      });
      seen.add(mid);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Find one staff identity by the number they sign in with. */
export async function findStaffByMobile(mobile, allowedRoles) {
  const key = mobileKey(mobile);
  if (!key) return null;
  return (await loadStaffDirectory(allowedRoles)).find((s) => s.mobileKey === key) ?? null;
}

/**
 * Find one staff identity by an email address on their member row.
 *
 * Returns { staff } , { staff: null } when nobody has it, or { ambiguous: true }
 * when more than one person does. Two people sharing an address is common in a
 * family; picking one of them would sign someone in as the wrong person, so
 * the caller refuses and sends them to their mobile number instead.
 */
export async function findStaffByEmail(email, allowedRoles) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return { staff: null };
  const hits = (await loadStaffDirectory(allowedRoles)).filter((s) => s.emails?.includes(want));
  if (hits.length > 1) return { ambiguous: true };
  return { staff: hits[0] ?? null };
}

/** Approved members who are not staff yet: who a super administrator may give
    access to. Someone who has not been approved cannot be given the console. */
export async function staffCandidates(allowedRoles, search = '') {
  const [members, staff] = await Promise.all([loadMembers(), loadStaffDirectory(allowedRoles)]);
  const have = new Set(staff.filter((s) => s.status !== 'Revoked').map((s) => s.memberRowId));
  const q = String(search).toLowerCase().trim();
  return members
    /* A member with no name is half a registration: the live data has one that
       is marked approved. Nobody is given the console without a name to give it to. */
    .filter((m) => m.approved && !m.blocked && !have.has(m.rowId) && !m.name.startsWith('('))
    .filter((m) => !q || [m.name, m.mobile, m.email].some((v) => String(v || '').toLowerCase().includes(q)))
    .map((m) => ({ rowId: m.rowId, name: m.name, mobile: m.mobile, email: m.email, loc: m.loc }))
    .slice(0, 50);
}

/** Give a member a console role, or restore one that was revoked. */
export async function grantConsoleAccess({ memberRowId, role, title, by }) {
  if (!consoleStaffEnabled()) {
    throw Object.assign(new Error('No console-staff table is configured.'), { code: 'no_table' });
  }
  const at = stamp();
  const rows = await io.getRows(T.consoleStaff);
  const mine = rows.find((r) => same(r.memberRowId, memberRowId));
  const row = { role, title: title || '', status: 'Active', grantedBy: by || '', grantedAt: at };

  if (mine) {
    await io.update(T.consoleStaff, { ROWID: String(mine.ROWID), ...row });
  } else {
    await io.insert(T.consoleStaff, { memberRowId: String(memberRowId), ...row });
  }
  clearCache();
  /* The id comes from reading it back, never from the insert response. */
  const fresh = (await io.getRows(T.consoleStaff)).find((r) => same(r.memberRowId, memberRowId));
  if (!fresh) throw new Error('The access row was written but could not be read back.');
  return String(fresh.ROWID);
}

/** Change a staff row: role, title or status. */
export async function updateConsoleStaff(rowId, patch) {
  if (!consoleStaffEnabled()) {
    throw Object.assign(new Error('No console-staff table is configured.'), { code: 'no_table' });
  }
  const out = { ROWID: String(rowId) };
  for (const k of ['role', 'title', 'status']) if (k in patch) out[k] = patch[k];
  await io.update(T.consoleStaff, out);
  clearCache();
}

/** Stamp a sign-in on the row. Never worth failing a sign-in over. */
export async function touchStaffSignIn(rowId) {
  if (!consoleStaffEnabled() || !rowId) return;
  await io.update(T.consoleStaff, { ROWID: String(rowId), lastSignedInAt: stamp() });
}

/* ---------- one person, everything about them ----------

   The person page: who they are, the registration they made (with its three
   uploads), who their pastor and cell leader are, whether they are a covenant
   partner, and their family and groups.

   Pastor, cell leader and partnership are on membersExtra and are real. Family
   and groups are not: their tables (membersRelations, kids, kidsConnect,
   groups, groupsConnect) exist in Catalyst with no columns yet, so there is
   nothing to read. They are reported as "not recorded" with the reason, rather
   than shown as empty, because "this person has no family" and "families are
   not stored yet" are very different things to tell an office. */

export async function loadPerson(memberRowId) {
  const [members, regs, raw] = await Promise.all([loadMembers(), loadRegistrations(), snapshot()]);
  const member = members.find((m) => m.rowId === String(memberRowId));
  if (!member) return null;

  /* Their registrations, newest first. The newest is the one on show. */
  const mine = regs
    .filter((r) => r.memberRowId === member.rowId)
    .sort((a, b) => +(b.at ?? 0) - +(a.at ?? 0));

  const x = raw.extras.find((e) => same(e.id, member.rowId)) || {};
  const byRow = new Map(raw.members.map((m) => [String(m.ROWID), m]));
  const who = (id) => {
    const m = id ? byRow.get(String(id)) : null;
    return m ? { rowId: String(m.ROWID), name: memberFullName(m), mobile: phoneOf(m) } : null;
  };

  return {
    member,
    /* What the edit form starts from: the stored values, as the form holds them. */
    editable: editableFrom(raw.members.find((m) => same(m.ROWID, member.rowId))),
    registration: mine[0] ?? null,
    earlier: mine.slice(1).map((r) => ({ id: r.id, state: r.state, at: r.at, remark: r.remark })),
    pastoral: { pastor: who(x.connectedPastor), cellLeader: who(x.connectedLeader), cell: null },
    partnership: {
      isPartner: asBool(x.isPartner),
      expiresOn: utc(x.partnershipExpireOn),
    },
    family: { recorded: false, rows: [], why: 'Families are not stored in Catalyst yet: their tables exist but have no columns.' },
    groups: { recorded: false, rows: [], why: 'Groups are not stored in Catalyst yet: their tables exist but have no columns.' },
  };
}

/* ---------- editing a member from the console ----------

   The reverse of registering: the office corrects a name or a pincode here and
   it is written to the same `members` column the app reads, so the member sees
   it. Which fields, and how they are checked, is member-fields.js. */

const dayOf = (v) => (v ? String(v).slice(0, 10) : '');

/** The editable fields' current values for one member, as the form shows them. */
function editableFrom(row) {
  const out = {};
  for (const f of MEMBER_FIELDS) {
    const v = row?.[f.column];
    out[f.key] = f.kind === 'gender' ? genderOf(v)
      : f.kind === 'date' ? dayOf(v)
      : (v ?? '') === '' ? '' : String(v);
  }
  return out;
}

/**
 * Write the changed fields of one member. `values` is { column: value }, already
 * checked (member-fields.checkPatch). Reads the row fresh first, so "nothing
 * changed" means nothing changed in Catalyst, not in a cache a minute old, and
 * only columns whose value actually differs are written: an unchanged column is
 * never re-sent over whatever the app may have just saved there.
 *
 * Returns { changed: [{ key, label, contact, before, after }] }.
 */
export async function updateMemberFields(memberRowId, values) {
  clearCache();
  const { members } = await snapshot();
  const row = members.find((m) => same(m.ROWID, memberRowId));
  if (!row) throw Object.assign(new Error('No such member.'), { code: 'not_found' });

  const was = editableFrom(row);
  const changed = [];
  const write = {};
  for (const f of MEMBER_FIELDS) {
    if (!(f.column in values)) continue;
    const next = values[f.column];
    const after = f.kind === 'gender' ? genderOf(next) : (next ?? '');
    if (String(after) === String(was[f.key])) continue;
    write[f.column] = next;
    changed.push({ key: f.key, label: f.label, contact: !!f.contact, before: was[f.key], after: String(after) });
  }
  if (!changed.length) return { changed: [] };

  await io.update(T.members, { ROWID: String(row.ROWID), ...write });
  clearCache();
  return { changed };
}

/* ---------- changes the app asks for ----------

   A member who wants a detail changed after approval files an
   `appChangeRequests` row: which member, which field, the old and new value,
   `status` pending / approved / rejected. The Noah API has no call to decide
   them yet, so the office applies one by writing `newValue` to the member's
   column and marking the request. That is what approving does here.

   `fieldId` is not documented beyond its name. It is matched to an editable
   field by key or column name, ignoring case and punctuation. A request this
   cannot match is shown, can be rejected, and cannot be approved: guessing
   which column a stranger's request means is how the wrong thing gets edited. */

let crSnap = null;
let crAt = 0;
const CR_FRESH = () => crSnap && Date.now() - crAt < CACHE_MS;

async function changeRequestRows() {
  if (CR_FRESH()) return crSnap;
  const rows = await io.getRows(T.appChangeRequests);
  crSnap = rows; crAt = Date.now();
  return rows;
}

/** The requests, newest first, with who asked. `status` filters ('pending'...). */
export async function loadChangeRequests({ status } = {}) {
  const [rows, { members }] = await Promise.all([changeRequestRows(), snapshot()]);
  const byRow = new Map(members.map((m) => [String(m.ROWID), m]));
  return rows
    .filter((r) => !status || String(r.status || 'pending').toLowerCase() === status)
    .map((r) => {
      const m = byRow.get(String(r.memberRowId));
      const field = fieldByName(r.fieldId);
      return {
        id: String(r.ROWID),
        memberRowId: r.memberRowId ? String(r.memberRowId) : null,
        memberName: m ? memberFullName(m) : '(unknown member)',
        fieldId: r.fieldId ?? '',
        fieldLabel: field?.label || null,
        /* Can the console apply it? Contact fields need members.pii on top. */
        known: !!field,
        contact: !!field?.contact,
        oldValue: r.oldValue ?? '',
        newValue: r.newValue ?? '',
        status: String(r.status || 'pending').toLowerCase(),
        note: r.note || '',
        at: ist(r.CREATEDTIME),
        decidedAt: utc(r.reviewedAt),
      };
    })
    .sort((a, b) => +(b.at ?? 0) - +(a.at ?? 0));
}

/**
 * Approve or reject one request. Approving writes the new value to the member
 * (after the same checks as an edit) and then marks the request, in that order:
 * a failure in between leaves a request still pending, which can be retried,
 * never one marked approved whose value was not written.
 */
export async function decideChangeRequest({ id, approve, note, byMemberRowId, canContact }) {
  crSnap = null;
  const all = await changeRequestRows();
  const row = all.find((r) => same(r.ROWID, id));
  if (!row) throw Object.assign(new Error('No such request.'), { code: 'not_found' });
  if (String(row.status || 'pending').toLowerCase() !== 'pending') {
    throw Object.assign(new Error('That request has already been decided.'), { code: 'not_pending' });
  }

  let applied = null;
  if (approve) {
    const field = fieldByName(row.fieldId);
    if (!field) {
      throw Object.assign(new Error(`The console does not know which detail "${row.fieldId}" is, so it cannot apply this. Reject it, or change the member's detail by hand.`), { code: 'unknown_field' });
    }
    if (field.contact && !canContact) {
      throw Object.assign(new Error('Applying a change to contact details needs permission to see them.'), { code: 'forbidden_field' });
    }
    const checked = checkValue(field, row.newValue);
    if (checked.error) {
      throw Object.assign(new Error(`The requested value cannot be applied: ${checked.error}`), { code: 'invalid_value' });
    }
    applied = await updateMemberFields(row.memberRowId, { [field.column]: checked.value });
  }

  await io.update(T.appChangeRequests, {
    ROWID: String(row.ROWID),
    status: approve ? 'approved' : 'rejected',
    note: note || '',
    reviewedAt: stamp(),
    ...(byMemberRowId ? { reviewedByRowId: String(byMemberRowId) } : {}),
  });
  crSnap = null;
  return { status: approve ? 'approved' : 'rejected', applied: applied?.changed ?? [] };
}
