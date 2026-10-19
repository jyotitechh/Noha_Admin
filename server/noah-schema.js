/* Reading the `noah-backend` Catalyst project.

   That project is the Catalyst developer's, and its schema is normalised:
   a registration is spread across five tables, joined on `memberRowId`.

     Members          who they are: phoneKey, names, email, gender, dob
     MemberAddresses  one row per address, type 'residence'
     MemberIdentity   one COLUMN per ID type: aadhaar, pan, passport, …
     Registrations    the review record: status, declaration, video, files
     Files            the uploads: purpose idProof | photo | video

   The console wants one flat registration, so this module does the joining.
   There is no ZCQL (see catalyst.js), so the tables are fetched whole and
   joined in Node. Fine at this size; it belongs in a Catalyst function with
   real queries before this carries thousands of members.

   Nothing here writes. Approving a member in this project means updating
   their tables, and the status vocabulary is not agreed yet — see
   docs/SCHEMA-RECONCILIATION.md. Read-only until that conversation happens. */

import { getRows, update, insert } from './catalyst.js';

/* Table ids in noah-backend (27145000000040056). */
export const NOAH_TABLES = {
  Members: '27145000000050162',
  MemberAddresses: '27145000000056361',
  MemberIdentity: '27145000000050521',
  MemberProfile: '27145000000053003',
  Registrations: '27145000000058361',
  Files: '27145000000043026',
  OtpRequests: '27145000000058002',
  Sessions: '27145000000056002',
  Locations: '27145000000059004',
  DailyManna: '27145000000057362',
  DailyPrayers: '27145000000052010',
  DailyConfessions: '27145000000054018',
  BibleCommentary: '27145000000059363',
  Books: '27145000000059722',
  BookCategories: '27145000000045311',
  BookChapters: '27145000000055376',
  Videos: '27145000000046367',
  VideoCategories: '27145000000041042',
  LiveVideos: '27145000000040840',
  Praises: '27145000000064079',
  PraiseReports: '27145000000055017',
  DashboardBanners: '27145000000052369',
  Groups: '27145000000053362',
  GroupMembers: '27145000000050880',
  Kids: '27145000000040122',
  KidLinks: '27145000000061002',
  MemberRelations: '27145000000046008',
  MemberRoles: '27145000000056720',
  MemberPreferences: '27145000000057003',
  Favorites: '27145000000040481',
  Attachments: '27145000000047045',
  DailyMannaCategories: '27145000000058720',
};

const asDate = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const asBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

/** Pull the staff name back out of a note like "Approved by Anitha Varghese". */
const decidedByFrom = (note) => {
  const m = String(note || '').match(/^(?:Approved|Returned|Decided) by (.+?)\.?$/i);
  return m ? m[1].trim() : '';
};

/* Their ID table has a column per type. Turn that back into a type and a
   number, which is how the app sends it and how the console shows it. */
const ID_COLUMNS = [
  ['aadhaar', 'Aadhaar'],
  ['pan', 'PAN'],
  ['passport', 'Passport'],
  ['drivingLicence', 'Driving licence'],
  ['voterId', 'Voter ID'],
  ['emiratesId', 'Emirates ID'],
];

const idFrom = (identity, declaredType) => {
  if (!identity) return { idType: declaredType || '', idNumber: '' };
  /* Prefer the type the registration says was used. */
  const byDeclared = ID_COLUMNS.find(([col]) => col.toLowerCase() === String(declaredType || '').toLowerCase());
  if (byDeclared && identity[byDeclared[0]]) {
    return { idType: byDeclared[1], idNumber: identity[byDeclared[0]] };
  }
  const filled = ID_COLUMNS.find(([col]) => identity[col]);
  return filled ? { idType: filled[1], idNumber: identity[filled[0]] } : { idType: declaredType || '', idNumber: '' };
};

/* Their statuses, as observed: `draft` until submitted, then `approved`.
   The console speaks pending / approved / videoReturned, so translate — and
   keep the original so nothing is hidden behind the translation. */
