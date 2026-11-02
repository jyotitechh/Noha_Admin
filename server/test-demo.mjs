/* Demo mode: a fixed code, no passphrase, sample data only, and off unless asked for.
   Starts the real server twice on its own port (never 4000) and talks to it. */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 4311;
const base = `http://localhost:${PORT}/api`;
let failed = 0;
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : '   ' + detail}`); };
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function withServer(env, fn) {
  const child = spawn(process.execPath, [join(here, 'index.js'), String(PORT)], {
    /* CATALYST_ENV_FILE points at a file that is not there, so the real .env.local is never read: nothing here can touch Catalyst. */
    env: { ...process.env, NODE_ENV: 'production', SESSIONS_FILE: 'off', CATALYST_ENV_FILE: join(here, 'no-such-env-file'), ...env }, stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await wait(250); }
    await fn();
  } finally { child.kill(); await wait(300); }
}

console.log('\nDemo mode\n' + '─'.repeat(64));

await withServer({
  DEMO_MODE: 'true', ADMIN_PASSPHRASE: 'would-be-asked', CATALYST_PROJECT_ID: '1', CATALYST_ORG_ID: '2',
  CATALYST_CLIENT_ID: '1000.a', CATALYST_CLIENT_SECRET: 'b', CATALYST_REFRESH_TOKEN: '1000.c',
}, async () => {
  const meta = await (await fetch(base + '/meta')).json();
  check('uses the sample data even though Catalyst settings are present', meta.dataSource === 'memory', meta.dataSource);
  check('asks for no passphrase', meta.passphraseRequired === false);
  check('tells the sign-in screen the demo number and code', meta.demo?.code === '123456' && !!meta.demo?.mobile);
  const asked = await post('/auth/request-code', { mobile: meta.demo.mobile });
  check('a code is requested without a passphrase', asked.status === 200 && asked.json.ok, JSON.stringify(asked.json));
  const wrong = await post('/auth/verify', { mobile: meta.demo.mobile, code: '654321' });
  check('a wrong code is refused', wrong.status === 400);
  await post('/auth/request-code', { mobile: meta.demo.mobile });
  const ok = await post('/auth/verify', { mobile: meta.demo.mobile, code: '123456' });
  check('123456 signs in', ok.status === 200 && !!ok.json.token);
});

console.log('\nCode on screen (as on localhost)\n' + '─'.repeat(64));

await withServer({ SHOW_CODE_ON_SCREEN: 'true', ADMIN_PASSPHRASE: 'would-be-asked', ENABLE_TEST_LOGIN: 'true', TEST_LOGIN_OTP: '111111' }, async () => {
  const meta = await (await fetch(base + '/meta')).json();
  check('asks for no passphrase', meta.passphraseRequired === false);
  check('shows no demo code on the sign-in page', meta.demo === undefined);
  const asked = await post('/auth/request-code', { mobile: '+91 90000 00001' });
  const code = asked.json.devCode;
  check('a code is requested and shown on screen', asked.status === 200 && /^\d{6}$/.test(code || ''), JSON.stringify(asked.json));
  const fixed = await post('/auth/verify', { mobile: '+91 90000 00001', code: '111111' });
  check('the fixed test code is NOT accepted', fixed.status === 400 || code === '111111');
  await post('/auth/request-code', { mobile: '+91 90000 00001' }).then((r) => { check('each request gets its own code', !!r.json.devCode); return post('/auth/verify', { mobile: '+91 90000 00001', code: r.json.devCode }); })
    .then((ok) => check('the code shown signs in', ok.status === 200 && !!ok.json.token, JSON.stringify(ok.json)));
});

console.log('\nSigned in, then the server restarts\n' + '─'.repeat(64));

const SIGNED = { SHOW_CODE_ON_SCREEN: 'true', SESSION_SECRET: 'a-long-private-test-secret-that-is-not-real-0123456789' };
const mobile = '+91 90000 00001';
const login = async () => {
  const a = await post('/auth/request-code', { mobile });
  return (await post('/auth/verify', { mobile, code: a.json.devCode })).json.token;
};
const me = (token) => fetch(base + '/auth/me', { headers: { authorization: 'Bearer ' + token } }).then((r) => r.status);

let kept = '';
await withServer(SIGNED, async () => {
  kept = await login();
  check('a signed token is handed out', kept.split('.').length === 3 && (await me(kept)) === 200);
  check('a token that was altered is refused', (await me(kept.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))) === 401);
  const [id, , sig] = kept.split('.');
  const forged = Buffer.from(JSON.stringify({ staffId: 'x', role: 'super', name: 'Forged', expires: Date.now() + 1e9 })).toString('base64url');
  check('a made-up session is refused', (await me(`${id}.${forged}.${sig}`)) === 401);
  const out = await login();
  await fetch(base + '/auth/sign-out', { method: 'POST', headers: { authorization: 'Bearer ' + out } });
  check('signing out ends it at once', (await me(out)) === 401);
});
await withServer(SIGNED, async () => {
  check('after a restart the same token still works (a refresh does not sign you out)', (await me(kept)) === 200);
});

let plain = '';
await withServer({ SHOW_CODE_ON_SCREEN: 'true' }, async () => { plain = await login(); });
await withServer({ SHOW_CODE_ON_SCREEN: 'true' }, async () => {
  check('without SESSION_SECRET a restart does sign people out (why the deployed API sets it)', (await me(plain)) === 401);
});
await withServer({ SHOW_CODE_ON_SCREEN: 'true', SESSION_SECRET: 'a-different-private-test-secret-0123456789-abcdefghijk' }, async () => {
  check('changing the secret signs everyone out', (await me(kept)) === 401);
});

await withServer({ ADMIN_PASSPHRASE: 'keep-out-1234' }, async () => {
  const meta = await (await fetch(base + '/meta')).json();
  check('without DEMO_MODE there is no demo sign-in', meta.demo === undefined);
  check('...and the passphrase is asked for', meta.passphraseRequired === true);
  const asked = await post('/auth/request-code', { mobile: '+91 90000 00001', passphrase: 'wrong' });
  check('...and 123456 is not a way in', asked.status === 401, String(asked.status));
});

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  All demo checks passed.\n');
process.exit(failed ? 1 : 0);
