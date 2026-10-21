/* Does approving in the console actually let that person into the app?

     node server/test-approval-loop.mjs

   Picks one registration that is waiting, checks the app refuses them,
   approves it the way the console does, then checks the app lets them in —
   the same person throughout, which is the bit that is easy to get wrong
   when testing by hand. */

const BASE = (process.argv[2] || 'http://localhost:4000') + '/api';
const STAFF = process.env.STAFF_MOBILE || '+91 9000000001'; /* the test super administrator */

const j = async (res) => {
  const t = await res.text();
  try { return t ? JSON.parse(t) : {}; } catch { return { raw: t.slice(0, 200) }; }
};
const post = (p, body, token) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body ?? {}),
  }).then(j);
const get = (p, token) => fetch(BASE + p, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then(j);

const appSays = async (mobile) => {
  const r = await post('/app/auth/verify', { mobile, code: '4821' });
  return { status: r.status, token: !!r.token, name: r.member?.name, state: r.state };
};

/* --- sign in as the office --- */
const asked = await post('/auth/request-code', { mobile: STAFF });
const signedIn = await post('/auth/verify', { mobile: STAFF, code: asked.devCode });
const token = signedIn.token;
if (!token) { console.error('Could not sign in:', asked, signedIn); process.exit(1); }
console.log(`\n  Signed in as ${signedIn.user.name} (${signedIn.user.roleName})\n`);

/* --- find someone waiting --- */
const queue = await get('/data/REGISTRATIONS?state=pending', token);
const waiting = queue.rows ?? [];
if (!waiting.length) {
  console.log('  Nothing is waiting for a decision. Nothing to test.\n');
  process.exit(0);
}
const reg = waiting[0];
console.log(`  Testing with: ${reg.fullName}  ${reg.mobile}`);
console.log(`  Registration ${reg.id} · their status "${reg.rawStatus}"\n`);

/* --- before --- */
const before = await appSays(reg.mobile);
console.log(`  1. Before approval, the app says: ${before.status}${before.token ? ' + TOKEN' : ' (no token)'}`);
if (before.token) {
  console.log('\n  PROBLEM: they can already get in without being approved.\n');
  process.exit(1);
}

/* --- approve --- */
const approved = await post(`/registrations/${reg.id}/approve`, { loc: 'Thane' }, token);
if (!approved.ok) {
  console.log(`\n  Approval failed: ${approved.error}\n`);
  process.exit(1);
}
console.log(`  2. The office approves it. ${approved.appAccess ?? ''}`);

/* --- after --- */
const after = await appSays(reg.mobile);
console.log(`  3. After approval, the app says: ${after.status}${after.token ? ' + TOKEN' : ' (no token)'}${after.name ? ` — welcome ${after.name}` : ''}`);

/* --- and nobody else moved --- */
const other = waiting[1];
if (other) {
  const stillOut = await appSays(other.mobile);
  console.log(`  4. Someone else still waiting (${other.fullName}): ${stillOut.status}${stillOut.token ? ' + TOKEN' : ' (no token)'}`);
  if (stillOut.token) {
    console.log('\n  PROBLEM: approving one person let another one in.\n');
    process.exit(1);
  }
}

const ok = !before.token && after.token;
console.log(ok
  ? '\n  The loop works: locked out before, in the app after.\n'
  : '\n  The loop is broken: approving did not open the app.\n');
process.exit(ok ? 0 : 1);