function consoleState(reg) {
  const raw = String(reg.status || '').toLowerCase();
  if (raw === 'approved') return 'approved';
  if (raw === 'returned' || raw === 'videoreturned' || (reg.reviewNote && raw !== 'approved' && reg.reviewedAt)) {
    return 'videoReturned';
  }
  /* A draft that has been submitted is what the office has to look at. */
  if (reg.submittedAt) return 'pending';
  return 'draft';
}

/* The join pulls five whole tables, which is slow enough to matter once a
   screen asks for it twice in a row. A short cache makes a page load one
   fetch instead of three; anything that writes clears it. */
let cache = null;
let cacheAt = 0;
const CACHE_MS = 4000;

export const clearCache = () => { cache = null; };

/** One registration row by its ROWID, without joining anything.

    Approving needs only the row id and the member it points at, so fetching
    one row beats rebuilding the whole join — which was slow enough to time
    the request out. */
export async function registrationCore(rowId) {
  const row = await getRow(NOAH_TABLES.Registrations, rowId);
  if (!row) return null;
  return {
    rowId: row.ROWID,
    memberRowId: row.memberRowId,
    rawStatus: row.status,
    state: consoleState(row),
    id: row.ROWID,
  };
}

/** Everything the console needs for the registration queue, joined up. */
export async function loadRegistrations() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const [regs, members, addresses, identities, files] = await Promise.all([
    getRows(NOAH_TABLES.Registrations),
    getRows(NOAH_TABLES.Members),
    getRows(NOAH_TABLES.MemberAddresses),
    getRows(NOAH_TABLES.MemberIdentity),
    getRows(NOAH_TABLES.Files),
  ]);

  const byMember = (rows) => {
    const m = new Map();
    for (const r of rows) if (!m.has(r.memberRowId)) m.set(r.memberRowId, r);
    return m;
  };
  const memberById = new Map(members.map((m) => [m.ROWID, m]));
  const addressOf = byMember(addresses);
  const identityOf = byMember(identities);

  const filesOf = new Map();
  for (const f of files) {
    if (!filesOf.has(f.ownerMemberRowId)) filesOf.set(f.ownerMemberRowId, {});
    filesOf.get(f.ownerMemberRowId)[f.purpose] = f;
  }

  const built = regs.map((r) => {
    const m = memberById.get(r.memberRowId) || {};
    const a = addressOf.get(r.memberRowId) || {};
    const mine = filesOf.get(r.memberRowId) || {};
    const { idType, idNumber } = idFrom(identityOf.get(r.memberRowId), r.idProofType);

    const fullName = [m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ');

    return {
      rowId: r.ROWID,
      memberRowId: r.memberRowId,
      id: r.ROWID,
      /* Their raw status, kept visible rather than translated away. */
      rawStatus: r.status,
      state: consoleState(r),

      mobile: m.phoneKey || [m.countryCode, m.mobileNumber].filter(Boolean).join(' '),
      salutation: m.salutation || '',
      firstName: m.firstName || '', middleName: m.middleName || '', lastName: m.lastName || '',
      fullName: fullName || '(name not given yet)',
      email: m.email || '',
      gender: m.gender || '',
      dob: asDate(m.dob),
      marital: m.maritalStatus || '',
      reference: m.referenceName || '',

      line1: a.addressLine || '', line2: a.area || '',
      city: a.city || '', region: a.state || '',
      country: a.country || '', pin: a.pincode || '',

      idType, idNumber,
      idFile: mine.idProof?.name || '',
      idSizeKb: Math.round(Number(mine.idProof?.size || 0) / 1024),
      photoFile: mine.photo?.name || '',
      photoSizeKb: Math.round(Number(mine.photo?.size || 0) / 1024),

      agreed: asBool(r.declarationAccepted),
      declarationLang: r.declarationLanguage || '',
      declarationVersion: '',
      signature: r.signatureText || '',
      signedOn: asDate(r.declarationAcceptedAt),

      videoFile: mine.video?.name || '',
      videoSecs: Number(r.videoSeconds || 0),
      videoAttempt: 1,

      at: asDate(r.submittedAt) || asDate(r.CREATEDTIME),
      decidedAt: asDate(r.reviewedAt),
      /* Their schema records the decider as `reviewedByLegacyId`, a numeric
         id into a staff table that does not exist in this project. So the
         name is written into `reviewNote` on approval and read back out
         here. Not elegant, but it is the only place the name survives. */
      decidedBy: r.reviewedByLegacyId || decidedByFrom(r.reviewNote),
      remark: r.reviewNote || '',
      memberId: r.memberRowId,

      checks: {
        idReadable: null, photoMatchesId: null, videoAudible: null,
        nameMatchesSignature:
          !!r.signatureText && r.signatureText.trim().toLowerCase() === fullName.trim().toLowerCase(),
        ageOver18: m.dob ? (Date.now() - +asDate(m.dob)) / 31557600000 >= 18 : true,
        duplicateMobile: false,
      },
      script: '',
      /* Catalyst File Store ids, for when signed view URLs are wired. */
      fileIds: {
        idProof: mine.idProof?.catalystFileId || null,
        photo: mine.photo?.catalystFileId || null,
        video: mine.video?.catalystFileId || null,
      },
    };
  });

  cache = built;
  cacheAt = Date.now();
  return built;
}

