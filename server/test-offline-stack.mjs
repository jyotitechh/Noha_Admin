/* The console's decisions and file viewing, end to end, offline.

     npm run dev:offline            (one terminal)
     npm run test:stack             (another)

   Runs against the in-memory stack from dev-offline.mjs and relies on its
   fixture: a known approved member with a photo, an ID and a video, and a
   member who has only asked for an OTP. It will not make sense against live
   Catalyst, and does not try.

   What it covers that the contract suite does not:
     - decisions go through the Noah API, and the reply says the member was told
     - reject, and its required reason
     - a decision on a draft, or a second decision, is refused
     - the photo, ID and video are streamed through the console
     - without the admin key, the reply says the member was NOT told */

const BASE = (process.argv[2] || 'http://localhost:4300') + '/api';
const NO_KEY = !!process.env.OFFLINE_NO_KEY;

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mok\x1b[0m    ${name}`); }
  else { fails.push(name); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n        \x1b[2m${detail}\x1b[0m` : ''}`); }
};
const section = (s) => console.log(`\n  ${s}\n`);

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString();
  let json = null; try { json = JSON.parse(text); } catch { /* bytes */ }
  return { status: res.status, body: json, text, type: res.headers.get('content-type') };
}

/* The fixture's members. */
const APPROVED_REG = '27145000000136691';
const DRAFT_REG = '27145000000128676';

console.log(`\nDecisions and files, offline ${NO_KEY ? '(NO admin key)' : '(Noah API on)'}\n` + '─'.repeat(64));

const code = (await call('POST', '/auth/request-code', { mobile: '+91 9000000001' })).body.devCode;
const token = (await call('POST', '/auth/verify', { mobile: '+91 9000000001', code })).body.token;

/* A registration as the app submits it, with a number of our choosing. */
let seq = 0;
async function submit(label) {
  const n = String(7000000000 + Date.now() % 100000000 + (++seq)).slice(0, 10);
  const mobile = `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
  const r = await call('POST', '/app/registration', {
    mobile, salutation: 'Mr', firstName: label, lastName: 'Tester', gender: 'male', dob: '1990-01-15',
    marital: 'single', line1: '1 Road', city: 'Pune', region: 'Maharashtra', country: 'India', pin: '411001',
    email: `${label.toLowerCase()}@example.com`,
    idType: 'pan', idNumber: 'ABCDE1234F', idFile: 'id.jpg', photoFile: 'me.jpg',
    agreed: true, declarationLang: 'en',
    signature: `${label} Tester`, videoSecs: 20,
  });
  return { mobile, id: r.body?.registrationId, status: r.status, body: r.body };
}

/* ================================================================== */
section('Reading the uploads');

const video = await call('GET', `/registrations/${APPROVED_REG}/file/video`, null, token);
if (NO_KEY) {
  /* No key, so no Noah API; the direct File Store route needs the real
     internet, which this stack refuses. What matters is that it ANSWERS, with
     a reason, rather than hanging or crashing. */
  check('without the key, the video fails cleanly with a reason',
    (video.status === 403 || video.status === 502) && typeof video.body?.error === 'string', `${video.status} ${video.text.slice(0, 100)}`);
} else {
  check('the video streams through the console', video.status === 200 && video.text === 'FAKE-video-BYTES', `${video.status} ${video.text.slice(0, 60)}`);
  check('…as video/mp4', /video[/]mp4/.test(video.type), video.type);

  const photo = await call('GET', `/registrations/${APPROVED_REG}/file/photo`, null, token);
  check('the photo streams', photo.status === 200 && photo.text === 'FAKE-photo-BYTES', `${photo.status} ${photo.text.slice(0, 60)}`);
  check('…as an image', /image[/]jpeg/.test(photo.type), photo.type);

  const idp = await call('GET', `/registrations/${APPROVED_REG}/file/id`, null, token);
  check('the ID proof streams', idp.status === 200 && idp.text === 'FAKE-idProof-BYTES', `${idp.status} ${idp.text.slice(0, 60)}`);
}

const none = await call('GET', `/registrations/${DRAFT_REG}/file/video`, null, token);
check('a registration with no upload says so (404)', none.status === 404, `${none.status} ${none.text.slice(0, 80)}`);
check('an unknown kind is refused (400)', (await call('GET', `/registrations/${APPROVED_REG}/file/passport`, null, token)).status === 400);
check('the files need a sign-in', (await call('GET', `/registrations/${APPROVED_REG}/file/video`)).status === 401);

/* ================================================================== */
section('Approving');

const a = await submit('Approve');
check('the app registration is accepted', a.status === 201 && !!a.id, JSON.stringify(a.body));

const before = await call('POST', '/app/auth/verify', { mobile: a.mobile, code: '4821' });
check('before approval the member is NOT let in', before.body?.status === 'pending', JSON.stringify(before.body));

const ok = await call('POST', `/registrations/${a.id}/approve`, {}, token);
check('the office approves it', ok.status === 200 && ok.body?.ok === true, `${ok.status} ${JSON.stringify(ok.body)?.slice(0, 200)}`);
if (NO_KEY) {
  check('without the key, the reply warns the member was NOT told', /NOT told/i.test(ok.body?.warning || ''), String(ok.body?.warning));
} else {
  check('through the Noah API, the member was told (emailed)', ok.body?.notified?.emailed === true, JSON.stringify(ok.body?.notified));
  check('…and there is no warning', !ok.body?.warning);
}
check('the reply carries the member id', !!ok.body?.member?.id, JSON.stringify(ok.body?.member));

const after = await call('POST', '/app/auth/verify', { mobile: a.mobile, code: '4821' });
check('after approval the app lets them in', after.body?.status === 'member' && !!after.body?.token, JSON.stringify(after.body)?.slice(0, 160));

const polled = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(a.mobile)}`);
check('the app sees "approved" and gets the member id', polled.body?.state === 'approved' && !!polled.body?.memberId, JSON.stringify(polled.body));

const again = await call('POST', `/registrations/${a.id}/approve`, {}, token);
check('a second approval is refused (409)', again.status === 409, `${again.status}`);

/* ================================================================== */
section('Rejecting');

const r = await submit('Reject');
const noReason = await call('POST', `/registrations/${r.id}/reject`, {}, token);
check('rejecting needs a reason (400)', noReason.status === 400, `${noReason.status}`);

const rej = await call('POST', `/registrations/${r.id}/reject`, { remark: 'The ID photo does not match.' }, token);
check('rejecting with a reason works', rej.status === 200 && rej.body?.registration?.state === 'rejected', `${rej.status} ${JSON.stringify(rej.body)?.slice(0, 160)}`);
if (NO_KEY) check('without the key, the reply warns', /NOT told/i.test(rej.body?.warning || ''));

const rejStatus = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(r.mobile)}`);
check('the app sees "rejected" and the reason', rejStatus.body?.state === 'rejected' && /does not match/.test(rejStatus.body?.remark || ''), JSON.stringify(rejStatus.body));

const rejIn = await call('POST', '/app/auth/verify', { mobile: r.mobile, code: '4821' });
check('a rejected member is NOT let in', rejIn.body?.status !== 'member', JSON.stringify(rejIn.body));

const approveRejected = await call('POST', `/registrations/${r.id}/approve`, {}, token);
check('a rejected registration cannot then be approved', approveRejected.status >= 400, `${approveRejected.status}`);
const notPendingSays = approveRejected.body?.error || '';

/* ================================================================== */
section('Returning the video');

