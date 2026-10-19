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

const code = (await call('POST', '/auth/request-code', { email: 'anitha.varghese@karunasadan.org' })).body.devCode;
const token = (await call('POST', '/auth/verify', { email: 'anitha.varghese@karunasadan.org', code })).body.token;

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
check('an approved row reads approved, with who decided it', mine?.state === 'approved' && mine?.decidedBy === 'Anitha Varghese', JSON.stringify({ s: mine?.state, d: mine?.decidedBy }));

console.log('\n' + '─'.repeat(64));
console.log(fails.length
  ? `\n  \x1b[31m${fails.length} failed\x1b[0m, ${pass} passed:\n${fails.map((f) => '   - ' + f).join('\n')}\n`
  : `\n  \x1b[32mAll ${pass} checks passed.\x1b[0m\n`);
process.exit(fails.length ? 1 : 0);
