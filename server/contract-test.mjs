/* Does a backend actually implement docs/API-CONTRACT.md?

   Run it against anything:

     node server/contract-test.mjs                          # the local mock
     node server/contract-test.mjs https://<catalyst-url>   # the real thing

   It walks the whole registration journey — submit, poll, approve, sign in —
   and checks the validation rules one at a time. Every failure prints what
   was expected and what came back.

   This is how the Catalyst developer knows they are done, and how we find out
   if something drifts later. It writes real rows, so run it against a
   development environment, never production. */

const BASE = (process.argv[2] || 'http://localhost:4000').replace(/\/+$/, '') + '/api';

/* A staff sign-in, for the admin half. Override for a different setup:
     STAFF_EMAIL=... STAFF_TOKEN=... node server/contract-test.mjs <url> */
const STAFF_EMAIL = process.env.STAFF_EMAIL || 'anitha.varghese@karunasadan.org';

let pass = 0;
const failures = [];

const c = { ok: '\x1b[32m', bad: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' };

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ${c.ok}pass${c.off}  ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ${c.bad}FAIL${c.off}  ${name}`);
    if (detail) console.log(`        ${c.dim}${detail}${c.off}`);
  }
}

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, body: json };
}

/* A valid registration, in the Flutter app's own field names. */
const uniqueMobile = () => '+91 9' + String(Date.now()).slice(-4) + ' ' + String(Math.floor(Math.random() * 90000) + 10000);

const validRegistration = (mobile) => ({
  firstName: 'Shashank', middleName: 'Sanjay', lastName: 'Gupta',
  email: 'contract.test@example.com',
  gender: 'male', dob: '1996-04-11', marital: 'married', reference: 'My cell leader',
  address1: 'Flat 402, Shanti Nagar', address2: 'Near the bus depot',
  city: 'Mumbai', state: 'Maharashtra', country: 'India', pin: '400053',
  idType: 'pan', idNumber: 'ABCDE1234F', idFile: 'id.jpg',
  photoFile: 'me.jpg',
  agreed: true, signature: 'Shashank Sanjay Gupta',
  declarationLang: 'en', declarationVersion: '2026.09',
  videoSeconds: 18, videoPath: 'kyc.mp4',
  phone: mobile,
});

/* Each case bends one field and says which one should be complained about. */
const REJECTIONS = [
  ['under 18', { dob: '2012-04-11' }, 'dob', 1],
  ['no gender', { gender: '' }, 'gender', 1],
  ['gender outside the three', { gender: 'unknown' }, 'gender', 1],
  ['marital status not one of the six', { marital: 'engaged' }, 'marital', 1],
  ['first name missing', { firstName: '' }, 'firstName', 1],
  ['email malformed', { email: 'not-an-email' }, 'email', 1],
  ['address line 1 too short', { address1: 'a' }, 'line1', 2],
  ['city missing', { city: '' }, 'city', 2],
  ['Indian PIN starting with zero', { pin: '040053' }, 'pin', 2],
  ['Indian PIN too short', { pin: '4005' }, 'pin', 2],
  ['PAN malformed', { idNumber: 'ABCD1234FG' }, 'idNumber', 3],
  ['Aadhaar starting with 1', { idType: 'aadhaar', idNumber: '1234 5678 9012' }, 'idNumber', 3],
  ['voter ID malformed', { idType: 'voter', idNumber: 'AB12345678' }, 'idNumber', 3],
  ['ID type not one of the five', { idType: 'ration' }, 'idType', 3],
  ['ID document not attached', { idFile: '' }, 'idFile', 3],
  ['photograph not attached', { photoFile: '' }, 'photoFile', 4],
  ['photograph is a PDF', { photoFile: 'me.pdf' }, 'photoFile', 4],
  ['declaration not ticked', { agreed: false }, 'agreed', 5],
  ['signature does not match the name', { signature: 'Shashank Gupta' }, 'signature', 5],
  ['video under 10 seconds', { videoSeconds: 4 }, 'videoSecs', 6],
  ['video over 30 seconds', { videoSeconds: 45 }, 'videoSecs', 6],
];

console.log(`\n  Contract test — ${BASE}\n`);

/* ---------- 1. the server is there ---------- */

console.log('  Reachable\n');
let health;
try {
  health = await call('GET', '/health');
  check('GET /health answers', health.status === 200, `got ${health.status}`);
} catch (err) {
  console.log(`  ${c.bad}Cannot reach ${BASE}${c.off}\n  ${err.message}\n`);
  process.exit(1);
}

/* ---------- 2. a good registration is accepted ---------- */

console.log('\n  POST /app/registration — the happy path\n');

const mobile = uniqueMobile();
const created = await call('POST', '/app/registration', validRegistration(mobile));

check('accepts a valid registration with 201', created.status === 201, `got ${created.status}: ${JSON.stringify(created.body)}`);
check('returns registrationId', !!created.body?.registrationId, JSON.stringify(created.body));
check('returns state "pending"', created.body?.state === 'pending', `got ${created.body?.state}`);
check('accepts the app\'s own field names (address1, state, phone, videoSeconds)',
  created.status === 201, 'if this failed the Flutter app cannot submit at all');

const regId = created.body?.registrationId;

/* ---------- 3. every validation rule ---------- */

console.log('\n  POST /app/registration — rules the server must enforce\n');

for (const [label, patch, field, step] of REJECTIONS) {
  const r = await call('POST', '/app/registration', { ...validRegistration(uniqueMobile()), ...patch });
  const named = r.body?.errors && Object.keys(r.body.errors).includes(field);
  check(
    `refuses: ${label}`,
    r.status === 400 && named,
    r.status !== 400
      ? `expected 400, got ${r.status} — this would be accepted`
      : `expected errors.${field}, got ${JSON.stringify(Object.keys(r.body?.errors || {}))}`,
  );
  if (r.status === 400 && named) {
    check(`  ...and points at step ${step}`, r.body?.step === step, `got step ${r.body?.step}`);
  }
}

/* ---------- 4. the waiting screen ---------- */

console.log('\n  GET /app/registration/status — what the app polls\n');

const status1 = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(mobile)}`);
check('finds the registration by mobile number', status1.status === 200, `got ${status1.status}`);
check('state is "pending"', status1.body?.state === 'pending', `got ${status1.body?.state}`);
check('memberId is null while pending', status1.body?.memberId == null, `got ${status1.body?.memberId}`);
check('carries the office contact', !!status1.body?.office?.phone, JSON.stringify(status1.body?.office));