const v = await submit('Video');
check('returning needs a reason (400)', (await call('POST', `/registrations/${v.id}/return-video`, {}, token)).status === 400);
const rv = await call('POST', `/registrations/${v.id}/return-video`, { remark: 'Too dark, please record again.' }, token);
check('returning with a reason works', rv.status === 200 && rv.body?.registration?.state === 'videoReturned', `${rv.status} ${JSON.stringify(rv.body)?.slice(0, 160)}`);
const rvStatus = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(v.mobile)}`);
check('the app sees "videoReturned" and the reason', rvStatus.body?.state === 'videoReturned' && /Too dark/.test(rvStatus.body?.remark || ''), JSON.stringify(rvStatus.body));

const redo = await call('POST', '/app/registration/video', { id: v.id, videoSeconds: 25, videoPath: 'kyc-2.mp4' });
check('the member re-records and it goes back to pending', redo.status === 200 && redo.body?.state === 'pending', `${redo.status} ${JSON.stringify(redo.body)}`);
check('…and can then be approved', (await call('POST', `/registrations/${v.id}/approve`, {}, token)).status === 200);

/* ================================================================== */
section('Things that must be refused');

const draft = await call('POST', `/registrations/${DRAFT_REG}/approve`, {}, token);
check('approving a draft is refused (409), with the right reason',
  draft.status === 409 && /not finished registering/.test(draft.body?.error || ''), `${draft.status} ${draft.body?.error}`);
check('rejecting a draft is refused', (await call('POST', `/registrations/${DRAFT_REG}/reject`, { remark: 'x' }, token)).status === 409);
check('returning a draft\'s video is refused', (await call('POST', `/registrations/${DRAFT_REG}/return-video`, { remark: 'x' }, token)).status === 409);
check('an unknown registration is a 404', (await call('POST', '/registrations/1/approve', {}, token)).status === 404);
check('deciding needs a sign-in', (await call('POST', `/registrations/${a.id}/approve`, {})).status === 401);

/* ================================================================== */
section('The register');

const list = await call('GET', '/data/REGISTRATIONS?limit=500', null, token);
const rows = list.body?.rows || [];
check('the registration list reads the new schema',
  rows.length > 0 && rows.every((x) => typeof x.id === 'string' && /^\d+$/.test(x.id)));
const mine = rows.find((x) => x.id === a.id);
check('an approved row reads approved, with who decided it', mine?.state === 'approved' && mine?.decidedBy === 'Test · Super administrator', JSON.stringify({ s: mine?.state, d: mine?.decidedBy }));

/* ================================================================== */
section('Signing in by mobile number');

/* The control hook in dev-offline.mjs: change the fake Catalyst, as if the
   office had edited it there. It listens one port above the API. */
const CONTROL = BASE.replace(/:(\d+)\/api$/, (_m, p) => `:${Number(p) + 1}`);
const fakePatch = (table, rowId, set) =>
  fetch(CONTROL + '/_fake/patch', { method: 'POST', body: JSON.stringify({ table, rowId, set }) }).then((r) => r.json());

/* ================================================================== */
section('A rejected registration comes back corrected');

/* FOR-CONSOLE-REJECTED-REGISTRATIONS.md: the member corrects it in the app and submits again. The app does that through
   the Noah API: pending again, the note cleared, a new submittedAt. */
const resubmitAt = new Date(Date.now() + 60_000).toISOString().slice(0, 19).replace('T', ' ');
await fakePatch('appRegistrations', r.id, { status: 'pending', reviewNote: '', submittedAt: resubmitAt });
const backRows = (await call('GET', '/data/REGISTRATIONS?state=pending&limit=500', null, token)).body?.rows || [];
const backReg = backRows.find((x) => x.id === r.id);
check('it is waiting for a decision again, marked as sent again', backReg?.state === 'pending' && backReg.resent === true, JSON.stringify({ s: backReg?.state, resent: backReg?.resent }));
if (!NO_KEY) {
  check('...with the note it was rejected with, to check it was corrected', backReg?.lastRejection?.note === 'The ID photo does not match.', JSON.stringify(backReg?.lastRejection));
}
const reApprove = await call('POST', `/registrations/${r.id}/approve`, {}, token);
check('...and the office can approve it now', reApprove.status === 200, `${reApprove.status} ${reApprove.text.slice(0, 160)}`);
check('a registration that is rejected and not sent again still cannot be decided, and the reason says it waits for the member',
  /correct it/.test(notPendingSays || ''), notPendingSays);

async function signIn(mobile, code) {
  const ask = await call('POST', '/auth/request-code', { mobile });
  if (!ask.body?.devCode && code === undefined) return { ask };
  const verify = await call('POST', '/auth/verify', { mobile, code: code ?? ask.body.devCode });
  return { ask, verify, token: verify.body?.token, user: verify.body?.user };
}

const BOSS = '+91 90000 00555';      /* flagged is_super_admin by the office */
const ANAND = '+91 90000 00779';     /* an approved member, not staff */
const OLD = '+91 90000 00778';       /* verified by the office, not staff */
const ANAND_ID = '27145000000145218';
const OLD_ID = '27145000000126932';
const DRAFT_MEMBER_ID = '27145000000143401';

const boss = await signIn(BOSS);
check('the office super administrator signs in with their number', boss.verify?.status === 200 && boss.user?.role === 'super', JSON.stringify(boss.verify?.body).slice(0, 160));
check('...the session says where the access came from', boss.user?.source === 'catalyst-flag');
check('...and carries their number', /9000000555/.test(boss.user?.mobile || ''), boss.user?.mobile);
const BT = boss.token;

const unknown = await call('POST', '/auth/request-code', { mobile: '+91 90000 77777' });
check('a number with no access is refused, and told why', unknown.status === 400 && /does not have access/.test(unknown.body?.error || ''), unknown.text.slice(0, 120));
check('a member who is not staff is refused too', (await call('POST', '/auth/request-code', { mobile: ANAND })).status === 400);
const viaEmail = await call('POST', '/auth/request-code', { email: 'anitha.varghese@karunasadan.org' });
check('THE BACKDOOR IS CLOSED: a sample person email does not sign in', viaEmail.status === 400 && /does not have access/.test(viaEmail.body?.error || ''), viaEmail.text.slice(0, 120));
check('a junk number is refused', (await call('POST', '/auth/request-code', { mobile: '12' })).status === 400);
check('a junk address is refused', (await call('POST', '/auth/request-code', { email: 'nope' })).status === 400);

/* By email as well as by number. This harness has no SMTP, so the code comes
   back on screen, which is what an unconfigured server does. */
const bossMail = await call('POST', '/auth/request-code', { email: 'Anitha@Example.com' });
check('the office super administrator can ask for a code by email', bossMail.status === 200 && /^\d{6}$/.test(bossMail.body?.devCode || ''), bossMail.text.slice(0, 140));
check('...and the reply does not give away their phone number', !/9000000555/.test(bossMail.text), bossMail.text.slice(0, 140));
const mailIn = await call('POST', '/auth/verify', { email: 'anitha@example.com', code: bossMail.body?.devCode });
check('...and signs in with it', mailIn.status === 200 && mailIn.body?.user?.role === 'super' && mailIn.body.user.source === 'catalyst-flag', mailIn.text.slice(0, 140));
check('a code asked for by email is not good for the number', (await call('POST', '/auth/verify', { mobile: BOSS, code: bossMail.body?.devCode })).status === 400);
const testMail = await call('POST', '/auth/request-code', { email: 'finance@console.test' });
const testMailIn = await call('POST', '/auth/verify', { email: 'finance@console.test', code: testMail.body?.devCode });
check('a test account signs in by email too', testMailIn.status === 200 && testMailIn.body?.user?.role === 'finance', testMailIn.text.slice(0, 140));
const metaNow = await call('GET', '/meta');
check('/meta says which ways of getting a code are set up', metaNow.body?.codeChannels && metaNow.body.codeChannels.email === false && metaNow.body.codeChannels.sms === false && metaNow.body.codeChannels.whatsapp === false, JSON.stringify(metaNow.body?.codeChannels));

const ask = await call('POST', '/auth/request-code', { mobile: BOSS });
check('a wrong code is refused', (await call('POST', '/auth/verify', { mobile: BOSS, code: '000000' })).status === 400);
const good = await call('POST', '/auth/verify', { mobile: BOSS, code: ask.body.devCode });
check('...the right one still works afterwards', good.status === 200);
check('a code works once', (await call('POST', '/auth/verify', { mobile: BOSS, code: ask.body.devCode })).status === 400);

const test3 = await signIn('+91 90000 00003');
check('a test number signs in with its fixed code', test3.verify?.status === 200 && test3.user?.role === 'finance' && test3.ask.body?.devCode === '123456', JSON.stringify(test3.verify?.body).slice(0, 140));
check('...and is marked as a test account', test3.user?.source === 'test');
const accounts = await call('GET', '/auth/accounts');
check('the sign-in page can offer the test numbers', accounts.status === 200 && accounts.body?.length === 10 && accounts.body[0].mobile === '+91 9000000001', accounts.text.slice(0, 100));

/* ================================================================== */
section('A super administrator gives a member a role');

const noAuthCand = await call('GET', '/staff/candidates');
check('the candidate list needs a sign-in', noAuthCand.status === 401);
check('...and the staff.manage permission', (await call('GET', '/staff/candidates', null, test3.token)).status === 403);

const cands = await call('GET', '/staff/candidates', null, BT);
check('approved members are offered', cands.status === 200 && cands.body.rows.some((c) => c.rowId === ANAND_ID) && cands.body.rows.some((c) => c.rowId === OLD_ID));
check('...someone not yet approved is not', !cands.body.rows.some((c) => c.rowId === DRAFT_MEMBER_ID));
check('...nor an existing staff member', !cands.body.rows.some((c) => /Varghese/.test(c.name)));
check('...and the staff table is reported ready', cands.body.tableReady === true);
check('candidates are searchable', (await call('GET', '/staff/candidates?q=anand', null, BT)).body.rows.length === 1);

check('granting needs a role (400)', (await call('POST', '/staff/grant', { memberRowId: ANAND_ID }, BT)).status === 400);
check('...a real one (400)', (await call('POST', '/staff/grant', { memberRowId: ANAND_ID, role: 'wizard' }, BT)).status === 400);
const notApproved = await call('POST', '/staff/grant', { memberRowId: DRAFT_MEMBER_ID, role: 'finance' }, BT);
check('an unapproved member cannot be given access (409)', notApproved.status === 409 && /not been approved/.test(notApproved.body?.error || ''), notApproved.text.slice(0, 120));
check('an unknown member is a 404', (await call('POST', '/staff/grant', { memberRowId: '1', role: 'finance' }, BT)).status === 404);
check('granting needs the staff.manage permission', (await call('POST', '/staff/grant', { memberRowId: ANAND_ID, role: 'finance' }, test3.token)).status === 403);

const grant = await call('POST', '/staff/grant', { memberRowId: ANAND_ID, role: 'finance', title: 'Accounts' }, BT);
check('the super administrator gives Anand the finance role', grant.status === 201 && grant.body?.role === 'finance', grant.text.slice(0, 140));
const dup = await call('POST', '/staff/grant', { memberRowId: ANAND_ID, role: 'events' }, BT);
check('giving it twice is refused, pointing at "change role"', dup.status === 409 && /Change their role/.test(dup.body?.error || ''), dup.text.slice(0, 120));
check('...and he is no longer a candidate', !(await call('GET', '/staff/candidates', null, BT)).body.rows.some((c) => c.rowId === ANAND_ID));

const anand = await signIn(ANAND);
check('Anand now signs in with the number he registered with', anand.verify?.status === 200 && anand.user?.role === 'finance', JSON.stringify(anand.verify?.body).slice(0, 150));
check('...as catalyst-stored staff', anand.user?.source === 'catalyst');
const AT = anand.token;

check('finance can reach giving', (await call('GET', '/data/RECEIPTS', null, AT)).status === 200);
check('...and the member register', (await call('GET', '/data/MEMBERS', null, AT)).status === 200);
check('...but not the audit log', (await call('GET', '/data/AUD', null, AT)).status === 403);
check('...nor the staff list', (await call('GET', '/data/STAFF', null, AT)).status === 403);
check('...nor can he give anyone else access', (await call('POST', '/staff/grant', { memberRowId: OLD_ID, role: 'finance' }, AT)).status === 403);
check('...nor approve a registration', (await call('POST', `/registrations/${APPROVED_REG}/approve`, {}, AT)).status === 403);

const staffList = await call('GET', '/data/STAFF', null, BT);
const rows2 = staffList.body?.rows || [];
const anandRow = rows2.find((x) => x.name === 'Anand Rao');
check('the staff screen lists the new staff member', anandRow?.role === 'finance' && anandRow.source === 'catalyst' && anandRow.status === 'Active', JSON.stringify(anandRow)?.slice(0, 160));
check('...the office super administrator', rows2.some((x) => x.source === 'catalyst-flag' && x.role === 'super'));
check('...and the test accounts', rows2.filter((x) => x.source === 'test').length === 10);
check('...and not a single sample person', !rows2.some((x) => /@karunasadan\.org$/.test(x.email || '')), rows2.map((x) => x.email).filter(Boolean).join(','));
check('a sign-in was stamped on his row', !!(await call('GET', '/data/STAFF', null, BT)).body.rows.find((x) => x.name === 'Anand Rao')?.lastIn);

/* ================================================================== */
section('Changing, suspending and revoking');

const ANAND_ROW = anandRow.id;
const toEvents = await call('POST', `/staff/${ANAND_ROW}/role`, { role: 'events' }, BT);
check('a role can be changed', toEvents.status === 200, toEvents.text.slice(0, 100));
const meNow = await call('GET', '/auth/me', null, AT);
check('...and applies to his open session at once', meNow.body?.user?.role === 'events', JSON.stringify(meNow.body?.user?.role));
check('...so his reach changed with it', (await call('GET', '/data/RECEIPTS', null, AT)).status === 403);
check('a role must be a real one (400)', (await call('POST', `/staff/${ANAND_ROW}/role`, { role: 'wizard' }, BT)).status === 400);

const flagRow = rows2.find((x) => x.source === 'catalyst-flag');
const flagTry = await call('POST', `/staff/${flagRow.id}/role`, { role: 'finance' }, BT);
check('the office flag cannot be changed from here (409)', flagTry.status === 409 && /office/.test(flagTry.body?.error || ''), flagTry.text.slice(0, 140));
check('a test account is fixed (409)', (await call('POST', '/staff/TEST-super/role', { role: 'finance' }, BT)).status === 409);
check('an unknown staff id is a 404', (await call('POST', '/staff/99999/role', { role: 'finance' }, BT)).status === 404);

/* make Anand a super administrator, so he can try to change himself */
await call('POST', `/staff/${ANAND_ROW}/role`, { role: 'super' }, BT);
const anandSuper = await call('GET', '/auth/me', null, AT);
check('a super administrator can make another one', anandSuper.body?.user?.role === 'super');
check('...but nobody changes their own access (409)', (await call('POST', `/staff/${ANAND_ROW}/role`, { role: 'finance' }, AT)).status === 409);
check('...nor suspends themselves', (await call('POST', `/staff/${ANAND_ROW}/status`, { to: 'Suspended' }, AT)).status === 409);
check('...nor revokes themselves', (await call('POST', `/staff/${ANAND_ROW}/revoke`, {}, AT)).status === 409);
const byAnand = await call('POST', '/staff/grant', { memberRowId: OLD_ID, role: 'content', title: 'Media' }, AT);
check('a super administrator made this way can give access too', byAnand.status === 201, byAnand.text.slice(0, 120));

/* the person he just gave access to: suspend, restore, revoke */
const old = await signIn(OLD);
check('the member he gave a role signs in', old.verify?.status === 200 && old.user?.role === 'content', JSON.stringify(old.verify?.body).slice(0, 140));
const OLD_ROW = (await call('GET', '/data/STAFF', null, BT)).body.rows.find((x) => x.name === 'Old Member').id;
check('...with a session that works', (await call('GET', '/auth/me', null, old.token)).status === 200);

const susp = await call('POST', `/staff/${OLD_ROW}/status`, { to: 'Suspended' }, BT);
check('suspending works', susp.status === 200, susp.text.slice(0, 100));
check('...and ends the session they already held, immediately', (await call('GET', '/auth/me', null, old.token)).status === 401);
const suspAsk = await call('POST', '/auth/request-code', { mobile: OLD });
check('...and they cannot sign in again', suspAsk.status === 400 && /suspended/.test(suspAsk.body?.error || ''), suspAsk.text.slice(0, 120));
check('a bad status is refused (400)', (await call('POST', `/staff/${OLD_ROW}/status`, { to: 'Banana' }, BT)).status === 400);

check('re-enabling works', (await call('POST', `/staff/${OLD_ROW}/status`, { to: 'Active' }, BT)).status === 200);
const back = await signIn(OLD);
check('...and they sign in again', back.verify?.status === 200);

const rev = await call('POST', `/staff/${OLD_ROW}/revoke`, {}, BT);
check('revoking works', rev.status === 200 && rev.body?.status === 'Revoked');
check('...ends their session', (await call('GET', '/auth/me', null, back.token)).status === 401);
const revAsk = await call('POST', '/auth/request-code', { mobile: OLD });
check('...and they cannot sign in', revAsk.status === 400 && /revoked/.test(revAsk.body?.error || ''), revAsk.text.slice(0, 120));
check('...but they can be given access again', (await call('POST', '/staff/grant', { memberRowId: OLD_ID, role: 'comms' }, BT)).status === 201);
const regranted = await signIn(OLD);
check('...with the new role', regranted.user?.role === 'comms', JSON.stringify(regranted.verify?.body).slice(0, 120));

/* ================================================================== */
section('There is always a super administrator');

/* The office un-flags its super administrator in Catalyst. Anand, made super
   from the console, is now the only real one. A test account (not counted) tries
   to remove him. */
await fakePatch('users', '27145000000151001', { is_super_admin: false });
const testSuper = await signIn('+91 90000 00001');
const lone = await call('POST', `/staff/${ANAND_ROW}/revoke`, {}, testSuper.token);
check('removing the only real super administrator is refused (409)', lone.status === 409 && /no super administrator/.test(lone.body?.error || ''), `${lone.status} ${lone.text.slice(0, 120)}`);
const loneRole = await call('POST', `/staff/${ANAND_ROW}/role`, { role: 'finance' }, testSuper.token);
check('...and so is demoting him', loneRole.status === 409 && /no super administrator/.test(loneRole.body?.error || ''), `${loneRole.status} ${loneRole.text.slice(0, 120)}`);
check('...but a flag removal is read: the office\'s old super administrator no longer signs in',
  (await call('POST', '/auth/request-code', { mobile: BOSS })).status === 400);
await fakePatch('users', '27145000000151001', { is_super_admin: true });
check('...and restoring the flag restores them', (await call('POST', '/auth/request-code', { mobile: BOSS })).status === 200);

/* ================================================================== */
section('What was recorded');

const aud = await call('GET', '/data/AUD?limit=200', null, BT);
const actions = (aud.body?.rows || []).map((a) => a.action);
check('giving access is in the audit log', actions.some((a) => /Gave console access: Finance officer/.test(a)), actions.slice(0, 6).join(' | '));
check('...so is changing a role', actions.some((a) => /Changed console role/.test(a)));
check('...suspending', actions.some((a) => /Suspended console access/.test(a)));
check('...and revoking', actions.some((a) => /Revoked console access/.test(a)));
check('...and sign-ins say which kind they were', actions.some((a) => /Signed in/.test(a)));

/* ================================================================== */
section('Content, media and school, over HTTP');

const fakeReady = (table) =>
  fetch(CONTROL + '/_fake/ready', { method: 'POST', body: JSON.stringify({ table }) }).then((r) => r.json());

const editor = await signIn('+91 90000 00006');     /* the test content editor */
const finance = await signIn('+91 90000 00003');    /* the test finance officer */
const ET = editor.token;
const FT = finance.token;

const types = await call('GET', '/content/types', null, ET);
check('the content editor can read what can be authored', types.status === 200 && types.body?.types?.length === 18, `${types.status}`);
check('...grouped into content, media and school', Object.keys(types.body?.sections || {}).join() === 'content,media,school');
check('...with seven languages on offer', types.body?.languages?.length === 7);
check('...and each kind says which fields it has', types.body.types.every((t) => t.fields.length > 2 && t.table));
check('finance cannot read it (403)', (await call('GET', '/content/types', null, FT)).status === 403);
check('...nor list content', (await call('GET', '/content/manna', null, FT)).status === 403);
check('...nor write it', (await call('POST', '/content/manna', {}, FT)).status === 403);
check('it needs a sign-in', (await call('GET', '/content/types')).status === 401);
check('an unknown kind is a 404', (await call('GET', '/content/nonsense', null, ET)).status === 404);

/* ---------- Catalyst, before the columns exist ---------- */
const empty = await call('GET', '/content/manna', null, ET);
check('a table with no columns yet lists as empty', empty.status === 200 && empty.body.rows.length === 0 && empty.body.source === 'catalyst', empty.text.slice(0, 120));

const MANNA = { title: 'Walking by faith', publishDate: '2026-10-20', content: 'The message of the day (John 3:16).', prayer: 'A short prayer.' };
const notYet = await call('POST', '/content/manna', MANNA, ET);
check('saving into it is refused, in plain words', notYet.status === 502 && /Catalyst refused it/.test(notYet.body?.error || ''), `${notYet.status} ${notYet.text.slice(0, 140)}`);
check('...pointing at the document that lists the columns', /CONTENT-TABLES/.test(notYet.body?.hint || ''));

const fakeTable = (table, present) =>
  fetch(CONTROL + '/_fake/table', { method: 'POST', body: JSON.stringify({ table, present }) }).then((r) => r.json());
await fakeTable('videos', false);
const tube = await call('GET', '/content/tubeVideos', null, ET);
check('a table that is not in the project says so', tube.body?.notReady?.code === 'no_table', tube.text.slice(0, 160));
const tubeSave = await call('POST', '/content/tubeVideos', { title: 'X', videoUrl: 'https://example.com/v' }, ET);
check('...and saving to it is refused as not ready (409)', tubeSave.status === 409 && tubeSave.body?.notReady === true, tubeSave.text.slice(0, 120));
await fakeTable('videos', true);
check('...and when the table is there, Noah Tube lists', (await call('GET', '/content/tubeVideos', null, ET)).body?.notReady === null);

/* ---------- checking what is sent ---------- */
const invalid = await call('POST', '/content/manna', {}, ET);
check('a blank form names every field that is missing (400)', invalid.status === 400 && ['title', 'publishDate', 'content', 'prayer'].every((k) => invalid.body?.errors?.[k]), invalid.text.slice(0, 140));
const badLink = await call('POST', '/content/manna', { ...MANNA, image: 'javascript:alert(1)' }, ET);
check('a link that is not http(s) is refused', badLink.status === 400 && !!badLink.body?.errors?.image);

/* ---------- once the Catalyst developer has added the columns ---------- */
await fakeReady('dailyMana');
const made = await call('POST', '/content/manna', { ...MANNA, contentLanguage: '1', published: false }, ET);
check('the devotional is saved', made.status === 201 && made.body?.ok === true, `${made.status} ${made.text.slice(0, 140)}`);

/* The originals only: saving also makes a copy in each language, in the background (see the section further down). */
const originals = async () => ((await call('GET', '/content/manna', null, ET)).body?.rows || []).filter((r) => !r.translatedFrom);
const mannaList = await call('GET', '/content/manna', null, ET);
const entry = mannaList.body?.rows?.find((r) => !r.translatedFrom);
check('...and listed, as a draft', mannaList.body?.rows?.filter((r) => !r.translatedFrom).length === 1 && entry.title === 'Walking by faith' && entry.live === false, mannaList.text.slice(0, 200));
check('...with a string id', typeof entry?.id === 'string' && entry.id.length >= 15);
check('...and the language and date came back as sent', entry?.contentLanguage === '1' && entry?.publishDate === '2026-10-20');

const pub = await call('POST', `/content/manna/${entry.id}/publish`, { on: true }, ET);
check('publishing it works', pub.status === 200 && pub.body?.on === true, pub.text.slice(0, 100));
let liveRows = [];
for (let i = 0; i < 80; i += 1) {
  liveRows = (await call('GET', '/content/manna?state=live', null, ET)).body?.rows || [];
  if (liveRows.length === 7 && !liveRows.some((r) => r.translating)) break;
  await new Promise((r) => setTimeout(r, 100));
}
check('...and it is live (with its six translations)', liveRows.length === 7, `${liveRows.length} live`);

const patched = await call('PATCH', `/content/manna/${entry.id}`, { title: 'Walking by faith, revised' }, ET);
check('a change is saved', patched.status === 200 && (await originals())[0]?.title === 'Walking by faith, revised');
check('...and the rest of it is kept', (await originals())[0]?.prayer === 'A short prayer.');
check('a change that empties a required field is refused', (await call('PATCH', `/content/manna/${entry.id}`, { title: '' }, ET)).status === 400);

const down = await call('POST', `/content/manna/${entry.id}/publish`, { on: false }, ET);
check('taking it down works', down.status === 200 && (await call('GET', '/content/manna?state=live', null, ET)).body.rows.length === 0);

check('a kind with no publish step says so (400)', (await call('POST', '/content/dictionaryCategories/1/publish', { on: true }, ET)).status === 400);

const del = await call('DELETE', `/content/manna/${entry.id}`, null, ET);
check('deleting works, its Kannada copy too', del.status === 200 && (await call('GET', '/content/manna', null, ET)).body.rows.length === 0);
check('finance cannot delete (403)', (await call('DELETE', `/content/manna/${entry.id}`, null, FT)).status === 403);

/* ---------- it is all recorded ---------- */
const audit2 = (await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows?.map((a) => `${a.action}|${a.rec}`) || [];
check('creating is in the audit log, with the title', audit2.some((a) => /Created devotional\|Daily Manna: Walking by faith/.test(a)), audit2.slice(0, 5).join(' / '));
check('...publishing', audit2.some((a) => /^Published devotional/.test(a)));
check('...taking down', audit2.some((a) => /^Took down devotional/.test(a)));
check('...changing', audit2.some((a) => /^Changed devotional/.test(a)));
check('...deleting', audit2.some((a) => /^Deleted devotional/.test(a)));

/* ---------- the rest of the kinds are reachable ---------- */
const kinds = ['mannaCategories', 'prayers', 'confessions', 'dictionary', 'dictionaryCategories', 'noahgramPosts',
  'noahgramCategories', 'tubeVideos', 'tubeCategories', 'bibleSchools', 'courses', 'courseCategories', 'courseSections', 'courseLessons'];
const reach = await Promise.all(kinds.map((k) => call('GET', `/content/${k}`, null, ET)));
check('every kind of content answers a list request', reach.every((r) => r.status === 200), reach.map((r, i) => `${kinds[i]}:${r.status}`).join(' '));

/* ================================================================== */
section('One person, everything about them');

const membership = await signIn('+91 90000 00002');   /* members.view, edit and pii */
const verifier = await signIn('+91 90000 00008');     /* Jodie verifier: no members.view */
/* "View the console as" is gone: no signed-in role can switch its own session to another role. */
const escalate = await call('POST', '/auth/view-as', { role: 'super' }, verifier.token);
const stillVerifier = await call('GET', '/auth/me', null, verifier.token);
check('a staff member cannot switch their session to super administrator', escalate.status === 404 && stillVerifier.body?.user?.role !== 'super',
  `${escalate.status} ${stillVerifier.body?.user?.role}`);

const person = await call('GET', `/people/${ANAND_ID}`, null, BT);
check('the person page loads for a super administrator', person.status === 200 && person.body?.member?.name === 'Anand Rao', `${person.status} ${person.text.slice(0, 120)}`);
check('...with the registration they made', person.body?.registration?.id === APPROVED_REG && person.body.registration.state === 'approved');
check('...and the ids of their photo, ID and video', !!person.body?.registration?.fileIds?.video && !!person.body.registration.fileIds.photo && !!person.body.registration.fileIds.idProof);
check('...who their pastor is', person.body?.pastoral?.pastor?.name === 'Fr Thomas', JSON.stringify(person.body?.pastoral));
check('...whether they are a partner', person.body?.partnership?.isPartner === true);
check('...and their family and groups, read from Catalyst',
  person.body?.family?.recorded === true && person.body.family.rows.some((r) => r.rel === 'Husband') && person.body.family.rows.some((r) => r.kid)
  && person.body?.groups?.recorded === true && person.body.groups.rows.length === 2, JSON.stringify([person.body?.family, person.body?.groups]).slice(0, 260));

check('their phone, email and address are masked until revealed',
  /•/.test(person.body?.member?.mobile) && /•/.test(person.body.member.email) && person.body.member.masked === true && !/9000000779/.test(person.body.member.mobile),
  JSON.stringify({ m: person.body?.member?.mobile, e: person.body?.member?.email }));

const reveal = await call('GET', `/people/${ANAND_ID}/contact`, null, membership.token);
check('revealing them is allowed with the permission', reveal.status === 200 && reveal.body?.mobile === '+919000000779' && reveal.body?.email === 'anand@example.com', reveal.text.slice(0, 120));
check('the referrer is on the page, not a Noah member, with the number masked',
  person.body?.referrer?.name === 'Fr. Thomas' && person.body.referrer.inNoah === false && /•/.test(person.body.referrer.phone) && !/9000011111/.test(person.body.referrer.phone),
  JSON.stringify(person.body?.referrer));
check('...and its number comes with the audited reveal', reveal.body?.referrerPhone === '+91 9000011111', reveal.body?.referrerPhone);
const aud3 = (await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || [];
check('...and written to the audit log, against the member', aud3.some((a) => /Revealed contact details/.test(a.action) && a.rec === ANAND_ID), aud3.slice(0, 3).map((a) => `${a.action}|${a.rec}`).join(' / '));

const asFinance = await call('GET', `/people/${ANAND_ID}`, null, FT);
check('finance may see the person (members.view)', asFinance.status === 200);
check('...but not the registration, which holds the ID number', asFinance.body?.registration === null && asFinance.body?.registrationHidden === true);
check('...and cannot reveal contact details (403)', (await call('GET', `/people/${ANAND_ID}/contact`, null, FT)).status === 403);
check('a role with no access to members is refused (403)', (await call('GET', `/people/${ANAND_ID}`, null, verifier.token)).status === 403);
check('it needs a sign-in', (await call('GET', `/people/${ANAND_ID}`)).status === 401);
check('an unknown member is a 404', (await call('GET', '/people/1', null, BT)).status === 404);

/* ================================================================== */
section('Correcting a person, and what the app asks to have changed');

{
  const asBoss = await call('GET', `/people/${ANAND_ID}`, null, BT);
  const fields = asBoss.body?.edit?.fields || [];
  check('the person page carries an edit form for someone who may edit', fields.length > 10 && fields.some((f) => f.key === 'firstName' && !f.contact && !f.locked), `${fields.length}`);
  check('...whose starting values do NOT include contact details', asBoss.body.edit.values.firstName === 'Anand' && !('email' in asBoss.body.edit.values) && !('city' in asBoss.body.edit.values), JSON.stringify(asBoss.body.edit.values).slice(0, 160));
  check('...and which marks the contact fields as such', fields.find((f) => f.key === 'email')?.contact === true && fields.find((f) => f.key === 'firstName')?.contact === false);
  check('someone who may only view gets no edit form', (await call('GET', `/people/${ANAND_ID}`, null, FT)).body?.edit === undefined);
  check('...the stored values are never sent loose', asBoss.body.editable === undefined);

  check('editing needs a sign-in', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'X' } })).status === 401);
  check('...and the permission to edit (finance gets 403)', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'X' } }, FT)).status === 403);
  check('nothing to save is refused', (await call('PATCH', `/people/${ANAND_ID}`, { changes: {} }, membership.token)).status === 400 && (await call('PATCH', `/people/${ANAND_ID}`, {}, membership.token)).status === 400);

  const bad = await call('PATCH', `/people/${ANAND_ID}`, { changes: { email: 'nope', mobile: 'call me', dateOfBirth: '31/12/1990' } }, membership.token);
  check('invalid details are refused, each one named', bad.status === 400 && !!bad.body?.errors?.email && !!bad.body?.errors?.mobile && !!bad.body?.errors?.dateOfBirth, bad.text.slice(0, 200));
  check('...a mobile number that is not one is refused, and says how to write it', /country code/.test(bad.body?.errors?.mobile || ''), bad.body?.errors?.mobile);
  check('...nothing was changed by a refused save', (await call('GET', `/people/${ANAND_ID}`, null, BT)).body?.member?.name === 'Anand Rao');

  const saved = await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'Anandan', gender: 'female' } }, membership.token);
  check('a correction is saved', saved.status === 200 && saved.body?.ok === true, saved.text.slice(0, 160));
  check('...and says what changed', saved.body?.changed?.join() === 'First name,Gender', JSON.stringify(saved.body?.changed));
  check('...and returns the person as now stored', saved.body?.person?.member?.name === 'Anandan Rao' && saved.body.person.edit.values.gender === 'female', saved.text.slice(0, 160));
  check('...so the register shows it too (what the app reads)', (await call('GET', '/app-roles/people', null, BT)).body?.rows?.find((r) => r.memberRowId === ANAND_ID)?.name === 'Anandan Rao');
  const same = await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'Anandan' } }, membership.token);
  check('saving what is already there changes nothing', same.status === 200 && same.body?.changed?.length === 0);

  const contact = await call('PATCH', `/people/${ANAND_ID}`, { changes: { email: 'new.anand@example.com', city: 'Nashik' } }, membership.token);
  check('a contact detail can be changed by someone who may see contact details', contact.status === 200 && contact.body?.changed?.length === 2, contact.text.slice(0, 160));
  const audit5 = (await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || [];
  const edited = audit5.find((a) => /Edited member details/.test(a.action) && /Email/.test(JSON.stringify(a.after || a.aft || a)));
  check('every edit is in the audit log, against the member', audit5.some((a) => /Edited member details/.test(a.action) && a.rec === ANAND_ID), audit5.slice(0, 3).map((a) => `${a.action}|${a.rec}`).join(' / '));
  check('...with names shown, but contact details NOT written into the log',
    !!edited && !/new\.anand|Nashik/.test(JSON.stringify(edited)) && /contact detail/.test(JSON.stringify(edited)), JSON.stringify(edited || audit5[0]).slice(0, 200));
  const rev = await call('GET', `/people/${ANAND_ID}/contact`, null, membership.token);
  check('revealing contact details now also gives the stored values for the form', rev.body?.values?.email === 'new.anand@example.com' && rev.body.values.city === 'Nashik' && 'corrAddress' in rev.body.values, JSON.stringify(rev.body?.values || {}).slice(0, 160));
  const formValues = (await call('GET', `/people/${ANAND_ID}`, null, membership.token)).body?.edit?.values || {};
  check('the reveal gives the referrer number for the form; the page gives only the name', rev.body?.values?.referPhone === '9000011111' && formValues.referName === 'Fr. Thomas' && !('referPhone' in formValues), JSON.stringify([rev.body?.values?.referPhone, formValues.referName]));
  const refEdit = await call('PATCH', `/people/${ANAND_ID}`, { changes: { referName: 'Anitha Varghese', referPhone: '90000 00555' } }, membership.token);
  check('the office can change who referred them', refEdit.status === 200 && refEdit.body?.changed?.length === 2, refEdit.text.slice(0, 200));
  check('...and the page then shows a Noah member, with the matched member', refEdit.body?.person?.referrer?.inNoah === true && refEdit.body.person.referrer.name === 'Anitha Varghese' && /•/.test(refEdit.body.person.referrer.phone), JSON.stringify(refEdit.body?.person?.referrer));
  check('a referrer number with letters is refused (400)', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { referPhone: 'abc' } }, membership.token)).status === 400);
  check('an unknown member is a 404', (await call('PATCH', '/people/27145000000999999', { changes: { city: 'X' } }, membership.token)).status === 404);

  /* ---------- the requests the app files ---------- */
  check('change requests need a sign-in and the permission', (await call('GET', '/change-requests')).status === 401 && (await call('GET', '/change-requests', null, FT)).status === 403);
  const pending = await call('GET', '/change-requests?status=pending', null, BT);
  check('the pending requests are listed, with who asked and what changes', pending.status === 200 && pending.body?.rows?.length === 16 && pending.body.rows.some((r) => r.fieldId === 'firstName' && r.newValue === 'Anandan' && /Anand/.test(r.memberName)), pending.text.slice(0, 200));
  check('...marking the one the console cannot place', pending.body.rows.find((r) => r.fieldId === 'favouriteColour')?.known === false);

  const nameReq = pending.body.rows.find((r) => r.fieldId === 'firstName');
  const colourReq = pending.body.rows.find((r) => r.fieldId === 'favouriteColour');
  const dateReq = pending.body.rows.find((r) => r.fieldId === 'dateOfBirth');
  const mailReq = pending.body.rows.find((r) => r.fieldId === 'emailId1');
  check('deciding needs a clear yes or no', (await call('POST', `/change-requests/${nameReq.id}/decide`, {}, BT)).status === 400);
  check('turning one down needs a reason', (await call('POST', `/change-requests/${nameReq.id}/decide`, { approve: false }, BT)).status === 400);
  check('finance cannot decide (403)', (await call('POST', `/change-requests/${nameReq.id}/decide`, { approve: true }, FT)).status === 403);
  check('one the console cannot place cannot be approved (409)', (await call('POST', `/change-requests/${colourReq.id}/decide`, { approve: true }, BT)).status === 409);
  check('one with a value that is not valid cannot be applied (422)', (await call('POST', `/change-requests/${dateReq.id}/decide`, { approve: true }, BT)).status === 422);
  check('an unknown request is a 404', (await call('POST', '/change-requests/1/decide', { approve: false, note: 'x' }, BT)).status === 404);

  const ok = await call('POST', `/change-requests/${nameReq.id}/decide`, { approve: true, note: 'Spelling corrected' }, BT);
  check('approving a request marks it approved', ok.status === 200 && ok.body?.status === 'approved', ok.text.slice(0, 160));
  check('...and the request is no longer pending', (await call('GET', '/change-requests?status=pending', null, BT)).body?.rows?.every((r) => r.id !== nameReq.id));
  check('...and cannot be decided again (409)', (await call('POST', `/change-requests/${nameReq.id}/decide`, { approve: true }, BT)).status === 409);
  const no = await call('POST', `/change-requests/${colourReq.id}/decide`, { approve: false, note: 'We do not keep that' }, BT);
  check('turning one down with a reason works', no.status === 200 && no.body?.status === 'rejected');
  const mailOk = await call('POST', `/change-requests/${mailReq.id}/decide`, { approve: true }, BT);
  check('a contact detail is applied by someone who may see contact details', mailOk.status === 200 && mailOk.body?.applied?.join() === 'Email', mailOk.text.slice(0, 160));
  check('...and the member now has the address the app asked for', (await call('GET', `/people/${ANAND_ID}/contact`, null, membership.token)).body?.values?.email === 'anand.rao@example.com');
  check('...and it is in the audit log', ((await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || []).some((a) => /change asked for from the app/i.test(a.action)));

  /* The app's own field ids (ADMIN_INTEGRATION, "Profile change requests"). */
  const fresh = (await call('GET', '/change-requests?status=pending', null, BT)).body?.rows || [];
  const byField = (f) => fresh.find((r) => r.fieldId === f);
  check('a documented id is labelled for the office (first_name is "First name")', byField('first_name')?.fieldLabel === 'First name' && byField('first_name')?.known === true);
  check('the sign-in number is listed as one that can be approved', byField('phone1')?.known === true && byField('phone1')?.signIn === true && !byField('phone1')?.blocked, JSON.stringify(byField('phone1')));
  /* Through the Noah API the API itself checks and converts the value; only the table path previews it. */
  check('the list says which way requests are decided', (await call('GET', '/change-requests?status=pending', null, BT)).body?.via === (NO_KEY ? 'table' : 'api'));
  if (NO_KEY) {
    check('an address request shows how it will be split, before approving', byField('address')?.saves?.length === 2 && byField('address').saves[1].value === 'Dadar', JSON.stringify(byField('address')?.saves));
    check('a location that cannot be split is flagged in the list', fresh.some((r) => r.fieldId === 'location' && /city, a state and a country/.test(r.problem || '')));
  }
  const phoneReq = byField('phone1');
  const anandWas = (await call('GET', `/people/${ANAND_ID}/contact`, null, BT)).body?.values?.mobile;
  const noPiiTry = await call('POST', `/change-requests/${phoneReq.id}/decide`, { approve: true }, FT);
  check('approving the sign-in number needs permission to edit members (finance 403)', noPiiTry.status === 403);
  const signedIn = await call('POST', `/change-requests/${phoneReq.id}/decide`, { approve: true }, BT);
  check('approving the sign-in number changes it, in both places the app reads', signedIn.status === 200 && signedIn.body?.signIn === true && signedIn.body?.applied?.join() === 'Mobile number'
    && (await call('GET', `/people/${ANAND_ID}/contact`, null, BT)).body?.values?.mobile === '+919876500000', signedIn.text.slice(0, 160));
  check('...and the request is approved', ((await call('GET', '/change-requests?status=approved', null, BT)).body?.rows || []).some((r) => r.id === phoneReq.id));
  check('...a request decided already is refused (409)', (await call('POST', `/change-requests/${phoneReq.id}/decide`, { approve: true }, BT)).status === 409);
  check('...and the number can be put back', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { mobile: anandWas } }, BT)).status === 200);
  const badLoc = fresh.find((r) => r.id === '27145000000160010');
  check('a location that cannot be split is refused when approved (422)', (await call('POST', `/change-requests/${badLoc.id}/decide`, { approve: true }, BT)).status === 422);
  const addr = await call('POST', `/change-requests/${byField('address').id}/decide`, { approve: true }, BT);
  check('an address request is applied', addr.status === 200 && addr.body?.applied?.join() === 'Address', addr.text.slice(0, 160));
  const afterAddr = (await call('GET', `/people/${ANAND_ID}/contact`, null, membership.token)).body?.values || {};
  check('...the last part is now the area, the rest the address', afterAddr.address === '14 Church Road, Near the school' && afterAddr.area === 'Dadar', JSON.stringify([afterAddr.address, afterAddr.area]));
  const noPii = (await call('GET', '/change-requests?status=pending', null, FT)).status;
  if (!NO_KEY) {
    /* The decision went through the API, which tells the member. */
    check('...and the reply says the member was notified', addr.body?.via === 'api' && addr.body?.notified?.pushed === 1, JSON.stringify([addr.body?.via, addr.body?.notified]));

    /* A new profile photograph. */
    const photoReq = byField('photo');
    check('a photograph request is marked as one', photoReq?.photo === true && photoReq.fieldLabel === 'Profile photo', JSON.stringify(photoReq));
    const newPic = await call('GET', `/change-requests/${photoReq.id}/photo/new`, null, BT);
    check('the new photograph can be looked at through the console', newPic.status === 200 && /image\/png/.test(newPic.type || '') && /FAKE-photo/.test(newPic.text), `${newPic.status} ${newPic.type} ${newPic.text.slice(0, 40)}`);
    check('...and so can the one it replaces', (await call('GET', `/change-requests/${photoReq.id}/photo/old`, null, BT)).status === 200);
    check('...but not by someone who may not decide (403)', (await call('GET', `/change-requests/${photoReq.id}/photo/new`, null, FT)).status === 403);
    check('...nor for a request that is not about a photograph (400)', (await call('GET', `/change-requests/${byField('first_name').id}/photo/new`, null, BT)).status === 400);
    check('...and which must be old or new (400)', (await call('GET', `/change-requests/${photoReq.id}/photo/other`, null, BT)).status === 400);
    check('viewing a photograph is in the audit log', ((await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || []).some((a) => /Viewed a profile photograph/.test(a.action)));
    const okPic = await call('POST', `/change-requests/${photoReq.id}/decide`, { approve: true }, BT);
    check('approving a photograph works and tells the member', okPic.status === 200 && okPic.body?.applied?.join() === 'Profile photo' && okPic.body?.notified?.pushed === 1, okPic.text.slice(0, 200));
    const rejReq = byField('blood_group');
    const rejected = await call('POST', `/change-requests/${rejReq.id}/decide`, { approve: false, note: 'That is not a blood group we hold.' }, BT);
    check('turning one down sends the reason to the member', rejected.status === 200 && rejected.body?.via === 'api', rejected.text.slice(0, 200));
    const rejList = await call('GET', '/change-requests?status=rejected', null, BT);
    const turnedDown = rejList.body?.rows || [];
    check('...and the list shows the reason', turnedDown.some((r) => r.id === rejReq.id && /not a blood group/.test(r.note)));
    /* The live Noah function fails on this one list (500), and the screen must not break with it. */
    check('the Turned down list still loads when the Noah API fails on it: from the table, and it says why',
      rejList.status === 200 && rejList.body?.listedFrom === 'table' && /Something went wrong/.test(rejList.body?.apiProblem || '') && rejList.body?.via === 'api', rejList.text.slice(0, 200));
    check('...the other lists still come from the API', (await call('GET', '/change-requests?status=approved', null, BT)).body?.listedFrom === 'api');
    check('...a decision on a request that is already turned down is still a 409, not a failure', await (async () => { const r = await call('POST', `/change-requests/${rejReq.id}/decide`, { approve: true }, BT); return r.status === 409 && r.body?.code === 'not_pending'; })());
    check('...and an unknown request is still a 404', (await call('POST', '/change-requests/1/decide', { approve: false, note: 'x' }, BT)).status === 404);
    check('a request already decided is a 409 (not_pending)', await (async () => { const r = await call('POST', `/change-requests/${photoReq.id}/decide`, { approve: true }, BT); return r.status === 409 && r.body?.code === 'not_pending'; })());
  }
  check('finance still cannot even list them (403)', noPii === 403);

  /* put the name and address back, so nothing later depends on this section */
  await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'Anand', gender: 'male', address: '12 Mill Road', area: 'Kurla' } }, membership.token);
}

/* ================================================================== */
section('Giving the roles a member holds in the app, and reading what the app sent');

{
  const give = await call('POST', `/app-roles/${ANAND_ID}/pastor`, { on: true }, BT);
  check('making someone a pastor works', give.status === 200 && give.body?.roles?.includes('pastor'), give.text.slice(0, 200));
  if (NO_KEY) {
    check('...without the Noah API key it writes the column and says so', give.body?.via === 'table' && /key is not set/.test(give.body?.warning || ''), JSON.stringify([give.body?.via, give.body?.warning]));
  } else {
    check('...through the Noah API, which is how the office\'s own tools see it', give.body?.via === 'noah-api' && !give.body?.warning, JSON.stringify([give.body?.via, give.body?.warning]));
  }
  const peopleRoles = (await call('GET', '/app-roles/people', null, BT)).body?.rows?.find((r) => r.memberRowId === ANAND_ID);
  check('...and the app\'s role list shows it', peopleRoles?.roles?.includes('pastor'), JSON.stringify(peopleRoles?.roles));

  const warrior = await call('POST', `/app-roles/${ANAND_ID}/prayerWarrior`, { on: true }, BT);
  check('a prayer warrior is a plain column, written directly', warrior.status === 200 && warrior.body?.via === 'table' && !warrior.body?.warning && warrior.body.roles.includes('prayerWarrior'), JSON.stringify([warrior.body?.via, warrior.body?.warning]));
  const take = await call('POST', `/app-roles/${ANAND_ID}/pastor`, { on: false }, BT);
  check('taking pastor away works too', take.status === 200 && !take.body?.roles?.includes('pastor'), take.text.slice(0, 160));
  await call('POST', `/app-roles/${ANAND_ID}/prayerWarrior`, { on: false }, BT);
  check('finance cannot give roles (403)', (await call('POST', `/app-roles/${ANAND_ID}/pastor`, { on: true }, FT)).status === 403);

  /* The door scanner in the app (FOR-CONSOLE-EVENTS.md 5b): { scanner } on the Noah API, kept in step with events.scan. */
  const appRolesOf = async (id) => (await call('GET', '/app-roles/people', null, BT)).body?.rows?.find((r) => r.memberRowId === id)?.roles || [];
  const cat = (await call('GET', '/app-roles/catalogue', null, BT)).body;
  check('App roles offers "Door staff / Pass scanner"', cat?.roles?.some((r) => r.id === 'passScan' && r.label === 'Door staff / Pass scanner'), JSON.stringify(cat?.roles?.map((r) => r.label)));
  const oldRow = () => call('GET', '/data/STAFF', null, BT).then((r) => r.body.rows.find((x) => x.name === 'Old Member' && x.status !== 'Revoked'));
  const OLD_NOW = (await oldRow())?.id;
  check('a staff member whose role does not scan has no door-scanner role', !(await appRolesOf(OLD_ID)).includes('passScan'), JSON.stringify(await appRolesOf(OLD_ID)));
  const toScan = await call('POST', `/staff/${OLD_NOW}/role`, { role: 'events' }, BT);
  if (NO_KEY) {
    check('without the Noah API key a role change still works and says nothing about the app', toScan.status === 200 && !toScan.body?.warning, toScan.text.slice(0, 160));
  } else {
    check('given a console role with events.scan, they get the door-scanner role in the app', toScan.status === 200 && !toScan.body?.warning && (await appRolesOf(OLD_ID)).includes('passScan'), toScan.text.slice(0, 160));
    await call('POST', `/staff/${OLD_NOW}/status`, { to: 'Suspended' }, BT);
    check('...suspended, it is taken away', !(await appRolesOf(OLD_ID)).includes('passScan'));
    await call('POST', `/staff/${OLD_NOW}/status`, { to: 'Active' }, BT);
    check('...enabled again, it comes back', (await appRolesOf(OLD_ID)).includes('passScan'));
    await call('POST', `/staff/${OLD_NOW}/role`, { role: 'comms' }, BT);
    check('...moved to a role without events.scan, it is taken away', !(await appRolesOf(OLD_ID)).includes('passScan'));
    const gridOn = await call('PATCH', '/roles/comms', { perm: 'events.scan', on: true }, BT);
    check('switching events.scan on for a whole role gives it to that role\'s staff', gridOn.status === 200 && !gridOn.body?.warning && (await appRolesOf(OLD_ID)).includes('passScan'), gridOn.text.slice(0, 160));
    const gridOff = await call('PATCH', '/roles/comms', { perm: 'events.scan', on: false }, BT);
    check('...and switching it off takes it away', gridOff.status === 200 && !(await appRolesOf(OLD_ID)).includes('passScan'));
  }
  await call('POST', `/staff/${OLD_NOW}/role`, { role: 'comms' }, BT);

  /* Staff given access before the two were kept in step (here: the office's own super administrator). */
  const before = (await call('GET', '/app-roles/people', null, BT)).body?.scannerGaps || [];
  check('App roles lists staff who can scan in the console but not yet in the app', before.length > 0 && !before.some((g) => g.memberRowId === OLD_ID), JSON.stringify(before));
  check('...the fix needs approles.manage or staff.manage (finance: 403)', (await call('POST', '/app-roles/sync-scanners', {}, FT)).status === 403);
  const fill = await call('POST', '/app-roles/sync-scanners', {}, BT);
  if (NO_KEY) {
    check('...without the Noah API key it says it cannot (409)', fill.status === 409, fill.text.slice(0, 160));
  } else {
    check('...one press gives them the door-scanner role', fill.status === 200 && fill.body?.given === before.length && !fill.body?.failed?.length, fill.text.slice(0, 160));
    check('...and the list is empty after', ((await call('GET', '/app-roles/people', null, BT)).body?.scannerGaps || []).length === 0);
  }

  const giveScan = await call('POST', `/app-roles/${OLD_ID}/passScan`, { on: true }, BT);
  check('the door-scanner role can be given on App roles', giveScan.status === 200 && giveScan.body?.roles?.includes('passScan'), giveScan.text.slice(0, 200));
  if (!NO_KEY) check('...through the Noah API ({ scanner: true }, kept as users.is_employee)', giveScan.body?.via === 'noah-api' && !giveScan.body?.warning, JSON.stringify([giveScan.body?.via, giveScan.body?.warning]));
  const takeScan = await call('POST', `/app-roles/${OLD_ID}/passScan`, { on: false }, BT);
  check('...and taken away', takeScan.status === 200 && !takeScan.body?.roles?.includes('passScan'), takeScan.text.slice(0, 200));
}

/* ================================================================== */
section('Attendance: every event, then who came to one');

{
  const fakeInsert = (table, rows) =>
    fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table, rows }) }).then((r) => r.json());
  const EV = '27145000000990001';
  await fakeInsert('events', [{ ROWID: EV, name: 'Attendance check', eventType: 1, eventValue: '2026-11-20', startTime: '10:00', isArchived: false }]);
  await fakeInsert('passes', [
    { ROWID: '27145000000991001', eventId: EV, memberId: ANAND_ID, passIsUsed: true, passIsUsedTime: '2026-11-20 04:35:00', passIsUsedEmployeeId: OLD_ID, inactive: false },
    { ROWID: '27145000000991002', eventId: EV, memberId: OLD_ID, passIsUsed: false, inactive: false },
    { ROWID: '27145000000991003', eventId: EV, memberId: DRAFT_MEMBER_ID, passIsUsed: false, inactive: true },
  ]);

  const list = await call('GET', '/event-admin/attendance/events', null, BT);
  const ev = list.body?.rows?.find((e) => e.id === EV);
  check('Attendance lists the events with how many booked and came', list.status === 200 && ev?.booked === 2 && ev?.present === 1 && ev?.notArrived === 1 && ev?.cancelled === 1, JSON.stringify(ev));
  const ppl = await call('GET', `/event-admin/events/${EV}/people`, null, BT);
  const byName = Object.fromEntries((ppl.body?.rows || []).map((p) => [p.memberId, p]));
  check('...one event shows everyone booked', ppl.status === 200 && ppl.body.rows.length === 3, ppl.text.slice(0, 200));
  check('...who is present, when they came in and who let them in', byName[ANAND_ID]?.status === 'Present' && byName[ANAND_ID]?.arrivedAt === '2026-11-20 04:35:00' && /Old Member/.test(byName[ANAND_ID]?.letInBy || ''), JSON.stringify(byName[ANAND_ID]));
  check('...who has not arrived yet, and who cancelled', byName[OLD_ID]?.status === 'Not yet arrived' && byName[DRAFT_MEMBER_ID]?.status === 'Cancelled');
  check('finance cannot see attendance (403)', (await call('GET', `/event-admin/events/${EV}/people`, null, FT)).status === 403);
  check('the console has no door scanner any more (404)', (await call('POST', `/event-admin/events/${EV}/scan`, { reference: 'KS-TEST-1' }, BT)).status === 404);
}

/* ================================================================== */
section("A child's consent in Registrations: marked with the parent, decided like any other (FOR-CONSOLE-CHILDREN.md)");

{
  const fakeInsert = (table, rows) =>
    fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table, rows }) }).then((r) => r.json());
  const KID_MEMBER = '27145000000994001';
  const KID_REG = '27145000000994002';
  const KID_ROW = '27145000000994003';
  await fakeInsert('members', [{
    ROWID: KID_MEMBER, firstName: 'Riya', middleName: 'Anand', lastName: 'Rao', isKid: true, userId: '',
    gender: 2, dateOfBirth: '2016-04-02', emailId1: 'anand@example.com', aadharCardNumber: '123412341234', isUnVerified: true,
  }]);
  await fakeInsert('appRegistrations', [{
    ROWID: KID_REG, memberRowId: KID_MEMBER, status: 'pending', submittedAt: '2026-11-20 05:00:00',
    parentMemberId: ANAND_ID, kidRowId: KID_ROW, idProofType: 'aadhar',
  }]);
  await call('POST', '/refresh', null, BT);

  const list = await call('GET', '/data/REGISTRATIONS?state=pending&limit=300', null, BT);
  const kid = list.body?.rows?.find((r) => r.id === KID_REG);
  check('a child\'s registration is in the Registrations list, marked with its parent', !!kid && kid.child?.parentId === ANAND_ID && kid.child?.kidId === KID_ROW && kid.child?.parentName === 'Anand Rao' && !!kid.child?.parentPhone, JSON.stringify(kid?.child));
  check('...with the child\'s own name, date of birth and email', kid?.fullName === 'Riya Anand Rao' && kid?.email === 'anand@example.com' && !!kid?.dob);
  check('every other registration has no child', list.body.rows.filter((r) => r.id !== KID_REG).every((r) => r.child === null));
  check('the list can be searched by the parent\'s name', (await call('GET', '/data/REGISTRATIONS?state=pending&q=anand%20rao&limit=300', null, BT)).body?.rows?.some((r) => r.id === KID_REG));
  const one = await call('GET', `/registrations/${KID_REG}`, null, BT);
  check('the detail carries the parent too', one.status === 200 && one.body?.child?.parentName === 'Anand Rao');


  const yes = await call('POST', `/registrations/${KID_REG}/approve`, {}, BT);
  check('a child\'s consent is approved like any other registration, and the answer says the parents are told', yes.status === 200 && /The child can now use the Noah app as a member/.test(yes.body?.appAccess || ''), `${yes.status} ${yes.text.slice(0, 200)}`);

  /* The child on the parent's page, and the parent on the child's. */
  await fakeInsert('kids', [{ ROWID: KID_ROW, firstName: 'Riya', middleName: 'Anand', lastName: 'Rao', gender: 2, dateOfBirth: '2016-04-02 00:00:00', archived: false }]);
  await fakeInsert('kidsConnect', [{ ROWID: '27145000000994004', memberId: ANAND_ID, kidId: KID_ROW, relationship: 3, isArchived: false }]);
  await call('POST', '/refresh', null, BT);
  const parentPage = await call('GET', `/people/${ANAND_ID}`, null, BT);
  const riya = parentPage.body?.family?.rows?.find((f) => f.rowId === KID_ROW);
  check('the parent\'s Family lists the child with their details', !!riya && riya.kid && riya.rel === 'Daughter' && riya.child?.dob === '2016-04-02' && riya.child?.gender === 'Female', JSON.stringify(riya));
  check('...with how the child stands (a member), and the child\'s own record to open', riya?.child?.state === 'member' && riya?.child?.memberRowId === KID_MEMBER && riya?.child?.email === 'anand@example.com', JSON.stringify(riya?.child));
  const kidPage = await call('GET', `/people/${KID_MEMBER}`, null, BT);
  check('the child\'s own page lists their parent', kidPage.status === 200 && kidPage.body?.family?.rows?.some((f) => f.rowId === ANAND_ID && f.parent && f.rel === 'Father'), JSON.stringify(kidPage.body?.family?.rows));
  check('...and shows the parent\'s mobile, masked until revealed', kidPage.body?.guardians?.[0]?.rowId === ANAND_ID && /•/.test(kidPage.body.guardians[0].mobile || ''), JSON.stringify(kidPage.body?.guardians));
  const kidContact = await call('GET', `/people/${KID_MEMBER}/contact`, null, BT);
  check('...revealing the child\'s contact details shows the parent\'s number', /^\+\d{10,}$/.test(kidContact.body?.guardians?.[0]?.mobile || ''), JSON.stringify(kidContact.body?.guardians));
  check('a child made a member has their own number, which the office can change', (kidPage.body?.edit?.fields || []).some((f) => f.key === 'mobile')
    && (await call('PATCH', `/people/${KID_MEMBER}`, { changes: { mobile: '+91 98111 00001' } }, BT)).status === 200);

  /* A member's mobile number: the one they sign in with, edited from the console. */
  const was = (await call('GET', `/people/${ANAND_ID}/contact`, null, BT)).body?.values?.mobile;
  check('the edit form offers the mobile number, as a contact detail', (parentPage.body?.edit?.fields || []).some((f) => f.key === 'mobile' && f.contact && f.kind === 'mobile') && /^\+\d+$/.test(was || ''), was);
  const moved = await call('PATCH', `/people/${ANAND_ID}`, { changes: { mobile: '98111 22334' } }, BT);
  const now = (await call('GET', `/people/${ANAND_ID}/contact`, null, BT)).body;
  check('the mobile number can be changed (ten digits are taken as +91)', moved.status === 200 && moved.body?.changed?.includes('Mobile number') && now?.mobile === '+919811122334' && now?.values?.mobile === '+919811122334', `${moved.status} ${moved.text.slice(0, 160)} ${now?.mobile}`);
  check('...and the change is in the audit log, without the number', (await call('GET', '/data/AUD?limit=10', null, BT)).body?.rows?.some((a) => a.action === "Changed a member's mobile number" && !JSON.stringify(a).includes('9811122334')));
  const clash = await call('PATCH', `/people/${OLD_ID}`, { changes: { mobile: '+91 98111 22334' } }, BT);
  check('a number another member already has is refused (409), and named on the field', clash.status === 409 && /Another member already uses this number/.test(clash.body?.errors?.mobile || ''), `${clash.status} ${clash.text.slice(0, 120)}`);
  check('...a number with a country code that is too short is refused (400)', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { mobile: '+91 123' } }, BT)).status === 400);
  check('...and changing it needs the permission to see contact details (finance gets 403)', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { mobile: '+91 98111 22335' } }, FT)).status === 403);
  /* Back as it was, for the sections that sign in with it. */
  check('...and it can be put back', (await call('PATCH', `/people/${ANAND_ID}`, { changes: { mobile: was } }, BT)).status === 200);
}

/* ================================================================== */
section('Children: the list, the notice at 15, and Make member (FOR-CONSOLE-CHILDREN.md)');

{
  const fakeInsert = (table, rows) =>
    fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table, rows }) }).then((r) => r.json());
  /* A second child of Anand's, 17, registered and approved. */
  const TEEN = '27145000000997001', TEEN_REG = '27145000000997002', TEEN_KID = '27145000000997003';
  await fakeInsert('kids', [{ ROWID: TEEN_KID, firstName: 'Kiran', lastName: 'Rao', gender: 1, dateOfBirth: '2009-02-10 00:00:00', archived: false }]);
  await fakeInsert('kidsConnect', [{ ROWID: '27145000000997004', memberId: ANAND_ID, kidId: TEEN_KID, relationship: 2, isArchived: false }]);
  await fakeInsert('members', [{ ROWID: TEEN, firstName: 'Kiran', lastName: 'Rao', isKid: true, userId: '', gender: 1, dateOfBirth: '2009-02-10', countryCode: '+91', mobileNumber1: '9811100077' }]);
  await fakeInsert('appRegistrations', [{ ROWID: TEEN_REG, memberRowId: TEEN, status: 'draft', parentMemberId: ANAND_ID, kidRowId: TEEN_KID }]);
  await call('POST', '/refresh', null, BT);

  const list = await call('GET', '/children', null, BT);
  const kiran = list.body?.rows?.find((c) => c.kidId === TEEN_KID);
  check('the Children list has every child, with age, parents and membership', list.status === 200 && kiran?.age === 17 && kiran?.fifteen === true && kiran?.state === 'login' && kiran?.parents?.[0]?.rowId === ANAND_ID, JSON.stringify(kiran));
  check('...parents\' numbers masked', /•/.test(kiran?.parents?.[0]?.mobile || ''));
  check('...a younger child is under 15', list.body.rows.some((c) => c.fifteen === false && c.state === 'young'));
  check('...and not told yet', kiran?.noticeAt === null && kiran?.noticesRead === true);
  check('only 15 or more, when asked', (await call('GET', '/children?age=15', null, BT)).body?.rows?.every((c) => c.fifteen));
  check('the list needs permission to see members (401 without a sign-in)', (await call('GET', '/children')).status === 401);

  const sent = await call('POST', '/children/age-notices', null, BT);
  check('Send notices now asks the Noah API, which tells the families who are due', sent.status === 200 && sent.body?.sent >= 1 && sent.body?.checked >= 1, sent.text.slice(0, 120));
  const again = await call('POST', '/children/age-notices', null, BT);
  check('...asking again tells nobody twice', again.status === 200 && again.body?.sent === 0);
  const after = (await call('GET', '/children', null, BT)).body?.rows?.find((c) => c.kidId === TEEN_KID);
  check('...and the list shows when the family was told', !!after?.noticeAt, JSON.stringify(after));
  check('sending needs permission to edit members (finance gets 403)', (await call('POST', '/children/age-notices', null, FT)).status === 403);

  /* A child of 15 or more becomes a member when the office approves "Make member" (FOR-CONSOLE-CHILDREN.md). */
  const MEERA_KID = '27145000000998001', AADHAAR_FILE = '27145000000998002', MM_REQ = '100596000000071099';
  await fakeInsert('kids', [{ ROWID: MEERA_KID, firstName: 'Meera', lastName: 'Rao', gender: 2, dateOfBirth: '2010-01-05 00:00:00', archived: false, photoFileId: AADHAAR_FILE, aadhaarNo: '432143214321' }]);
  await fakeInsert('kidsConnect', [{ ROWID: '27145000000998003', memberId: ANAND_ID, kidId: MEERA_KID, relationship: 3, isArchived: false }]);
  await fakeInsert('files', [{ ROWID: AADHAAR_FILE, path: 'x', remoteSource: JSON.stringify({ purpose: 'post', mimeType: 'image/png', name: 'aadhaar.png' }) }]);
  await fetch(CONTROL + '/_fake/family-request', { method: 'POST', body: JSON.stringify({
    id: MM_REQ, kind: 'member', relation: 'daughter', kid: true, kidId: MEERA_KID, name: 'Meera Rao', gender: 'female', dob: '2010-01-05',
    mobile: '+919811100055', aadhaarNo: '4321 4321 4321', aadhaarFileId: AADHAAR_FILE, requesterId: ANAND_ID, existingMemberId: null,
  }) });
  await call('POST', '/refresh', null, BT);
  const fam = (await call('GET', '/family-requests?state=Pending', null, BT)).body?.rows || [];
  const mm = fam.find((r) => r.id === MM_REQ);
  check('a Make member request is listed as kind member, with the child\'s own number and Aadhaar', mm?.kind === 'member' && mm.kidId === MEERA_KID && mm.childMobile === '+919811100055' && mm.aadhaarNo === '432143214321' && mm.aadhaarFileId === AADHAAR_FILE, JSON.stringify(mm));
  const aad = await call('GET', `/family-requests/${MM_REQ}/aadhaar`, null, BT);
  check('...the Aadhaar picture can be opened', aad.status === 200 && /image\/png/.test(aad.type || ''), `${aad.status} ${aad.type}`);
  check('...and opening it is in the audit log', ((await call('GET', '/data/AUD?limit=20', null, BT)).body?.rows || []).some((a) => a.action === 'Viewed the Aadhaar on a Make member request'));
  check('...the Children list says Make member was asked for', (await call('GET', '/children', null, BT)).body?.rows?.find((c) => c.kidId === MEERA_KID)?.state === 'requested');
  check('...and shows the photo the parents gave', (await call('GET', `/children/${MEERA_KID}/photo`, null, BT)).status === 200);
  const made = await call('POST', `/family-requests/${MM_REQ}/decide`, { decision: 'Approved' }, BT);
  check('approving Make member makes the child a member', made.status === 200 && made.body?.result?.kind === 'member' && !!made.body?.result?.memberId, made.text.slice(0, 200));
  await call('POST', '/refresh', null, BT);
  check('...who now waits to send their consent', (await call('GET', '/children', null, BT)).body?.rows?.find((c) => c.kidId === MEERA_KID)?.state === 'login');
  const draft = (await call('GET', '/data/REGISTRATIONS?state=draft&limit=300', null, BT)).body?.rows?.find((r) => r.child?.kidId === MEERA_KID);
  check('...with a registration for the consent, marked Child of the parent', draft?.child?.parentName === 'Anand Rao', JSON.stringify(draft?.child));

  /* A number that is already a member's: the Noah API refuses it, and the office reads why in plain words. */
  const TAKEN_REQ = '100596000000071098';
  await fetch(CONTROL + '/_fake/family-request', { method: 'POST', body: JSON.stringify({
    id: TAKEN_REQ, kind: 'member', relation: 'son', kid: true, kidId: '27145000000998009', name: 'Joel Rao', gender: 'male', dob: '2010-02-01',
    mobile: '+919811100055', aadhaarNo: '111122223333', aadhaarFileId: AADHAAR_FILE, requesterId: ANAND_ID, existingMemberId: null,
  }) });
  await call('POST', '/refresh', null, BT);
  const taken = await call('POST', `/family-requests/${TAKEN_REQ}/decide`, { decision: 'Approved' }, BT);
  check('approving with a number another member has is refused, saying why', taken.status === 409 && taken.body?.code === 'phone_in_use' && /belongs to another member/.test(taken.body?.error || ''), taken.text.slice(0, 200));
  check('...and the request is still waiting', ((await call('GET', '/family-requests?state=Pending', null, BT)).body?.rows || []).some((r) => r.id === TAKEN_REQ));
  const rejected = await call('POST', `/family-requests/${TAKEN_REQ}/decide`, { decision: 'Rejected', remark: "Please give the child's own number." }, BT);
  check('...so it is rejected with a reason for both parents', rejected.status === 200 && rejected.body?.request?.state === 'Rejected', rejected.text.slice(0, 200));

  /* Every new child waits for the office (docs/FOR-NOAH-API-CHILD-APPROVAL.md): the request carries the photo and Aadhaar. */
  const NEW_KID_REQ = '100596000000071097';
  await fetch(CONTROL + '/_fake/family-request', { method: 'POST', body: JSON.stringify({
    id: NEW_KID_REQ, kind: 'child', relation: 'son', kid: true, name: 'Noel Rao', gender: 'male', dob: '2019-06-01',
    photoFileId: AADHAAR_FILE, aadhaarNo: '5555 6666 7777', aadhaarFileId: AADHAAR_FILE, requesterId: ANAND_ID, existingMemberId: null,
  }) });
  await call('POST', '/refresh', null, BT);
  const newKid = ((await call('GET', '/family-requests?state=Pending', null, BT)).body?.rows || []).find((r) => r.id === NEW_KID_REQ);
  check('a new child waits for the office, with the photo and the Aadhaar', newKid?.kind === 'child' && newKid.photoFileId === AADHAAR_FILE && newKid.aadhaarNo === '555566667777' && newKid.aadhaarFileId === AADHAAR_FILE, JSON.stringify(newKid));
  const kidPhoto = await call('GET', `/family-requests/${NEW_KID_REQ}/photo`, null, BT);
  check("...the child's photo can be opened", kidPhoto.status === 200 && /image\//.test(kidPhoto.type || ''), `${kidPhoto.status} ${kidPhoto.type}`);
  check('...and so can the Aadhaar', (await call('GET', `/family-requests/${NEW_KID_REQ}/aadhaar`, null, BT)).status === 200);
  check('...the queue counts it', ((await call('GET', '/queues', null, BT)).body || []).find?.((q) => q.id === 'family')?.count >= 1);
  const addKid = await call('POST', `/family-requests/${NEW_KID_REQ}/decide`, { decision: 'Approved' }, BT);
  check('approving adds the child to the family', addKid.status === 200, addKid.text.slice(0, 200));
  await call('POST', '/refresh', null, BT);
  const noel = ((await call('GET', '/children', null, BT)).body?.rows || []).find((c) => c.name === 'Noel Rao');
  check('...with the photo and Aadhaar the parent gave', !!noel && noel.kidPhoto === true && noel.aadhaar === true, JSON.stringify(noel));

  /* Opening a child shows the child's own record, not a parent's. */
  const kid = await call('GET', `/children/${MEERA_KID}`, null, BT);
  check("a child's own record opens: the child's name, date of birth and Aadhaar", kid.status === 200 && kid.body?.kidId === MEERA_KID && kid.body?.name === 'Meera Rao' && kid.body?.dob === '2010-01-05' && kid.body?.aadhaarNo === '432143214321', kid.text.slice(0, 300));
  check('...with the parents beside it, as Father or Mother', kid.body?.parents?.some((p) => p.rowId === ANAND_ID && ['Father', 'Mother', 'Parent'].includes(p.rel)), JSON.stringify(kid.body?.parents));
  check('...the Make member request and the consent', kid.body?.makeMember?.[0]?.state === 'Approved' && kid.body?.consent?.status === 'draft' && !!kid.body?.memberRowId, JSON.stringify({ m: kid.body?.makeMember, c: kid.body?.consent }));
  check('...a child who is not there is a 404', (await call('GET', '/children/27145000000990000', null, BT)).status === 404);
  check('...and the record needs permission to see members (the content editor gets 403)', (await call('GET', `/children/${MEERA_KID}`, null, ET)).status === 403);
}

/* ================================================================== */
section('Daily Manna in every language: translated in the background on save, kept in step, deleted with the original');

/* Translations are made after the save answers: wait until the list says none is being made. */
const settled = async (type) => {
  let rows = [];
  for (let i = 0; i < 80; i += 1) {
    rows = (await call('GET', `/content/${type}`, null, BT)).body?.rows || [];
    if (!rows.some((r) => r.translating)) return rows;
    await new Promise((r) => setTimeout(r, 100));
  }
  return rows;
};
const SIX = { hi: '2', mr: '3', te: '4', ml: '5', ta: '6', kn: '7' };

{
  const DAY = { title: 'Grace upon grace', publishDate: '2026-11-25', contentLanguage: '1', published: false,
    content: '<p>Hello <strong>world</strong></p><ul><li><p>One thing</p></li></ul>', prayer: '<p>Amen.</p>' };
  const made = await call('POST', '/content/manna', DAY, BT);
  check('saving a devotional answers at once, saying it is being translated into the six languages', made.status === 201 && made.body?.translation?.queued === true
    && /Translating into Hindi, Marathi, Telugu, Malayalam, Tamil and Kannada/.test(made.body.translation.said || ''), `${made.status} ${made.text.slice(0, 200)}`);
  const rows = await settled('manna');
  const en = rows.find((r) => r.title === 'Grace upon grace');
  const copies = rows.filter((r) => r.translatedFrom === en?.id);
  check('...then each language has its own entry, pointing at the original', copies.length === 6
    && Object.entries(SIX).every(([iso, code]) => copies.some((c) => c.contentLanguage === code && c.title === `[${iso}] Grace upon grace` && c.publishDate === '2026-11-25')), JSON.stringify(copies.map((c) => [c.contentLanguage, c.title])));
  const kn = copies.find((r) => r.contentLanguage === '7');
  check('...the message translated block by block, the blocks kept', kn?.content === '<p>[kn] Hello world</p><ul><li><p>[kn] One thing</p></li></ul>' && kn?.prayer === '<p>[kn] Amen.</p>', kn?.content);
  check('...and they are drafts, like the original', copies.every((c) => c.published === false && c.live === false));
  check('...and the original is no longer marked as translating', en && !en.translating && !en.translationFailed);

  await call('PATCH', `/content/manna/${kn.id}`, { title: 'ಕೃಪೆಯ ಮೇಲೆ ಕೃಪೆ' }, BT);
  await settled('manna');
  const edited = await call('PATCH', `/content/manna/${en.id}`, { prayer: '<p>Thank you, Lord.</p>' }, BT);
  const kn2 = (await settled('manna')).find((r) => r.id === kn.id);
  check('changing the English prayer translates the prayer again', edited.status === 200 && kn2?.prayer === '<p>[kn] Thank you, Lord.</p>', JSON.stringify(kn2).slice(0, 200));
  check('...so a correction made to the Kannada title by hand is kept', kn2?.title === 'ಕೃಪೆಯ ಮೇಲೆ ಕೃಪೆ', kn2?.title);
  await call('PATCH', `/content/manna/${kn.id}`, { prayer: '<p>ಆಮೆನ್</p>' }, BT);
  check('editing the Kannada copy itself translates nothing', (await settled('manna')).find((r) => r.id === kn.id)?.prayer === '<p>ಆಮೆನ್</p>');

  const live = await call('POST', `/content/manna/${en.id}/publish`, { on: true }, BT);
  check('publishing the original publishes every translation too', live.status === 200 && (await settled('manna')).filter((r) => r.translatedFrom === en.id).every((r) => r.live === true));

  const failed = await call('PATCH', `/content/manna/${en.id}`, { content: '<p>FAIL-TRANSLATE this</p>' }, BT);
  const afterFail = await settled('manna');
  check('a translation that fails does not stop the original being saved', failed.status === 200 && afterFail.find((r) => r.id === en.id)?.content === '<p>FAIL-TRANSLATE this</p>');
  check('...and the list says which languages were not translated', afterFail.find((r) => r.id === en.id)?.translationFailed?.includes('Kannada'), JSON.stringify(afterFail.find((r) => r.id === en.id)?.translationFailed));

  await call('PATCH', `/content/manna/${en.id}`, { content: '<p>Hello again</p>' }, BT);
  await settled('manna');
  const fresh = await call('POST', `/content/manna/${en.id}/translate`, null, BT);
  const after = await settled('manna');
  const kn3 = after.find((r) => r.id === kn.id);
  check('Translate again translates every text afresh', fresh.status === 200 && kn3?.title === '[kn] Grace upon grace' && kn3?.content === '<p>[kn] Hello again</p>', JSON.stringify(kn3).slice(0, 200));
  check('...and the failure mark is gone', !after.find((r) => r.id === en.id)?.translationFailed);
  check('...and needs permission to edit content (finance gets 403)', (await call('POST', `/content/manna/${en.id}/translate`, null, FT)).status === 403);

  const gone = await call('DELETE', `/content/manna/${en.id}`, null, BT);
  let left = [];
  for (let i = 0; i < 40; i += 1) {
    left = ((await call('GET', '/content/manna', null, BT)).body?.rows || []).filter((r) => r.translatedFrom === en.id);
    if (!left.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check('deleting the original deletes its translations', gone.status === 200 && left.length === 0, `${gone.status} ${left.length} left`);
  /* Text with no letters (a number, a row of signs) has nothing to translate: it is kept as it is, not sent to Zoho, so it can
     never make an entry fail (a message that was only "1234567890" once failed in every language). */
  const callsBefore = (await (await fetch(CONTROL + '/_fake/translate-calls')).json()).calls.length;
  const digits = await call('POST', '/content/manna', { title: 'Numbers', publishDate: '2026-12-01', published: false, content: '<p><strong><s>1234567890</s></strong></p>', prayer: '<p>Amen.</p>' }, BT);
  const digitRows = await settled('manna');
  const numbers = digitRows.find((r) => r.title === 'Numbers' && !r.translatedFrom);
  const numberCopies = digitRows.filter((r) => r.translatedFrom === numbers?.id);
  check('a message of only numbers is translated into all six, the numbers kept', digits.status === 201 && numberCopies.length === 6
    && numberCopies.every((c) => /1234567890/.test(c.content) && /^<p>\[..\] Amen\.<\/p>$/.test(c.prayer)), JSON.stringify(numberCopies[0]).slice(0, 200));
  const newCalls = (await (await fetch(CONTROL + '/_fake/translate-calls')).json()).calls.slice(callsBefore);
  check('...and the numbers were never sent to Zoho', !newCalls.some((c) => /^\d+$/.test(String(c.text || '').trim())), JSON.stringify(newCalls.slice(0, 3)));
  await call('DELETE', `/content/manna/${numbers.id}`, null, BT);
  await settled('manna');

  /* The form no longer asks the language of content that is translated: it is English, and the copies keep their own. */
  const types = (await call('GET', '/content/types', null, BT)).body?.types || [];
  check('the translated kinds do not ask for a language', ['manna', 'prayers', 'confessions', 'dictionary', 'bibleCommentary']
    .every((id) => types.find((t) => t.id === id)?.fields?.find((f) => f.key === 'contentLanguage')?.hidden === true)
    && types.find((t) => t.id === 'tubeVideos')?.fields?.some((f) => f.key === 'contentLanguage' && !f.hidden), 'hidden flags');
  const { contentLanguage: _skip, ...noLang } = DAY;
  const plain = await call('POST', '/content/manna', { ...noLang, title: 'Still waters' }, BT);
  const plainRows = await settled('manna');
  const still = plainRows.find((r) => r.title === 'Still waters' && !r.translatedFrom);
  check('...an entry saved without one is stored as English, and translated', plain.status === 201 && still?.contentLanguage === '1'
    && plainRows.filter((r) => r.translatedFrom === still?.id).length === 6, `${plain.status} ${JSON.stringify(still).slice(0, 120)}`);
  const hiCopy = plainRows.find((r) => r.translatedFrom === still?.id && r.contentLanguage === '2');
  await call('PATCH', `/content/manna/${hiCopy.id}`, { title: 'शांत जल' }, BT);
  check('...and editing a translation keeps its language', (await settled('manna')).find((r) => r.id === hiCopy.id)?.contentLanguage === '2');
  await call('DELETE', `/content/manna/${still.id}`, null, BT);

  const calls = (await (await fetch(CONTROL + '/_fake/translate-calls')).json()).calls;
  check('every call asked for one of the six languages, from English', calls.length > 0 && calls.every((c) => c.source === 'en' && c.target in SIX)
    && Object.keys(SIX).every((iso) => calls.some((c) => c.target === iso)));
}

/* ================================================================== */
section('Member register: filter by place, mother tongue, group and event; export as CSV');

{
  const fakeInsert = (table, rows) =>
    fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table, rows }) }).then((r) => r.json());
  await fakePatch('members', ANAND_ID, { city: 'Nashik', state: 'Goa', country: 'Nepal', motherTongue: 'Marathi' });
  await fakePatch('members', OLD_ID, { city: ' nashik ', state: 'GOA', country: 'Nepal', motherTongue: 'Hindi', address: '=HYPERLINK("http://x")' });
  await fakeInsert('groups', [{ ROWID: '27145000000992001', name: 'WOW' }, { ROWID: '27145000000992002', name: 'Marathi' }, { ROWID: '27145000000992003', name: 'Old group', isArchived: true }]);
  await fakeInsert('groupsConnect', [
    { ROWID: '27145000000993001', memberId: ANAND_ID, groupId: '27145000000992001' },
    { ROWID: '27145000000993002', memberId: ANAND_ID, groupId: '27145000000992002' },
    { ROWID: '27145000000993003', memberId: OLD_ID, groupId: '27145000000992002' },
    { ROWID: '27145000000993004', memberId: OLD_ID, groupId: '27145000000992003' },
  ]);
  await call('POST', '/refresh', null, BT);

  const names = async (query) => ((await call('GET', `/data/MEMBERS?limit=500&status=&${query}`, null, BT)).body?.rows || []).map((m) => m.rowId).sort();
  const opts = await call('GET', '/member-register/filters', null, BT);
  const city = opts.body?.city?.find((o) => o.label.toLowerCase() === 'nashik');
  const goa = opts.body?.state?.filter((o) => o.label.toLowerCase() === 'goa');
  check('the filter choices are the values members have, with counts, whatever the case or spacing', opts.status === 200 && city?.count === 2 && goa?.length === 1 && goa[0].count === 2 && opts.body.tongue.length === 2, JSON.stringify(opts.body).slice(0, 300));
  check('...groups are offered, not archived ones', opts.body?.group?.some((g) => g.label === 'WOW' && g.count === 1) && !opts.body.group.some((g) => g.label === 'Old group'));
  check('...and only events someone came to', opts.body?.event?.length >= 1 && opts.body.event.every((e) => e.count > 0), JSON.stringify(opts.body?.event));
  check('filter by city', JSON.stringify(await names('city=NASHIK')) === JSON.stringify([ANAND_ID, OLD_ID].sort()));
  check('filter by state and country together', JSON.stringify(await names('state=goa&country=Nepal')) === JSON.stringify([ANAND_ID, OLD_ID].sort()));
  check('filter by mother tongue', JSON.stringify(await names('tongue=Hindi')) === JSON.stringify([OLD_ID]));
  check('filter by group: one person can be in several', JSON.stringify(await names('group=27145000000992002')) === JSON.stringify([ANAND_ID, OLD_ID].sort()) && JSON.stringify(await names('group=27145000000992001')) === JSON.stringify([ANAND_ID]));
  check('filter by an event they came to (present, not just booked)', JSON.stringify(await names('event=27145000000990001')) === JSON.stringify([ANAND_ID]));
  check('every filter must match', (await names('group=27145000000992001&tongue=Hindi')).length === 0);
  check('one filter can take several values (Marathi or Hindi)', JSON.stringify(await names('tongue=Marathi&tongue=hindi')) === JSON.stringify([ANAND_ID, OLD_ID].sort()));
  check('...and several groups means any of them', JSON.stringify(await names('group=27145000000992001&group=27145000000992002&tongue=Hindi')) === JSON.stringify([OLD_ID]));
  check('the filter choices need a sign-in (401)', (await call('GET', '/member-register/filters')).status === 401);

  const ex = await call('GET', '/member-register/export?status=&group=27145000000992002', null, BT);
  const lines = ex.text.replace(/^﻿/, '').trim().split(/\r\n/);
  check('Export CSV gives the members shown, one line each, with a header', ex.status === 200 && /text\/csv/.test(ex.type || '') && lines.length === 3 && /^Member ID,Full name,/.test(lines[0]), `${ex.status} ${lines.length}`);
  check('...with every detail: mobile, email, address, mother tongue, groups and events attended', /Mobile/.test(lines[0]) && /Mother tongue/.test(lines[0]) && /Groups/.test(lines[0]) && /Events attended/.test(lines[0]) && lines.some((l) => /Marathi; WOW/.test(l) && /Attendance check/.test(l)));
  check('...one line per member, however many groups they are in', lines.filter((l) => l.includes(ANAND_ID)).length === 1 && /Registration date/.test(lines[0]));
  check('...a value a spreadsheet would run as a formula is made harmless', ex.text.includes(`"'=HYPERLINK(""http://x"")"`) && !/,=HYPERLINK/.test(ex.text));
  check('...the export is in the audit log', (await call('GET', '/data/AUD?limit=5', null, BT)).body?.rows?.some((a) => a.action === 'Exported the member register (CSV)'));
  check('finance may see the register but not export it (403)', (await call('GET', '/member-register/export', null, FT)).status === 403);
  check('...nor without a sign-in (401)', (await call('GET', '/member-register/export')).status === 401);
}

/* ================================================================== */
section('Reading less, and seeing what was spent');

{
  const first = await call('POST', '/refresh', null, BT);
  const second = await call('POST', '/refresh', null, BT);
  check('Refresh clears what was read, so the next screen asks again', first.status === 200 || first.status === 429, `${first.status}`);
  check('...but not more than once every ten seconds', second.status === 429 && /seconds/.test(second.body?.error || ''), `${second.status} ${second.text.slice(0, 80)}`);
  check('it needs a sign-in', (await call('POST', '/refresh')).status === 401);
  const health = await call('GET', '/health');
  check('health says what this process has spent of the free allowance, for nothing', health.status === 200 && typeof health.body?.catalystSpent?.fetches === 'number' && 'updates' in health.body.catalystSpent, health.text.slice(0, 200));
}

/* ================================================================== */
section('Pictures dragged in from the computer, and the two form changes');

const rawUpload = async (bytes, tok, type = 'image/png') => {
  const r = await fetch(BASE + '/uploads/picture', { method: 'POST', headers: { 'content-type': type, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: bytes });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-body-for-the-test')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake-jpeg-body-for-the-test')]);

const up = await rawUpload(PNG, ET);
check('a picture dropped by the content editor is stored and answers with its link',
  up.status === 201 && /^http:[/][/]127[.]0[.]0[.]1:\d+[/]pictures[/]\d{4}[/][0-9a-f-]{36}[.]png$/.test(up.body?.url || ''), JSON.stringify(up.body));
if (up.body?.url) {
  const back = Buffer.from(await (await fetch(up.body.url)).arrayBuffer());
  check('...and that link serves the same bytes back', back.equals(PNG));
}
const upJpg = await rawUpload(JPG, ET, 'image/jpeg');
check('a JPEG is accepted too, under a different name', upJpg.status === 201 && /[.]jpg$/.test(upJpg.body?.url || '') && upJpg.body.url !== up.body?.url);
check('what counts is the file itself, not what the browser calls it', (await rawUpload(JPG, ET, 'text/plain')).status === 201);
check('a file that is not a picture is refused (400)', (await rawUpload(Buffer.from('<script>alert(1)</script> not a picture at all'), ET, 'image/png')).status === 400);
check('an empty drop is refused (400)', (await rawUpload(Buffer.alloc(0), ET)).status === 400);
check('a picture over 5 MB is refused (413)', (await rawUpload(Buffer.concat([JPG, Buffer.alloc(5 * 1048576)]), ET, 'image/jpeg')).status === 413);
check('uploading needs the permission to write content (403)', (await rawUpload(PNG, FT)).status === 403);
check('...and a sign-in (401)', (await rawUpload(PNG, '')).status === 401);
const upAud = await call('GET', '/data/AUD?limit=200', null, BT);
check('an upload is in the audit log', (upAud.body?.rows || []).some((x) => /Uploaded a picture/.test(x.action || '')));

const ctypes = (await call('GET', '/content/types', null, ET)).body?.types || [];
const prayersDef = ctypes.find((t) => t.id === 'prayers');
const confessDef = ctypes.find((t) => t.id === 'confessions');
check('Daily Prayers no longer asks about obituary notices', prayersDef && !prayersDef.fields.some((f) => f.key === 'showOnObituary'));
check('Confessions no longer has a separate Prayer box', confessDef && !confessDef.fields.some((f) => f.key === 'prayer'));
check('...but each still has its message, embeds and picture', ['content', 'embed01', 'image'].every((k) => prayersDef.fields.some((f) => f.key === k) && confessDef.fields.some((f) => f.key === k)));
check('the console says which kinds the Noah app reads today (16 Nov 2026: all of Content)', ['manna', 'prayers', 'confessions', 'dictionary', 'bibleCommentary', 'banners', 'announcements'].every((id) => ctypes.find((x) => x.id === id)?.inApp === true));
check('every picture field offers the drop box', ctypes.every((t) => t.fields.filter((f) => f.key === 'image').every((f) => f.picture === true)));

if (up.body?.url) {
  await fakeReady('dailyPrayers');
  const withPic = await call('POST', '/content/prayers', { title: 'With a dropped picture', content: '<p>Lord, hear us.</p>', publishedDate: '2026-10-09', contentLanguage: '1', image: up.body.url }, ET);
  check('a prayer saves with the uploaded picture link in its picture field', withPic.status === 201, `${withPic.status} ${JSON.stringify(withPic.body)?.slice(0, 200)}`);
}

section('Bible commentary: a book, then one of its chapters');

await fakeReady('bibleCommentary');
const CM = { title: 'A commentary', content: '<p>Notes on the chapter.</p>', contentLanguage: '1' };
const tooHigh = await call('POST', '/content/bibleCommentary', { ...CM, bibleBookId: '2', startChapter: '41' }, ET);
check('Exodus has 40 chapters, so 41 is refused and says why', tooHigh.status === 400 && /Exodus has 40 chapters/.test(tooHigh.body?.errors?.startChapter || ''), tooHigh.text.slice(0, 160));
check('...and Jude has one', (await call('POST', '/content/bibleCommentary', { ...CM, bibleBookId: '65', startChapter: '2' }, ET)).status === 400);
check('...a chapter and a book are both needed', (await call('POST', '/content/bibleCommentary', { ...CM }, ET)).body?.errors?.startChapter !== undefined);
check('...and the book must be one of the 66', (await call('POST', '/content/bibleCommentary', { ...CM, bibleBookId: '67', startChapter: '1' }, ET)).status === 400);
const okCm = await call('POST', '/content/bibleCommentary', { ...CM, bibleBookId: '2', startChapter: '40' }, ET);
check('chapter 40 of Exodus is accepted', okCm.status === 201, okCm.text.slice(0, 160));
const cmRows = (await call('GET', '/content/bibleCommentary', null, ET)).body?.rows || [];
check('...stored as the book number and chapter, with the last chapter equal to the first', cmRows.some((r) => String(r.bibleBookId) === '2' && String(r.startChapter) === '40'));
check('the form is told how many chapters each book has', (await call('GET', '/content/types', null, ET)).body?.chapters?.[1] === 40);

section('Telling the member about a decision (ADMIN_INTEGRATION.md)');

if (!NO_KEY) {
  /* The registration approved earlier in this run was decided THROUGH the API, which told the member then. */
  const toldAlready = await call('POST', `/registrations/${a.id}/notify`, {}, BT);
  check('asking again for a member already told says so, and is fine', toldAlready.status === 200 && /already been told/i.test(toldAlready.body?.message || '') && toldAlready.body?.delivered === true, `${toldAlready.status} ${toldAlready.text.slice(0, 160)}`);

  /* One decided without the API (the fixture's own approved registration): nobody was told yet. */
  const first = await call('POST', `/registrations/${APPROVED_REG}/notify`, {}, BT);
  check('a decision stored without the API can be told to the member', first.status === 200 && /1 phone/.test(first.body?.message || '') && first.body?.delivered === true, `${first.status} ${first.text.slice(0, 160)}`);
  const second = await call('POST', `/registrations/${APPROVED_REG}/notify`, {}, BT);
  check('...once: the second ask says they were already told', /already been told/i.test(second.body?.message || ''), second.text.slice(0, 160));

  const pending = await submit('Notify');
  const early = await call('POST', `/registrations/${pending.id}/notify`, {}, BT);
  check('there is nothing to tell about a registration not yet decided (409)', early.status === 409, `${early.status} ${early.text.slice(0, 120)}`);

  check('the decision replies say what reached the member', typeof ok.body?.notifiedText === 'string' && ok.body.notifiedText.length > 0, JSON.stringify(ok.body));
}
check('telling a member needs the permission to edit members',
  (await call('POST', `/registrations/${APPROVED_REG}/notify`, {}, verifier.token)).status === 403);
check('...and a sign-in', (await call('POST', `/registrations/${APPROVED_REG}/notify`, {})).status === 401);
const audited = await call('GET', '/data/AUD?limit=200', null, BT);
if (!NO_KEY) check('telling the member is in the audit log', (audited.body?.rows || []).some((x) => /Told the member/.test(x.action || x.act || '')), JSON.stringify((audited.body?.rows || []).slice(0, 2)).slice(0, 200));

section('Asking for console access, and a super administrator deciding');

const askAccess = (mobile, note) => call('POST', '/auth/request-access', { mobile, note });
const reqs = async () => (await call('GET', '/staff/requests', null, BT)).body?.rows || [];

const sentOk = await askAccess(a.mobile, 'I run the Sunday desk');
check('a member who is not staff can ask from the sign-in page, with no sign-in', sentOk.status === 200 && sentOk.body?.ok === true, JSON.stringify(sentOk.body));
const asked = (await reqs()).find((r) => r.note === 'I run the Sunday desk');
check('...and a super administrator sees the request, with the note', !!asked && /Approve/.test('Approve') && asked.name.length > 0, JSON.stringify(await reqs()));
const strangerReq = await askAccess('+91 91234 56780', 'x');
const staffAlready = await askAccess('+91 9000000779', 'I already have access');
check('the answer is the same for a number nobody has, so nobody can find out who is a member',
  strangerReq.status === 200 && strangerReq.body.message === sentOk.body.message, JSON.stringify(strangerReq.body));
check('...and the same for someone who is already staff (no duplicate request)', staffAlready.body?.message === sentOk.body.message
  && (await reqs()).filter((r) => r.mobile.includes('9779') || r.name === 'Anand Rao').length === 0);
check('asking again does not add a second line for the same person', (await askAccess(a.mobile, 'I run the Sunday desk')).status === 200 && (await reqs()).filter((r) => r.note === 'I run the Sunday desk').length === 1);
check('a request with no number is refused (400)', (await askAccess('', 'x')).status === 400);
check('the queue shows the open request', ((await call('GET', '/queues', null, BT)).body?.rows || (await call('GET', '/queues', null, BT)).body || []).some?.((x) => x.id === 'access' && x.count >= 1), '');

check('too many asks for one number are refused (429)', (await askAccess(a.mobile, 'again')).status === 200 && (await askAccess(a.mobile, 'again')).status === 429);
check('...and too many from one place are refused as well (429)', (await askAccess('+91 91234 56781', 'x')).status === 429);

check('only a super administrator may see the requests (403)', (await call('GET', '/staff/requests', null, membership.token)).status === 403);
check('...nor decide them (403)', (await call('POST', `/staff/requests/${asked.memberRowId}/approve`, { role: 'content' }, membership.token)).status === 403);
check('approving needs a real role (400)', (await call('POST', `/staff/requests/${asked.memberRowId}/approve`, { role: 'nonsense' }, BT)).status === 400);
check('approving someone who never asked is a 404', (await call('POST', `/staff/requests/${ANAND_ID}/approve`, { role: 'content' }, BT)).status === 404);

const beforeOk = await signIn(a.mobile);
check('beforeOk approval they cannot sign in', !beforeOk.token, JSON.stringify(beforeOk.verify?.body || beforeOk.ask?.body).slice(0, 140));
const approveReq = await call('POST', `/staff/requests/${asked.memberRowId}/approve`, { role: 'content' }, BT);
check('one click approves it with the chosen role', approveReq.status === 201 && approveReq.body?.role === 'content', approveReq.text.slice(0, 160));
check('...and it leaves the list', !(await reqs()).some((r) => r.memberRowId === asked.memberRowId));
const afterOk = await signIn(a.mobile);
check('...and they sign in with their own number, as that role', afterOk.verify?.status === 200 && afterOk.user?.role === 'content', JSON.stringify(afterOk.verify?.body)?.slice(0, 140));
check('a second approval is a 404 (already decided)', (await call('POST', `/staff/requests/${asked.memberRowId}/approve`, { role: 'content' }, BT)).status === 404);

/* declining: a different approved member */
const dn = await submit('Declinee');
await call('POST', `/registrations/${dn.id}/approve`, {}, token);
const dnReq = await call('POST', '/auth/request-access', { mobile: dn.mobile, note: 'please' });
const dnRow = (await reqs()).find((r) => r.note === 'please');
check('another request arrives', dnReq.status === 429 ? true : !!dnRow, `${dnReq.status}`);
if (dnRow) {
  const no = await call('POST', `/staff/requests/${dnRow.memberRowId}/decline`, {}, BT);
  check('a request can be declined', no.status === 200, no.text.slice(0, 120));
  check('...it leaves the list, and they still cannot sign in', !(await reqs()).some((r) => r.memberRowId === dnRow.memberRowId) && !(await signIn(dn.mobile)).token);
}
const reqAud = await call('GET', '/data/AUD?limit=200', null, BT);
check('approving is in the audit log', (reqAud.body?.rows || []).some((x) => /Approved an access request/.test(x.action || '')));

section('Family: one row, both sides see each other');

const OFFICE_ID = '27145000000126932', BLANK_ID = '27145000000146028';
const famOf = async (id) => (await call('GET', '/people/' + id, null, BT)).body?.family?.rows || [];
const found = await call('GET', '/people/' + ANAND_ID + '/relation-candidates?q=Thom', null, BT);
check('members are searched by name, showing name and place only', found.status === 200 && found.body.rows.some((c) => c.name === 'Fr Thomas') && found.body.rows.every((c) => !('mobile' in c)), JSON.stringify(found.body));
check('a search needs two letters', (await call('GET', '/people/' + ANAND_ID + '/relation-candidates?q=T', null, BT)).body?.rows?.length === 0);
const THOMAS_ID = found.body.rows.find((c) => c.name === 'Fr Thomas').rowId;

const addParent = await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 4 }, BT);
check('Fr Thomas is added as the father of Anand', addParent.status === 201, addParent.text.slice(0, 160));
check('...Anand sees him as Father', (await famOf(ANAND_ID)).some((r) => r.rowId === THOMAS_ID && r.rel === 'Father'));
check('...and Fr Thomas sees Anand as Son (Anand is male), with nothing added on his side', (await famOf(THOMAS_ID)).some((r) => r.rowId === ANAND_ID && r.rel === 'Son'));
check('the same two people cannot be related twice (400)', (await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 7 }, BT)).status === 400);
check('...nor from the other side', (await call('POST', '/people/' + THOMAS_ID + '/relations', { otherRowId: ANAND_ID, relation: 2 }, BT)).status === 400);
const changed = await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 12, change: true }, BT);
check('someone already in the family can have the relation changed', changed.status === 201, changed.text.slice(0, 160));
check('...both sides show the new relation, and there is still one row (Uncle / Nephew)', (await famOf(ANAND_ID)).filter((r) => r.rowId === THOMAS_ID).map((r) => r.rel).join() === 'Uncle' && (await famOf(THOMAS_ID)).filter((r) => r.rowId === ANAND_ID).map((r) => r.rel).join() === 'Nephew');
const gone = await call('DELETE', '/people/' + ANAND_ID + '/relations/' + THOMAS_ID, null, BT);
check('a relation can be removed, and it goes from both sides', gone.status === 200 && !(await famOf(ANAND_ID)).some((r) => r.rowId === THOMAS_ID) && !(await famOf(THOMAS_ID)).some((r) => r.rowId === ANAND_ID));
check('removing what is not there is a 404', (await call('DELETE', '/people/' + ANAND_ID + '/relations/' + THOMAS_ID, null, BT)).status === 404);

const bro = await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: BLANK_ID, relation: 6 }, BT);
check('a brother can be added', bro.status === 201, bro.text.slice(0, 160));
check('...Anand (a man) sees him as Brother', (await famOf(ANAND_ID)).some((r) => r.rowId === BLANK_ID && r.rel === 'Brother'));
check('...and the other man sees Anand as Brother too, because Anand is male', (await famOf(BLANK_ID)).some((r) => r.rowId === ANAND_ID && r.rel === 'Brother'));
check('someone with no gender set cannot be given a brother or sister (400, says why)', await (async () => { const r = await call('POST', '/people/' + BLANK_ID + '/relations', { otherRowId: THOMAS_ID, relation: 7 }, BT); return r.status === 400 && /gender/i.test(r.body?.error || ''); })());
const uncle = await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 12 }, BT);
check('an uncle can be added', uncle.status === 201, uncle.text.slice(0, 160));
check('...Anand sees him as Uncle, and he sees Anand as Nephew (Anand is a man), automatically', (await famOf(ANAND_ID)).some((r) => r.rowId === THOMAS_ID && r.rel === 'Uncle') && (await famOf(THOMAS_ID)).some((r) => r.rowId === ANAND_ID && r.rel === 'Nephew'));
check('the form offers uncle and aunt, with the console-only ones marked', (await call('GET', '/people/' + ANAND_ID, null, BT)).body?.relationOptions?.filter((o) => o.extra).map((o) => o.label).join() === 'Uncle / Aunt,Nephew / Niece');
await call('DELETE', '/people/' + ANAND_ID + '/relations/' + THOMAS_ID, null, BT);
check('a person cannot be related to themselves (400)', (await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: ANAND_ID, relation: 7 }, BT)).status === 400);
check('a relation that is not on offer is refused (400)', (await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 99 }, BT)).status === 400);
check('the form is told which relations exist', (await call('GET', '/people/' + ANAND_ID, null, BT)).body?.relationOptions?.some((o) => o.code === 1 && /Spouse/.test(o.label)));
check('adding a relation needs the permission to edit members (403)', (await call('POST', '/people/' + ANAND_ID + '/relations', { otherRowId: THOMAS_ID, relation: 1 }, verifier.token)).status === 403);
const famAud = await call('GET', '/data/AUD?limit=200', null, BT);
check('adding and removing are in the audit log', ['Added a family relation', 'Removed a family relation'].every((a) => (famAud.body?.rows || []).some((x) => x.action === a)));

section('Family requests from the app (Me > Family)');

const BOSS_ID = '27145000000151002';
const FR = { kid: '100596000000071001', brother: '100596000000071002', sister: '100596000000071003', mother: '100596000000071006', done: '100596000000071004' };
const queueCount = async (id) => {
  const b = (await call('GET', '/queues', null, BT)).body;
  return (b?.rows || b || []).find((x) => x.id === id)?.count;
};

if (NO_KEY) {
  const noKey = await call('GET', '/family-requests', null, BT);
  check('without the admin key the inbox says so instead of an empty list', noKey.status === 200 && noKey.body?.needsAdminKey === true && noKey.body?.rows?.length === 0, noKey.text.slice(0, 120));
  const noKeyDecide = await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Approved' }, BT);
  check('...and a decision is refused, because nobody would be told', noKeyDecide.status === 409 && noKeyDecide.body?.needsAdminKey === true, noKeyDecide.text.slice(0, 120));
} else {
  const inbox = await call('GET', '/family-requests', null, BT);
  const rows = inbox.body?.rows || [];
  check('the inbox lists the requests waiting, oldest first', inbox.status === 200 && rows.length === 4
    && rows.every((r, i) => !i || +new Date(rows[i - 1].at) <= +new Date(r.at)), `${inbox.status} ${inbox.text.slice(0, 200)}`);
  const kidRow = rows.find((r) => r.id === FR.kid);
  check('a child under 18 is marked as one, with an age worked out from the date of birth',
    kidRow?.kid === true && kidRow.relationLabel === 'Daughter' && Number.isInteger(kidRow.age) && kidRow.age >= 0 && kidRow.age < 18, JSON.stringify(kidRow));
  const broRow = rows.find((r) => r.id === FR.brother);
  check('a grown-up shows the member their number belongs to', broRow?.kid === false && broRow.existingMemberName === 'Fr Thomas' && broRow.relationLabel === 'Brother', JSON.stringify(broRow));
  check('...and one who has not joined yet shows none', rows.find((r) => r.id === FR.sister)?.existingMemberName === null);
  check('who asked is named, with the number masked', broRow?.requesterName === 'Anand Rao' && /•/.test(broRow.requesterMobile) && !/9000000779/.test(inbox.text), broRow?.requesterMobile);
  check('the number they typed is masked too', /•/.test(broRow?.mobile || '') && !/9000000100/.test(inbox.text), broRow?.mobile);

  const approvedList = await call('GET', '/family-requests?state=Approved', null, BT);
  /* The Make member request approved in the Children section is approved too. */
  check('the Approved list holds only what was approved', approvedList.body?.rows?.length >= 1 && approvedList.body.rows.every((r) => r.state === 'Approved') && approvedList.body.rows.some((r) => r.id === FR.done), approvedList.text.slice(0, 160));
  const cancelledList = await call('GET', '/family-requests?state=Cancelled', null, BT);
  check('a request the member withdrew is in Cancelled', cancelledList.body?.rows?.length === 1 && cancelledList.body.rows[0].state === 'Cancelled');
  check('a status that does not exist falls back to Waiting', (await call('GET', '/family-requests?state=Nonsense', null, BT)).body?.rows?.length === 4);

  check('listing needs the permission to edit members (403)', (await call('GET', '/family-requests', null, verifier.token)).status === 403);
  check('deciding needs it too (403)', (await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Approved' }, verifier.token)).status === 403);
  check('nothing is listed without signing in (401)', (await call('GET', '/family-requests')).status === 401);

  check('a decision that is not Approved or Rejected is refused (400)', (await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Maybe' }, BT)).status === 400);
  const noWhy = await call('POST', `/family-requests/${FR.mother}/decide`, { decision: 'Rejected' }, BT);
  check('a rejection needs a reason, because the member reads it (400)', noWhy.status === 400 && /why/i.test(noWhy.body?.error || ''), noWhy.text.slice(0, 120));
  check('a request that is not waiting cannot be decided again (409)', (await call('POST', `/family-requests/${FR.done}/decide`, { decision: 'Approved' }, BT)).status === 409);
  check('...nor one that does not exist (409)', (await call('POST', '/family-requests/1/decide', { decision: 'Approved' }, BT)).status === 409);
  check('a child has no account to pick (400)', (await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Approved', memberId: OLD_ID }, BT)).status === 400);
  check('the member who asked cannot be picked as their own relative (400)', (await call('POST', `/family-requests/${FR.brother}/decide`, { decision: 'Approved', memberId: ANAND_ID }, BT)).status === 400);
  check('a member who is not on the register cannot be picked (400)', (await call('POST', `/family-requests/${FR.brother}/decide`, { decision: 'Approved', memberId: '999' }, BT)).status === 400);
  check('a member can only be picked when approving (400)', (await call('POST', `/family-requests/${FR.mother}/decide`, { decision: 'Rejected', remark: 'No', memberId: OLD_ID }, BT)).status === 400);
  check('none of those refusals decided anything', (await call('GET', '/family-requests', null, BT)).body?.rows?.length === 4);

  /* Only the child request: grown-up relatives are added by the office itself now, so they are not counted as work. */
  check('the work queue counts the child request only', await queueCount('family') === 1, String(await queueCount('family')));

  /* A child under 18: the child is added and linked to the member. */
  const okKid = await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Approved' }, BT);
  check('a child under 18 can be approved', okKid.status === 200 && okKid.body?.ok === true && okKid.body?.result?.notified?.pushed === 2, okKid.text.slice(0, 200));
  check('...and appears in the member family as a Daughter, with no account behind it',
    (await famOf(ANAND_ID)).some((r) => /Hannah/.test(r.name || '') && r.rel === 'Daughter'), JSON.stringify((await famOf(ANAND_ID)).map((r) => [r.name, r.rel])));

  /* A grown-up who is already a member: both accounts show each other. */
  const okBro = await call('POST', `/family-requests/${FR.brother}/decide`, { decision: 'Approved' }, BT);
  check('a grown-up who is a member can be approved', okBro.status === 200, okBro.text.slice(0, 200));
  check('...the member sees him as Brother', (await famOf(ANAND_ID)).some((r) => r.rowId === THOMAS_ID && r.rel === 'Brother'));
  check('...and he sees the member as Brother, so both accounts show each other', (await famOf(THOMAS_ID)).some((r) => r.rowId === ANAND_ID && r.rel === 'Brother'));

  /* The number was not theirs: the office picks the right member. */
  const okPick = await call('POST', `/family-requests/${FR.sister}/decide`, { decision: 'Approved', memberId: OLD_ID }, BT);
  check('the office can link a member they picked when the typed number was wrong', okPick.status === 200, okPick.text.slice(0, 200));
  check('...the picked member is the one linked', (await famOf(BOSS_ID)).some((r) => r.rowId === OLD_ID && r.rel === 'Sister'), JSON.stringify((await famOf(BOSS_ID)).map((r) => [r.rowId, r.rel])));

  /* Rejecting. */
  const rej = await call('POST', `/family-requests/${FR.mother}/decide`, { decision: 'Rejected', remark: 'We could not find a member with that number.' }, BT);
  check('a request can be rejected with a reason', rej.status === 200 && rej.body?.request?.state === 'Rejected', rej.text.slice(0, 200));
  const rejList = await call('GET', '/family-requests?state=Rejected', null, BT);
  check('...which the member can read back, and the list shows', /could not find/.test(rejList.body?.rows?.find((r) => r.id === FR.mother)?.remark || ''), rejList.text.slice(0, 200));
  check('...nothing was linked by a rejection', !(await famOf(OLD_ID)).some((r) => /Grace/.test(r.name || '')));

  check('deciding twice is refused (409, not_pending)', await (async () => { const r = await call('POST', `/family-requests/${FR.kid}/decide`, { decision: 'Rejected', remark: 'x' }, BT); return r.status === 409 && r.body?.code === 'not_pending'; })());
  check('nothing is waiting any more', (await call('GET', '/family-requests', null, BT)).body?.rows?.length === 0);
  check('...and the work queue says so', await queueCount('family') === 0, String(await queueCount('family')));

  const famDecided = await call('GET', '/data/AUD?limit=300', null, BT);
  check('approving and rejecting are in the audit log, with the reason',
    (famDecided.body?.rows || []).some((x) => x.action === 'Approved a family request')
    && (famDecided.body?.rows || []).some((x) => x.action === 'Rejected a family request' && /could not find/.test(x.remark || '')));
}

section('Noahgram moderation (posts, reels and comments)');

/* The fixtures in dev-offline.mjs: two waiting (a picture 52 h old, a reel 5 h old), two live (a member's, and one the office wrote
   with a plain link), one the office already took down, and comments under the live member post. */
const G = {
  pic: '27145000000181001', reel: '27145000000181002', live: '27145000000181003', office: '27145000000181004', gone: '27145000000181005',
  cMember: '27145000000183001', cReply: '27145000000183002', cGone: '27145000000183003',
};
/* Who the fake Noah API told: it keeps the list, because telling the author is the whole point of deciding through it. */
const told = async () => (await (await fetch(`http://127.0.0.1:${process.env.NOAH_PORT || '4301'}/_fake/noahgram-told`)).json()).told;