/** The member register, for the Membership screen. */
export async function loadMembers() {
  const [members, addresses] = await Promise.all([
    getRows(NOAH_TABLES.Members),
    getRows(NOAH_TABLES.MemberAddresses),
  ]);
  const addressOf = new Map();
  for (const a of addresses) if (!addressOf.has(a.memberRowId)) addressOf.set(a.memberRowId, a);

  return members.map((m) => {
    const a = addressOf.get(m.ROWID) || {};
    const name = [m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ');
    return {
      id: m.memberNumber || m.ROWID,
      rowId: m.ROWID,
      name: name || '(not registered yet)',
      first: m.firstName || '', last: m.lastName || '',
      mobile: m.phoneKey || '',
      email: m.email || '',
      g: m.gender === 'female' ? 'F' : 'M',
      age: m.dob ? Math.floor((Date.now() - +asDate(m.dob)) / 31557600000) : 0,
      loc: a.city || '', cell: null, pastor: null,
      /* Do NOT invent a status. A null `status` means nobody has approved
         this person, and defaulting it to Active would hand the app to
         everyone who ever asked for an OTP. */
      status: asBool(m.isArchived) ? 'Archived' : (m.status || 'Not approved'),
      rawStatus: m.status ?? null,
      partner: false, kid: asBool(m.isKid),
      joined: asDate(m.joinedOn) || asDate(m.CREATEDTIME),
      lang: m.appLanguage || 'en',
      address: [a.addressLine, a.city, a.pincode].filter(Boolean).join(', '),
      photo: m.photoFileId ? 'Approved' : 'None',
      crm: 'Pending', lastActive: null,
    };
  });
}

/* ---------- writes ----------

   Approving has to do two things, because access is gated on the member, not
   on the registration:

     Registrations.status -> 'approved'   the office's decision
     Members.status       -> 'active'     what actually opens the app

   THE TRAP: in this schema every phone number that asks for an OTP already
   has a Members row. So "a member row exists" must NOT mean "let them in" —
   that would admit everyone who ever typed their number. `canEnterApp` below
   is the real gate, and it checks the registration. */

export const MEMBER_ACTIVE = 'active';

/* ---------- the app writing in ----------

   A registration submitted from the Noah app has to be spread back across
   the same five tables the read joins together. One row per table, keyed on
   the member, which is found or created from the phone number.

   `phoneKey` is unique on Members, so a number that has already asked for an
   OTP reuses its row rather than colliding. */

const phoneKeyOf = (mobile) => {
  const s = String(mobile || '').trim();
  return s.startsWith('+') ? s.replace(/\s+/g, '') : '+' + s.replace(/\D/g, '');
};

/* Catalyst date columns want YYYY-MM-DD. The validator hands back a Date
   object, and String(date).slice(0, 10) quietly gives "Sun Jun 2", which
   Catalyst rejects with "date value expected". */
const asDay = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(+d) ? null : d.toISOString().slice(0, 10);
};

