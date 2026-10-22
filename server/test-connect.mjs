/* The guided connection (npm run catalyst:connect), end to end, with Zoho and
   Catalyst replaced by a tiny server on this machine.

     npm run test:connect

   It runs the real script as a child process, feeding it a Client ID, a secret
   and a code the way a person would type them, with .env.local replaced by a
   temporary file so nothing real is touched. */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 4021;

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  \x1b[32mok\x1b[0m    ${name}`); }
  else { fails.push(name); console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `\n        \x1b[2m${detail}\x1b[0m` : ''}`); }
};
console.log('\nThe guided connection, offline\n' + '─'.repeat(64) + '\n');

const SECRET = 'sekrit-client-secret-value';
const GOOD_CODE = '1000.goodcode.abcdef';
const REFRESH = '1000.refreshtoken123456.zzzzzzzzzzzz';
const seen = [];
let dropScope = null;   /* a scope the fake Zoho will silently leave out */

const { SCOPES } = await import('./catalyst.js');

/* Zoho's token endpoint and Catalyst's REST API, as far as the script uses them. */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  seen.push(`${req.method} ${url.pathname}`);
  const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

  if (url.pathname === '/oauth/v2/token') {
    const q = url.searchParams;
    if (q.get('grant_type') === 'authorization_code') {
      if (q.get('client_secret') !== SECRET) return json(400, { error: 'invalid_client' });
      if (q.get('code') !== GOOD_CODE) return json(400, { error: 'invalid_code' });
      /* Zoho silently drops a scope when told to: the test asks for that. */
      const scope = (dropScope ? SCOPES.filter((s) => s !== dropScope) : SCOPES).join(',');
      return json(200, { access_token: 'at', refresh_token: REFRESH, scope, expires_in: 3600 });
    }
    if (q.get('grant_type') === 'refresh_token') {
      return q.get('refresh_token') === REFRESH ? json(200, { access_token: 'at', expires_in: 3600 }) : json(400, { error: 'invalid_token' });
    }
  }
  if (url.pathname.endsWith('/table')) return json(200, '{"status":"success","data":[{"table_name":"members","table_id":73626000000075359},{"table_name":"users","table_id":73626000000075001}]}');
  if (/\/column$/.test(url.pathname)) return json(200, { status: 'success', data: [{ column_name: 'ROWID', data_type: 'bigint' }] });
  return json(404, { status: 'failure', message: 'unexpected ' + url.pathname });
});
await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));

/** Run the script, typing `lines` at it. */
function connect(lines, envExtra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'connect-'));
  const file = join(dir, '.env.local');
  writeFileSync(file, 'CATALYST_PROJECT_ID=73626000000028001\nCATALYST_ORG_ID=60088815946\nCATALYST_SCHEMA=noah\nNOAH_ADMIN_API_KEY=keep-me\n');
  return new Promise((done) => {
    const child = spawn(process.execPath, ['server/connect.mjs'], {
      cwd: resolve(here, '..'),
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CATALYST_ENV_FILE: file,
        CATALYST_ACCOUNTS_HOST: `http://127.0.0.1:${PORT}`, CATALYST_API_HOST: `http://127.0.0.1:${PORT}`,
        ...envExtra,
      },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => { const env = readFileSync(file, 'utf8'); rmSync(dir, { recursive: true, force: true }); done({ code, out, env }); });
    child.stdin.end(lines.join('\n') + '\n');
  });
}

/* ---------- the good path ---------- */
const ok = await connect(['1000.CLIENTID', SECRET, GOOD_CODE]);
check('it connects with a Client ID, a secret and a code', ok.out.includes('Saved') && /Saved to \.env\.local/.test(ok.out), ok.out.slice(-400));
check('...the Client ID and Secret are written to .env.local', /^CATALYST_CLIENT_ID=1000\.CLIENTID$/m.test(ok.env) && new RegExp(`^CATALYST_CLIENT_SECRET=${SECRET}$`, 'm').test(ok.env), ok.env);
check('...and the refresh token it was given', new RegExp(`^CATALYST_REFRESH_TOKEN=${REFRESH.replace(/\./g, '\\.')}$`, 'm').test(ok.env), ok.env);
check('...without touching the project ids or the Noah key already there', /CATALYST_PROJECT_ID=73626000000028001/.test(ok.env) && /CATALYST_ORG_ID=60088815946/.test(ok.env) && /NOAH_ADMIN_API_KEY=keep-me/.test(ok.env));
check('...it reads back which scopes were granted', /Granted:/.test(ok.out) && /Everything asked for was granted/.test(ok.out), ok.out.slice(-600));
check('...then proves the token by looking at the project', /members/.test(ok.out) && seen.some((s) => s.endsWith('/table')), seen.join(' | '));
check('...and never prints the secret or the code back', !ok.out.includes(SECRET) && !ok.out.includes(GOOD_CODE), 'the secret or code was echoed');
check('...nor the whole refresh token', !ok.out.includes(REFRESH));

/* ---------- a wrong code ---------- */
const bad = await connect(['1000.CLIENTID', SECRET, '1000.expired.code']);
check('an expired or reused code fails, and says what to do', bad.code === 1 && /did not complete/.test(bad.out) && /invalid_code/.test(bad.out) && /fresh one/.test(bad.out), bad.out.slice(-500));
check('...leaving no refresh token behind', !/CATALYST_REFRESH_TOKEN=1000/.test(bad.env));

/* ---------- a wrong secret ---------- */
const wrong = await connect(['1000.CLIENTID', 'not-the-secret', GOOD_CODE]);
check('a wrong Client Secret fails, and points at it', wrong.code === 1 && /invalid_client/.test(wrong.out) && /Client ID or Secret is wrong/.test(wrong.out), wrong.out.slice(-500));

/* ---------- Zoho drops a scope ---------- */
dropScope = 'ZohoCatalyst.tables.columns.ALL';
const dropped = await connect(['1000.CLIENTID', SECRET, GOOD_CODE]);
dropScope = null;
check('a scope Zoho silently dropped is named, and the script does not say it is connected',
  dropped.code === 1 && /NOT granted/.test(dropped.out) && /tables\.columns\.ALL/.test(dropped.out) && !/Connected, and the project/.test(dropped.out), dropped.out.slice(-600));

/* ---------- nothing typed ---------- */
const empty = await connect(['', '']);
check('an empty answer is refused', empty.code === 1 && /Both are needed/.test(empty.out), empty.out.slice(-200));

server.close();
console.log('\n' + '─'.repeat(64));
if (fails.length) { console.log(`\n  \x1b[31m${fails.length} failed\x1b[0m, ${pass} passed:\n${fails.map((f) => '   - ' + f).join('\n')}\n`); process.exit(1); }
console.log(`\n  \x1b[32mAll ${pass} checks passed.\x1b[0m\n`);