if (NO_KEY) {
  const noKeyGram = await call('GET', '/noahgram/posts?state=pending', null, BT);
  check('without the admin key the waiting list says so instead of looking empty', noKeyGram.status === 200 && noKeyGram.body?.needsAdminKey === true && noKeyGram.body?.rows?.length === 0, noKeyGram.text.slice(0, 120));
  const noKeyDo = await call('POST', `/noahgram/posts/${G.pic}/decide`, { decision: 'approve' }, BT);
  check('...and a decision is refused, because the author would not be told', noKeyDo.status === 409 && noKeyDo.body?.needsAdminKey === true, noKeyDo.text.slice(0, 120));
} else {
  const waitingGram = await call('GET', '/noahgram/posts?state=pending', null, BT);
  const wrows = waitingGram.body?.rows || [];
  check('the waiting list shows both posts, the one waiting longest first', waitingGram.status === 200 && wrows.length === 2 && wrows[0].id === G.pic && wrows[1].id === G.reel, `${waitingGram.status} ${waitingGram.text.slice(0, 200)}`);
  check('a member is shown by their own name, with no title', wrows[0]?.author?.name === 'Anand Rao' && wrows[1]?.author?.name === 'Old Member', JSON.stringify(wrows.map((p) => p.author)));
  check('a reel is marked as one, a picture is not', wrows[1]?.reel === true && wrows[0]?.reel === false);
  check('how long each has waited is real (52 h and 5 h)', Math.abs(Date.now() - +new Date(wrows[0]?.at) - 52 * 3600e3) < 120_000 && Math.abs(Date.now() - +new Date(wrows[1]?.at) - 5 * 3600e3) < 120_000, JSON.stringify(wrows.map((p) => p.at)));
  check('the picture is served by this console, not from a public address', wrows[0]?.media?.src?.url === `/noahgram/posts/${G.pic}/media/main` && wrows[0].media.src.external === false);
  check('a reel also carries its still picture', wrows[1]?.media?.still?.url === `/noahgram/posts/${G.reel}/media/still`);
  check('the work queue counts what is waiting', await queueCount('mod') === 2, String(await queueCount('mod')));
  const dashGram = await call('GET', '/dashboard', null, BT);
  check('the dashboard has a Noahgram card', (dashGram.body?.cards || []).some((c) => c.id === 'noahgram' && c.value === 2), dashGram.text.slice(0, 200));

  const pic = await call('GET', `/noahgram/posts/${G.pic}/media/main`, null, BT);
  check('a waiting picture can be looked at before deciding', pic.status === 200 && pic.text.slice(1, 4) === 'PNG' && /image[/]png/.test(pic.type), `${pic.status} ${pic.text.slice(0, 20)} ${pic.type}`);
  const reelFile = await call('GET', `/noahgram/posts/${G.reel}/media/main`, null, BT);
  check('a waiting reel plays as a video', reelFile.status === 200 && reelFile.text === 'FAKE-reel-BYTES' && /video[/]mp4/.test(reelFile.type), `${reelFile.status} ${reelFile.type}`);
  const still = await call('GET', `/noahgram/posts/${G.reel}/media/still`, null, BT);
  check('...and its still picture is there', still.status === 200 && /image[/]png/.test(still.type), `${still.status} ${still.type}`);
  check('a picture has no still (404)', (await call('GET', `/noahgram/posts/${G.pic}/media/still`, null, BT)).status === 404);
  check('a post that does not exist has no picture (404)', (await call('GET', '/noahgram/posts/27145000000999999/media/main', null, BT)).status === 404);
  check('an id that is not a number is refused before anything is read (404)', (await call('GET', '/noahgram/posts/abc/media/main', null, BT)).status === 404);
  check('only main or still can be asked for (400)', (await call('GET', `/noahgram/posts/${G.pic}/media/passport`, null, BT)).status === 400);
  const external = await fetch(BASE + `/noahgram/posts/${G.office}/media/main`, { headers: { authorization: 'Bearer ' + BT }, redirect: 'manual' });
  check('a post the office wrote with a plain link goes to that link', external.status === 302 && external.headers.get('location') === 'https://example.com/carols.jpg', `${external.status} ${external.headers.get('location')}`);

  check('the waiting list needs permission to moderate (403)', (await call('GET', '/noahgram/posts?state=pending', null, verifier.token)).status === 403);
  check('deciding needs it too (403)', (await call('POST', `/noahgram/posts/${G.pic}/decide`, { decision: 'approve' }, verifier.token)).status === 403);
  check('so does looking at a file (403)', (await call('GET', `/noahgram/posts/${G.pic}/media/main`, null, verifier.token)).status === 403);
  check('...and the comments (403)', (await call('GET', `/noahgram/posts/${G.live}/comments`, null, verifier.token)).status === 403);
  check('...and moderating one (403)', (await call('POST', `/noahgram/comments/${G.cMember}/moderate`, { action: 'remove' }, verifier.token)).status === 403);
  check('nothing is listed without signing in (401)', (await call('GET', '/noahgram/posts?state=pending')).status === 401);

  const liveGram = await call('GET', '/noahgram/posts?state=live', null, BT);
  const lrows = liveGram.body?.rows || [];
  check('the live list holds what members can see now, newest first', liveGram.status === 200 && lrows.map((p) => p.id).join() === [G.live, G.office].join(), `${liveGram.status} ${lrows.map((p) => p.id)}`);
  check('...with its counts', lrows[0]?.likes === 3 && lrows[0]?.comments === 2 && lrows[0]?.views === 40, JSON.stringify(lrows[0]));
  check('...a post the office wrote has no member, so it says the office', lrows[1]?.author?.name === 'The office' && lrows[1]?.media?.src?.external === true);
  check('...nothing waiting and nothing already taken down is in it', !lrows.some((p) => [G.pic, G.reel, G.gone].includes(p.id)));

  check('a decision that is not approve or reject is refused (400)', (await call('POST', `/noahgram/posts/${G.pic}/decide`, { decision: 'maybe' }, BT)).status === 400);
  const noWhyGram = await call('POST', `/noahgram/posts/${G.reel}/decide`, { decision: 'reject' }, BT);
  check('turning one down needs a reason (400)', noWhyGram.status === 400 && /why/i.test(noWhyGram.body?.error || ''), noWhyGram.text.slice(0, 120));
  const noSuch = await call('POST', '/noahgram/posts/27145000000999999/decide', { decision: 'approve' }, BT);
  check('a post that does not exist is refused, with the code (404)', noSuch.status === 404 && noSuch.body?.code === 'post_not_found', noSuch.text.slice(0, 120));
  check('none of those decided anything', (await call('GET', '/noahgram/posts?state=pending', null, BT)).body?.rows?.length === 2);

  const okPic = await call('POST', `/noahgram/posts/${G.pic}/decide`, { decision: 'approve' }, BT);
  check('a picture can be approved', okPic.status === 200 && okPic.body?.ok === true && okPic.body?.result?.approved === true && okPic.body?.result?.notified?.pushed === 1, okPic.text.slice(0, 200));
  check('...and the author was told it is live (by the API, not by writing the table)', (await told()).some((t) => t.post === G.pic && t.type === 'noahgram_post_approved'));
  check('...it is no longer waiting', (await call('GET', '/noahgram/posts?state=pending', null, BT)).body?.rows?.map((p) => p.id).join() === G.reel);
  check('...it is on the live list', (await call('GET', '/noahgram/posts?state=live', null, BT)).body?.rows?.some((p) => p.id === G.pic));
  check('...and the work queue dropped to 1', await queueCount('mod') === 1, String(await queueCount('mod')));
  const again = await call('POST', `/noahgram/posts/${G.pic}/decide`, { decision: 'approve' }, BT);
  check('approving twice is refused (409, not_pending)', again.status === 409 && again.body?.code === 'not_pending', again.text.slice(0, 120));

  const rejGram = await call('POST', `/noahgram/posts/${G.reel}/decide`, { decision: 'reject', note: 'It advertises something for sale.' }, BT);
  check('a reel can be turned down with a reason', rejGram.status === 200 && rejGram.body?.result?.archived === true, rejGram.text.slice(0, 200));
  check('...the author was told, and the reason went with it', (await told()).some((t) => t.post === G.reel && t.type === 'noahgram_post_rejected' && /for sale/.test(t.note)));
  check('...it is archived, never live, and nothing is waiting', (await call('GET', '/noahgram/posts?state=pending', null, BT)).body?.rows?.length === 0
    && !(await call('GET', '/noahgram/posts?state=live', null, BT)).body?.rows?.some((p) => p.id === G.reel));
  check('...and the work queue says so', await queueCount('mod') === 0, String(await queueCount('mod')));

  const down = await call('POST', `/noahgram/posts/${G.office}/decide`, { decision: 'reject', note: 'Event is over.' }, BT);
  check('a post that is already live can be taken down', down.status === 200 && down.body?.result?.archived === true, down.text.slice(0, 200));
  check('...and it leaves the live list', !(await call('GET', '/noahgram/posts?state=live', null, BT)).body?.rows?.some((p) => p.id === G.office));
  check('one already taken down cannot be decided again (409)', (await call('POST', `/noahgram/posts/${G.gone}/decide`, { decision: 'reject', note: 'x' }, BT)).status === 409);

  const gramAud = await call('GET', '/data/AUD?limit=300', null, BT);
  check('approving and taking down are in the audit log, with the reason',
    (gramAud.body?.rows || []).some((x) => x.action === 'Approved a Noahgram post')
    && (gramAud.body?.rows || []).some((x) => x.action === 'Took down a Noahgram post' && /for sale/.test(x.remark || '')));

  /* Comments. */
  const cm = await call('GET', `/noahgram/posts/${G.live}/comments`, null, BT);
  const crows = cm.body?.rows || [];
  check('the comments under a post are listed, oldest first, a removed one left out', cm.status === 200 && crows.map((c) => c.id).join() === [G.cMember, G.cReply].join(), `${cm.status} ${cm.text.slice(0, 200)}`);
  check('...a reply says which comment it answers, and everyone is named', crows[1]?.parentId === G.cMember && crows[0]?.parentId === null && crows[0]?.author?.name === 'Old Member', JSON.stringify(crows));

  check('a comment can be hidden', (await call('POST', `/noahgram/comments/${G.cReply}/moderate`, { action: 'hide' }, BT)).status === 200);
  check('...it is still listed, marked hidden', (await call('GET', `/noahgram/posts/${G.live}/comments`, null, BT)).body?.rows?.find((c) => c.id === G.cReply)?.hidden === true);
  check('hiding it again is refused (409)', (await call('POST', `/noahgram/comments/${G.cReply}/moderate`, { action: 'hide' }, BT)).status === 409);
  check('a hidden comment can be shown again', (await call('POST', `/noahgram/comments/${G.cReply}/moderate`, { action: 'show' }, BT)).status === 200
    && (await call('GET', `/noahgram/posts/${G.live}/comments`, null, BT)).body?.rows?.find((c) => c.id === G.cReply)?.hidden === false);
  check('showing one that is not hidden is refused (409)', (await call('POST', `/noahgram/comments/${G.cReply}/moderate`, { action: 'show' }, BT)).status === 409);

  const before = (await call('GET', '/noahgram/posts?state=live', null, BT)).body?.rows?.find((p) => p.id === G.live)?.comments;
  check('a comment can be removed', (await call('POST', `/noahgram/comments/${G.cMember}/moderate`, { action: 'remove' }, BT)).status === 200);
  check('...it is gone from the list', !(await call('GET', `/noahgram/posts/${G.live}/comments`, null, BT)).body?.rows?.some((c) => c.id === G.cMember));
  check('...and the post counts one fewer (never below nothing)', (await call('GET', '/noahgram/posts?state=live', null, BT)).body?.rows?.find((p) => p.id === G.live)?.comments === before - 1, String(before));
  check('removing it again is refused (409)', (await call('POST', `/noahgram/comments/${G.cMember}/moderate`, { action: 'remove' }, BT)).status === 409);
  check('a comment that does not exist is refused (404)', (await call('POST', '/noahgram/comments/27145000000999999/moderate', { action: 'remove' }, BT)).status === 404);
  check('an action that does not exist is refused (400)', (await call('POST', `/noahgram/comments/${G.cReply}/moderate`, { action: 'delete' }, BT)).status === 400);

  const cAud = await call('GET', '/data/AUD?limit=300', null, BT);
  check('hiding, showing and removing a comment are in the audit log',
    ['Hid a Noahgram comment', 'Showed a Noahgram comment again', 'Removed a Noahgram comment'].every((a) => (cAud.body?.rows || []).some((x) => x.action === a)));
}