/** Find the Members row for a number, or create one. */
export async function findOrCreateMember(mobile, details = {}) {
  const key = phoneKeyOf(mobile);
  const existing = (await getRows(NOAH_TABLES.Members)).find((m) => m.phoneKey === key);

  const fields = {
    countryCode: key.slice(0, 3),
    mobileNumber: key.slice(3),
    ...(details.firstName !== undefined ? { firstName: details.firstName } : {}),
    ...(details.middleName !== undefined ? { middleName: details.middleName } : {}),
    ...(details.lastName !== undefined ? { lastName: details.lastName } : {}),
    ...(details.email ? { email: details.email } : {}),
    ...(details.gender ? { gender: details.gender } : {}),
    ...(asDay(details.dob) ? { dob: asDay(details.dob) } : {}),
    ...(details.marital ? { maritalStatus: details.marital } : {}),
    ...(details.salutation ? { salutation: details.salutation } : {}),
    ...(details.reference ? { referenceName: details.reference } : {}),
    ...(details.country ? { nationality: details.country } : {}),
  };

  if (existing) {
    await update(NOAH_TABLES.Members, { ROWID: existing.ROWID, ...fields });
    clearCache();
    return String(existing.ROWID);
  }

  await insert(NOAH_TABLES.Members, {
    phoneKey: key,
    isKid: false,
    isArchived: false,
    /* No status until the office approves. A status here would open the app. */
    ...fields,
  });
  clearCache();

  /* DO NOT use the ROWID from the insert response.

     Catalyst returns it unquoted there, so JSON.parse makes it a Number —
     and a Catalyst ROWID (27145000000069452) is past Number.MAX_SAFE_INTEGER,
     so the last digits are silently wrong. Using it as a foreign key fails
     with "Invalid Foreign key value for column memberRowId", which does not
     obviously point at a rounding problem.

     Reading the row back gives the id as a quoted string, intact. */
  const fresh = (await getRows(NOAH_TABLES.Members)).find((m) => m.phoneKey === key);
  if (!fresh) throw new Error('The member row was created but could not be read back.');
  return String(fresh.ROWID);
}

/** Their ID table has a column per type; put the number in the right one. */
const ID_COLUMN_FOR = {
  aadhaar: 'aadhaar', pan: 'pan', passport: 'passport',
  'driving licence': 'drivingLicence', dl: 'drivingLicence',
  'voter id': 'voterId', voter: 'voterId',
  'emirates id': 'emiratesId',
};

/**
 * Store a registration submitted from the app.
 * Returns the new Registrations ROWID, which is the id the console shows.
 */
export async function createRegistrationInNoah(v) {
  const memberRowId = await findOrCreateMember(v.mobile, v);
  if (!memberRowId) throw new Error('Could not create the member row for this number.');

  const when = new Date().toISOString().slice(0, 19).replace('T', ' ');
  /* Both lookups at once; each is a full table scan and there is no reason
     to wait for one before starting the other. */
  const [addresses, identities] = await Promise.all([
    getRows(NOAH_TABLES.MemberAddresses),
    getRows(NOAH_TABLES.MemberIdentity),
  ]);
  const existingAddress = addresses.find((a) => a.memberRowId === memberRowId);
  const existingIdentity = identities.find((i) => i.memberRowId === memberRowId);

  /* step 2, address */
  const address = {
    memberRowId,
    type: 'residence',
    addressLine: v.line1 || '',
    area: v.line2 || '',
    city: v.city || '',
    state: v.region || '',
    country: v.country || '',
    pincode: v.pin || '',
  };
  if (existingAddress) await update(NOAH_TABLES.MemberAddresses, { ROWID: existingAddress.ROWID, ...address });
  else await insert(NOAH_TABLES.MemberAddresses, address);

  /* step 3, the ID number, into its own column */
  const column = ID_COLUMN_FOR[String(v.idType || '').toLowerCase()];
  if (column && v.idNumber) {
    const identity = { memberRowId, [column]: v.idNumber };
    if (existingIdentity) await update(NOAH_TABLES.MemberIdentity, { ROWID: existingIdentity.ROWID, ...identity });
    else await insert(NOAH_TABLES.MemberIdentity, identity);
  }

  /* the review record itself. `submittedAt` is what puts it in the office's
     queue — a draft without it is someone still filling the form in. */
  const created = await insert(NOAH_TABLES.Registrations, {
    memberRowId,
    status: 'draft',
    submittedAt: when,
    declarationAccepted: !!v.agreed,
    declarationLanguage: v.declarationLang || 'en',
    declarationAcceptedAt: when,
    signatureText: v.signature || '',
    idProofType: String(v.idType || '').toLowerCase(),
    videoSeconds: Number(v.videoSecs || 0) || null,
    videoLanguage: v.declarationLang || 'en',
    profileVerified: false,
  });

  clearCache();

  /* Same precision trap as above: read the row back rather than trusting the
     unquoted ROWID in the insert response. */
  const fresh = (await getRows(NOAH_TABLES.Registrations))
    .filter((r) => r.memberRowId === memberRowId)
    .sort((a, b) => String(b.CREATEDTIME).localeCompare(String(a.CREATEDTIME)))[0];
  return fresh ? String(fresh.ROWID) : (Array.isArray(created) ? String(created[0]?.ROWID) : String(created?.ROWID));
}

