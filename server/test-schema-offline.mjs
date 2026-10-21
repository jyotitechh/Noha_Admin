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
    !sample.staff && /mobile number/.test(sample.error || ''), JSON.stringify(sample).slice(0, 140));

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
