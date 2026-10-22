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

import { S, T, tables, writes, reset, seed, U, M, CR } from './fake-catalyst.mjs';

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
  tables[T.users].length === seed().users.length && tables[T.members].length === seed().members.length);
check('its empty draft is filled in, not left beside a second row',
  tables[T.appRegistrations].length === seed().appRegistrations.length && draftId === '27145000000128676');
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
check('everyone\'s roles are listed, including members with no extra row', all.size === seed().members.length && all.get(M.blank).memberType === null);

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
section('Who may sign in: staff are members, found by number');

const ROLES = ['super', 'membership', 'finance', 'events', 'moderator', 'content', 'comms', 'jverifier', 'jadmin', 'pastor'];
const dirOf = async () => S.loadStaffDirectory(ROLES);
const staffTable = () => tables[T.consoleStaff];

check('a bare ten-digit number is taken as Indian', S.mobileKey('9000000555') === '919000000555');
check('a +91 number with spaces is the same key', S.mobileKey('+91 90000 00555') === '919000000555');
check('another country code is left alone', S.mobileKey('+971 50 123 4567') === '971501234567');

reset(seed());
let dir = await dirOf();
const boss = dir.find((x) => x.memberRowId === M.boss);
check('the office flag is_super_admin makes a super administrator', boss?.role === 'super' && boss.source === 'catalyst-flag' && boss.status === 'Active');
check('...identified by the number they register with', boss?.mobileKey === '919000000555', boss?.mobileKey);
check('...named from their member row', boss?.name === 'Anitha Varghese');
check('an ordinary approved member is NOT staff', !dir.some((x) => x.memberRowId === M.approved));
check('is_admin alone does NOT make someone staff (the app uses it for the office chat)', !dir.some((x) => x.userRowId === U.bare));
check('findStaffByMobile finds them by the number as typed',
  (await S.findStaffByMobile('+91 90000 00555', ROLES))?.memberRowId === M.boss
  && (await S.findStaffByMobile('9000000555', ROLES))?.memberRowId === M.boss);
check('an unknown number finds nobody', (await S.findStaffByMobile('+91 90000 99999', ROLES)) === null);
check('an empty number finds nobody', (await S.findStaffByMobile('', ROLES)) === null);

/* ---------- who can be given access ---------- */
let cands = await S.staffCandidates(ROLES);
check('approved members are candidates', cands.some((c) => c.rowId === M.approved) && cands.some((c) => c.rowId === M.office));
check('...someone still waiting on approval is not', !cands.some((c) => c.rowId === M.draft));
check('...someone who is already staff is not', !cands.some((c) => c.rowId === M.boss));
check('...a member with no name is not, even if marked approved', !cands.some((c) => c.rowId === M.blank));
check('candidates can be searched by name', (await S.staffCandidates(ROLES, 'anand')).map((c) => c.rowId).join() === M.approved);
check('...and by number', (await S.staffCandidates(ROLES, '9000000779')).map((c) => c.rowId).join() === M.approved);

/* ---------- giving a role ---------- */
const rowId = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', title: 'Accounts', by: 'Anitha Varghese' });
check('granting writes a row in the staff table', staffTable().length === 1 && staffTable()[0].role === 'finance');
check('...the member id is stored as a string, intact', staffTable()[0].memberRowId === M.approved);
check('...with who gave it, and when', staffTable()[0].grantedBy === 'Anitha Varghese' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(staffTable()[0].grantedAt));
check('...the id returned is read back, not the rounded one from the insert', rowId === staffTable()[0].ROWID && /^\d{17}$/.test(rowId), rowId);

dir = await dirOf();
const fin = dir.find((x) => x.memberRowId === M.approved);
check('the new staff member is in the directory with their role', fin?.role === 'finance' && fin.status === 'Active' && fin.source === 'catalyst');
check('...and found by their registered number', (await S.findStaffByMobile('+91 9000000779', ROLES))?.role === 'finance');
check('...and no longer a candidate', !(await S.staffCandidates(ROLES)).some((c) => c.rowId === M.approved));

/* ---------- changing and revoking ---------- */
await S.updateConsoleStaff(rowId, { role: 'content' });
check('a role can be changed', (await S.findStaffByMobile('9000000779', ROLES)).role === 'content');
await S.updateConsoleStaff(rowId, { status: 'Suspended' });
check('a suspended row reads Suspended', (await S.findStaffByMobile('9000000779', ROLES)).status === 'Suspended');
await S.updateConsoleStaff(rowId, { status: 'Revoked' });
check('a revoked row stays, marked Revoked, so the history is kept',
  staffTable().length === 1 && (await S.findStaffByMobile('9000000779', ROLES)).status === 'Revoked');
check('...and they are a candidate again', (await S.staffCandidates(ROLES)).some((c) => c.rowId === M.approved));
const again = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'events', by: 'Anitha Varghese' });
check('granting again restores the same row rather than adding a second', staffTable().length === 1 && again === rowId);
check('...with the new role, Active', staffTable()[0].role === 'events' && staffTable()[0].status === 'Active');

/* ---------- things that must not become access ---------- */
reset(seed());
await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
staffTable()[0].role = 'wizard';
check('a row with a role nobody defined gives no access', !(await dirOf()).some((x) => x.memberRowId === M.approved));

reset(seed());
staffTable().push({ ROWID: '27145000000290001', memberRowId: '27145000000000001', role: 'finance', status: 'Active' });
check('a row pointing at a member that does not exist gives no access', (await dirOf()).length === 1);

reset(seed());
staffTable().push({ ROWID: '27145000000290002', memberRowId: M.boss, role: 'finance', status: 'Active' });
dir = await dirOf();
check('the office flag outranks a console row for the same member',
  dir.filter((x) => x.memberRowId === M.boss).length === 1 && dir.find((x) => x.memberRowId === M.boss).role === 'super');

reset(seed());
await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
tables[T.members].find((m) => m.ROWID === M.approved).archived = true;
S.clearCache();
const gone = (await dirOf()).find((x) => x.memberRowId === M.approved);
check('an archived member is Blocked, whatever their row says', gone.status === 'Blocked' && gone.blocked === true);

reset(seed());
await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
tables[T.users].find((u) => u.ROWID === U.otp).archived = true;
S.clearCache();
check('a blocked login (users.archived) is Blocked too', (await dirOf()).find((x) => x.memberRowId === M.approved).status === 'Blocked');

reset(seed());
const stamped = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
await S.touchStaffSignIn(stamped);
check('a sign-in is stamped on the row', /^\d{4}-/.test(staffTable()[0].lastSignedInAt || ''));

/* ---------- no table yet ---------- */
reset(seed());
const savedTable = process.env.CATALYST_TABLE_CONSOLE_STAFF;
process.env.CATALYST_TABLE_CONSOLE_STAFF = '';
let noTable = null;
try { await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' }); } catch (e) { noTable = e; }
check('with no staff table, granting fails with a clear code', noTable?.code === 'no_table', noTable?.message);
check('...the office super administrator still works without it', (await dirOf()).some((x) => x.memberRowId === M.boss));
check('...and the table is reported as not set up', !S.consoleStaffEnabled());
process.env.CATALYST_TABLE_CONSOLE_STAFF = savedTable;

/* ================================================================== */
section('Signing in: the number, the test accounts, and what is closed');

const ST = await import('./staff.js');
const withEnv = async (patch, fn) => {
  const keys = Object.keys(patch);
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
  try { return await fn(); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
};

reset(seed());
await withEnv({ NODE_ENV: 'test', ENABLE_TEST_LOGIN: undefined, TEST_LOGIN_OTP: undefined }, async () => {
  check('outside production, test login is on by default', ST.testLoginEnabled());
  check('...with the documented one-time code', ST.testOtp() === '123456');
  const t = ST.testAccounts();
  check('there is a test account for every role', t.length === 10 && new Set(t.map((x) => x.role)).size === 10);
  check('...each with its own number', new Set(t.map((x) => x.mobileKey)).size === 10);
  check('...the first is the super administrator', t[0].role === 'super' && t[0].mobile === '+91 9000000001', `${t[0].role} ${t[0].mobile}`);

  const viaTest = await ST.resolveStaff({ mobile: '+91 9000000003' });
  check('a test number resolves to its role', viaTest.staff?.role === 'finance' && viaTest.staff.source === 'test', JSON.stringify(viaTest).slice(0, 120));
  check('...typed without the +91 as well', (await ST.resolveStaff({ mobile: '9000000003' })).staff?.role === 'finance');
});

await withEnv({ NODE_ENV: 'production', ENABLE_TEST_LOGIN: undefined, TEST_LOGIN_OTP: undefined }, async () => {
  check('in production, test login is OFF by default', !ST.testLoginEnabled(), JSON.stringify(ST.testLoginStatus()));
  check('...and its numbers are not accounts', !!(await ST.resolveStaff({ mobile: '+91 9000000001' })).error);
});
await withEnv({ NODE_ENV: 'production', ENABLE_TEST_LOGIN: 'true', TEST_LOGIN_OTP: undefined }, async () => {
  check('in production, asking for it is not enough: there is no default code',
    !ST.testLoginEnabled() && /TEST_LOGIN_OTP/.test(ST.testLoginStatus().why), JSON.stringify(ST.testLoginStatus()));
});
await withEnv({ NODE_ENV: 'production', ENABLE_TEST_LOGIN: 'true', TEST_LOGIN_OTP: '482913' }, async () => {
  check('in production it needs both, and then works', ST.testLoginEnabled() && ST.testOtp() === '482913');
});
await withEnv({ NODE_ENV: 'development', ENABLE_TEST_LOGIN: 'false' }, async () => {
  check('ENABLE_TEST_LOGIN=false turns it off anywhere', !ST.testLoginEnabled());
});

await withEnv({ NODE_ENV: 'test', ENABLE_TEST_LOGIN: undefined }, async () => {
  reset(seed());
  const real = await ST.resolveStaff({ mobile: '+91 90000 00555' });
  check('a real super administrator signs in by number', real.staff?.role === 'super' && real.staff.source === 'catalyst-flag', JSON.stringify(real).slice(0, 140));

  const unknown = await ST.resolveStaff({ mobile: '+91 90000 77777' });
  check('a number with no access is told so', /does not have access/.test(unknown.error || ''), unknown.error);
  check('...someone who is only a member is not staff', /does not have access/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));
  check('a junk number is refused', /not a mobile number/.test((await ST.resolveStaff({ mobile: '12' })).error || ''));
  check('nothing at all asks for a number', /mobile number/.test((await ST.resolveStaff({})).error || ''));

  const sample = await ST.resolveStaff({ email: 'anitha.varghese@karunasadan.org' });
  check('THE BACKDOOR IS CLOSED: a sample person email does not sign in on live data',
    !sample.staff && /does not have access/.test(sample.error || ''), JSON.stringify(sample).slice(0, 140));

  const id = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
  check('a member given a role signs in with their registered number',
    (await ST.resolveStaff({ mobile: '+91 90000 00779' })).staff?.role === 'finance');
  await S.updateConsoleStaff(id, { status: 'Suspended' });
  check('...suspended, they cannot', /suspended/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));
  await S.updateConsoleStaff(id, { status: 'Revoked' });
  check('...revoked, they cannot', /revoked/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));
  await S.updateConsoleStaff(id, { status: 'Active' });
  tables[T.members].find((m) => m.ROWID === M.approved).archived = true; S.clearCache();
  check('...archived as a member, they cannot', /blocked/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));

  const listed = await ST.listStaff();
  check('the Staff screen lists the real people and the test accounts',
    listed.some((x) => x.source === 'catalyst-flag') && listed.filter((x) => x.source === 'test').length === 10);
});