/** Has this person been approved, and may the app open for them?

    Deliberately strict: it must find positive evidence of approval. A missing
    or unrecognised status is treated as "not approved", because the cost of
    guessing wrong is letting a stranger into the congregation's app. */
export function canEnterApp(member, registration) {
  if (!member) return false;
  if (String(member.rawStatus ?? '').toLowerCase() === MEMBER_ACTIVE) return true;
  /* For members approved before the status column was being written. */
  return String(registration?.rawStatus ?? '').toLowerCase() === 'approved';
}

/* ---------- member roles ---------- */

/** The MemberRoles row for a member, creating it if there is not one. */
export async function memberRolesRow(memberRowId, { create = false } = {}) {
  const rows = await getRows(NOAH_TABLES.MemberRoles);
  const existing = rows.find((r) => String(r.memberRowId) === String(memberRowId));
  if (existing || !create) return existing ?? null;

  await insert(NOAH_TABLES.MemberRoles, {
    memberRowId,
    /* Everyone approved is a church member. Nothing else is assumed. */
    isChurchMember: true,
    memberType: 'member',
  });
  clearCache();
  const fresh = (await getRows(NOAH_TABLES.MemberRoles))
    .find((r) => String(r.memberRowId) === String(memberRowId));
  return fresh ?? null;
}

/** Apply a set of column changes to a member's roles. */
export async function patchMemberRoles(memberRowId, patch) {
  const row = await memberRolesRow(memberRowId, { create: true });
  if (!row) throw new Error('Could not find or create the roles row for this member.');
  await update(NOAH_TABLES.MemberRoles, { ROWID: row.ROWID, ...patch });
  clearCache();
  return (await getRows(NOAH_TABLES.MemberRoles))
    .find((r) => String(r.ROWID) === String(row.ROWID)) ?? null;
}

/** Everyone's roles, keyed by member row id, for the list screens. */
export async function allMemberRoles() {
  const rows = await getRows(NOAH_TABLES.MemberRoles);
  const byMember = new Map();
  for (const r of rows) byMember.set(String(r.memberRowId), r);
  return byMember;
}

export async function approveInNoah({ registration, staffName, remark }) {
  const when = new Date().toISOString().slice(0, 19).replace('T', ' ');

  /* The member first. A member marked active whose registration still says
     pending is recoverable; a registration marked approved pointing at a
     member who cannot sign in is a person locked out with no trace. */
  await update(NOAH_TABLES.Members, {
    ROWID: registration.memberRowId,
    status: MEMBER_ACTIVE,
    joinedOn: when.slice(0, 10), /* already YYYY-MM-DD */
  });

  await update(NOAH_TABLES.Registrations, {
    ROWID: registration.rowId,
    status: 'approved',
    reviewedAt: when,
    reviewNote: remark || `Approved by ${staffName}`,
    profileVerified: true,
    profileVerifiedAt: when,
  });

  /* Everyone approved becomes an ordinary church member. Anything beyond
     that — pastor, cell leader, prayer warrior — is given deliberately
     afterwards, never as a side effect of being let in. */
  await memberRolesRow(registration.memberRowId, { create: true });

  clearCache();
  /* `id` as well as `memberRowId`: the same value here, but the contract and
     the app both ask for `id`. */
  return {
    id: registration.memberRowId,
    memberRowId: registration.memberRowId,
    status: MEMBER_ACTIVE,
    roles: ['member'],
  };
}

