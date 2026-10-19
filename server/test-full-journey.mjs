/* The whole thing, end to end, against the live Catalyst project.

     node server/test-full-journey.mjs

   1. A new person asks for an OTP and registers in the app
   2. Their data lands in Catalyst
   3. The office sees it in the console queue
   4. The app refuses them while they wait
   5. The office approves
   6. The app lets them in

   Every step is checked, and it uses a fresh phone number each run so it
   never collides with the Catalyst developer's test rows. */

const BASE = (process.argv[2] || 'http://localhost:4000') + '/api';
const STAFF = 'anitha.varghese@karunasadan.org';

const j = async (res) => {
  const t = await res.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { raw: t.slice(0, 300) }; }
};
const post = (p, body, token) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body ?? {}),
  }).then(j);
const get = (p, token) => fetch(BASE + p, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then(j);

let failed = 0;
const step = (n, what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32mok  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}. ${what}`);
  if (detail) console.log(`        \x1b[2m${detail}\x1b[0m`);
  if (!ok) failed++;
};

/* A number nobody has used. */
const tail = String(Date.now()).slice(-8);
const MOBILE = `+9188${tail}`;
const NAME = { firstName: 'Journey', middleName: 'Test', lastName: 'Person' };

console.log(`\n  Full journey · ${MOBILE}\n`);

/* ---------- 1. the app asks for an OTP ---------- */
const otp = await post('/app/auth/request-otp', { mobile: MOBILE });
step(1, 'The app asks for a one-time code', otp.ok === true, `code ${otp.devCode} · expires in ${otp.expiresInSeconds}s`);

/* ---------- 2. brand new number ---------- */
const first = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
step(2, 'A number never seen before is "new"', first.status === 'new', `got "${first.status}"`);

/* ---------- 3. they fill in the six steps ---------- */
const submitted = await post('/app/registration', {
  ...NAME,
  email: 'journey.test@example.com',
  gender: 'male',
  dob: '1995-06-21',
  marital: 'single',
  reference: 'A friend at the Sunday service',
  address1: 'Flat 9, Hill View',
  address2: 'Near the water tank',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  pin: '411006',
  idType: 'pan',
  idNumber: 'ZXCVB9876N',
  idFile: 'id.jpg',
  photoFile: 'me.jpg',
  agreed: true,
  signature: 'Journey Test Person',
  declarationLang: 'en',
  videoSeconds: 22,
  videoPath: 'kyc.mp4',
  phone: MOBILE,
});
step(3, 'They submit the six steps', submitted.ok === true,
  submitted.ok ? `registration ${submitted.registrationId}` : JSON.stringify(submitted.errors ?? submitted));

if (!submitted.ok) { console.log('\n  Stopping: the submission failed.\n'); process.exit(1); }

/* ---------- 4. it is in Catalyst ---------- */
const asked = await post('/auth/request-code', { email: STAFF });
const signedIn = await post('/auth/verify', { email: STAFF, code: asked.devCode });
const token = signedIn.token;

const queue = await get('/data/REGISTRATIONS?state=pending', token);
const mine = (queue.rows ?? []).find((r) => r.mobile.replace(/\D/g, '') === MOBILE.replace(/\D/g, ''));
step(4, 'The office sees it in the queue', !!mine,
  mine ? `${mine.fullName} · ${mine.city} · ${mine.idType} ${mine.idNumber}` : `${queue.rows?.length ?? 0} waiting, none theirs`);

if (mine) {
  const right =
    mine.fullName === 'Journey Test Person' &&
    mine.city === 'Pune' && mine.region === 'Maharashtra' && mine.pin === '411006' &&
    mine.idType === 'PAN' && mine.idNumber === 'ZXCVB9876N' &&
    mine.agreed === true && mine.signature === 'Journey Test Person';
  step(5, 'Every field they typed survived the round trip', right,
    `name "${mine.fullName}" · ${mine.city}, ${mine.region} ${mine.pin} · ${mine.idType} ${mine.idNumber} · signed "${mine.signature}"`);
}

/* ---------- 6. locked out while waiting ---------- */
const whileWaiting = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
step(6, 'The app refuses them while they wait', whileWaiting.status === 'pending' && !whileWaiting.token,
  `"${whileWaiting.status}"${whileWaiting.token ? ' WITH A TOKEN' : ', no token'}`);

/* ---------- 7. the office approves ---------- */
if (mine) {
  const approved = await post(`/registrations/${mine.id}/approve`, { loc: 'Pune' }, token);
  step(7, 'The office approves it', approved.ok === true, approved.ok ? approved.appAccess : approved.error);
}

/* ---------- 8. and the app opens ---------- */
const after = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
step(8, 'The app now lets them in', after.status === 'member' && !!after.token,
  `"${after.status}"${after.member ? ` — welcome ${after.member.name}` : ''}`);

console.log(failed === 0
  ? '\n  \x1b[32mThe whole journey works.\x1b[0m\n'
  : `\n  \x1b[31m${failed} step(s) failed.\x1b[0m\n`);
process.exit(failed === 0 ? 0 : 1);