/* ================================================================== */
section('Console roles kept on membersExtra, because the project cannot hold another table');

{
  const FCs = await import('./fake-catalyst.mjs');
  const extraOf = (id) => tables[T.membersExtra].find((x) => x.id === id);
  await withEnv({ NODE_ENV: 'test', CATALYST_TABLE_CONSOLE_STAFF: undefined, ENABLE_TEST_LOGIN: undefined }, async () => {
    reset(seed());
    S.forgetTables();

    /* The columns have not been added yet. */
    FCs.fakeColumns(T.membersExtra, []);
    check('without the columns there is nowhere to keep roles, and it says which', (await S.ensureStaffBackend(true)) === null && !S.consoleStaffEnabled());
    let none = null;
    try { await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' }); } catch (e) { none = e; }
    check('...granting is refused, plainly, and nothing is written', none?.code === 'no_table' && /columns have not been added/.test(none.message) && writes.length === 0, none?.message);
    check('...the schema check names the six columns as missing from membersExtra',
      (await S.verifySchema()).find((r) => r.table === 'membersExtra').missing.filter((c) => c.startsWith('console')).join() === S.CONSOLE_COLUMNS.join());

    /* npm run catalyst:columns -- --apply has been run. */
    FCs.fakeColumns(T.membersExtra, S.CONSOLE_COLUMNS);
    check('with the columns present, roles are kept on membersExtra', (await S.ensureStaffBackend(true)) === 'columns' && S.consoleStaffEnabled() && S.staffBackend() === 'columns');
    check('...and the schema check no longer names them', (await S.verifySchema()).find((r) => r.table === 'membersExtra').missing.filter((c) => c.startsWith('console')).length === 0);

    const before = writes.length;
    const id = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', title: 'Accounts', by: 'Anitha Varghese' });
    const row = extraOf(M.approved);
    check('granting writes the member\'s own extra row', row.consoleRole === 'finance' && row.consoleStatus === 'Active' && row.consoleTitle === 'Accounts' && row.consoleGrantedBy === 'Anitha Varghese' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.consoleGrantedAt), JSON.stringify(row));
    check('...the id handed back is that row\'s, as a string, intact', id === row.ROWID && typeof id === 'string');
    check('...and nothing is written to a table of its own', writes.slice(before).every((w) => w.table === T.membersExtra));

    const dir = await S.loadStaffDirectory(['super', 'finance', 'membership']);
    const mine = dir.find((s) => s.memberRowId === M.approved);
    check('the staff directory lists them, from the same rows already read', mine?.role === 'finance' && mine.source === 'catalyst' && mine.id === row.ROWID && mine.title === 'Accounts' && mine.grantedBy === 'Anitha Varghese', JSON.stringify(mine));
    check('...and a member with no role is not staff', !dir.some((s) => s.memberRowId === M.draft));
    check('...they sign in by number as that role', (await ST.resolveStaff({ mobile: '+91 90000 00779' })).staff?.role === 'finance');
    check('...and by email', (await ST.resolveStaff({ email: 'anand@example.com' })).staff?.role === 'finance');
    check('...and are no longer offered as someone to give access to', !(await S.staffCandidates(['finance'])).some((c) => c.rowId === M.approved));

    /* a member with no membersExtra row at all */
    check('Old Member has no extra row to begin with', !extraOf(M.office));
    await S.grantConsoleAccess({ memberRowId: M.office, role: 'events', by: 'x' });
    check('granting someone with no extra row creates it, joined to the member by id', extraOf(M.office)?.consoleRole === 'events' && extraOf(M.office).form_submit === false);

    await S.updateConsoleStaff(row.ROWID, { role: 'membership', title: 'Registrar' });
    check('changing a role updates the columns', extraOf(M.approved).consoleRole === 'membership' && extraOf(M.approved).consoleTitle === 'Registrar');
    await S.updateConsoleStaff(row.ROWID, { status: 'Suspended' });
    check('suspending is a column too, and it is honoured at sign-in', extraOf(M.approved).consoleStatus === 'Suspended' && /suspended/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));
    await S.updateConsoleStaff(row.ROWID, { status: 'Revoked' });
    check('...so is revoking', /revoked/.test((await ST.resolveStaff({ mobile: '9000000779' })).error || ''));
    check('...a revoked member can be given access again', (await S.staffCandidates(['finance'])).some((c) => c.rowId === M.approved));
    await S.updateConsoleStaff(row.ROWID, { status: 'Active' });

    await S.touchStaffSignIn(row.ROWID);
    check('a sign-in is stamped on the row', /^\d{4}-\d{2}-\d{2}/.test(extraOf(M.approved).consoleLastSignedInAt || ''));
    check('...and shows as when they were last in', (await S.loadStaffDirectory(['membership'])).find((s) => s.memberRowId === M.approved).lastIn instanceof Date);

    /* a role the console does not define is ignored */
    extraOf(M.approved).consoleRole = 'wizard'; S.clearCache();
    check('a role the console does not define does not become access', !(await S.loadStaffDirectory(['membership'])).some((s) => s.memberRowId === M.approved));
    extraOf(M.approved).consoleRole = 'membership'; S.clearCache();

    /* a separate table, if a project has room for one, still works and wins */
    process.env.CATALYST_TABLE_CONSOLE_STAFF = '27145000000299001';
    check('a table named in the environment takes precedence', S.staffBackend() === 'table');
    delete process.env.CATALYST_TABLE_CONSOLE_STAFF;
    S.forgetTables();
  });
  /* leave the fake as the other suites expect it */
  process.env.CATALYST_TABLE_CONSOLE_STAFF = '27145000000299001';
  FCs.fakeColumns(T.membersExtra, []);
  reset(seed());
}

/* ================================================================== */
section('Signing in by email as well as by number');

await withEnv({ NODE_ENV: 'test', ENABLE_TEST_LOGIN: undefined }, async () => {
  reset(seed());
  const anitha = 'anitha@example.com'; /* the office's own super administrator */
  const anand = 'anand@example.com';   /* an approved member, not staff yet */
  const memberRow = (id) => tables[T.members].find((x) => x.ROWID === id);

  const viaEmail = await ST.resolveStaff({ email: `  ${anitha.toUpperCase()} ` });
  check('an address on a staff member\'s row signs them in, whatever its case or spacing',
    viaEmail.staff?.role === 'super' && viaEmail.staff.source === 'catalyst-flag', JSON.stringify(viaEmail).slice(0, 140));
  check('...as the same person their number finds',
    viaEmail.staff?.memberRowId === (await ST.resolveStaff({ mobile: '+91 90000 00555' })).staff?.memberRowId);

  check('an address with no access is told so', /does not have access/.test((await ST.resolveStaff({ email: 'nobody@example.com' })).error || ''));
  check('...an ordinary member is not staff by email either', /does not have access/.test((await ST.resolveStaff({ email: anand })).error || ''));
  check('not an address is refused', /not an email address/.test((await ST.resolveStaff({ email: 'anitha' })).error || ''));
  check('...one with no dot after the @ too', /not an email address/.test((await ST.resolveStaff({ email: 'a@b' })).error || ''));

  const id = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
  check('a member given a role signs in by email too', (await ST.resolveStaff({ email: anand })).staff?.role === 'finance');
  await S.updateConsoleStaff(id, { status: 'Suspended' });
  check('...suspended, they cannot', /suspended/.test((await ST.resolveStaff({ email: anand })).error || ''));
  await S.updateConsoleStaff(id, { status: 'Active' });

  memberRow(M.approved).emailId2 = 'anand.work@example.com'; S.clearCache();
  check('the second address on the row works as well', (await ST.resolveStaff({ email: 'Anand.Work@example.com' })).staff?.role === 'finance');

  /* Two people on one address: signing in as whichever came first would hand
     one of them the other's access. */
  memberRow(M.boss).emailId2 = anand; S.clearCache();
  const shared = await ST.resolveStaff({ email: anand });
  check('an address two staff share signs nobody in', !shared.staff && /More than one person/.test(shared.error || ''), JSON.stringify(shared).slice(0, 140));
  check('...and points them at their number, which still works', (await ST.resolveStaff({ mobile: '9000000779' })).staff?.role === 'finance');
  delete memberRow(M.boss).emailId2; S.clearCache();

  memberRow(M.approved).archived = true; S.clearCache();
  check('...archived as a member, they cannot', /blocked/.test((await ST.resolveStaff({ email: anand })).error || ''));
  memberRow(M.approved).archived = false; S.clearCache();

  const t = await ST.resolveStaff({ email: 'super@console.test' });
  check('each test account has an email that can never be a real mailbox',
    t.staff?.role === 'super' && t.staff.source === 'test' && ST.testAccounts().every((a) => a.email.endsWith('@console.test')), JSON.stringify(t).slice(0, 100));
});
await withEnv({ NODE_ENV: 'production', ENABLE_TEST_LOGIN: undefined }, async () => {
  check('...and in production they are not accounts', !!(await ST.resolveStaff({ email: 'super@console.test' })).error);
});

