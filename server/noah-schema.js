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

import { getRows } from './catalyst.js';

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

/** Everything the console needs for the registration queue, joined up. */
export async function loadRegistrations() {
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

  return regs.map((r) => {
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
      decidedBy: r.reviewedByLegacyId || '',
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
      status: m.status || (m.isArchived === 'true' ? 'Archived' : 'Active'),
      partner: false, kid: asBool(m.isKid),
      joined: asDate(m.joinedOn) || asDate(m.CREATEDTIME),
      lang: m.appLanguage || 'en',
      address: [a.addressLine, a.city, a.pincode].filter(Boolean).join(', '),
      photo: m.photoFileId ? 'Approved' : 'None',
      crm: 'Pending', lastActive: null,
    };
  });
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
