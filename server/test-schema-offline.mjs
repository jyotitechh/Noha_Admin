/* The schema logic, checked against an in-memory copy of the tables.

     npm run test:schema

   No network, no Catalyst, no Data Store fetches spent. The rows below copy the
   shapes seen in the live project — including the awkward ones:

     - `members.status` is true for EVERYONE, approved or not
     - a number that has only asked for an OTP already has a users row, a
       members row and a `draft` registration
     - ROWIDs are past Number.MAX_SAFE_INTEGER, so they are strings
     - Catalyst's own CREATEDTIME is IST; the columns the app writes are UTC

   What this proves is the logic: who is let in, how the join is built, what a
   decision writes. It cannot prove Catalyst accepts a given column — that is
   `npm run check:schema` and the live suites, when there is quota. */

import { rolesFromRow, patchForRole, appRoleSummary } from './roles.js';

import { S, T, tables, writes, reset, seed, U, M } from './fake-catalyst.mjs';

/* ---------- the harness ---------- */

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mok\x1b[0m    ${name}`); }
  else { fails.push(name); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n        \x1b[2m${detail}\x1b[0m` : ''}`); }
};
const section = (s) => console.log(`\n  ${s}\n`);
const wrote = (table) => writes.filter((w) => w.table === T[table]);

console.log('\nSchema logic, offline\n' + '─'.repeat(64));

/* ================================================================== */
section('Who is let in');

reset(seed());
const members = await S.loadMembers();
const regs = await S.loadRegistrations();
const m = (rowId) => members.find((x) => x.rowId === rowId);
const r = (rowId) => regs.find((x) => x.memberRowId === rowId);

check('every member row has status = true, so status cannot be the gate',
  S.io && (await S.io.getRows(T.members)).every((x) => x.status === true));

check('approved registration → let in', S.canEnterApp(m(M.approved), r(M.approved)));
check('someone who only asked for an OTP is NOT let in',
  !S.canEnterApp(m(M.draft), r(M.draft)),
  `member.status is true, registration is "${r(M.draft)?.rawStatus}"`);
check('…and reads "Not approved", never Active', m(M.draft).status === 'Not approved', m(M.draft).status);
check('a draft registration reads as draft', r(M.draft).state === 'draft');
check('verified by the office, no registration → let in', S.canEnterApp(m(M.office), undefined));
check('…and shows as Active', m(M.office).status === 'Active');
check('not verified, no registration → not let in',
  !S.canEnterApp({ officeVerified: false, blocked: false }, undefined));
check('a registration that says pending beats isUnVerified = false',
  !S.canEnterApp({ officeVerified: true }, { rawStatus: 'pending' }));
check('a rejected registration is not let in', !S.canEnterApp({}, { rawStatus: 'rejected' }));
check('a returned video is not let in', !S.canEnterApp({}, { rawStatus: 'videoReturned' }));
check('an unknown status is not let in', !S.canEnterApp({}, { rawStatus: 'banana' }));
check('no member at all is not let in', !S.canEnterApp(null, undefined));
check('an archived member is never let in, even approved',
  !S.canEnterApp({ blocked: true, officeVerified: true }, { rawStatus: 'approved' }));

reset({ ...seed(), users: seed().users.map((u) => (u.ROWID === U.otp ? { ...u, archived: true } : u)) });
const blocked = (await S.loadMembers()).find((x) => x.rowId === M.approved);
check('users.archived blocks the login',
  blocked.blocked && !S.canEnterApp(blocked, (await S.loadRegistrations()).find((x) => x.memberRowId === M.approved)));

/* ================================================================== */
section('The registration, joined');

reset(seed());
const reg = (await S.loadRegistrations()).find((x) => x.memberRowId === M.approved);

check('ids stay strings, intact', reg.id === '27145000000136691' && reg.memberRowId === M.approved);
check('the number is built from countryCode + mobileNumber1', reg.mobile === '+919000000779', reg.mobile);
check('gender 1 reads as male', reg.gender === 'male');
check('email, dob and marital come from members', reg.email === 'anand@example.com' && reg.marital === 'married' && reg.dob?.toISOString().startsWith('1990-05-14'));
check('referBy "name|+91|number" splits', reg.reference === 'Fr. Thomas' && reg.referencePhone === '9000011111', `${reg.reference} / ${reg.referencePhone}`);
check('address columns come from members', reg.line1 === '12 Mill Road' && reg.line2 === 'Kurla' && reg.city === 'Mumbai' && reg.region === 'Maharashtra' && reg.pin === '400070');
check('the ID number is found by the type the member declared', reg.idType === 'PAN' && reg.idNumber === 'ABCDE1234F', `${reg.idType} ${reg.idNumber}`);
check('uploads: names come from remoteSource', reg.videoFile === 'declaration.mp4' && reg.photoFile === 'photo.jpg' && reg.idFile === 'pan.png');
check('uploads: sizes in KB', reg.idSizeKb === 1 && reg.photoSizeKb === 2);
check('fileIds are the files ROWIDs, what the Noah API takes',
  reg.fileIds.video === '27145000000126953' && reg.fileIds.photo === '27145000000130921' && reg.fileIds.idProof === '27145000000142407');
check('storeIds are files.path, the File Store ids',
  reg.storeIds.video === '27145000000128680' && reg.storeIds.photo === '27145000000146032' && reg.storeIds.idProof === '27145000000133990');
check('the reviewer is read back out of the note', reg.decidedBy === 'Anitha Varghese', reg.decidedBy);
check('the declaration is read', reg.agreed && reg.signature === 'Anand Rao' && reg.declarationLang === 'en');
check('name matches signature', reg.checks.nameMatchesSignature === true);

check('submittedAt is read as UTC', +reg.at === +new Date('2026-10-19T12:34:09Z'), String(reg.at?.toISOString()));
const draftReg = (await S.loadRegistrations()).find((x) => x.memberRowId === M.draft);
check('CREATEDTIME is read as IST (5½ hours earlier than the same digits in UTC)',
  +draftReg.at === +new Date('2026-10-19T17:00:01+05:30'), String(draftReg.at?.toISOString()));

/* ================================================================== */
section('The member register');

const ms = await S.loadMembers();
check('names, and a placeholder when there is none', m(M.approved).name === 'Anand Rao' && ms.find((x) => x.rowId === M.blank).name === '(not registered yet)');
check('the pastor is named from connectedPastor', ms.find((x) => x.rowId === M.approved).pastor === 'Fr Thomas', String(ms.find((x) => x.rowId === M.approved).pastor));
check('partner comes from membersExtra', ms.find((x) => x.rowId === M.approved).partner === true);
check('a member with no membersExtra row still loads', ms.find((x) => x.rowId === M.office).partner === false);
check('an admin login is flagged', ms.find((x) => x.rowId === M.blank).isAdmin === true);
check('approved-but-never-submitted (test data) counts as approved by its row', ms.find((x) => x.rowId === M.blank).approved === true);

/* ================================================================== */
section('A registration submitted from the app');

reset(seed());
const before = {
  users: tables[T.users].length, members: tables[T.members].length,
  extras: tables[T.membersExtra].length, regs: tables[T.appRegistrations].length,
};
const newReg = await S.createRegistrationInNoah({
  mobile: '+91 98765 43210', salutation: 'Mrs', firstName: 'Kavya', middleName: '', lastName: 'Iyer',
  email: 'kavya@example.com', gender: 'female', dob: new Date('1994-03-02'), marital: 'single',
  reference: 'Friend', line1: '5 Lake View', line2: 'Powai', city: 'Mumbai', region: 'Maharashtra',
  country: 'India', pin: '400076', idType: 'Aadhaar', idNumber: '123412341234', agreed: true,
  declarationLang: 'en', signature: 'Kavya Iyer', videoSecs: 22,
});

const uNew = tables[T.users].at(-1);
const mNew = tables[T.members].at(-1);
check('a new login is created for a new number', tables[T.users].length === before.users + 1 && uNew.number === '9876543210' && uNew.countryCode === '+91');
check('…marked is_member', uNew.is_member === true);
check('a member is created, linked by userId', tables[T.members].length === before.members + 1 && mNew.userId === uNew.ROWID);
check('the member carries id = ROWID', mNew.id === mNew.ROWID, `${mNew.id} vs ${mNew.ROWID}`);
check('…and starts unverified', mNew.isUnVerified === true);
check('a membersExtra row is created with id = member ROWID', tables[T.membersExtra].length === before.extras + 1 && tables[T.membersExtra].at(-1).id === mNew.ROWID);
check('gender is stored as the int 2', mNew.gender === 2, String(mNew.gender));
check('the date of birth is a plain date', mNew.dateOfBirth === '1994-03-02', mNew.dateOfBirth);
check('the email goes to emailId1', mNew.emailId1 === 'kavya@example.com');
check('address columns are on the member', mNew.address === '5 Lake View' && mNew.area === 'Powai' && mNew.pincode === '400076');
check('the Aadhaar number goes to aadharNo', mNew.aadharNo === '123412341234', Object.keys(mNew).join(','));
check('a registration is created, pending', tables[T.appRegistrations].length === before.regs + 1 && tables[T.appRegistrations].at(-1).status === 'pending');
check('…its id is the ROWID read back, not the rounded number from the insert',
  newReg === tables[T.appRegistrations].at(-1).ROWID && /^\d{17}$/.test(newReg), String(newReg));
check('…and it is in the office queue',
  (await S.loadRegistrations()).find((x) => x.id === newReg)?.state === 'pending');
check('the new member is NOT let in',
  !S.canEnterApp((await S.loadMembers()).find((x) => x.rowId === mNew.ROWID), (await S.loadRegistrations()).find((x) => x.id === newReg)));

/* A number that has already asked for an OTP. */
reset(seed());
const draftId = await S.createRegistrationInNoah({
  mobile: '+91 90000 00777', firstName: 'Meera', lastName: 'Nair', gender: 'female',
  line1: 'x', city: 'Pune', region: 'MH', country: 'India', pin: '411001', idType: 'PAN', idNumber: 'ABCDE9999Z',
  agreed: true, signature: 'Meera Nair', videoSecs: 15,
});
check('an existing number reuses its login and member rather than duplicating',
  tables[T.users].length === 5 && tables[T.members].length === 5);
check('its empty draft is filled in, not left beside a second row',
  tables[T.appRegistrations].length === 4 && draftId === '27145000000128676');
check('…and now reads pending', tables[T.appRegistrations].find((x) => x.ROWID === draftId).status === 'pending');

reset(seed());
const { cc, number } = S.splitPhone('+971 50 123 4567');
check('a 3-digit country code is split off whole', cc === '971' && number === '501234567', `${cc} / ${number}`);
check('a 2-digit one', S.splitPhone('+91 95631 16482').cc === '91');
check('a 1-digit one', S.splitPhone('+1 415 555 0100').cc === '1');

/* ================================================================== */
section('Roles: spread over two tables');

reset(seed());
let row = await S.memberRolesRow(M.approved);
check('the merged row carries memberType and the flags together', row.memberType === null && row.isPartner === true);
check('a pastor is read from members.memberType', rolesFromRow(await S.memberRolesRow(M.pastor)).includes('pastor'));

await S.patchMemberRoles(M.approved, patchForRole('pastor', true));
check('giving pastor writes members.memberType', tables[T.members].find((x) => x.ROWID === M.approved).memberType === 'pastor');
check('…and nothing on membersExtra', wrote('membersExtra').length === 0);
check('…the app now sees a pastor', appRoleSummary(await S.memberRolesRow(M.approved)).isPastor === true);

writes.length = 0;
await S.patchMemberRoles(M.approved, patchForRole('prayerWarrior', true));
check('giving prayer warrior writes a flag on membersExtra', tables[T.membersExtra].find((x) => x.id === M.approved).isPrayerWarrior === true);
check('roles stack', rolesFromRow(await S.memberRolesRow(M.approved)).includes('pastor') && rolesFromRow(await S.memberRolesRow(M.approved)).includes('prayerWarrior'));

await S.patchMemberRoles(M.approved, patchForRole('pastor', false));
check('removing pastor returns memberType to something else', tables[T.members].find((x) => x.ROWID === M.approved).memberType === 'member');
check('…the app no longer sees a pastor', appRoleSummary(await S.memberRolesRow(M.approved)).isPastor === false);
check('…and the prayer warrior flag is untouched', tables[T.membersExtra].find((x) => x.id === M.approved).isPrayerWarrior === true);

const extrasBefore = tables[T.membersExtra].length;
await S.patchMemberRoles(M.office, patchForRole('leader', true));
check('a flag for a member with no membersExtra row creates it first', tables[T.membersExtra].length === extrasBefore + 1);
check('…joined by id = member ROWID', tables[T.membersExtra].at(-1).id === M.office && tables[T.membersExtra].at(-1).isLeader === true);

const all = await S.allMemberRoles();
check('everyone\'s roles are listed, including members with no extra row', all.size === 5 && all.get(M.blank).memberType === null);

/* ================================================================== */
section('A decision written straight to the tables (the fallback)');

reset(seed());
const target = (await S.loadRegistrations()).find((x) => x.memberRowId === M.draft);
const result = await S.approveInNoah({ registration: target, staffName: 'Anitha Varghese' });
const reg2 = tables[T.appRegistrations].find((x) => x.ROWID === target.rowId);
const mem2 = tables[T.members].find((x) => x.ROWID === M.draft);

check('the registration reads approved', reg2.status === 'approved');
check('…with reviewedAt and the reviewer in the note', /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(reg2.reviewedAt) && reg2.reviewNote === 'Approved by Anitha Varghese', `${reg2.reviewedAt} | ${reg2.reviewNote}`);
check('the member is marked verified', mem2.isUnVerified === false && !!mem2.verifiedOn);
check('members.status is not touched', !wrote('members').some((w) => 'status' in w.row));
check('the reply carries id', result.id === M.draft && result.memberRowId === M.draft);
check('the member can now enter',
  S.canEnterApp((await S.loadMembers()).find((x) => x.rowId === M.draft), (await S.loadRegistrations()).find((x) => x.memberRowId === M.draft)));
check('…and approval needed no membersExtra write', wrote('membersExtra').length === 0);

reset(seed());
const t2 = (await S.loadRegistrations()).find((x) => x.memberRowId === M.draft);
await S.returnVideoInNoah({ registration: t2, remark: 'The video is too dark.' });
const rv = tables[T.appRegistrations].find((x) => x.ROWID === t2.rowId);
check('return-video sets status and note', rv.status === 'videoReturned' && rv.reviewNote === 'The video is too dark.');
check('…and leaves the member alone', wrote('members').length === 0);
check('…the member is not let in', !S.canEnterApp((await S.loadMembers()).find((x) => x.rowId === M.draft), (await S.loadRegistrations()).find((x) => x.memberRowId === M.draft)));

reset(seed());
await S.rejectInNoah({ registration: t2, remark: 'ID does not match.' });
const rj = tables[T.appRegistrations].find((x) => x.ROWID === t2.rowId);
check('reject sets status and note', rj.status === 'rejected' && rj.reviewNote === 'ID does not match.');
check('…and leaves the member alone', wrote('members').length === 0);
check('a rejected member reads Rejected', (await S.loadMembers()).find((x) => x.rowId === M.draft).status === 'Rejected');

reset(seed());
await S.patchRegistrationInNoah(t2, { state: 'pending', videoSecs: 20, videoFile: 'kyc-2.mp4', remark: '' });
const rec = tables[T.appRegistrations].find((x) => x.ROWID === t2.rowId);
check('a re-recording is translated to this schema\'s columns', rec.status === 'pending' && rec.videoSeconds === 20 && !!rec.submittedAt);
check('…an unknown field (videoFile) is dropped, not sent', !('videoFile' in wrote('appRegistrations')[0].row));
check('…and the old reason is cleared', rec.reviewNote === '');

reset(seed());
await S.activateMemberOnly(M.draft);
check('the repair only marks the member verified', tables[T.members].find((x) => x.ROWID === M.draft).isUnVerified === false && wrote('appRegistrations').length === 0);

/* ================================================================== */
section('The cache');

reset(seed());
let fetches = 0;
const real = S.io.getRows;
S.io.getRows = async (...a) => { fetches++; return real(...a); };
await S.loadRegistrations(); const first = fetches;
await S.loadMembers(); await S.loadRegistrations(); await S.loadMembers();
check('four reads in a row cost one round of fetches', fetches === first && first === 5, `${fetches} fetches, first round ${first}`);
S.clearCache();
await S.loadMembers();
check('a write clears it, so the next read is fresh', fetches === first * 2);
S.io.getRows = real;

reset(seed());
const [a, b] = await Promise.all([S.loadMembers(), S.loadRegistrations()]);
check('two reads at once share one fetch', a.length > 0 && b.length > 0);

/* ---------- result ---------- */

console.log('\n' + '─'.repeat(64));
console.log(fails.length
  ? `\n  \x1b[31m${fails.length} failed\x1b[0m, ${pass} passed:\n${fails.map((f) => '   - ' + f).join('\n')}\n`
  : `\n  \x1b[32mAll ${pass} checks passed.\x1b[0m\n`);
process.exit(fails.length ? 1 : 0);