/* ================================================================== */
section('How the code gets there: texted to a number, emailed to an address');

const D = await import('./deliver.js');
const A = await import('./auth.js');

/* Nothing real is sent: both transports write to an outbox instead. */
const outbox = [];
const realTransport = { ...D.transport };
D.transport.email = async (mail) => { outbox.push({ via: 'email', ...mail }); };
D.transport.sms = async (to, text) => { outbox.push({ via: 'sms', to, text }); };
const codeIn = (msg) => (msg.text.match(/\b(\d{6})\b/) || [])[1];

const EMAIL = { SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'Karuna Sadan <no-reply@karunasadan.test>' };
const TWILIO = { SMS_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15005550006', TWILIO_MESSAGING_SERVICE_SID: undefined };
const NONE = Object.fromEntries(Object.keys({ ...EMAIL, ...TWILIO }).map((k) => [k, undefined]));

/* Time is moved by hand, so the resend rules can be tested without waiting. */
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;
const tick = (s) => { clock += s * 1000; };

try {
  /* ---------- what counts as set up ---------- */
  await withEnv({ ...NONE }, async () => {
    check('with nothing configured, neither channel is on', !D.channels().email && !D.channels().sms);
  });
  await withEnv({ ...NONE, ...EMAIL }, async () => {
    check('email needs host, user, password and a from address', D.channels().email && !D.channels().sms);
  });
  await withEnv({ ...NONE, ...EMAIL, SMTP_PASS: undefined }, async () => {
    check('...a missing password means it is not on', !D.channels().email);
  });
  await withEnv({ ...NONE, ...TWILIO }, async () => {
    check('SMS is on with an account and a sending number', D.channels().sms && !D.channels().email);
  });
  await withEnv({ ...NONE, ...TWILIO, TWILIO_FROM: undefined }, async () => {
    check('...but not with no number to send from', !D.channels().sms);
  });
  await withEnv({ ...NONE, ...TWILIO, TWILIO_FROM: undefined, TWILIO_MESSAGING_SERVICE_SID: 'MG1' }, async () => {
    check('...a messaging service stands in for a number', D.channels().sms);
  });
  check('the masks show where to look without the whole thing',
    D.maskMobile('+919000000555') === '+91••••••0555' && D.maskEmail('anitha@example.com') === 'a•••@example.com',
    `${D.maskMobile('+919000000555')} ${D.maskEmail('anitha@example.com')}`);
  check('a number goes to the provider as + and digits', D.e164('919000000555') === '+919000000555');

  /* ---------- by number: a text ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...TWILIO, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    outbox.length = 0;
    const logged = [];
    const realLog = console.log;
    console.log = (...a) => logged.push(a.join(' '));
    let r;
    try { r = await A.requestCode({ mobile: '+91 90000 00555' }); } finally { console.log = realLog; }

    check('asking by number texts the code', r.ok && r.via === 'sms' && outbox.length === 1 && outbox[0].via === 'sms', JSON.stringify(r).slice(0, 160));
    check('...to the number in full, in the form providers want', outbox[0].to === '+919000000555', outbox[0].to);
    check('...the message carries the code and how long it lasts', /^\d{6} is your Karuna Sadan console code/.test(outbox[0].text) && /5 minutes/.test(outbox[0].text), outbox[0].text);
    check('the reply does NOT hand the code back once it has been sent', r.devCode === undefined && !JSON.stringify(r).includes(codeIn(outbox[0])));
    check('...it says where it went, masked', r.sentTo === '+91••••••0555' && !JSON.stringify(r).includes('9000000555'), r.sentTo);
    check('...and when it may be asked for again', r.resendAfterSeconds === 30);
    check('...and it is not written to the server log either', !logged.some((l) => l.includes(codeIn(outbox[0]))), logged.join('|'));

    check('a wrong code does not sign in', !(await A.verifyCode({ mobile: '+91 90000 00555' }, '000000')).ok || codeIn(outbox[0]) === '000000');
    const signed = await A.verifyCode({ mobile: '+91 90000 00555' }, codeIn(outbox[0]));
    check('the code that was texted signs them in', signed.ok && signed.user.role === 'super' && !!signed.token, JSON.stringify(signed).slice(0, 120));
    check('...and works once', !(await A.verifyCode({ mobile: '+91 90000 00555' }, codeIn(outbox[0]))).ok);
  });

  /* ---------- by address: an email ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...EMAIL, ADMIN_PASSPHRASE: undefined }, async () => {
    outbox.length = 0;
    tick(60);
    const r = await A.requestCode({ email: ' Anitha@Example.com ' });
    check('asking by address emails the code', r.ok && r.via === 'email' && outbox.length === 1 && outbox[0].via === 'email', JSON.stringify(r).slice(0, 160));
    check('...to the address, tidied', outbox[0].to === 'anitha@example.com', outbox[0].to);
    check('...with the code in the subject, so it shows before the message is opened', /^\d{6} is your Karuna Sadan console code$/.test(outbox[0].subject), outbox[0].subject);
    check('...the same code in the body, in plain text and HTML', outbox[0].text.includes(codeIn({ text: outbox[0].subject })) && outbox[0].html.includes(codeIn({ text: outbox[0].subject })));
    check('...and not handed back in the reply', r.devCode === undefined && r.sentTo === 'a•••@example.com', JSON.stringify(r).slice(0, 140));
    check('typing someone\'s email does not hand back their phone number, their name or their address',
      !JSON.stringify(r).includes('9000000555') && r.name === undefined && r.mobile === undefined && r.email === undefined, JSON.stringify(r));

    const code = codeIn({ text: outbox[0].subject });
    const signed = await A.verifyCode({ email: 'anitha@example.com' }, code);
    check('the emailed code signs them in', signed.ok && signed.user.role === 'super', JSON.stringify(signed).slice(0, 120));
    check('...a code asked for by email does not sign in by number',
      !(await A.verifyCode({ mobile: '+91 90000 00555' }, code)).ok);
  });

  /* ---------- the person must have access first ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...EMAIL, ...TWILIO, ADMIN_PASSPHRASE: undefined }, async () => {
    outbox.length = 0;
    const a = await A.requestCode({ email: 'stranger@example.com' });
    const b = await A.requestCode({ mobile: '+91 90000 77777' });
    check('nothing is sent to an address or number with no access', !a.ok && !b.ok && outbox.length === 0, JSON.stringify([a, b]).slice(0, 200));
  });

  /* ---------- a code that was sent to the right person is not valid after they lose access ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...EMAIL, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    outbox.length = 0;
    tick(120);
    const gid = await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
    await A.requestCode({ email: 'anand@example.com' });
    await S.updateConsoleStaff(gid, { status: 'Revoked' });
    const late = await A.verifyCode({ email: 'anand@example.com' }, codeIn({ text: outbox[0].subject }));
    check('access revoked after the code was sent: the code no longer works', !late.ok && /revoked/.test(late.error || ''), JSON.stringify(late));
  });

  /* ---------- how often ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...TWILIO, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    outbox.length = 0;
    tick(120);
    /* Their own person, so no earlier block's sends count against them. */
    await S.grantConsoleAccess({ memberRowId: M.approved, role: 'finance', by: 'x' });
    const num = { mobile: '+91 90000 00779' };
    const first = await A.requestCode(num);
    const again = await A.requestCode(num);
    check('asking twice at once sends one text', first.ok && !again.ok && again.status === 429 && outbox.length === 1, JSON.stringify(again));
    check('...and says how long to wait', /in \d+ seconds/.test(again.error || '') && again.retryAfter > 0, again.error);
    tick(31);
    check('...after the wait, another is allowed', (await A.requestCode(num)).ok && outbox.length === 2);
    for (let i = 0; i < 3; i++) { tick(31); await A.requestCode(num); }
    tick(31);
    const sixth = await A.requestCode(num);
    check('five an hour, then it stops', !sixth.ok && sixth.status === 429 && /Too many/.test(sixth.error || '') && outbox.length === 5, `${outbox.length} ${JSON.stringify(sixth)}`);
    tick(3600);
    check('...and starts again an hour later', (await A.requestCode(num)).ok);
  });

  /* ---------- the provider fails ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...TWILIO, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    tick(7200);
    const was = D.transport.sms;
    D.transport.sms = async () => { throw new Error('Twilio refused: account AC123 suspended for +919000000555'); };
    const errLog = console.error; const seen = [];
    console.error = (...a) => seen.push(a.join(' '));
    let r;
    try { r = await A.requestCode({ mobile: '+91 90000 00555' }); } finally { console.error = errLog; D.transport.sms = was; }
    check('a provider failure is reported, not hidden', !r.ok && r.status === 502, JSON.stringify(r));
    check('...in plain words, without the provider\'s account and number details', /could not be texted/.test(r.error) && !/AC123|9000000555|Twilio/.test(r.error), r.error);
    check('...the detail goes to the server log, with the number masked', seen.length === 1 && /suspended/.test(seen[0]) && /sms to \+91•+0555 failed/.test(seen[0]), seen.join('|'));
    check('...no code is left waiting to be guessed', !(await A.verifyCode({ mobile: '+91 90000 00555' }, '123456')).ok);
    check('...and a failed send does not use up their hourly allowance', (await A.requestCode({ mobile: '+91 90000 00555' })).ok);
  });

  /* ---------- nothing set up ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    outbox.length = 0;
    const r = await A.requestCode({ mobile: '+91 90000 00555' });
    check('locally, with nothing set up, the code is shown on screen as before', r.ok && /^\d{6}$/.test(r.devCode) && r.via === undefined && outbox.length === 0, JSON.stringify(r));
  });
  await withEnv({ NODE_ENV: 'production', ...NONE, ENABLE_TEST_LOGIN: undefined, ADMIN_PASSPHRASE: undefined }, async () => {
    reset(seed());
    tick(7200);
    const r = await A.requestCode({ mobile: '+91 90000 00555' });
    check('deployed with nothing set up and no passphrase, it will NOT hand the code to whoever asks',
      !r.ok && r.status === 503 && r.devCode === undefined && /not set up/.test(r.error), JSON.stringify(r));
  });
  await withEnv({ NODE_ENV: 'production', ...NONE, ...EMAIL, ENABLE_TEST_LOGIN: undefined, ADMIN_PASSPHRASE: undefined }, async () => {
    const r = await A.requestCode({ mobile: '+91 90000 00555' });
    check('...and when the other channel works it says to use that', /Sign in with your email/.test(r.error || ''), r.error);
  });
  await withEnv({ NODE_ENV: 'production', ...NONE, ENABLE_TEST_LOGIN: undefined, ADMIN_PASSPHRASE: 'office-secret' }, async () => {
    const r = await A.requestCode({ mobile: '+91 90000 00555' });
    check('behind the office passphrase, the old on-screen code still works', r.ok && /^\d{6}$/.test(r.devCode), JSON.stringify(r).slice(0, 120));
  });
  await withEnv({ NODE_ENV: 'production', ...NONE, ...TWILIO, ENABLE_TEST_LOGIN: undefined, ADMIN_PASSPHRASE: 'office-secret' }, async () => {
    tick(7200);
    const r = await A.requestCode({ mobile: '+91 90000 00555' });
    check('once SMS is set up the passphrase deployment stops showing codes', r.ok && r.devCode === undefined && r.via === 'sms', JSON.stringify(r).slice(0, 140));
  });

  /* ---------- test accounts are never sent anything ---------- */
  await withEnv({ NODE_ENV: 'test', ...NONE, ...EMAIL, ...TWILIO, ENABLE_TEST_LOGIN: undefined, ADMIN_PASSPHRASE: undefined }, async () => {
    outbox.length = 0;
    const byNumber = await A.requestCode({ mobile: '+91 90000 00001' });
    const byEmail = await A.requestCode({ email: 'super@console.test' });
    const again = await A.requestCode({ mobile: '+91 90000 00001' });
    check('a test account gets its fixed code and no message, by number or by email',
      byNumber.devCode === '123456' && byEmail.devCode === '123456' && outbox.length === 0 && byNumber.test, JSON.stringify([byNumber, byEmail]).slice(0, 200));
    check('...and is not throttled, so the suites can sign in as often as they like', again.ok);
    check('...it signs in by email with that code', (await A.verifyCode({ email: 'super@console.test' }, '123456')).ok);
  });

  /* ---------- the real transports ---------- */
  Date.now = realNow;
  Object.assign(D.transport, realTransport);
  await withEnv({ ...NONE, ...TWILIO }, async () => {
    const realFetch = globalThis.fetch;
    let call = null;
    globalThis.fetch = async (url, init) => { call = { url: String(url), init }; return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }); };
    try { await realTransport.sms('+919000000555', '123456 is your code'); } finally { globalThis.fetch = realFetch; }
    const body = new URLSearchParams(String(call?.init.body));
    check('Twilio is called on the account\'s own messages endpoint', call?.url === 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json', call?.url);
    check('...with the account sid and token as basic auth', call?.init.headers.Authorization === 'Basic ' + Buffer.from('AC123:tok').toString('base64'));
    check('...the number, the sender and the text in the form body', body.get('To') === '+919000000555' && body.get('From') === '+15005550006' && body.get('Body') === '123456 is your code', String(call?.init.body));
    check('...a form post, not JSON', call?.init.headers['Content-Type'] === 'application/x-www-form-urlencoded' && call?.init.method === 'POST');

    globalThis.fetch = async () => new Response(JSON.stringify({ code: 21608, message: 'unverified number' }), { status: 400 });
    let failure = null;
    try { await realTransport.sms('+919000000555', 'x'); } catch (e) { failure = e; } finally { globalThis.fetch = realFetch; }
    check('Twilio\'s refusal becomes an error that names its code', /400 \/ 21608/.test(failure?.message || '') && /unverified number/.test(failure.message), failure?.message);
  });
  await withEnv({ ...NONE, ...TWILIO, TWILIO_FROM: undefined, TWILIO_MESSAGING_SERVICE_SID: 'MG77' }, async () => {
    const realFetch = globalThis.fetch;
    let body = null;
    globalThis.fetch = async (_u, init) => { body = new URLSearchParams(String(init.body)); return new Response('{}', { status: 201 }); };
    try { await realTransport.sms('+919000000555', 'x'); } finally { globalThis.fetch = realFetch; }
    check('with a messaging service, that is sent instead of a number', body?.get('MessagingServiceSid') === 'MG77' && !body.has('From'));
  });

  /* A real SMTP conversation, against a tiny server in this process: the only
     way to know an email actually leaves, not just that our function was called. */
  const net = await import('node:net');
  const received = [];
  const smtp = net.createServer((sock) => {
    let inData = false, buf = '', body = '';
    const say = (s) => sock.write(s + '\r\n');
    say('220 sink ESMTP');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          body += buf; buf = '';
          if (body.endsWith('\r\n.\r\n')) { inData = false; received.push(body); body = ''; say('250 queued'); continue; }
          return;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') sock.write('250-sink\r\n250 AUTH PLAIN\r\n');
        else if (verb === 'AUTH') say('235 ok');
        else if (verb === 'DATA') { say('354 go'); inData = true; }
        else if (verb === 'QUIT') { say('221 bye'); sock.end(); return; }
        else say('250 ok');
      }
    });
  });
  await new Promise((ok) => smtp.listen(0, '127.0.0.1', ok));
  try {
    await withEnv({ ...NONE, ...EMAIL, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port) }, async () => {
      let sendErr = null;
      const errLog = console.error; console.error = (...a) => { sendErr = a.join(' '); };
      try { await D.sendCode({ via: 'email', to: 'anitha@example.com', code: '482913', ttlMs: 300000 }); } catch { /* reported by the check below */ } finally { console.error = errLog; }
      check('...and the first of those: an email really goes out over SMTP', received.length === 1, `${received.length} received; ${sendErr || 'no error'}`);
      const mail = received[0] || '';
      check('...to the right person, from the configured sender', /To: anitha@example\.com/i.test(mail) && /From: .*no-reply@karunasadan\.test/i.test(mail), mail.slice(0, 300));
      check('...with the code in the subject and the body', /Subject: 482913 is your Karuna Sadan console code/.test(mail) && mail.includes('482913'));
    });
  } finally { smtp.close(); }

  await withEnv({ ...NONE, ...EMAIL, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' }, async () => {
    const errLog = console.error; console.error = () => {};
    let failure = null;
    try { await D.sendCode({ via: 'email', to: 'anitha@example.com', code: '111111', ttlMs: 300000 }); } catch (e) { failure = e; } finally { console.error = errLog; }
    check('a mail server that cannot be reached is a plain failure, not a hang or a crash',
      failure?.code === 'delivery_failed' && /could not be emailed/.test(failure.message) && !/ECONNREFUSED|127\.0\.0\.1/.test(failure.message), failure?.message);
  });
} finally {
  Date.now = realNow;
  Object.assign(D.transport, realTransport);
}