section('Praise reports, from the praiseReport table');
{
  const P = { waiting: '27145000000187001', plain: '27145000000187002', published: '27145000000187003', rejected: '27145000000187004' };
  const list = async (q = '') => (await call('GET', `/data/PRAISE?limit=500${q}`, null, BT)).body;
  const all = await list();
  check('the Praise screen reads the real table, not "not in the project"', !all?.notInProject && all?.rows?.length === 4, JSON.stringify(all).slice(0, 200));
  const byId = (rows, id) => rows.find((r) => r.id === id);
  check('waiting, published and rejected are read from isComplete and isArchived',
    byId(all.rows, P.waiting)?.state === 'Pending' && byId(all.rows, P.published)?.state === 'Published' && byId(all.rows, P.rejected)?.state === 'Rejected');
  const w = byId(all.rows, P.waiting);
  check('a report carries the testimony, name, phone, place, video, note and photos',
    /healed/.test(w?.text) && w.name === 'Anand Rao' && w.mobile === '+919000000779' && w.location === 'Kurla, Mumbai' && /youtu/.test(w.videoLink) && /Kurla cell/.test(w.comment) && w.photos === 2,
    JSON.stringify(w).slice(0, 300));
  check('...a photo given as a link is passed as it is; a stored file is not', w?.photoUrls?.[0] === null && w.photoUrls[1] === 'https://example.com/praise-2.jpg');
  check('the featured one says so', byId(all.rows, P.published)?.featured === true);
  check('the waiting filter shows only the two waiting', (await list('&state=Pending')).rows.length === 2);
  check('the work queue counts the two waiting', await queueCount('praise') === 2, String(await queueCount('praise')));
  check('a search finds a place', (await list('&q=kurla')).rows.length === 1);

  if (!NO_KEY) {
    const photo = await call('GET', `/praise/${P.waiting}/photo/1`, null, BT);
    check('a stored photo is shown through the console', photo.status === 200, `${photo.status}`);
  }
  check('a photo that is not there is a 404', (await call('GET', `/praise/${P.plain}/photo/1`, null, BT)).status === 404);

  check('rejecting needs a reason (400)', (await call('POST', `/decide/PRAISE/${P.plain}`, { approve: false }, BT)).status === 400);
  const rej = await call('POST', `/decide/PRAISE/${P.plain}`, { approve: false, remark: 'It names a doctor or hospital.' }, BT);
  check('a report can be rejected with a reason', rej.status === 200, rej.text.slice(0, 160));
  check('...it is archived, so it reads Rejected', byId((await list()).rows, P.plain)?.state === 'Rejected');
  const pub = await call('POST', `/decide/PRAISE/${P.waiting}`, { approve: true }, BT);
  check('a report can be published', pub.status === 200 && byId((await list()).rows, P.waiting)?.state === 'Published', pub.text.slice(0, 160));
  check('deciding it again is refused (409)', (await call('POST', `/decide/PRAISE/${P.waiting}`, { approve: true }, BT)).status === 409);
  check('...and nothing is waiting now', await queueCount('praise') === 0);

  const feat = await call('POST', `/praise/${P.waiting}/feature`, { featured: true }, BT);
  check('a published report can be featured', feat.status === 200 && byId((await list()).rows, P.waiting)?.featured === true, feat.text.slice(0, 160));
  check('...and unfeatured', (await call('POST', `/praise/${P.waiting}/feature`, { featured: false }, BT)).status === 200 && byId((await list()).rows, P.waiting)?.featured === false);
  check('a rejected report cannot be featured (409)', (await call('POST', `/praise/${P.rejected}/feature`, { featured: true }, BT)).status === 409);
  check('a role without moderation cannot decide (403)', (await call('POST', `/decide/PRAISE/${P.published}`, { approve: true }, FT)).status === 403);

  const pAud = (await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || [];
  check('publishing, rejecting (with the reason) and featuring are in the audit log',
    pAud.some((a) => a.action === 'Published praise report') && pAud.some((a) => a.action === 'Rejected praise report' && /doctor/.test(a.remark || '')) && pAud.some((a) => a.action === 'Featured praise report'));
}

section('Registration checks, member photographs, and pictures sent as JSON');

/* The three Yes / No checks on a live registration used to do nothing: the route looked in the sample data. */
const tick = await call('PATCH', `/registrations/${APPROVED_REG}/checks`, { idReadable: true }, BT);
check('a check can be ticked on a real registration', tick.status === 200 && tick.body?.checks?.idReadable === true, `${tick.status} ${tick.text.slice(0, 160)}`);
check('...and it is still ticked when the registration is opened again', (await call('GET', `/registrations/${APPROVED_REG}`, null, BT)).body?.checks?.idReadable === true);
check('...and in the list', (await call('GET', '/data/REGISTRATIONS?limit=100', null, BT)).body?.rows?.find((r) => r.id === APPROVED_REG)?.checks?.idReadable === true);
check('No is kept as no, not as not checked', (await call('PATCH', `/registrations/${APPROVED_REG}/checks`, { idReadable: false }, BT)).body?.checks?.idReadable === false);
check('a check that does not exist is refused (400)', (await call('PATCH', `/registrations/${APPROVED_REG}/checks`, { nonsense: true }, BT)).status === 400);
check('a registration that does not exist is refused (404)', (await call('PATCH', '/registrations/1/checks', { idReadable: true }, BT)).status === 404);
check('ticking needs the permission to edit members (403)', (await call('PATCH', `/registrations/${APPROVED_REG}/checks`, { idReadable: true }, verifier.token)).status === 403);

if (!NO_KEY) {
  const face = await call('GET', `/people/${ANAND_ID}/photo`, null, BT);
  check('a member photograph is served for the family screens', face.status === 200 && face.text === 'FAKE-photo-BYTES' && /image[/]/.test(face.type), `${face.status} ${face.text.slice(0, 40)} ${face.type}`);
  check('a member with no photograph says so (404)', (await call('GET', `/people/${OLD_ID}/photo`, null, BT)).status === 404);
  check('an id that is not a number is refused (404)', (await call('GET', '/people/abc/photo', null, BT)).status === 404);
  check('a photograph needs permission to view members (403)', (await call('GET', `/people/${ANAND_ID}/photo`, null, verifier.token)).status === 403);
  check('...and a sign-in (401)', (await call('GET', `/people/${ANAND_ID}/photo`)).status === 401);
}

/* A picture sent as JSON (base64), for a host in front of the API that lets only JSON through. */
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const viaJson = await call('POST', '/uploads/picture', { data: tinyPng, type: 'image/png' }, BT);
check('a picture can be sent as JSON as well as raw bytes', viaJson.status === 201 && /\.png$/.test(viaJson.body?.url || '') && viaJson.body?.bytes === 70, `${viaJson.status} ${viaJson.text.slice(0, 160)}`);
check('JSON that holds no picture is refused (400)', (await call('POST', '/uploads/picture', { data: Buffer.from('not a picture at all').toString('base64') }, BT)).status === 400);

section('Archive, restore and delete a member for good');

/* Someone to delete: a member with a login, an extra row, an approved registration with three uploads, a family link to Anand, and
   Anand has them as his cell leader. Put straight into the fake's tables. */
const FAKE = `http://127.0.0.1:${process.env.NOAH_PORT || '4301'}/_fake`;
const hook = (path, body) => fetch(FAKE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const DM = { user: '27145000000191001', member: '27145000000191002', extra: '27145000000191003', reg: '27145000000191004', photo: '27145000000191005', idf: '27145000000191006', vid: '27145000000191007', rel: '27145000000191008' };
const file = (id, purpose) => ({ ROWID: id, uid: DM.member, path: '99' + id.slice(2), fileType: 1, extension: 'jpg', size: 10, archived: false, remoteSource: JSON.stringify({ name: purpose + '.jpg', mimeType: 'image/jpeg', purpose }) });
await hook('/insert', { table: 'users', rows: [{ ROWID: DM.user, number: '9000000444', countryCode: '+91', archived: false, is_member: true }] });
await hook('/insert', { table: 'members', rows: [{ ROWID: DM.member, id: DM.member, userId: DM.user, countryCode: '+91', mobileNumber1: '9000000444', status: true, isUnVerified: false, archived: false, firstName: 'Delete', lastName: 'Me', gender: 1, photo: DM.photo }] });
await hook('/insert', { table: 'membersExtra', rows: [{ ROWID: DM.extra, id: DM.member }] });
await hook('/insert', { table: 'appRegistrations', rows: [{ ROWID: DM.reg, memberRowId: DM.member, status: 'approved', idProofFileId: DM.idf, videoFileId: DM.vid }] });
await hook('/insert', { table: 'files', rows: [file(DM.photo, 'photo'), file(DM.idf, 'idProof'), file(DM.vid, 'video')] });
await hook('/insert', { table: 'membersRelations', rows: [{ ROWID: DM.rel, memberIdA: ANAND_ID, memberIdB: DM.member, relationshipA2B: 6, relationshipB2A: 6, isArchived: false }] });
await hook('/patch', { table: 'membersExtra', rowId: '27145000000150001', set: { connectedLeader: DM.member } });

const officer = await signIn('+91 90000 00002');     /* a role that may archive but not delete */
const personOf = async (id, tok = BT) => (await call('GET', `/people/${id}`, null, tok)).body?.member;

check('the member is on the register', (await personOf(DM.member))?.name === 'Delete Me' && (await personOf(DM.member))?.archived === false);
check('deleting a member who is not archived is refused (409)', await (async () => { const r = await call('POST', `/people/${DM.member}/delete-for-good`, { confirmName: 'Delete Me' }, BT); return r.status === 409 && r.body?.code === 'not_archived'; })());
check('...so there is no way to delete by mistake in one step', !!(await personOf(DM.member)));

check('archiving needs the permission (403 for someone without it)', (await call('POST', `/people/${DM.member}/archive`, {}, verifier.token)).status === 403);
check('archiving a member that does not exist is refused (404)', (await call('POST', '/people/27145000000999999/archive', {}, BT)).status === 404);
const arch = await call('POST', `/people/${DM.member}/archive`, { remark: 'Left the church' }, officer.token);
check('a membership officer can archive a member', arch.status === 200 && arch.body?.archived === true && arch.body?.name === 'Delete Me', `${arch.status} ${arch.text.slice(0, 160)}`);
check('...they show as Archived', (await personOf(DM.member))?.status === 'Archived' && (await personOf(DM.member))?.archived === true);
check('...and they cannot be offered as a relative any more', !(await call('GET', `/people/${ANAND_ID}/relation-candidates?q=Delete`, null, BT)).body?.rows?.some((c) => c.rowId === DM.member));
check('archiving twice is refused (409)', (await call('POST', `/people/${DM.member}/archive`, {}, BT)).status === 409);
check('a membership officer cannot delete for good (403)', (await call('POST', `/people/${DM.member}/delete-for-good`, { confirmName: 'Delete Me' }, officer.token)).status === 403);

const restored = await call('POST', `/people/${DM.member}/restore`, {}, officer.token);
check('an archived member can be restored', restored.status === 200 && (await personOf(DM.member))?.archived === false && (await personOf(DM.member))?.status !== 'Archived', `${restored.status} ${restored.text.slice(0, 120)}`);
check('restoring one who is not archived is refused (409)', (await call('POST', `/people/${DM.member}/restore`, {}, BT)).status === 409);

await call('POST', `/people/${DM.member}/archive`, {}, BT);
const wrong = await call('POST', `/people/${DM.member}/delete-for-good`, { confirmName: 'Someone Else' }, BT);
check('deleting needs the member name typed exactly (400)', wrong.status === 400 && wrong.body?.code === 'confirm_mismatch', `${wrong.status} ${wrong.text.slice(0, 120)}`);
check('...and not an empty one (400)', (await call('POST', `/people/${DM.member}/delete-for-good`, {}, BT)).status === 400);
check('...nothing was removed by those refusals', !!(await personOf(DM.member)));

const sa = await call('POST', `/people/${BOSS_ID}/archive`, {}, officer.token);
check('nobody can archive their own record (409)', (await call('POST', `/people/${BOSS_ID}/archive`, {}, BT)).body?.code === 'self');
check('the office\'s own super administrator cannot be archived from here (409)', sa.status === 409 && sa.body?.code === 'super_admin', `${sa.status} ${sa.text.slice(0, 120)}`);

const wiped = await call('POST', `/people/${DM.member}/delete-for-good`, { confirmName: '  delete   ME ' }, BT);
check('a super administrator can delete an archived member for good (name typed, case and spaces forgiven)', wiped.status === 200 && wiped.body?.ok === true && wiped.body?.name === 'Delete Me', `${wiped.status} ${wiped.text.slice(0, 300)}`);
check('...their registration, uploads and family link were removed', wiped.body?.removed?.registrations === 1 && wiped.body?.removed?.files === 3 && wiped.body?.removed?.familyLinks === 1 && wiped.body?.removed?.login === true, JSON.stringify(wiped.body?.removed));
check('...the stored files were removed too', wiped.body?.storedFiles?.removed === 3 && wiped.body?.storedFiles?.left === 0, JSON.stringify(wiped.body?.storedFiles));
check('...someone who had them as cell leader is cleared', wiped.body?.removed?.clearedFromOthers === 1);
check('...they are no longer on the register', (await call('GET', `/people/${DM.member}`, null, BT)).status === 404);
check('...nor in the people list', !((await call('GET', '/data/MEMBERS?limit=500', null, BT)).body?.rows || []).some((m) => m.rowId === DM.member));
check('...and Anand\'s family no longer shows them', !(await famOf(ANAND_ID)).some((r) => r.rowId === DM.member));
check('deleting again is refused (404)', (await call('POST', `/people/${DM.member}/delete-for-good`, { confirmName: 'Delete Me' }, BT)).status === 404);

const delAud = await call('GET', '/data/AUD?limit=300', null, BT);
const delRows = delAud.body?.rows || [];
check('archive, restore and delete are all in the audit log', ['Archived a member', 'Restored an archived member', 'Deleted a member for good'].every((a) => delRows.some((x) => x.action === a)));
check('...the deletion keeps the name and number but no contact details', (() => { const x = delRows.find((r) => r.action === 'Deleted a member for good'); const t = JSON.stringify(x); return /Delete Me/.test(t) && !/9000000444/.test(t); })());
check('a member who may sign in to this console cannot be deleted', await (async () => {
  /* Anand is made console staff by an earlier test only in some runs, so use the fake to give a fresh archived member a console role. */
  await hook('/insert', { table: 'members', rows: [{ ROWID: '27145000000192002', id: '27145000000192002', status: true, archived: true, firstName: 'Staff', lastName: 'Person', gender: 1 }] });
  await hook('/insert', { table: 'membersExtra', rows: [{ ROWID: '27145000000192003', id: '27145000000192002', consoleRole: 'moderator', consoleStatus: 'Active' }] });
  const r = await call('POST', '/people/27145000000192002/delete-for-good', { confirmName: 'Staff Person' }, BT);
  return r.status === 409 && r.body?.code === 'console_access';
})());

section('Reported comments (Daily Manna and Noahgram)');

/* dev-offline.mjs: a Manna comment reported 3 times (hidden by the API) with a reply, a Noahgram comment reported once, one with no
   reports, and one already removed. */
const RC = { manna: '27145000000184001', cManna: '27145000000185001', cMannaReply: '27145000000185002', cPost: '27145000000185003', cClean: '27145000000185004', cRemoved: '27145000000185005' };
const repList = await call('GET', '/reported-comments', null, BT);
const repRows = repList.body?.rows || [];
check('reported comments are listed, the most reported first', repList.status === 200 && repRows.map((r) => r.id).join() === [RC.cManna, RC.cPost].join(), `${repList.status} ${repRows.map((r) => r.id)} ${repList.text.slice(0, 120)}`);
check('...none with no reports, and none already removed', !repRows.some((r) => [RC.cClean, RC.cRemoved, RC.cMannaReply].includes(r.id)));
check('...a Manna comment says it is on a Daily Manna, with its title', repRows[0]?.kind === 'manna' && repRows[0]?.where?.title === 'Faith that moves mountains' && repRows[0]?.reports === 3, JSON.stringify(repRows[0]?.where));
check('...a Noahgram comment says so, with the post caption', repRows[1]?.kind === 'noahgram' && /Christmas carol/.test(repRows[1]?.where?.title || ''));
check('...one the API hid is marked hidden, one it did not is not', repRows[0]?.hidden === true && repRows[1]?.hidden === false);
check('...with its replies shown together', repRows[0]?.replies?.length === 1 && repRows[0].replies[0].text === 'Please be kind.' && repRows[0].replies[0].author.name === 'Anand Rao', JSON.stringify(repRows[0]?.replies));
check('...and who wrote it, by name', repRows[0]?.author?.name === 'Old Member', repRows[0]?.author?.name);
check('...who reported it is shown, in the order they did', repRows[0]?.reporters?.map((p) => p.name).join() === 'Anand Rao,Anitha Varghese,Fr Thomas' && repRows[1]?.reporters?.map((p) => p.name).join() === 'Old Member', JSON.stringify(repRows.map((r) => r.reporters)));
check('the work queue counts them', await queueCount('flags') === 2, String(await queueCount('flags')));
check('listing needs permission to moderate (403)', (await call('GET', '/reported-comments', null, verifier.token)).status === 403);
check('...and a sign-in (401)', (await call('GET', '/reported-comments')).status === 401);
check('deciding needs permission too (403)', (await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'keep' }, verifier.token)).status === 403);
check('an action that does not exist is refused (400)', (await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'delete' }, BT)).status === 400);
check('a comment that does not exist is refused (404)', (await call('POST', '/reported-comments/27145000000999999/decide', { action: 'keep' }, BT)).status === 404);

