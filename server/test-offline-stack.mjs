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
check('THE BACKDOOR IS CLOSED: a sample person email does not sign in', viaEmail.status === 400 && /mobile number/.test(viaEmail.body?.error || ''), viaEmail.text.slice(0, 120));
check('a junk number is refused', (await call('POST', '/auth/request-code', { mobile: '12' })).status === 400);

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

console.log('\n' + '─'.repeat(64));
console.log(fails.length
  ? `\n  \x1b[31m${fails.length} failed\x1b[0m, ${pass} passed:\n${fails.map((f) => '   - ' + f).join('\n')}\n`
  : `\n  \x1b[32mAll ${pass} checks passed.\x1b[0m\n`);
process.exit(fails.length ? 1 : 0);
