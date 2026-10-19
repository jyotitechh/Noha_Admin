/* Does making someone a pastor actually change what the app gives them?

     node server/test-roles.mjs

   Registers a fresh person, approves them, checks the app says "member",
   promotes them to pastor, and checks the app now says so too. Then takes it
   back off again, so the project is left as it was found. */

const BASE = (process.argv[2] || 'http://localhost:4000') + '/api';
const STAFF = 'anitha.varghese@karunasadan.org';

const j = async (r) => { const t = await r.text(); try { return t ? JSON.parse(t) : {}; } catch { return { raw: t.slice(0, 200) }; } };
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify(b ?? {}) }).then(j);
const get = (p, t) => fetch(BASE + p, { headers: t ? { authorization: 'Bearer ' + t } : {} }).then(j);

let bad = 0;
const check = (n, what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32mok  \x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}. ${what}`);
  if (detail) console.log(`        \x1b[2m${detail}\x1b[0m`);
  if (!ok) bad++;
};

const MOBILE = `+9177${String(Date.now()).slice(-8)}`;
console.log(`\n  Roles · ${MOBILE}\n`);

/* --- register and approve --- */
await post('/app/auth/request-otp', { mobile: MOBILE });
await post('/app/registration', {
  firstName: 'Role', lastName: 'Candidate', email: 'role@example.com',
  gender: 'male', dob: '1988-02-14', marital: 'married',
  address1: 'House 3, Church Road', city: 'Thane', state: 'Maharashtra',
  country: 'India', pin: '400601',
  idType: 'pan', idNumber: 'QWERT4321Z', idFile: 'id.jpg', photoFile: 'me.jpg',
  agreed: true, signature: 'Role Candidate', declarationLang: 'en',
  videoSeconds: 19, phone: MOBILE,
});

const asked = await post('/auth/request-code', { email: STAFF });
const me = await post('/auth/verify', { email: STAFF, code: asked.devCode });
const token = me.token;

const queue = await get('/data/REGISTRATIONS?state=pending', token);
const reg = (queue.rows ?? []).find((r) => r.mobile.replace(/\D/g, '') === MOBILE.replace(/\D/g, ''));
if (!reg) { console.log('  Could not find the new registration.\n'); process.exit(1); }

await post(`/registrations/${reg.id}/approve`, { loc: 'Thane' }, token);

/* --- 1. approved, so an ordinary member --- */
const plain = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
check(1, 'Once approved, the app calls them an ordinary member',
  plain.status === 'member' && plain.roles?.length === 1 && plain.roles[0] === 'member' && plain.isPastor === false,
  `roles ${JSON.stringify(plain.roles)} · isPastor ${plain.isPastor}`);

/* --- 2. find them in the roles screen --- */
const people = await get('/app-roles/people', token);
const person = (people.rows ?? []).find((p) => p.mobile.replace(/\D/g, '') === MOBILE.replace(/\D/g, ''));
check(2, 'They appear in People and roles', !!person,
  person ? `${person.name} · roles ${JSON.stringify(person.roles)}` : 'not found');
if (!person) process.exit(1);

/* --- 3. the office makes them a pastor --- */
const promoted = await post(`/app-roles/${person.memberRowId}/pastor`, { on: true }, token);
check(3, 'The office gives them the pastor role', promoted.ok === true && promoted.isPastor === true,
  `roles ${JSON.stringify(promoted.roles)}`);

/* --- 4. the app now sees it --- */
const asPastor = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
check(4, 'The app now gives them pastor access',
  asPastor.isPastor === true && asPastor.roles?.includes('pastor'),
  `roles ${JSON.stringify(asPastor.roles)} · opens ${JSON.stringify(asPastor.features)}`);

/* --- 5. a second role on top --- */
const warrior = await post(`/app-roles/${person.memberRowId}/prayerWarrior`, { on: true }, token);
const both = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
check(5, 'Roles stack rather than replace each other',
  warrior.ok && both.isPastor && both.isPrayerWarrior,
  `roles ${JSON.stringify(both.roles)}`);

/* --- 6. church member cannot be removed --- */
const removeBase = await post(`/app-roles/${person.memberRowId}/member`, { on: false }, token);
check(6, 'Church member cannot be taken away', !!removeBase.error,
  removeBase.error ?? 'it was removed, which it should not be');

/* --- 7. demote, and the app follows --- */
await post(`/app-roles/${person.memberRowId}/pastor`, { on: false }, token);
await post(`/app-roles/${person.memberRowId}/prayerWarrior`, { on: false }, token);
const demoted = await post('/app/auth/verify', { mobile: MOBILE, code: '4821' });
check(7, 'Taking the role away closes it again in the app',
  demoted.isPastor === false && demoted.isPrayerWarrior === false,
  `roles ${JSON.stringify(demoted.roles)}`);

console.log(bad === 0
  ? '\n  \x1b[32mRoles work: given in the console, honoured by the app.\x1b[0m\n'
  : `\n  \x1b[31m${bad} check(s) failed.\x1b[0m\n`);
process.exit(bad === 0 ? 0 : 1);