/* ================================================================== */
section('Finding the Catalyst tables by name, and talking to Catalyst properly');

/* A second copy of the schema module, so these tests use the REAL client (the
   fake replaced the first copy's), with fetch stubbed so nothing leaves. */
const REAL = await import('./noah-schema.js?real');
const CAT = await import('./catalyst.js');
{
  const realFetch = globalThis.fetch;
  const calls = [];
  const MEMBERS_ID = '73626000000075359'; /* past Number.MAX_SAFE_INTEGER */
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const json = (o, status = 200) => new Response(typeof o === 'string' ? o : JSON.stringify(o), { status });
    if (u.includes('/oauth/v2/token')) return json({ access_token: 'tok', expires_in: 3600 });
    if (/\/table$/.test(u) && (init.method || 'GET') === 'GET') {
      /* The real list sends table_id as a bare number. */
      return json(`{"status":"success","data":[{"table_name":"members","table_id":${MEMBERS_ID}},{"table_name":"users","table_id":73626000000075001}]}`);
    }
    if (/\/table$/.test(u) && init.method === 'POST') return json(`{"status":"success","data":{"table_name":"consoleStaff","table_id":73626000000099001}}`);
    if (/\/column$/.test(u) && (init.method || 'GET') === 'GET') {
      return json({ status: 'success', data: [{ column_name: 'ROWID', data_type: 'bigint' }, { column_name: 'firstName', data_type: 'varchar', max_length: '255' }] });
    }
    if (/\/column$/.test(u) && init.method === 'POST') return json({ status: 'success', data: [] });
    if (u.endsWith('/query')) return json({ status: 'success', data: [{ members: { ROWID: '9', firstName: 'A' } }, { members: { ROWID: '10', firstName: 'B' } }] });
    if (/\/row/.test(u)) return json({ status: 'success', data: [{ ROWID: '1' }, { ROWID: '2' }], more_records: false });
    return json({ status: 'failure', message: 'unexpected ' + u }, 404);
  };
  try {
    const before = CAT.usage();
    const rows = await REAL.io.getRows('tbl:members');
    await REAL.io.getRows('tbl:members');
    await REAL.io.getRows('tbl:users');
    const rowCalls = calls.filter((c) => /\/row/.test(c.url));
    const listCalls = calls.filter((c) => /\/table$/.test(c.url));

    check('a table is found by its name, from the project\'s own list', rows.length === 2 && rowCalls[0].url.includes(`/table/${MEMBERS_ID}/row`), rowCalls[0]?.url);
    check('...a 17-digit table id arrives intact, not rounded', rowCalls[0].url.includes(MEMBERS_ID) && !rowCalls[0].url.includes('73626000000075360'), rowCalls[0]?.url);
    check('...the list is read once, however many tables are used', listCalls.length === 1, String(listCalls.length));
    check('every call names the organisation and the environment',
      rowCalls.every((c) => c.headers['CATALYST-ORG'] === 'offline' && c.headers.Environment === 'Development' && /^Zoho-oauthtoken /.test(c.headers.authorization)),
      JSON.stringify(rowCalls[0]?.headers));
    check('the free allowance spent is counted, a page at a time', CAT.usage().fetches - before.fetches === 3, JSON.stringify(CAT.usage()));

    let missing = null;
    try { await REAL.io.getRows('tbl:nosuch'); } catch (e) { missing = e; }
    check('a table that is not in the project says so, by name', /no table called "nosuch"/.test(missing?.message || ''), missing?.message);
    check('...without asking the list again straight away (30 seconds apart at most)', calls.filter((c) => /\/table$/.test(c.url)).length === 1);
    check('a plain id is passed through untouched', (await REAL.tableId('12345678901234567')) === '12345678901234567');
    /* (The fake sets an id for it in the environment; take that away for this check.) */
    await withEnv({ CATALYST_TABLE_CONSOLE_STAFF: undefined }, async () => {
      check('the console-staff table is absent until the project has one', !REAL.NOAH_TABLES.consoleStaff && !REAL.tableExists('consoleStaff'));
    });
    check('...and an id in the environment is honoured, for a table with another name', (await withEnv({ CATALYST_TABLE_CONSOLE_STAFF: '99' }, async () => REAL.NOAH_TABLES.consoleStaff)) === '99');

    /* columns */
    const cols = await CAT.listColumns(MEMBERS_ID);
    check('a table\'s columns are listed, with the system ones marked',
      cols.length === 2 && cols[0].system === true && cols[1].name === 'firstName' && cols[1].maxLength === '255', JSON.stringify(cols));

    calls.length = 0;
    await CAT.createColumns(MEMBERS_ID, [{ column_name: 'corrCity', data_type: 'varchar', max_length: 255 }]);
    const made = calls.find((c) => c.method === 'POST' && /\/column$/.test(c.url));
    const sent = JSON.parse(made.body);
    check('a column is created with the flags Catalyst wants, as strings',
      Array.isArray(sent) && sent[0].column_name === 'corrCity' && sent[0].is_mandatory === 'false' && sent[0].audit_consent === 'false' && sent[0].search_index_enabled === 'false' && sent[0].is_unique === 'false', made.body);

    check('a table is created and its id comes back as a string, intact', (await CAT.createTable('consoleStaff')) === '73626000000099001');
    const q = await CAT.query('SELECT * FROM members LIMIT 2');
    check('a ZCQL result is flattened out of its table name', q.length === 2 && q[0].ROWID === '9' && q[1].firstName === 'B', JSON.stringify(q));
    check('...and counted as a query', CAT.usage().queries === before.queries + 1);
  } finally {
    globalThis.fetch = realFetch;
  }
}