check('under a Noahgram post the comment shows how often it was reported', (await call('GET', '/noahgram/posts/27145000000181004/comments', null, BT)).body?.rows?.find((c) => c.id === RC.cPost)?.reports === 1);
const hid = await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'hide' }, BT);
check('a reported comment can be hidden without removing it', hid.status === 200 && (await call('GET', '/reported-comments', null, BT)).body?.rows?.find((r) => r.id === RC.cPost)?.hidden === true, `${hid.status} ${hid.text.slice(0, 100)}`);
check('hiding it again is refused (409)', (await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'hide' }, BT)).status === 409);

const reportRows = async () => (await (await fetch(`http://127.0.0.1:${process.env.NOAH_PORT || '4301'}/_fake/count?table=flaggedComponentStats`)).json()).count;
check('four reports are on record before any decision', await reportRows() === 4, String(await reportRows()));
const keep = await call('POST', `/reported-comments/${RC.cManna}/decide`, { action: 'keep' }, BT);
check('a comment reported unfairly can be kept: the reports are cleared and it shows again', keep.status === 200
  && !(await call('GET', '/reported-comments', null, BT)).body?.rows?.some((r) => r.id === RC.cManna), `${keep.status} ${keep.text.slice(0, 100)}`);
check('...the three members who reported it can report it again (their report rows are cleared), and only that one comment\'s', await reportRows() === 1, String(await reportRows()));
check('...it is no longer listed, and its replies were never touched', (await call('GET', '/reported-comments', null, BT)).body?.rows?.length === 1);