const missing = await call('GET', '/app/registration/status?mobile=%2B91%2000000%2000000');
check('404s for a number with no registration', missing.status === 404, `got ${missing.status}`);

/* ---------- 5. locked out until approved ---------- */

console.log('\n  POST /app/auth/verify — access is locked until approved\n');

const before = await call('POST', '/app/auth/verify', { mobile, code: '4821' });
check('an unapproved registration gets status "pending"', before.body?.status === 'pending',
  `got "${before.body?.status}" — if this says "member", an unapproved person can use the app`);
check('and is given no usable token', !before.body?.token, 'a token was issued before approval');

const stranger = await call('POST', '/app/auth/verify', { mobile: '+91 00000 00000', code: '4821' });
check('an unknown number gets status "new"', stranger.body?.status === 'new', `got "${stranger.body?.status}"`);

/* ---------- 6. the admin half ---------- */

console.log('\n  Admin — the office decides\n');

let token = process.env.STAFF_TOKEN || '';
if (!token) {
  const ask = await call('POST', '/auth/request-code', { email: STAFF_EMAIL });
  const code = ask.body?.devCode;
  if (code) {
    const verified = await call('POST', '/auth/verify', { email: STAFF_EMAIL, code });
    token = verified.body?.token || '';
  }
}

if (!token) {
  console.log(`  ${c.dim}skipped — no staff session. Set STAFF_TOKEN to test the admin half`);
  console.log(`  against a backend that does not return a code in the response.${c.off}`);
} else {
  const queue = await call('GET', '/data/REGISTRATIONS?state=pending&limit=300', null, token);
  check('the queue lists pending registrations', queue.status === 200 && Array.isArray(queue.body?.rows),
    `got ${queue.status}`);
  check('the new registration is in it', (queue.body?.rows || []).some((r) => r.id === regId),
    `${regId} not found among ${queue.body?.rows?.length} rows`);

  const one = (queue.body?.rows || []).find((r) => r.id === regId);
  if (one) {
    check('the honorific was derived, not taken from the app', one.salutation === 'Mr',
      `expected "Mr" for male+married, got "${one.salutation}"`);
    check('the declaration tick box was stored', one.agreed === true, `got ${one.agreed}`);
    check('the state or province was stored', !!one.region, `got "${one.region}"`);
    check('the language they read was stored', !!one.declarationLang, `got "${one.declarationLang}"`);
  }

  /* return the video, then re-record, then approve */
  const noRemark = await call('POST', `/registrations/${regId}/return-video`, {}, token);
  check('returning the video without a reason is refused', noRemark.status === 400,
    `got ${noRemark.status} — the member must be told why`);

  const returned = await call('POST', `/registrations/${regId}/return-video`,
    { remark: 'Too dark to match your photograph. Please record it again in daylight.' }, token);
  check('the video can be returned with a reason', returned.status === 200, `got ${returned.status}`);

  const afterReturn = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(mobile)}`);
  check('the app sees state "videoReturned"', afterReturn.body?.state === 'videoReturned',
    `got "${afterReturn.body?.state}"`);
  check('and the reason reaches the member', /daylight/.test(afterReturn.body?.remark || ''),
    `got "${afterReturn.body?.remark}"`);

  const short = await call('POST', '/app/registration/video', { id: regId, videoSeconds: 3 });
  check('a re-recorded video under 10 seconds is refused', short.status === 400, `got ${short.status}`);

  const redone = await call('POST', '/app/registration/video', { id: regId, videoSeconds: 20, videoPath: 'kyc-2.mp4' });
  check('a good re-recording is accepted', redone.status === 200, `got ${redone.status}`);
  check('and it goes back to "pending"', redone.body?.state === 'pending', `got "${redone.body?.state}"`);

  const approved = await call('POST', `/registrations/${regId}/approve`, { loc: 'Thane' }, token);
  check('the office can approve', approved.status === 200, `got ${approved.status}: ${JSON.stringify(approved.body)}`);
  check('approving creates a member record', !!approved.body?.member?.id, JSON.stringify(approved.body));

  const twice = await call('POST', `/registrations/${regId}/approve`, { loc: 'Thane' }, token);
  check('approving twice is refused with 409', twice.status === 409, `got ${twice.status}`);

  /* ---------- 7. the loop closes ---------- */

  console.log('\n  The loop closes — the app finds out\n');

  const afterApprove = await call('GET', `/app/registration/status?mobile=${encodeURIComponent(mobile)}`);
  check('the app sees state "approved"', afterApprove.body?.state === 'approved', `got "${afterApprove.body?.state}"`);
  check('and is given the member id', !!afterApprove.body?.memberId, `got ${afterApprove.body?.memberId}`);

  const signIn = await call('POST', '/app/auth/verify', { mobile, code: '4821' });
  check('the member can now sign in', signIn.body?.status === 'member', `got "${signIn.body?.status}"`);
  check('and gets a token', !!signIn.body?.token, 'no token issued after approval');
  check('and their name comes back', !!signIn.body?.member?.name, JSON.stringify(signIn.body?.member));

  /* ---------- 8. permissions ---------- */

  console.log('\n  Permissions — the API refuses what the console hides\n');

  const noAuth = await call('GET', '/data/REGISTRATIONS');
  check('no session gets 401', noAuth.status === 401, `got ${noAuth.status}`);

  const contentEditor = process.env.CONTENT_EMAIL || 'rohan.pawar@karunasadan.org';
  const ask2 = await call('POST', '/auth/request-code', { email: contentEditor });
  if (ask2.body?.devCode) {
    const v2 = await call('POST', '/auth/verify', { email: contentEditor, code: ask2.body.devCode });
    const t2 = v2.body?.token;
    const refused = await call('POST', `/registrations/${regId}/approve`, {}, t2);
    check('a content editor cannot approve a registration', refused.status === 403,
      `got ${refused.status} — any signed-in staff member could approve`);
  } else {
    console.log(`  ${c.dim}skipped — could not sign in as a second role${c.off}`);
  }
}

/* ---------- result ---------- */

console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.log('  Not yet matching the contract:\n');
  for (const f of failures) console.log(`   - ${f.name}${f.detail ? `\n     ${c.dim}${f.detail}${c.off}` : ''}`);
  console.log('\n  See docs/API-CONTRACT.md. The reference implementation is server/.\n');
  process.exit(1);
}
console.log(`  ${c.ok}This backend matches the contract.${c.off}\n`);