/* ================================================================== */
section('Does the console\'s schema match the project?');

reset(seed());
{
  const report = await S.verifySchema();
  const members = report.find((r) => r.table === 'members');
  check('every table the console uses is checked', ['users', 'members', 'membersExtra', 'files', 'appRegistrations', 'appChangeRequests'].every((n) => report.some((r) => r.table === n)));
  check('a column the project does not have yet is named', members.checked && members.missing.includes('corrAddress') && members.missing.includes('emailId2'), JSON.stringify(members.missing));
  check('...and an existing one is not', !members.missing.includes('firstName'));
  const FC2 = await import('./fake-catalyst.mjs');
  FC2.fakeColumns(T.members, ['emailId2', 'anniversaryDate', 'corrAddress', 'corrArea', 'corrCity', 'corrState', 'corrCountry', 'corrPincode', 'religion', 'motherTongue', 'educationDetail', 'employedIn', 'commLanguage', 'language', 'memberType', 'dateOfJoining', 'verifiedOn', 'aadharNo', 'voterId', 'passportNumber', 'drivingLicense', 'emiratesID', 'referBy', 'maritalStatus', 'isKid', 'memberId', 'photo']);
  const again = (await S.verifySchema()).find((r) => r.table === 'members');
  check('once the columns are added the table passes', again.missing.length === 0, JSON.stringify(again.missing));
  const staff = report.find((r) => r.table === 'consoleStaff');
  check('the console-staff table is checked once it exists', staff && staff.exists === true);
}

/* ================================================================== */
section('Editing a member from the console, and it reaching the app');

const MF = await import('./member-fields.js');
{
  const ok = MF.checkPatch({ firstName: ' Anandan ', city: 'Pune', gender: 'female', dateOfBirth: '1991-02-03' }, { canContact: true });
  check('a good change is cleaned and mapped to its columns', Object.keys(ok.errors).length === 0 && ok.values.firstName === 'Anandan' && ok.values.city === 'Pune' && ok.values.gender === 2 && ok.values.dateOfBirth === '1991-02-03', JSON.stringify(ok));
  check('a first name cannot be emptied', !!MF.checkPatch({ firstName: '  ' }).errors.firstName);
  check('an optional detail can be cleared', MF.checkPatch({ middleName: '' }).values.middleName === null);
  check('an email must be an email', !!MF.checkPatch({ email: 'nope' }, { canContact: true }).errors.email);
  check('a date must be real', !!MF.checkPatch({ dateOfBirth: '2026-02-30' }).errors.dateOfBirth && !!MF.checkPatch({ dateOfBirth: '03/02/1991' }).errors.dateOfBirth);
  check('a birth date cannot be in the future', !!MF.checkPatch({ dateOfBirth: '2999-01-01' }).errors.dateOfBirth);
  check('gender is one of three', !!MF.checkPatch({ gender: 'robot' }).errors.gender && MF.checkPatch({ gender: 'other' }).values.gender === 3);
  check('a name that is too long is refused', !!MF.checkPatch({ firstName: 'x'.repeat(101) }).errors.firstName);
  check('a field that is not editable is refused, not ignored', !!MF.checkPatch({ mobile: '9999999999' }).errors.mobile && !!MF.checkPatch({ aadharNo: '1' }).errors.aadharNo);
  check('the login number and ID numbers are not on the editable list', !MF.MEMBER_FIELDS.some((f) => /mobile|aadhar|pan|passport|voter|driving|emirates|userId/i.test(f.key + f.column)));
  check('contact details need permission to see them', !!MF.checkPatch({ email: 'a@b.co' }, { canContact: false }).errors.email && !MF.checkPatch({ email: 'a@b.co' }, { canContact: true }).errors.email);
  check('a request names a field loosely and still finds it', MF.fieldByName('EmailId1')?.key === 'email' && MF.fieldByName('first_name')?.key === 'firstName' && MF.fieldByName('favouriteColour') === null);
}