const rem = await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'remove' }, BT);
check('a reported comment can be removed', rem.status === 200 && (await call('GET', '/reported-comments', null, BT)).body?.rows?.length === 0, `${rem.status} ${rem.text.slice(0, 100)}`);
check('removing it again is refused (409)', (await call('POST', `/reported-comments/${RC.cPost}/decide`, { action: 'remove' }, BT)).status === 409);
check('...nothing is waiting, and the work queue says so', await queueCount('flags') === 0, String(await queueCount('flags')));

/* Removing a Manna comment lowers the Daily Manna's count. Report one by the fake, then remove it. */
await hook('/patch', { table: 'comments', rowId: RC.cClean, set: { flagged: 2 } });
const mannaRemove = await call('POST', `/reported-comments/${RC.cClean}/decide`, { action: 'remove' }, BT);
check('a Daily Manna comment can be removed too', mannaRemove.status === 200, `${mannaRemove.status} ${mannaRemove.text.slice(0, 100)}`);

const repAud = (await call('GET', '/data/AUD?limit=300', null, BT)).body?.rows || [];
check('keeping, hiding and removing are in the audit log', ['Kept a reported comment', 'Hid a reported comment', 'Removed a reported comment'].every((a) => repAud.some((x) => x.action === a)));

section('Education details and other My information changes');