export async function returnVideoInNoah({ registration, staffName, remark }) {
  const when = new Date().toISOString().slice(0, 19).replace('T', ' ');

  /* Their schema has no `videoReturned` status — the agreed vocabulary is
     `draft` then `approved` (see docs/SCHEMA-RECONCILIATION.md). Until that
     conversation happens, returning sends it back to `draft` with the reason
     in reviewNote, and clears the video so the app asks for it again. That is
     reversible and loses nothing; inventing a status word they do not read
     would quietly break their app. */
  await update(NOAH_TABLES.Registrations, {
    ROWID: registration.rowId,
    status: 'draft',
    reviewedAt: when,
    reviewNote: remark,
    submittedAt: null,
    videoFileId: null,
    videoSeconds: null,
  });

  /* Make sure they cannot get in while the video is outstanding. */
  await update(NOAH_TABLES.Members, {
    ROWID: registration.memberRowId,
    status: 'pending',
  });

  clearCache();
  return { status: 'draft', remark };
}

/** Row counts for every table, for the survey screen. */
export async function surveyTables() {
  const names = Object.keys(NOAH_TABLES);
  const out = [];
  for (const name of names) {
    try {
      const rows = await getRows(NOAH_TABLES[name], { max: 1000 });
      out.push({ table: name, rows: rows.length, sample: rows[0] ?? null });
    } catch (err) {
      out.push({ table: name, rows: null, error: err.message });
    }
  }
  return out.sort((a, b) => (b.rows ?? -1) - (a.rows ?? -1));
}

/* The member half of an approval, without touching Registrations.

   When the Noah API makes the decision it also writes the registration and
   emails the member, so this end must not write `Registrations.status` —
   doing that again would be the silent approval the API exists to prevent.

   What the API does to the *member* row is its business and may change, so
   rather than assume, the approve route checks afterwards whether the member
   can actually get in and calls this only if they cannot. It is a repair, not
   part of the normal path. */
export async function activateMemberOnly(memberRowId) {
  const when = new Date().toISOString().slice(0, 10);
  await update(NOAH_TABLES.Members, {
    ROWID: memberRowId,
    status: MEMBER_ACTIVE,
    joinedOn: when,
  });
  await memberRolesRow(memberRowId, { create: true });
  clearCache();
  return { memberRowId, status: MEMBER_ACTIVE };
}

/* Translate a console-shaped patch into this schema's columns.

   The console speaks `state`, `videoSecs`, `remark`; this project's table has
   `status`, `videoSeconds`, `reviewNote`. Passing the console's names straight
   through made Catalyst reject the whole request — which is how a re-recorded
   video came to hang instead of saving.

   Only the fields that are actually sent are translated. Anything unrecognised
   is dropped rather than passed along, because one unknown column fails the
   entire write and takes the known-good fields down with it. */
export async function patchRegistrationInNoah(registration, patch) {
  const when = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const out = { ROWID: registration.rowId };

  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case 'state':
        /* 'pending' is not a status in this schema: it is a draft that has
           been submitted. See consoleState. */
        if (v === 'pending') {
          out.status = 'draft';
          out.submittedAt = patch.submittedAt || when;
          /* The reason it came back is spent once they act on it; leaving it
             would keep the registration reading as returned for ever. */
          out.reviewNote = '';
          out.reviewedAt = null;
        } else if (v === 'approved') {
          out.status = 'approved';
        } else if (v === 'videoReturned') {
          out.status = 'draft';
          out.reviewedAt = when;
        } else {
          out.status = v;
        }
        break;
      case 'videoSecs': out.videoSeconds = Number(v) || null; break;
      case 'remark': out.reviewNote = v; break;
      case 'submittedAt': out.submittedAt = v; break;
      case 'decidedAt': out.reviewedAt = v; break;
      case 'profileVerified': out.profileVerified = v; break;
      /* `videoFile` is a filename from the app. There is no column for one
         here — the file itself lives in the Files table — and writing it into
         videoFileId would put a name where an id belongs. */
      case 'videoFile': case 'memberId': case 'decidedBy': break;
      default: break;
    }
  }

  await update(NOAH_TABLES.Registrations, out);
  clearCache();
  return out;
}