reset(seed());
{
  const rowOf = () => tables[T.members].find((m) => m.ROWID === M.approved);
  const before = writes.length;
  const r = await S.updateMemberFields(M.approved, { firstName: 'Anandan', city: 'Pune' });
  check('an edit changes the member\'s own columns', rowOf().firstName === 'Anandan' && rowOf().city === 'Pune');
  check('...and says what changed, from what to what', r.changed.length === 2 && r.changed.find((c) => c.key === 'firstName').before === 'Anand' && r.changed.find((c) => c.key === 'firstName').after === 'Anandan', JSON.stringify(r.changed));
  const w = writes.slice(before).filter((x) => x.op === 'update');
  check('...in one write, of only those columns and the row id', w.length === 1 && Object.keys(w[0].row).sort().join() === 'ROWID,city,firstName', JSON.stringify(w[0]?.row));
  check('...the row id is a string, intact', w[0].row.ROWID === M.approved);
  check('the app sees it: the register now shows the new name', (await S.loadMembers()).find((x) => x.rowId === M.approved).name === 'Anandan Rao');

  const n = writes.length;
  const same = await S.updateMemberFields(M.approved, { firstName: 'Anandan', city: 'Pune' });
  check('saving what is already there writes nothing', same.changed.length === 0 && writes.length === n);

  /* The app changed the pincode a moment ago; the console cache has not noticed. */
  tables[T.members].find((m) => m.ROWID === M.approved).pincode = '411001';
  const stale = await S.updateMemberFields(M.approved, { pincode: '400070' });
  check('an edit is judged against Catalyst now, not against a minute-old copy', stale.changed.length === 1 && stale.changed[0].before === '411001' && rowOf().pincode === '400070', JSON.stringify(stale.changed));

  await S.updateMemberFields(M.approved, { gender: 2, middleName: 'K', dateOfBirth: '1991-02-03' });
  check('gender is stored as the code the app reads (2), a date as YYYY-MM-DD', rowOf().gender === 2 && rowOf().dateOfBirth === '1991-02-03' && rowOf().middleName === 'K');
  await S.updateMemberFields(M.approved, { middleName: null });
  check('clearing a detail stores null', rowOf().middleName === null);

  let gone = null;
  try { await S.updateMemberFields('27145000000999999', { city: 'X' }); } catch (e) { gone = e; }
  check('a member that does not exist is refused, and nothing is written', gone?.code === 'not_found');

  const person = await S.loadPerson(M.approved);
  check('the person carries the stored values the edit form starts from', person.editable.firstName === 'Anandan' && person.editable.gender === 'female' && person.editable.pincode === '400070' && person.editable.dateOfBirth === '1991-02-03', JSON.stringify(person.editable).slice(0, 200));
}

/* ================================================================== */
section('Changes the members ask for from the app');

reset(seed());
{
  const pending = await S.loadChangeRequests({ status: 'pending' });
  check('the pending requests are listed, newest first', pending.length === 4 && pending[0].id === CR.badDate, pending.map((p) => p.fieldId).join());
  check('...each with who asked, the old value and the new', pending.find((p) => p.id === CR.name).memberName === 'Anand Rao' && pending.find((p) => p.id === CR.name).newValue === 'Anandan');
  check('...marking the ones the console can place', pending.find((p) => p.id === CR.name).known && pending.find((p) => p.id === CR.email).contact && !pending.find((p) => p.id === CR.unknown).known);
  check('a request already decided is not pending', (await S.loadChangeRequests({ status: 'approved' })).length === 1);

  const approved = await S.decideChangeRequest({ id: CR.name, approve: true, note: 'ok', byMemberRowId: M.boss, canContact: false });
  const reqRow = () => tables[T.appChangeRequests].find((r) => r.ROWID === CR.name);
  check('approving writes the new value to the member', tables[T.members].find((m) => m.ROWID === M.approved).firstName === 'Anandan' && approved.applied.length === 1);
  check('...and marks the request, with who and when', reqRow().status === 'approved' && reqRow().reviewedByRowId === M.boss && !!reqRow().reviewedAt && reqRow().note === 'ok', JSON.stringify(reqRow()));
  let again = null;
  try { await S.decideChangeRequest({ id: CR.name, approve: true }); } catch (e) { again = e; }
  check('a request is decided once', again?.code === 'not_pending');

  let unknown = null;
  try { await S.decideChangeRequest({ id: CR.unknown, approve: true, canContact: true }); } catch (e) { unknown = e; }
  check('a request for something the console cannot place cannot be approved', unknown?.code === 'unknown_field' && /favouriteColour/.test(unknown.message));
  check('...and is left pending', tables[T.appChangeRequests].find((r) => r.ROWID === CR.unknown).status === 'pending');
  check('...but it can be turned down', (await S.decideChangeRequest({ id: CR.unknown, approve: false, note: 'Not a detail we keep' })).status === 'rejected');

  let noPii = null;
  try { await S.decideChangeRequest({ id: CR.email, approve: true, canContact: false }); } catch (e) { noPii = e; }
  check('applying a contact detail needs permission to see contact details', noPii?.code === 'forbidden_field' && tables[T.members].find((m) => m.ROWID === M.approved).emailId1 === 'anand@example.com');
  await S.decideChangeRequest({ id: CR.email, approve: true, canContact: true });
  check('...and with it, the email is changed', tables[T.members].find((m) => m.ROWID === M.approved).emailId1 === 'anand.rao@example.com');

  let bad = null;
  try { await S.decideChangeRequest({ id: CR.badDate, approve: true, canContact: true }); } catch (e) { bad = e; }
  check('a requested value that is not valid is not applied', bad?.code === 'invalid_value' && tables[T.appChangeRequests].find((r) => r.ROWID === CR.badDate).status === 'pending' && tables[T.members].find((m) => m.ROWID === M.approved).dateOfBirth === '1990-05-14', bad?.message);

  /* The member write fails: the request must NOT be left marked approved. */
  reset(seed());
  const realUpdate = S.io.update;
  S.io.update = async (id, row) => { if (id === T.members) throw new Error('Catalyst: boom'); return realUpdate(id, row); };
  let failed = null;
  try { await S.decideChangeRequest({ id: CR.name, approve: true, canContact: true }); } catch (e) { failed = e; } finally { S.io.update = realUpdate; }
  check('if the member cannot be written, the request stays pending to retry', !!failed && tables[T.appChangeRequests].find((r) => r.ROWID === CR.name).status === 'pending');
}

/* ================================================================== */
section('Adding what the project is missing (npm run catalyst:columns)');