const EDU = "10th (SSC) — School: St Mary's High School; Marks: 85%; Academic year: 2008-09\n12th (HSC) — School: Holy Cross College; Marks: 425/500; Academic year: 2010-11\nBachelor's degree";
await hook('/insert', { table: 'appChangeRequests', rows: [{ ROWID: '27145000000193001', memberRowId: ANAND_ID, fieldId: 'education', oldValue: '', newValue: EDU, status: 'pending', CREATEDTIME: '2026-11-10 10:00:00:000' }] });
const eduList = await call('GET', '/change-requests?status=pending', null, BT);
const eduReq = (eduList.body?.rows || []).find((r) => r.id === '27145000000193001');
check('an education request is listed, known, and its line breaks are kept', eduReq?.fieldLabel === 'Education' && eduReq?.known === true && eduReq?.newValue === EDU, JSON.stringify(eduReq));
const eduOk = await call('POST', '/change-requests/27145000000193001/decide', { approve: true }, BT);
check('...it can be approved', eduOk.status === 200 && eduOk.body?.ok === true, `${eduOk.status} ${eduOk.text.slice(0, 160)}`);
const eduMember = (await call('GET', `/people/${ANAND_ID}`, null, BT)).body;
check('...and the member page shows it with its three lines', eduMember?.member?.education === EDU && eduMember.member.education.split('\n').length === 3, JSON.stringify(eduMember?.member?.education));
check('the edit form offers it as a long text', (eduMember?.edit?.fields || []).find((f) => f.key === 'educationDetail')?.multiline === true && (eduMember?.edit?.fields || []).find((f) => f.key === 'educationDetail')?.max === 2000);
const eduEdit = await call('PATCH', `/people/${ANAND_ID}`, { changes: { educationDetail: 'Diploma\nMaster\'s degree' } }, BT);
check('the office can edit it by hand, keeping its line breaks', eduEdit.status === 200 && (await call('GET', `/people/${ANAND_ID}`, null, BT)).body?.member?.education === "Diploma\nMaster's degree", `${eduEdit.status} ${eduEdit.text.slice(0, 160)}`);
check('...but not past 2000 characters (422)', [400, 422].includes((await call('PATCH', `/people/${ANAND_ID}`, { changes: { educationDetail: 'x'.repeat(2001) } }, BT)).status));
check('...and not with control characters (422)', [400, 422].includes((await call('PATCH', `/people/${ANAND_ID}`, { changes: { educationDetail: 'a\u0007b' } }, BT)).status));
check('a single-line field still refuses a line break', [400, 422].includes((await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'An\nand' } }, BT)).status));

section('Who looks after a member: pastor and cell leader');

const withChoices = await call('GET', `/people/${ANAND_ID}`, null, BT);
const pastors = withChoices.body?.pastoralChoices?.pastors || [];
check('the person page offers who can be picked as a pastor', pastors.some((p) => p.name === 'Fr Thomas'), JSON.stringify(withChoices.body?.pastoralChoices));
check('...but not to someone who may only view members', (await call('GET', `/people/${ANAND_ID}`, null, verifier.token)).status === 403
  || !(await call('GET', `/people/${ANAND_ID}`, null, verifier.token)).body?.pastoralChoices);
const thomas = pastors.find((p) => p.name === 'Fr Thomas')?.rowId;

const cleared = await call('PATCH', `/people/${ANAND_ID}/pastoral`, { pastor: null }, BT);
check('the pastor can be cleared', cleared.status === 200 && cleared.body?.person?.pastoral?.pastor === null, `${cleared.status} ${cleared.text.slice(0, 200)}`);
const set = await call('PATCH', `/people/${ANAND_ID}/pastoral`, { pastor: thomas }, BT);
check('...and set again, which the app reads from connectedPastor', set.status === 200 && set.body?.person?.pastoral?.pastor?.name === 'Fr Thomas', `${set.status} ${set.text.slice(0, 200)}`);
check('someone who is not a pastor cannot be picked (400)', (await call('PATCH', `/people/${ANAND_ID}/pastoral`, { pastor: ANAND_ID }, BT)).status === 400);
check('a pastor is not accepted as a cell leader (400)', (await call('PATCH', `/people/${ANAND_ID}/pastoral`, { leader: thomas }, BT)).status === 400);
check('an empty change is refused (400)', (await call('PATCH', `/people/${ANAND_ID}/pastoral`, {}, BT)).status === 400);
check('it needs the permission to edit members', (await call('PATCH', `/people/${ANAND_ID}/pastoral`, { pastor: thomas }, verifier.token)).status === 403);
const care = await call('GET', '/data/AUD?limit=200', null, BT);
check('changing it is in the audit log', (care.body?.rows || []).some((x) => /Changed pastoral care/.test(x.action || x.act || '')), JSON.stringify((care.body?.rows || []).slice(0, 2)).slice(0, 200));

section('Which sites may call the API from a browser');

{
  /* A browser asks first (a preflight), then sends the request only if the answer names its origin. */
  const ask = async (origin) => {
    const res = await fetch(BASE + '/auth/request-code', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    return res.headers.get('access-control-allow-origin');
  };
  const slate = 'https://noah-console-60088815946.development.catalystserverless.in';
  check('a site on Catalyst hosting (a Slate or Client Hosting address) may call it', (await ask(slate)) === slate, String(await ask(slate)));
  check('the Slate address this console is deployed at may', (await ask('https://karuna-admin-tnzlnait.onslate.in')) === 'https://karuna-admin-tnzlnait.onslate.in');
  check('...a lookalike of it may not', (await ask('https://onslate.in.evil.com')) === null && (await ask('https://evilonslate.in')) === null);
  check('...Slate\'s other domain too', (await ask('https://admin-1234.catalystslate.in')) === 'https://admin-1234.catalystslate.in');
  check('the developer\'s own machine may', (await ask('http://localhost:5173')) === 'http://localhost:5173');
  check('Vercel is no longer used, so its sites are not let in', (await ask('https://noha-admin.vercel.app')) === null && (await ask('https://anything.vercel.app')) === null);
  check('a stranger\'s site may not', (await ask('https://evil.example.com')) === null);
  check('...nor one that only looks like Catalyst hosting', (await ask('https://catalystserverless.in.evil.com')) === null && (await ask('https://x.catalystserverless.in.evil.com')) === null);
  check('...nor plain http on a Catalyst-looking host', (await ask('http://x.development.catalystserverless.in')) === null);
  check('...nor a lookalike domain that merely ends in the same letters', (await ask('https://evilcatalystserverless.in')) === null);
}

/* ================================================================== */
section('Languages: every kind of content is translated into the six languages, and older content is filled in');

{
  /* The tables the fake keeps refusing until a test says they exist. */
  for (const table of ['dailyConfessions', 'dreamDictionary', 'bibleCommentary', 'dailyPrayers']) await fetch(CONTROL + '/_fake/ready', { method: 'POST', body: JSON.stringify({ table }) });

  const first = await call('GET', '/translation', null, BT);
  check('every language the app offers is on, with nothing to choose', first.status === 200 && first.body?.ready === true
    && first.body.on.join() === 'hi,mr,te,ml,ta,kn' && first.body.languages.every((l) => l.on), JSON.stringify(first.body).slice(0, 200));
  check('...with what can be translated, kind by kind', first.body?.coverage?.map((c) => c.id).join() === 'manna,prayers,confessions,dictionary,bibleCommentary', first.body?.coverage?.map((c) => c.id).join());
  check('...and finance may not see it (403)', (await call('GET', '/translation', null, FT)).status === 403);
  check('the content types say which kinds are translated', (await call('GET', '/content/types', null, BT)).body?.types?.filter((t) => t.translated).map((t) => t.id).join() === 'manna,prayers,confessions,dictionary,bibleCommentary');
  check('the languages can no longer be switched (the office does not choose)', (await call('PUT', '/translation/languages', { languages: ['kn'] }, BT)).status === 404);

  const prayer = await call('POST', '/content/prayers', { title: 'Morning light', publishedDate: '2026-11-26', contentLanguage: '1', published: true, content: '<p>Lord, lead me today.</p>' }, BT);
  check('a new prayer is queued for translation', prayer.status === 201 && prayer.body?.translation?.queued === true, `${prayer.status} ${prayer.text.slice(0, 200)}`);
  const prows = await settled('prayers');
  const pen = prows.find((r) => r.title === 'Morning light');
  const pta = prows.find((r) => r.translatedFrom === pen?.id && r.contentLanguage === '6');
  check('...the Tamil one is its own entry (6), live like the original, with the prayer translated', pta?.title === '[ta] Morning light' && pta.content === '<p>[ta] Lord, lead me today.</p>' && pta.live === true, String(JSON.stringify(pta)).slice(0, 200));
  check('...and so is every other language', prows.filter((r) => r.translatedFrom === pen?.id).length === 6);

  const dict = await call('POST', '/content/dictionary', { title: 'River', contentLanguage: '1', published: false, content: '<p>Life and the Spirit.</p>' }, BT);
  const drows = await settled('dictionary');
  check('a dream dictionary entry is translated too', dict.status === 201 && drows.filter((r) => r.translatedFrom === drows.find((x) => x.title === 'River')?.id).length === 6, `${dict.status} ${dict.text.slice(0, 200)}`);
  const comm = await call('POST', '/content/bibleCommentary', { title: 'Psalm 23', bibleBookId: '19', startChapter: '23', contentLanguage: '1', isPublished: false, content: '<p>The Lord is my shepherd.</p>' }, BT);
  const crows = await settled('bibleCommentary');
  check('...and a Bible commentary', comm.status === 201 && crows.filter((r) => r.translatedFrom === crows.find((x) => x.title === 'Psalm 23')?.id).length === 6, `${comm.status} ${comm.text.slice(0, 200)}`);

  /* Something written before translation existed: put straight into the table, so the console never translated it. */
  await fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table: 'dailyPrayers', rows: [
    { ROWID: '27145000000994001', title: 'Written long ago', content: '<p>Old words.</p>', contentLanguage: 1, published: false, isArchived: false },
  ] }) });
  await call('POST', '/refresh', null, BT);
  const before = (await call('GET', '/translation', null, BT)).body;
  const behind = before.coverage.reduce((n, c) => n + (c.originals - (c.done.hi ?? 0)), 0);
  check('older content is counted as not yet in every language', behind > 0, JSON.stringify(before.coverage));
  check('only someone who may publish can fill it in (finance 403)', (await call('POST', '/translation/run', {}, FT)).status === 403);
  const run = await call('POST', '/translation/run', {}, BT);
  check('filling in starts in the background with the entries still to do', run.status === 202 && run.body?.job?.running === true && run.body.job.total > 0, run.text.slice(0, 200));
  /* The stand-in translates at once, so the first run may already be over when the second start arrives: then the second
     finds nothing left to do. Either way two runs never go side by side. */
  const second = await call('POST', '/translation/run', {}, BT);
  check('...and a second start while it runs is refused', second.status === 409 || (second.status === 202 && second.body?.job?.total === 0), `${second.status} ${second.text.slice(0, 120)}`);
  let job;
  for (let i = 0; i < 200; i += 1) {
    job = (await call('GET', '/translation', null, BT)).body;
    if (!job?.job?.running) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  check('...it finishes with every entry done and none failed', job?.job?.running === false && job.job.done === job.job.total && job.job.failed === 0
    && (second.status === 409 ? job.job.made > 0 : true), JSON.stringify(job?.job).slice(0, 300));
  check('...and now everything is in all six languages', job?.coverage?.every((c) => c.error || ['hi', 'mr', 'te', 'ml', 'ta', 'kn'].every((l) => c.done[l] === c.originals)), JSON.stringify(job?.coverage));
  const again = await call('POST', '/translation/run', {}, BT);
  check('...so running it again has nothing to do', again.status === 202 && again.body?.job?.total === 0, again.text.slice(0, 120));

  /* An entry Zoho cannot translate must not stop the ones after it (it once did: the same bad entry came first on every run, failed
     in all six languages, and the job then gave up on everything behind it). */
  await fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table: 'dailyPrayers', rows: [
    { ROWID: '27145000000994002', title: 'Cannot be translated', content: '<p>FAIL-TRANSLATE this one.</p>', contentLanguage: 1, published: false, isArchived: false },
    { ROWID: '27145000000994003', title: 'Comes after it', content: '<p>Fine words.</p>', contentLanguage: 1, published: false, isArchived: false },
  ] }) });
  await call('POST', '/refresh', null, BT);
  await call('POST', '/translation/run', {}, BT);
  let bad;
  for (let i = 0; i < 200; i += 1) {
    bad = (await call('GET', '/translation', null, BT)).body;
    if (!bad?.job?.running) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const after = (await call('GET', '/content/prayers', null, BT)).body?.rows || [];
  check('one entry that fails does not stop the run: the entry after it is translated in all six languages',
    after.filter((r) => r.translatedFrom === '27145000000994003').length === 6, `${after.filter((r) => r.translatedFrom === '27145000000994003').length} copies`);
  check('...the run finished all its entries, and says which one failed', bad?.job?.running === false && bad.job.done === bad.job.total && !bad.job.stopped
    && bad.job.failures?.length === 6 && bad.job.failures.every((f) => /Cannot be translated/.test(f.what)), JSON.stringify(bad?.job).slice(0, 300));
  check('...and the entry that failed has no half-made copies', after.filter((r) => r.translatedFrom === '27145000000994002').length === 0);

  const calls = (await (await fetch(CONTROL + '/_fake/translate-calls')).json()).calls;
  check('Zoho was asked for the six languages, never English', ['hi', 'mr', 'te', 'ml', 'ta', 'kn'].every((l) => calls.some((c) => c.target === l)) && calls.every((c) => c.target !== 'en'));
}

