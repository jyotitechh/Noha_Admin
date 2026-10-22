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
check('/meta says which ways of getting a code are set up', metaNow.body?.codeChannels && metaNow.body.codeChannels.email === false && metaNow.body.codeChannels.sms === false, JSON.stringify(metaNow.body?.codeChannels));

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
check('the content editor can read what can be authored', types.status === 200 && types.body?.types?.length === 15, `${types.status}`);
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

const MANNA = { title: 'Walking by faith', publishDate: '2026-10-20', text: 'A verse (John 3:16)', content: 'The message of the day.', prayer: 'A short prayer.' };
const notYet = await call('POST', '/content/manna', MANNA, ET);
check('saving into it is refused, in plain words', notYet.status === 502 && /Catalyst refused it/.test(notYet.body?.error || ''), `${notYet.status} ${notYet.text.slice(0, 140)}`);
check('...pointing at the document that lists the columns', /CONTENT-TABLES/.test(notYet.body?.hint || ''));

const tube = await call('GET', '/content/tubeVideos', null, ET);
check('Noah Tube says its table does not exist', tube.body?.notReady?.code === 'no_table', tube.text.slice(0, 160));
const tubeSave = await call('POST', '/content/tubeVideos', { title: 'X', videoUrl: 'https://example.com/v' }, ET);
check('...and saving to it is refused as not ready (409)', tubeSave.status === 409 && tubeSave.body?.notReady === true, tubeSave.text.slice(0, 120));

/* ---------- checking what is sent ---------- */
const invalid = await call('POST', '/content/manna', {}, ET);
check('a blank form names every field that is missing (400)', invalid.status === 400 && ['title', 'publishDate', 'text', 'content', 'prayer'].every((k) => invalid.body?.errors?.[k]), invalid.text.slice(0, 140));
const badLink = await call('POST', '/content/manna', { ...MANNA, imageUrl: 'javascript:alert(1)' }, ET);
check('a link that is not http(s) is refused', badLink.status === 400 && !!badLink.body?.errors?.imageUrl);

/* ---------- once the Catalyst developer has added the columns ---------- */
await fakeReady('dailyMana');
const made = await call('POST', '/content/manna', { ...MANNA, language: 'en', published: false }, ET);
check('the devotional is saved', made.status === 201 && made.body?.ok === true, `${made.status} ${made.text.slice(0, 140)}`);

const mannaList = await call('GET', '/content/manna', null, ET);
const entry = mannaList.body?.rows?.[0];
check('...and listed, as a draft', mannaList.body?.rows?.length === 1 && entry.title === 'Walking by faith' && entry.live === false, mannaList.text.slice(0, 200));
check('...with a string id', typeof entry?.id === 'string' && entry.id.length >= 15);
check('...and the language and date came back as sent', entry?.language === 'en' && entry?.publishDate === '2026-10-20');

const pub = await call('POST', `/content/manna/${entry.id}/publish`, { on: true }, ET);
check('publishing it works', pub.status === 200 && pub.body?.on === true, pub.text.slice(0, 100));
check('...and it is live', (await call('GET', '/content/manna?state=live', null, ET)).body.rows.length === 1);

const patched = await call('PATCH', `/content/manna/${entry.id}`, { title: 'Walking by faith, revised' }, ET);
check('a change is saved', patched.status === 200 && (await call('GET', '/content/manna', null, ET)).body.rows[0].title === 'Walking by faith, revised');
check('...and the rest of it is kept', (await call('GET', '/content/manna', null, ET)).body.rows[0].prayer === 'A short prayer.');
check('a change that empties a required field is refused', (await call('PATCH', `/content/manna/${entry.id}`, { title: '' }, ET)).status === 400);

const down = await call('POST', `/content/manna/${entry.id}/publish`, { on: false }, ET);
check('taking it down works', down.status === 200 && (await call('GET', '/content/manna?state=live', null, ET)).body.rows.length === 0);

check('a kind with no publish step says so (400)', (await call('POST', '/content/mannaCategories/1/publish', { on: true }, ET)).status === 400);

const del = await call('DELETE', `/content/manna/${entry.id}`, null, ET);
check('deleting works', del.status === 200 && (await call('GET', '/content/manna', null, ET)).body.rows.length === 0);
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

const person = await call('GET', `/people/${ANAND_ID}`, null, BT);
check('the person page loads for a super administrator', person.status === 200 && person.body?.member?.name === 'Anand Rao', `${person.status} ${person.text.slice(0, 120)}`);
check('...with the registration they made', person.body?.registration?.id === APPROVED_REG && person.body.registration.state === 'approved');
check('...and the ids of their photo, ID and video', !!person.body?.registration?.fileIds?.video && !!person.body.registration.fileIds.photo && !!person.body.registration.fileIds.idProof);
check('...who their pastor is', person.body?.pastoral?.pastor?.name === 'Fr Thomas', JSON.stringify(person.body?.pastoral));
check('...whether they are a partner', person.body?.partnership?.isPartner === true);
check('...and says family and groups are not recorded yet, rather than empty',
  person.body?.family?.recorded === false && /no columns/.test(person.body.family.why) && person.body?.groups?.recorded === false);

check('their phone, email and address are masked until revealed',
  /•/.test(person.body?.member?.mobile) && /•/.test(person.body.member.email) && person.body.member.masked === true && !/9000000779/.test(person.body.member.mobile),
  JSON.stringify({ m: person.body?.member?.mobile, e: person.body?.member?.email }));

const reveal = await call('GET', `/people/${ANAND_ID}/contact`, null, membership.token);
check('revealing them is allowed with the permission', reveal.status === 200 && reveal.body?.mobile === '+919000000779' && reveal.body?.email === 'anand@example.com', reveal.text.slice(0, 120));
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

  const bad = await call('PATCH', `/people/${ANAND_ID}`, { changes: { email: 'nope', mobile: '9999999999', dateOfBirth: '31/12/1990' } }, membership.token);
  check('invalid details are refused, each one named', bad.status === 400 && !!bad.body?.errors?.email && !!bad.body?.errors?.mobile && !!bad.body?.errors?.dateOfBirth, bad.text.slice(0, 200));
  check('...and the login number cannot be edited at all', /not a field that can be edited/.test(bad.body?.errors?.mobile || ''));
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
  check('an unknown member is a 404', (await call('PATCH', '/people/27145000000999999', { changes: { city: 'X' } }, membership.token)).status === 404);

  /* ---------- the requests the app files ---------- */
  check('change requests need a sign-in and the permission', (await call('GET', '/change-requests')).status === 401 && (await call('GET', '/change-requests', null, FT)).status === 403);
  const pending = await call('GET', '/change-requests?status=pending', null, BT);
  check('the pending requests are listed, with who asked and what changes', pending.status === 200 && pending.body?.rows?.length === 4 && pending.body.rows.some((r) => r.fieldId === 'firstName' && r.newValue === 'Anandan' && /Anand/.test(r.memberName)), pending.text.slice(0, 200));
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

  /* put the name back, so nothing later depends on this section */
  await call('PATCH', `/people/${ANAND_ID}`, { changes: { firstName: 'Anand', gender: 'male' } }, membership.token);
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