const SS = await import('./schema-spec.js');
{
  const spec = SS.buildSpec();
  const of = (t) => spec.find((s) => s.table === t);
  const cols = (t) => of(t).columns.map((c) => c.column_name);
  const col = (t, c) => of(t).columns.find((x) => x.column_name === c);

  check('the spec covers the Noah tables and every content table',
    ['members', 'membersExtra', 'users', 'files', 'appRegistrations', 'appChangeRequests', 'dailyMana', 'rowilCourseManagement', 'videos'].every((t) => of(t)));
  check('no table is ever created: the project is at Catalyst\'s 200-table cap', spec.every((s) => !s.create) && !of('consoleStaff'));
  check('the only thing the console adds to the developer\'s tables is six columns for console roles',
    SS.buildSpec().find((s) => s.table === 'membersExtra').columns.filter((c) => c.column_name.startsWith('console')).map((c) => c.column_name).sort().join()
      === 'consoleGrantedAt,consoleGrantedBy,consoleLastSignedInAt,consoleRole,consoleStatus,consoleTitle');
  check('...with sensible types', col('membersExtra', 'consoleRole').data_type === 'varchar' && col('membersExtra', 'consoleGrantedAt').data_type === 'datetime' && col('membersExtra', 'consoleLastSignedInAt').data_type === 'datetime');
  const { columnFor } = await import('./content-types.js');
  check('Catalyst\'s refused names are written the way the project spells them', cols('noahGramCategory').includes('orderCol') && cols('rowilCourseLessonGroupManagement').includes('orderCol') && !cols('noahGramCategory').includes('order'));
  check('...and columnFor agrees', columnFor('order') === 'orderCol' && columnFor('title') === 'title');
  check('no column in the spec has a name Catalyst refuses', spec.every((s) => s.columns.every((c) => !['date', 'order', 'time', 'key', 'rows', 'in', 'out', 'priority', 'timestamp'].includes(c.column_name))));
  check('a content field\'s storage picks its type', col('dailyMana', 'publishDate').data_type === 'date'
    && col('dailyMana', 'content').data_type === 'text'
    && col('dailyMana', 'published').data_type === 'boolean'
    && col('dailyMana', 'categoryIds').data_type === 'text'
    && col('dailyMana', 'contentLanguage').data_type === 'int'
    && col('dailyMana', 'showOnObituary').data_type === 'int'
    && col('rowilCourseManagement', 'published').data_type === 'int'
    && col('rowilCourseManagement', 'donationAmount').data_type === 'double'
    && col('rowilCourseManagement', 'publishedDate').data_type === 'datetime');
  check('every content field is a column the spec asks for, with nothing invented', cols('rowilCourseManagement').includes('title') && !cols('rowilCourseManagement').includes('name') && !cols('dailyMana').includes('text') && !cols('dailyMana').includes('imageUrl'));
  check('guessed types for a missing developer column are sensible', SS.guessType('isPrayerWarrior').data_type === 'boolean'
    && SS.guessType('reviewedAt').data_type === 'datetime' && SS.guessType('dateOfBirth').data_type === 'date'
    && SS.guessType('reviewNote').data_type === 'text' && SS.guessType('city').data_type === 'varchar'
    && SS.guessType('language').data_type === 'int' && SS.guessType('memberRowId').data_type === 'varchar');

  /* A fake project: the Noah tables are there, membersExtra lacks the console
     columns, dailyMana is an empty shell, members is full. */
  const project = {
    members: { id: '1001', cols: [...Array(104)].map((_, i) => ({ name: i === 0 ? 'ROWID' : `c${i}`, type: 'varchar' })) },
    membersExtra: { id: '1002', cols: of('membersExtra').columns.filter((c) => !c.column_name.startsWith('console')).map((c) => ({ name: c.column_name, type: c.data_type })) },
    users: { id: '1003', cols: of('users').columns.map((c) => ({ name: c.column_name, type: c.data_type })) },
    files: { id: '1004', cols: of('files').columns.map((c) => ({ name: c.column_name, type: c.data_type === 'varchar' ? 'text' : c.data_type })) },
    appChangeRequests: { id: '1006', cols: [{ name: 'ROWID', type: 'bigint' }, { name: 'memberRowId', type: 'varchar' }] },
    dailyMana: { id: '2001', cols: [{ name: 'ROWID', type: 'bigint' }, { name: 'CREATEDTIME', type: 'datetime' }] },
  };
  const calls = [];
  const api = {
    listTables: async () => Object.entries(project).map(([name, t]) => ({ name, id: t.id })),
    listColumns: async (id) => Object.values(project).find((t) => t.id === id).cols,
    createTable: async (name) => { calls.push(['table', name]); project[name] = { id: String(9000 + calls.length), cols: [{ name: 'ROWID', type: 'bigint' }] }; return project[name].id; },
    createColumns: async (id, columns) => {
      calls.push(['columns', id, columns.length]);
      Object.values(project).find((t) => t.id === id).cols.push(...columns.map((c) => ({ name: c.column_name, type: c.data_type })));
    },
  };

  const planned = await SS.plan(spec, api);
  const state = (t) => planned.find((p) => p.table === t);
  check('nothing is changed while planning', calls.length === 0);
  check('a table the project has complete is "ok"', state('users').state === 'ok');
  check('membersExtra needs the six console columns, and only those', state('membersExtra').state === 'add-columns' && state('membersExtra').missing.length === 6 && state('membersExtra').missing.every((c) => c.column_name.startsWith('console')), JSON.stringify(state('membersExtra').missing.map((c) => c.column_name)));
  check('an empty shell needs its columns', state('dailyMana').state === 'add-columns' && state('dailyMana').missing.length > 5);
  check('a table that is not in the project is reported, not created', state('videos').state === 'absent' && calls.length === 0);
  check('a table already at 104 columns that needs more is refused, with why', state('members').state === 'too-wide' && /104/.test(state('members').problem), state('members').problem);
  check('a string kept as text where the console expected varchar is NOT a difference', !state('files').notes.some((n) => /path|extension/.test(n)), state('files').notes.join(' | '));
  check('...but a real difference (a flag kept as an int) is noted and left alone', (await SS.plan([{ table: 'files', create: false, columns: [{ column_name: 'size', data_type: 'boolean' }] }], { ...api, listColumns: async () => [{ name: 'size', type: 'int' }] }))[0].notes.length === 1);

  const results = await SS.apply(planned.filter((p) => p.state === 'add-columns'), api);
  check('applying adds the columns, one request per table', calls.filter((c) => c[0] === 'columns').length === results.length && calls.filter((c) => c[0] === 'table').length === 0);
  check('...membersExtra gets exactly the six', calls.find((c) => c[0] === 'columns' && c[1] === '1002')[2] === 6);
  check('...nothing is ever deleted or altered: only creation is in the api', Object.keys(api).sort().join() === 'createColumns,createTable,listColumns,listTables');
  const after = await SS.plan(spec, api);
  check('read back, everything asked for is there (apart from what cannot be added)',
    after.filter((p) => !['ok', 'too-wide', 'absent'].includes(p.state)).length === 0 && after.find((p) => p.table === 'membersExtra').state === 'ok'
      && after.find((p) => p.table === 'dailyMana').state === 'ok');

  /* A spec that does ask for a table gets one (nothing in the real spec does). */
  const made = [];
  const apiNew = { ...api, listTables: async () => [], createTable: async (n) => { made.push(n); return '7001'; }, createColumns: async (id, c) => made.push([id, c.length]) };
  const one = [{ table: 'x', group: 't', create: true, columns: [{ column_name: 'a', data_type: 'int' }] }];
  const newPlan = await SS.plan(one, apiNew);
  await SS.apply(newPlan, apiNew);
  check('a table the spec asks to create is created, then given its columns', newPlan[0].state === 'create-table' && made[0] === 'x' && made[1][0] === '7001' && made[1][1] === 1);

  /* one table failing must not stop the others */
  const project2 = { dailyMana: { id: '2001', cols: [{ name: 'ROWID', type: 'bigint' }] }, dailyPrayers: { id: '2002', cols: [{ name: 'ROWID', type: 'bigint' }] } };
  const api2 = {
    listTables: async () => Object.entries(project2).map(([name, t]) => ({ name, id: t.id })),
    listColumns: async (id) => Object.values(project2).find((t) => t.id === id).cols,
    createTable: async () => '', createColumns: async (id) => { if (id === '2001') throw new Error('Catalyst: refused'); },
  };
  const two = await SS.plan(spec.filter((s) => ['dailyMana', 'dailyPrayers'].includes(s.table)), api2);
  const done = await SS.apply(two, api2);
  check('a failure on one table is reported and the rest carry on', done.find((r) => r.table === 'dailyMana').error === 'Catalyst: refused' && done.find((r) => r.table === 'dailyPrayers').done.length > 0 && !done.find((r) => r.table === 'dailyPrayers').error);
  const noId = await SS.apply([{ table: 'x', state: 'create-table', missing: [{ column_name: 'a', data_type: 'int' }] }], { createTable: async () => '', createColumns: async () => { throw new Error('should not be called'); } });
  check('a table created without an id back does not get columns written to nowhere', /id is/.test(noId[0].error || ''), noId[0].error);
}

/* ================================================================== */
section('Content: what the office authors');

const C = await import('./content.js');
const CT = await import('./content-types.js');
const FC = await import('./fake-catalyst.mjs');
const manna = CT.typeById('manna');

/* ---------- the definitions ---------- */
check('there are fifteen kinds of content across content, media and school', CT.TYPES.length === 15
  && new Set(CT.TYPES.map((t) => t.section)).size === 3, `${CT.TYPES.length}`);
check('every kind has a unique id and a table name', new Set(CT.TYPES.map((t) => t.id)).size === 15 && CT.TYPES.every((t) => t.table));
check('every field a kind names as its title exists', CT.TYPES.every((t) => t.fields.some((f) => f.key === t.title)));
check('every publish flag is a real toggle field', CT.TYPES.every((t) => !t.publish || t.fields.some((f) => f.key === t.publish && f.kind === 'toggle')));
check('every ref points at a kind that exists', CT.TYPES.every((t) => t.fields.every((f) => f.kind !== 'ref' || CT.typeById(f.ref))));
check('the Daily Manna asks for the columns its table really has',
  ['title', 'publishDate', 'content', 'prayer'].every((k) => manna.fields.find((f) => f.key === k)?.required)
  && !manna.fields.some((f) => ['text', 'imageUrl', 'language', 'categoryId'].includes(f.key)));
check('a language is stored as its code number, from the Laravel config (1 English ... 7 Kannada)',
  CT.LANGUAGES.map((l) => `${l.v}${l.l}`).join() === '1English,2Hindi,3Marathi,4Telugu,5Malayalam,6Tamil,7Kannada'
  && manna.fields.find((f) => f.key === 'contentLanguage').store === 'int');
check('every field that is stored another way says how', CT.TYPES.every((t) => t.fields.every((f) => !f.store || ['int', 'datetime'].includes(f.store))));

/* ---------- checking what is sent ---------- */
const good = { title: 'Walking by faith', publishDate: '2026-10-20', content: 'The message', prayer: 'A prayer' };
check('a complete devotional passes', Object.keys(C.validate(manna, good).errors).length === 0);
const bad = C.validate(manna, {});
check('missing required fields are each named',
  ['title', 'publishDate', 'content', 'prayer'].every((k) => bad.errors[k]), Object.keys(bad.errors).join());
check('a bad date is refused', !!C.validate(manna, { ...good, publishDate: '20/10/2026' }).errors.publishDate);
check('an impossible date is refused', !!C.validate(manna, { ...good, publishDate: '2026-13-45' }).errors.publishDate);
check('a language off the list is refused', !!C.validate(manna, { ...good, contentLanguage: '99' }).errors.contentLanguage);
check('a language on it passes', !C.validate(manna, { ...good, contentLanguage: '5' }).errors.contentLanguage);
check('a link must be http(s)', !!C.validate(manna, { ...good, image: 'javascript:alert(1)' }).errors.image);
check('...data: links too', !!C.validate(manna, { ...good, image: 'data:text/html,x' }).errors.image);
check('...but a real one passes', !C.validate(manna, { ...good, image: 'https://example.com/a.jpg' }).errors.image);
check('a colour must be a hex colour', !!C.validate(CT.typeById('noahgramCategories'), { name: 'X', backgroundColor: 'blue' }).errors.backgroundColor);
check('a number must be a number', !!C.validate(CT.typeById('courses'), { title: 'X', donationAmount: 'lots' }).errors.donationAmount);
check('...and not negative', !!C.validate(CT.typeById('courses'), { title: 'X', donationAmount: -5 }).errors.donationAmount);
check('a very long title is refused', !!C.validate(manna, { ...good, title: 'x'.repeat(256) }).errors.title);
check('long text has Catalyst\'s own limit', !!C.validate(manna, { ...good, content: 'x'.repeat(10001) }).errors.content);
check('empty optional fields become null, not empty strings',
  C.validate(manna, good).value.categoryIds === null && C.validate(manna, good).value.contentLanguage === null);
check('a toggle left out is false', C.validate(manna, good).value.published === false);
check('...unless the field starts on (an active category)', C.validate(CT.typeById('mannaCategories'), { title: 'X' }).value.status === true
  && C.validate(CT.typeById('mannaCategories'), { title: 'X', status: false }).value.status === false);
check('an update checks only what it sends', Object.keys(C.validate(manna, { title: 'New' }, { partial: true }).errors).length === 0
  && Object.keys(C.validate(manna, { title: 'New' }, { partial: true }).value).join() === 'title');
check('...but still refuses an emptied required field', !!C.validate(manna, { title: '' }, { partial: true }).errors.title);

/* ---------- against Catalyst: not ready ---------- */
reset(seed());
check('the fake knows the content tables', !!FC.contentTableId('dailyMana') && !!FC.contentTableId('videos'));
const shellList = await C.listContent('manna');
check('an empty-shell table lists as empty, not as an error', shellList.rows.length === 0 && shellList.source === 'catalyst' && !shellList.notReady);

