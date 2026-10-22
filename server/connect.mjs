/* Connect the console to Catalyst, step by step, on your own machine.

     npm run catalyst:connect

   It asks for the three things a Zoho Self Client gives you, writes them to
   .env.local, exchanges the one-time code for a refresh token, proves the token
   works by listing the project's tables, and then runs the schema check.

   Why a script and not a chat message: the Client Secret and the code are
   secrets. They are typed here, into your own terminal (the secret is not shown
   as you type), and go nowhere except .env.local, which git ignores. Nothing is
   printed back.

   The code from the Self Client lasts at most ten minutes and works once, so
   have the "Generate Code" tab ready, and do not paste it until this asks. */

import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = process.env.CATALYST_ENV_FILE ? resolve(process.env.CATALYST_ENV_FILE) : resolve(here, '..', '.env.local');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
/* Piped input (a test, or a paste): lines arrive all at once, so they are read in
   order from an iterator rather than lost between questions. */
const piped = process.stdin.isTTY ? null : rl[Symbol.asyncIterator]();

/** Leave. Closes the input and waits a moment first: on Windows, exiting while a
    piped stdin is still closing trips a libuv assertion. Never returns. */
async function quit(code) {
  rl.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(code);
}

/** Ask a question. A secret is not echoed back while it is typed. */
function ask(question, { secret = false } = {}) {
  return new Promise((done) => {
    if (secret && process.stdin.isTTY) {
      const out = rl.output;
      const original = rl._writeToOutput;
      rl._writeToOutput = (text) => { if (text.startsWith(question)) original.call(rl, text); else out.write(''); };
      rl.question(question, (answer) => { rl._writeToOutput = original; out.write('\n'); done(answer.trim()); });
    } else if (piped) {
      process.stdout.write(question);
      piped.next().then(({ value }) => { process.stdout.write('\n'); done(String(value ?? '').trim()); });
    } else {
      rl.question(question, (answer) => done(answer.trim()));
    }
  });
}

/** Set KEY=value in .env.local, keeping every other line. */
function setEnv(key, value) {
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  text = re.test(text) ? text.replace(re, () => line) : text.trimEnd() + (text ? '\n' : '') + line + '\n';
  writeFileSync(envPath, text);
}

const current = (key) => {
  if (!existsSync(envPath)) return '';
  const m = readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

const run = (args) => spawnSync(process.execPath, args, {
  cwd: resolve(here, '..'), stdio: 'inherit', env: { ...process.env, CATALYST_ENV_FILE: envPath },
}).status;

console.log(`
${bold('Connect the console to Catalyst')}
${'─'.repeat(64)}
Project ${current('CATALYST_PROJECT_ID') || '(not set)'}, organisation ${current('CATALYST_ORG_ID') || '(not set)'}.
`);

if (!current('CATALYST_PROJECT_ID') || !current('CATALYST_ORG_ID')) {
  console.log(`  ${red('CATALYST_PROJECT_ID or CATALYST_ORG_ID is missing in .env.local.')} Fix that first.\n`);
  await quit(1);
}

console.log(`${bold('Before you start')}: you need a Zoho Self Client with the scopes from
${dim('npm run catalyst:scopes')}. If you have not made one, stop (Ctrl+C) and follow step 2
of docs/CATALYST-SETUP.md.
`);

let id = current('CATALYST_CLIENT_ID');
let secret = current('CATALYST_CLIENT_SECRET');
if (id && secret) {
  const reuse = (await ask(`  .env.local already has a Client ID and Secret. Use them? [Y/n] `)).toLowerCase();
  if (reuse === 'n' || reuse === 'no') { id = ''; secret = ''; }
}
if (!id || !secret) {
  id = await ask('  Client ID (starts 1000.): ');
  secret = await ask('  Client Secret (not shown as you type): ', { secret: true });
  if (!id || !secret) { console.log(`\n  ${red('Both are needed.')}\n`); await quit(1); }
  setEnv('CATALYST_CLIENT_ID', id);
  setEnv('CATALYST_CLIENT_SECRET', secret);
  console.log(`  ${green('Saved')} to .env.local.\n`);
}

console.log(`  Now open the Self Client's ${bold('Generate Code')} tab, paste the scope line, choose the longest
  duration (ten minutes), and create the code. It works once and expires fast.
`);
const code = await ask('  Code (not shown as you type): ', { secret: true });
rl.close();
if (!code) { console.log(`\n  ${red('No code given.')}\n`); await quit(1); }

console.log('\n  Exchanging it for a refresh token…');
const exchanged = run(['server/catalyst.js', '--exchange', code]);
if (exchanged !== 0) {
  console.log(`
  ${red('That did not complete.')} Read what is printed above:
    - "invalid_code": the code expired or was already used. Generate a fresh one and run this again.
    - "NOT granted": Zoho dropped a scope. Tick it by hand in the scope tree, make a new code, run again.
    - a refused client: the Client ID or Secret is wrong; run this again and answer "n" to reuse.
`);
  await quit(1);
}

console.log(`${'─'.repeat(64)}\n  Checking the console can see the project…\n`);
const checked = run(['server/check-schema.mjs']);

console.log(checked === 0
  ? `  ${green('Connected, and the project has everything the console uses.')} Restart npm run dev.\n`
  : `  The token works if you saw a list of tables above. What is missing is shown there.
  See what would be added:   npm run catalyst:columns
  Add it:                    npm run catalyst:columns -- --apply\n`);
await quit(0);