/* ================================================================== */
section('Prayer requests: category and audience read right, the office can edit them, a decline needs no reason');

{
  const ids = { health: '27145000000995001', career: '27145000000995002', thanks: '27145000000995003', other: '27145000000995004', toDecline: '27145000000995005', toApprove: '27145000000995006', odd: '27145000000995007' };
  const row = (ROWID, type, isApproved, content) => ({ ROWID, memberId: ANAND_ID, type, isApproved, isArchived: false, closed: false, content, prayerCount: 0, createdOn: '2026-11-24 10:00:00' });
  await fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table: 'prayerRequest', rows: [
    row(ids.health, 11, 0, 'Please pray for my health.'),         /* Healing, everyone */
    row(ids.career, 30, 0, 'Please pray for my career.'),         /* Guidance, prayer warriors */
    row(ids.thanks, 40, 1, 'Thank you Lord for the harvest.'),    /* Thanksgiving, prayer warriors, approved */
    row(ids.other, 51, 0, 'Pray for the village.'),               /* Other, everyone */
    row(ids.toDecline, 11, 0, 'Decline me without a reason.'),
    row(ids.toApprove, 21, 0, 'Approve me.'),                     /* Family, everyone */
    row(ids.odd, 52, 0, 'An audience code nobody knows.'),
  ] }) });
  await call('POST', '/refresh', null, BT);
  const list = async () => ((await call('GET', '/data/PRAYER_INBOX?limit=500', null, BT)).body?.rows || []);
  const get = async (id) => (await list()).find((r) => r.id === id);

  const a = await list();
  const h = a.find((r) => r.id === ids.health);
  check('a request the member sent for everyone shows as Everyone, with its category', h?.everyone === true && h.category === 'Healing', JSON.stringify(h));
  check('...one for prayer warriors as prayer warriors', a.find((r) => r.id === ids.career)?.everyone === false && a.find((r) => r.id === ids.career)?.category === 'Guidance');
  check('...Thanksgiving and Other are read too', a.find((r) => r.id === ids.thanks)?.category === 'Thanksgiving' && a.find((r) => r.id === ids.other)?.category === 'Other' && a.find((r) => r.id === ids.other)?.everyone === true);
  check('...and the state is read from isApproved', a.find((r) => r.id === ids.thanks)?.state === 'Approved' && h.state === 'Pending');

  /* Editing: the wording and who may see it. */
  const longText = 'Lord, hear this long prayer. '.repeat(100);
  const toAll = await call('PATCH', `/prayer-inbox/${ids.career}`, { everyone: true }, BT);
  check('the office can change a request from prayer warriors to everyone', toAll.status === 200 && toAll.body?.request?.everyone === true && (await get(ids.career))?.everyone === true && (await get(ids.career))?.category === 'Guidance', toAll.text.slice(0, 160));
  const toWarriors = await call('PATCH', `/prayer-inbox/${ids.health}`, { everyone: false }, BT);
  check('...and from everyone to prayer warriors', toWarriors.status === 200 && (await get(ids.health))?.everyone === false && (await get(ids.health))?.category === 'Healing');
  const longEdit = await call('PATCH', `/prayer-inbox/${ids.other}`, { text: longText }, BT);
  check('the wording can be edited before approval, past the 300 characters the app allows', longEdit.status === 200 && (await get(ids.other))?.text.length === longText.trim().length && longText.length > 2500, longEdit.text.slice(0, 160));
  check('...and its audience is untouched by that', (await get(ids.other))?.everyone === true);
  const afterApproval = await call('PATCH', `/prayer-inbox/${ids.thanks}`, { text: 'Thank you Lord for a good harvest.', everyone: true }, BT);
  check('...and after it was approved, both the wording and who may see it', afterApproval.status === 200 && (await get(ids.thanks))?.text === 'Thank you Lord for a good harvest.' && (await get(ids.thanks))?.everyone === true && (await get(ids.thanks))?.state === 'Approved', afterApproval.text.slice(0, 160));
  check('...an empty request is refused', (await call('PATCH', `/prayer-inbox/${ids.health}`, { text: '   ' }, BT)).status === 400);
  const tooLong = await call('PATCH', `/prayer-inbox/${ids.health}`, { text: 'x'.repeat(10001) }, BT);
  check('...so is more than the 10,000 the database can hold, saying so', tooLong.status === 400 && tooLong.body?.code === 'too_long' && /10,000/.test(tooLong.body?.error || ''), tooLong.text.slice(0, 160));
  check('...nothing to change is refused', (await call('PATCH', `/prayer-inbox/${ids.health}`, {}, BT)).status === 400 && (await call('PATCH', `/prayer-inbox/${ids.health}`, { everyone: 'yes' }, BT)).status === 400);
  check('...a request that is not there is a 404', (await call('PATCH', '/prayer-inbox/27145000000999999', { text: 'x' }, BT)).status === 404);
  const odd = await call('PATCH', `/prayer-inbox/${ids.odd}`, { everyone: true }, BT);
  check('an audience code the console does not know is not changed (and says why)', odd.status === 400 && odd.body?.code === 'unknown_audience' && (await get(ids.odd))?.everyone === false, odd.text.slice(0, 160));
  check('...but its wording can still be edited', (await call('PATCH', `/prayer-inbox/${ids.odd}`, { text: 'An audience code nobody knows, corrected.' }, BT)).status === 200);
  check('editing needs permission to moderate (finance gets 403)', (await call('PATCH', `/prayer-inbox/${ids.health}`, { text: 'x' }, FT)).status === 403);
  const audits = (await call('GET', '/data/AUD?limit=60', null, BT)).body?.rows || [];
  check('edits are in the audit log, saying what was changed', audits.some((x) => /Edited prayer request \(who may see it\)/.test(x.action)) && audits.some((x) => /Edited prayer request \(wording\)/.test(x.action)) && audits.some((x) => /Edited prayer request \(wording and who may see it\)/.test(x.action)));

  /* Deciding: through the Noah API, so the member is told; the reason for a decline is optional. */
  const declined = await call('POST', `/prayer-inbox/${ids.toDecline}/decide`, { decision: 'Declined' }, BT);
  check('a request can be declined without a reason, and the member is told', declined.status === 200 && declined.body?.memberTold === true && (await get(ids.toDecline))?.state === 'Declined', declined.text.slice(0, 160));
  const withWhy = await call('POST', `/prayer-inbox/${ids.other}/decide`, { decision: 'Declined', remark: 'Please send it again with more detail.' }, BT);
  const sent = (await (await fetch(CONTROL + '/_fake/prayer-decisions')).json()).decisions;
  check('...with a reason, it goes to the member through the Noah API', withWhy.status === 200 && sent.find((d) => d.id === ids.other)?.remark === 'Please send it again with more detail.' && sent.find((d) => d.id === ids.toDecline)?.remark === null, JSON.stringify(sent));
  const approved = await call('POST', `/prayer-inbox/${ids.toApprove}/decide`, { decision: 'Approved' }, BT);
  check('approving is told to the member too, and moves it to Approved', approved.status === 200 && approved.body?.memberTold === true && (await get(ids.toApprove))?.state === 'Approved');
  check('deciding again is refused (409)', (await call('POST', `/prayer-inbox/${ids.toApprove}/decide`, { decision: 'Declined' }, BT)).status === 409);
  check('...and an unknown decision is a 400', (await call('POST', `/prayer-inbox/${ids.career}/decide`, { decision: 'Maybe' }, BT)).status === 400);
  check('deciding needs permission to moderate (finance gets 403)', (await call('POST', `/prayer-inbox/${ids.career}/decide`, { decision: 'Approved' }, FT)).status === 403);
  /* The office writes a prayer request of its own. */
  const newOne = await call('POST', '/prayer-inbox', { text: 'Pray for the church building fund.', category: 'Family', everyone: true, memberId: ANAND_ID }, BT);
  check('the office can add a prayer request for a member, for everyone, in a category', newOne.status === 201 && newOne.body?.request?.everyone === true && newOne.body.request.category === 'Family'
    && newOne.body.request.memberName === 'Anand Rao' && newOne.body.request.state === 'Approved', newOne.text.slice(0, 200));
  const listed = (await list()).find((r) => r.id === newOne.body?.request?.id);
  check('...it is on the wall at once (approved), read back as Family for everyone', listed?.state === 'Approved' && listed.everyone === true && listed.category === 'Family' && listed.text === 'Pray for the church building fund.', JSON.stringify(listed));
  const forWarriors = await call('POST', '/prayer-inbox', { text: 'For the prayer warriors only.', category: 'Guidance', everyone: false, memberId: ANAND_ID }, BT);
  check('...one for prayer warriors only is stored as that', forWarriors.status === 201 && (await list()).find((r) => r.id === forWarriors.body?.request?.id)?.everyone === false);
  const waiting = await call('POST', '/prayer-inbox', { text: 'Leave this one waiting.', category: 'Healing', publish: false, memberId: ANAND_ID }, BT);
  check('...it can be left waiting, like a member\'s', waiting.status === 201 && (await list()).find((r) => r.id === waiting.body?.request?.id)?.state === 'Pending');
  const longOne = await call('POST', '/prayer-inbox', { text: 'Lord, hear us. '.repeat(400), memberId: ANAND_ID }, BT);
  check('...with no 300-character limit', longOne.status === 201 && longOne.body?.request?.text.length > 5000, `${longOne.status}`);
  const bySelf = await call('POST', '/prayer-inbox', { text: 'From the office itself.', everyone: true }, BT);
  check('...without choosing a member it is from the signed-in office member', bySelf.status === 201 && !!bySelf.body?.request?.memberName, bySelf.text.slice(0, 200));
  check('...an empty request is refused', (await call('POST', '/prayer-inbox', { text: '  ', memberId: ANAND_ID }, BT)).status === 400);
  check('...so is one past the 10,000 the database holds', (await call('POST', '/prayer-inbox', { text: 'x'.repeat(10001), memberId: ANAND_ID }, BT)).body?.code === 'too_long');
  check('...a category that does not exist', (await call('POST', '/prayer-inbox', { text: 'x', category: 'Weather', memberId: ANAND_ID }, BT)).body?.code === 'bad_category');
  check('...and a member who is not on the register', (await call('POST', '/prayer-inbox', { text: 'x', memberId: '27145000000999999' }, BT)).body?.code === 'no_member');
  check('...an audience that is not true or false', (await call('POST', '/prayer-inbox', { text: 'x', everyone: 'yes', memberId: ANAND_ID }, BT)).status === 400);
  check('adding needs permission to moderate (finance gets 403)', (await call('POST', '/prayer-inbox', { text: 'x', memberId: ANAND_ID }, FT)).status === 403);
  const people = await call('GET', '/prayer-inbox/members?q=anand', null, BT);
  check('a member can be searched for by name, to write a request on their behalf', people.status === 200 && people.body?.rows?.some((x) => x.id === ANAND_ID && x.name === 'Anand Rao'), people.text.slice(0, 160));
  check('...and the search needs permission to moderate (finance gets 403)', (await call('GET', '/prayer-inbox/members?q=anand', null, FT)).status === 403);
  const added = (await call('GET', '/data/AUD?limit=80', null, BT)).body?.rows || [];
  check('adding is in the audit log', added.some((x) => x.action === 'Added a prayer request'));

  const declinedRow = await get(ids.toDecline);
  check('a declined request (the Noah API marks it isApproved = 2) is listed as Declined, not as waiting', declinedRow?.state === 'Declined' && !(await list()).some((r) => r.id === ids.toDecline && r.state === 'Pending'));
}

/* ================================================================== */
section('Duplicate emails: addresses more than one member uses, when each came, checked or corrected');

{
  const person = (n, first, email, day) => ({ ROWID: `2714500000099700${n}`, firstName: first, lastName: 'Dup', emailId1: email,
    countryCode: '+91', mobileNumber1: `90000970${n}0`, CREATEDTIME: `2026-11-${day} 10:00:00:000`, archived: false });
  await fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table: 'members', rows: [
    person(1, 'Asha', 'same.person@example.com', '01'),
    person(2, 'Bina', ' Same.Person@Example.COM ', '10'),          /* the same address, other capitals and spaces */
    person(3, 'Chris', 'john.smith@gmail.com', '02'),
    person(4, 'Dev', 'johnsmith+church@gmail.com', '12'),         /* Gmail ignores the dot and the +tag */
    person(5, 'Esha', 'priya@gmial.com', '03'),                   /* a typo of gmail.com */
    person(6, 'Farah', 'priya@gmail.com', '13'),
    person(7, 'Gita', 'nobody.else@example.com', '04'),
  ] }) });
  const read = async () => (await call('GET', '/duplicate-emails', null, BT)).body?.rows || [];
  const byKey = async (k) => (await read()).find((g) => g.key === k);

  const same = await byKey('same.person@example.com');
  check('two members with the same email (whatever the capitals) are a Duplicate', same?.kind === 'duplicate' && same.people === 2, JSON.stringify(same).slice(0, 200));
  check('...listed oldest first, with when each came, so the office sees which came first', same?.entries?.[0]?.name === 'Asha Dup' && same.entries[0].first === true
    && same.entries[1].name === 'Bina Dup' && same.entries[1].first === false && same.entries[0].came < same.entries[1].came, JSON.stringify(same?.entries?.map((e) => [e.name, e.came, e.first])));
  check('...with their mobile number to call them', same?.entries?.[0]?.mobile?.includes('9000097010'), same?.entries?.[0]?.mobile);
  const gmail = await byKey('johnsmith@gmail.com');
  check('the same Gmail with a dot or a +tag is a Potential duplicate', gmail?.kind === 'potential' && gmail.people === 2, JSON.stringify(gmail).slice(0, 160));
  check('...so is a typo of gmail.com', (await byKey('priya@gmail.com'))?.kind === 'potential');
  check('an address only one member uses is not listed', !(await read()).some((g) => g.entries.some((e) => e.email === 'nobody.else@example.com')));
  check('the list needs permission to edit members (finance gets 403)', (await call('GET', '/duplicate-emails', null, FT)).status === 403);

  const queue = async () => ((await call('GET', '/queues', null, BT)).body || []).find?.((x) => x.id === 'dupes')?.count ?? -1;
  const before = await queue();
  check('the shared emails to check are counted for the bell', before >= 3, String(before));

  const marked = await call('POST', '/duplicate-emails/check', { key: 'same.person@example.com', note: 'Called both: sisters who share it.' }, BT);
  check('an address can be marked as checked, with a note', marked.status === 200 && (await byKey('same.person@example.com'))?.checked === true
    && (await byKey('same.person@example.com'))?.check?.note === 'Called both: sisters who share it.', marked.text.slice(0, 160));
  check('...and is no longer counted as work', await queue() === before - 1, `${before} -> ${await queue()}`);
  check('...which is in the audit log', ((await call('GET', '/data/AUD?limit=40', null, BT)).body?.rows || []).some((a) => a.action === 'Marked a shared email as checked'));
  await fetch(CONTROL + '/_fake/insert', { method: 'POST', body: JSON.stringify({ table: 'members', rows: [person(8, 'Hema', 'same.person@example.com', '20')] }) });
  const third = await byKey('same.person@example.com');
  check('when someone new joins with a checked address, it is open again', third?.checked === false && third.people === 3, JSON.stringify(third).slice(0, 160));
  await call('POST', '/duplicate-emails/check', { key: 'same.person@example.com' }, BT);
  const reopened = await call('POST', '/duplicate-emails/reopen', { key: 'same.person@example.com' }, BT);
  check('...and a checked address can be opened again by hand', reopened.status === 200 && (await byKey('same.person@example.com'))?.checked === false);
  check('...marking needs an address that is shared (404) and permission (finance 403)', (await call('POST', '/duplicate-emails/check', { key: 'not.shared@example.com' }, BT)).status === 404
    && (await call('POST', '/duplicate-emails/check', { key: 'same.person@example.com' }, FT)).status === 403);

  /* Correcting the address on the right member, after calling them. */
  const fixed = await call('PATCH', '/people/27145000000997005', { changes: { email: 'esha.dup@gmail.com' } }, BT);
  check('the office corrects the email on a member, and that address is no longer shared', fixed.status === 200 && !(await byKey('priya@gmail.com')), fixed.text.slice(0, 160));
  check('...a correction that is not an email is refused', (await call('PATCH', '/people/27145000000997004', { changes: { email: 'not an email' } }, BT)).status === 400);
}

/* ================================================================== */
section('Help bot questions: the FAQ to-do list (FOR-CONSOLE-HELP-BOT.md)');

{
  const todo = await call('GET', '/help-questions', null, BT);
  const rows = todo.body?.rows || [];
  check('Needs attention lists the questions with no answer and the ones marked not helpful', todo.status === 200 && rows.length === 3
    && rows.filter((r) => r.problem === 'none').length === 2 && rows.filter((r) => r.problem === 'unhelpful').length === 1, todo.text.slice(0, 200));
  check('...newest first, with the member and the time', rows[0]?.memberName === 'Test Boss' && rows[0]?.at === '2026-11-24T14:10:00.000Z' && rows[0]?.answer === null, JSON.stringify(rows[0]));
  const unhelpful = rows.find((r) => r.problem === 'unhelpful');
  check('...a not helpful one carries the answer the bot gave', /Me > My information/.test(unhelpful?.answer || '') && unhelpful.helpful === false);
  const answered = await call('GET', '/help-questions?show=answered', null, BT);
  check('Answered lists the ones that got an answer (helpful or not rated)', answered.body?.rows?.length === 2 && answered.body.rows.every((r) => r.answered && r.problem === null), answered.text.slice(0, 160));
  check('All lists every question', (await call('GET', '/help-questions?show=all', null, BT)).body?.rows?.length === 5);
  check('anything else is read as Needs attention', (await call('GET', '/help-questions?show=nonsense', null, BT)).body?.show === 'attention');
  check('only moderators see the questions (finance gets 403)', (await call('GET', '/help-questions', null, FT)).status === 403);
  check('...and a sign-in is needed (401)', (await call('GET', '/help-questions')).status === 401);
}

/* ================================================================== */
section('When Catalyst stops answering');

const outage = (message) =>
  fetch(CONTROL + '/_fake/outage', { method: 'POST', body: JSON.stringify({ message }) }).then((r) => r.json());

/* ---------- the allowance is used up ---------- */
await outage('Catalyst: You have exhausted the free tier allowance for Datastore - Fetch. Please set up a payment method to continue using this resource.');

const dash = await call('GET', '/dashboard', null, BT);
check('the dashboard answers 503, not a bare 502', dash.status === 503, `${dash.status} ${dash.text.slice(0, 120)}`);
check('...saying the allowance is used up, in plain words', /free allowance .* used up/.test(dash.body?.error || '') && /Nothing is wrong with the console/.test(dash.body?.error || ''), dash.body?.error);
check('...naming who needs to act', /Whoever owns the Catalyst account/.test(dash.body?.error || ''));
check('...with a code a screen can recognise', dash.body?.code === 'catalyst_quota');
check('...without the raw Catalyst message the office cannot act on', !/Datastore - Fetch/.test(dash.body?.error || ''));

const regsDown = await call('GET', '/data/REGISTRATIONS?limit=50', null, BT);
check('the registration list says the same', regsDown.status === 503 && regsDown.body?.code === 'catalyst_quota', `${regsDown.status} ${regsDown.text.slice(0, 100)}`);
const peopleDown = await call('GET', '/app-roles/people', null, BT);
check('...and so does the people list', peopleDown.status === 503 && peopleDown.body?.code === 'catalyst_quota', `${peopleDown.status}`);

/* things that need no Catalyst still work */
check('sign-in still works (test accounts need no database)', (await call('POST', '/auth/request-code', { mobile: '+91 90000 00001' })).status === 200);
check('the health check still answers, and costs nothing', (await call('GET', '/health')).status === 200);
check('the work queues still load', (await call('GET', '/queues', null, BT)).status === 200);

/* ---------- the settings are wrong ---------- */
await outage('Catalyst would not issue an access token (400). invalid_code. Check CATALYST_* in .env.local.');
const authDown = await call('GET', '/dashboard', null, BT);
check('wrong Catalyst settings are named as that, not as an outage', authDown.status === 503 && authDown.body?.code === 'catalyst_auth' && /CATALYST_REFRESH_TOKEN/.test(authDown.body?.error || ''), authDown.text.slice(0, 160));

/* ---------- anything else is passed on as it came ---------- */
await outage('Catalyst: some other thing went wrong');
const other = await call('GET', '/dashboard', null, BT);
check('an unrecognised Catalyst error is still reported, as a 502', other.status === 502 && /some other thing/.test(other.body?.error || ''), `${other.status} ${other.text.slice(0, 100)}`);

/* ---------- and it recovers ---------- */
await outage(null);
const recovered = await call('GET', '/dashboard', null, BT);
check('when Catalyst answers again the dashboard comes back', recovered.status === 200 && Array.isArray(recovered.body?.cards), `${recovered.status} ${recovered.text.slice(0, 100)}`);

console.log('\n' + '─'.repeat(64));
console.log(fails.length
  ? `\n  \x1b[31m${fails.length} failed\x1b[0m, ${pass} passed:\n${fails.map((f) => '   - ' + f).join('\n')}\n`
  : `\n  \x1b[32mAll ${pass} checks passed.\x1b[0m\n`);
process.exit(fails.length ? 1 : 0);