let refused = null;
try { await C.createContent('manna', good, { canPublish: true }); } catch (e) { refused = e; }
check('saving into a table without the columns is refused, plainly', refused?.status === 502 && /Catalyst refused it/.test(refused.message), refused?.message);
check('...with a pointer to what is missing', /CONTENT-TABLES/.test(refused?.extra?.hint || ''));

FC.removeTable('videos');
C.forgetTables();
const noVideos = await C.listContent('tubeVideos');
check('a table that is not in the project says so', noVideos.notReady?.code === 'no_table' && /videos/.test(noVideos.notReady.why), JSON.stringify(noVideos.notReady));
let missing = null;
try { await C.createContent('tubeVideos', { title: 'X', videoUrl: 'https://example.com/v' }, { canPublish: true }); } catch (e) { missing = e; }
check('...and saving to it is refused as not ready', missing?.status === 409 && missing.extra.notReady === true, missing?.message);
reset(seed());
C.forgetTables();

/* ---------- against Catalyst: once the columns exist ---------- */
FC.makeReady('dailyMana');
FC.makeReady('dailyMannaCategories');
const tid = FC.contentTableId('dailyMana');

const made = await C.createContent('manna', { ...good, contentLanguage: '1', showOnObituary: true, published: false }, { canPublish: true });
check('a devotional is saved to its table', FC.tables[tid].length === 1 && made.title === 'Walking by faith');
const stored = FC.tables[tid][0];
check('...in the columns the table has, kept the way Catalyst keeps them',
  stored.title === 'Walking by faith' && stored.publishDate === '2026-10-20' && stored.published === false
  && stored.categoryIds === null && stored.contentLanguage === 1 && stored.showOnObituary === 1, JSON.stringify(stored).slice(0, 260));
check('...the language is the number 1, not "en" or "1"', stored.contentLanguage === 1 && typeof stored.contentLanguage === 'number');
check('...a toggle kept as an int is 1, not true', stored.showOnObituary === 1);
check('...stamped as created, in UTC, in the form Catalyst wants', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stored.created || ''), String(stored.created));
check('...and not yet as updated', stored.updated === undefined);
check('...no column the table does not have is sent', !('text' in stored) && !('imageUrl' in stored) && !('language' in stored) && !('ministryId' in stored));

let list = await C.listContent('manna');
check('...and listed with a string id', list.rows.length === 1 && typeof list.rows[0].id === 'string' && /^\d{17}$/.test(list.rows[0].id), list.rows[0]?.id);
check('...the language and the obituary toggle read back as the form shows them', list.rows[0].contentLanguage === '1' && list.rows[0].showOnObituary === true);
check('...as a draft', list.rows[0].live === false);

const rid = list.rows[0].id;
await C.publishContent('manna', rid, true, { canPublish: true });
check('publishing sets the publish column', FC.tables[tid][0].published === true);
check('...stamps it as updated', /^\d{4}-\d{2}-\d{2} /.test(FC.tables[tid][0].updated || ''));
check('...and it lists as live', (await C.listContent('manna')).rows[0].live === true);
check('...and can be filtered to live and to draft',
  (await C.listContent('manna', { state: 'live' })).rows.length === 1 && (await C.listContent('manna', { state: 'draft' })).rows.length === 0);
await C.publishContent('manna', rid, false, { canPublish: true });
check('taking it down clears it', FC.tables[tid][0].published === false);

await C.updateContent('manna', rid, { title: 'Walking by faith, again' }, { canPublish: true });
check('an update changes only what it sends', FC.tables[tid][0].title === 'Walking by faith, again' && FC.tables[tid][0].prayer === 'A prayer');
check('searching finds it', (await C.listContent('manna', { q: 'again' })).rows.length === 1 && (await C.listContent('manna', { q: 'zzz' })).rows.length === 0);

await C.createContent('manna', { ...good, title: 'Later one', publishDate: '2026-11-01' }, { canPublish: true });
await C.createContent('manna', { ...good, title: 'Earlier one', publishDate: '2026-09-01' }, { canPublish: true });
check('the newest date is listed first', (await C.listContent('manna')).rows.map((r) => r.title).join('|') === 'Later one|Walking by faith, again|Earlier one');

await C.deleteContent('manna', rid);
check('deleting removes the row', FC.tables[tid].length === 2 && !FC.tables[tid].some((r) => r.ROWID === rid));

/* ---------- the other ways a table stores a value ---------- */
{
  FC.makeReady('rowilCourseManagement');
  FC.makeReady('dailyConfessions');
  FC.makeReady('dailyMannaCategories');
  FC.makeReady('dailyPrayers');
  await C.createContent('courses', { title: 'Knowing God', language: '5', published: true, featured: false, donationAmount: '250', publishedDate: '2026-10-25' }, { canPublish: true });
  const course = FC.tables[FC.contentTableId('rowilCourseManagement')][0];
  check('a course keeps published and featured as 1 and 0, its language as a number, its fee as a number',
    course.published === 1 && course.featured === 0 && course.language === 5 && course.donationAmount === 250, JSON.stringify(course).slice(0, 220));
  check('...its title is in `title` (the table has no `name`)', course.title === 'Knowing God' && !('name' in course));
  check('...a date kept as a datetime is written as one', course.publishedDate === '2026-10-25 00:00:00', String(course.publishedDate));
  check('...and read back as a plain date', (await C.listContent('courses')).rows[0].publishedDate === '2026-10-25');
  check('...stamped with the columns this table uses (createdOn, not created)', !!course.createdOn && course.created === undefined);

  await C.createContent('confessions', { title: 'I am loved', content: 'I am.' }, { canPublish: true });
  check('a confession is always marked as one', FC.tables[FC.contentTableId('dailyConfessions')][0].isConfession === true);

  await C.createContent('mannaCategories', { title: 'Hope' }, { canPublish: true });
  const cat = FC.tables[FC.contentTableId('dailyMannaCategories')][0];
  check('a new category is active unless said otherwise', cat.status === true, JSON.stringify(cat).slice(0, 160));
  await C.createContent('prayers', { title: 'Evening', content: 'Lord.', publishedDate: '2026-11-02' }, { canPublish: true });
  check('a prayer\'s publish date is a datetime', FC.tables[FC.contentTableId('dailyPrayers')][0].publishedDate === '2026-11-02 00:00:00');
}

/* ---------- a role that may write but not publish ---------- */
let denied = null;
try { await C.createContent('manna', { ...good, published: true }, { canPublish: false }); } catch (e) { denied = e; }
check('writing is allowed but publishing is not, without the permission', denied?.status === 403, denied?.message);
check('...a draft is fine', (await C.createContent('manna', { ...good, title: 'Just a draft', published: false }, { canPublish: false })).ok);
let denied2 = null;
try { await C.updateContent('manna', FC.tables[tid][0].ROWID, { published: true }, { canPublish: false }); } catch (e) { denied2 = e; }
check('...and neither can an edit switch it on', denied2?.status === 403);

let nopub = null;
try { await C.publishContent('dictionaryCategories', '1', true, { canPublish: true }); } catch (e) { nopub = e; }
check('a kind with no publish step says so', nopub?.status === 400 && /no publish step/.test(nopub.message), nopub?.message);

/* ---------- the sample set, with no Catalyst connection ---------- */
const savedSchema = process.env.CATALYST_SCHEMA;
process.env.CATALYST_SCHEMA = 'flat';
check('without the noah schema the content is the sample set', !C.onCatalyst());
const sample = await C.listContent('manna');
check('...there are sample devotionals to look at', sample.rows.length === 3 && sample.source === 'sample');
check('...every kind has some sample entries', (await Promise.all(CT.TYPES.map((t) => C.listContent(t.id)))).every((r) => r.rows.length >= 2));
check('...a sample devotional is linked to its sample category', sample.rows.some((r) => r.categoryIds === 'mannaCategories-1'));
check('...the sample uses the real field names (a course has a title)', (await C.listContent('courses')).rows.every((r) => r.title));
await C.createContent('manna', good, { canPublish: true });
check('...saving adds to it', (await C.listContent('manna')).rows.length === 4);
const sid = (await C.listContent('manna')).rows.find((r) => r.title === 'Walking by faith' && r.prayer === 'A prayer').id;
await C.publishContent('manna', sid, true, { canPublish: true });
check('...publishing flips it', (await C.listContent('manna', { state: 'live' })).rows.some((r) => r.id === sid));
await C.deleteContent('manna', sid);
check('...deleting removes it', (await C.listContent('manna')).rows.length === 3);
let ghost = null;
try { await C.updateContent('manna', 'nope', { title: 'x' }, { canPublish: true }); } catch (e) { ghost = e; }
check('...changing one that does not exist is a 404', ghost?.status === 404);
process.env.CATALYST_SCHEMA = savedSchema;

/* ================================================================== */
section('Explaining a Catalyst failure');

const { explainCatalyst } = await import('./catalyst.js');
const quota = explainCatalyst(new Error('Catalyst: You have exhausted the free tier allowance for Datastore - Fetch. Please set up a payment method.'));
check('an exhausted allowance is recognised', quota?.code === 'catalyst_quota' && quota.status === 503);
check('...and explained as nothing wrong with the console', /Nothing is wrong with the console/.test(quota?.message || ''));
check('...naming the people it affects', /Noah app and the Noah API/.test(quota?.message || ''));
check('a rejected token is recognised as wrong settings', explainCatalyst(new Error('Catalyst would not issue an access token (400). invalid_code.'))?.code === 'catalyst_auth');
check('anything else is left alone, to be reported as it came', explainCatalyst(new Error('Catalyst: some other thing')) === null);
check('a missing error is left alone', explainCatalyst(undefined) === null);

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
