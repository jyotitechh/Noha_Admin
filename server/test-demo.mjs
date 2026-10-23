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
    env: { ...process.env, NODE_ENV: 'production', SESSIONS_FILE: 'off', ...env }, stdio: 'ignore',
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

await withServer({ ADMIN_PASSPHRASE: 'keep-out-1234' }, async () => {
  const meta = await (await fetch(base + '/meta')).json();
  check('without DEMO_MODE there is no demo sign-in', meta.demo === undefined);
  check('...and the passphrase is asked for', meta.passphraseRequired === true);
  const asked = await post('/auth/request-code', { mobile: '+91 90000 00001', passphrase: 'wrong' });
  check('...and 123456 is not a way in', asked.status === 401, String(asked.status));
});

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  All demo checks passed.\n');
process.exit(failed ? 1 : 0);
