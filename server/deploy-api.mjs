/* Deploy the API to Catalyst AppSail, so the whole console lives in Catalyst.

     npm run deploy:api                 deploy what is committed
     npm run deploy:api -- --test-login also switch on the test accounts (for trying it out)

   Slate hosts the pages; AppSail runs this Node server. It sends what is COMMITTED
   (`git archive HEAD`: server/, package.json, package-lock.json), bundles it with esbuild
   into a single api.mjs, and writes the server's settings into AppSail's own config.

   SECRETS never appear on screen or in the repository:
     - the Catalyst credentials are read from .env.local and checked first (an empty value, a
       space inside, an id in the secret's row are refused before anything is deployed);
     - the office passphrase is made for you and kept in ~/ksm-passphrase.txt (and reused
       next time, so it does not change on every deploy); with --test-login the test code is
       kept in ~/ksm-test-code.txt. Read them with `cat`. Share the passphrase privately.
   The settings are uploaded to the project that hosts the server (your Catalyst), nowhere else.

   Needs the Catalyst CLI signed in to the account that owns the hosting project
   (`catalyst whoami`). Hosting project: SLATE_PROJECT_ID / SLATE_ORG_ID, as deploy-slate.mjs. */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { credentialProblems, clean } from './catalyst.js';
import { passphraseLooksCopied } from './auth.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = process.env.SLATE_PROJECT_ID || '73626000000028001';
const ORG = process.env.SLATE_ORG_ID || '60088815946';
const NAME = process.env.APPSAIL_NAME || 'karuna-api';
const DC = process.env.SLATE_DC || 'in';
const SITE = process.env.CONSOLE_URL || 'https://karuna-admin-eayoyuuw.onslate.in';
const testLogin = process.argv.includes('--test-login');

const say = (s) => console.log(`\n  ${s}`);
const fail = (s) => { console.error(`\n  ${s}\n`); process.exit(1); };
/* The Catalyst CLI is run WITHOUT this project's own CATALYST_* settings. They name the DATA
   project's organisation (the colleague's), which the CLI would try to use instead of the one
   it is deploying into, and answer 401. */
const cliEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CATALYST_')));
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env: cliEnv() });
  if (r.status !== 0) fail(`FAILED: ${cmd}`);
};

console.log('\nDeploy the API to Catalyst AppSail\n' + '─'.repeat(64));

/* ---------- the settings ---------- */

const envFile = {};
const path = process.env.CATALYST_ENV_FILE || join(root, '.env.local');
if (!existsSync(path)) fail('.env.local is missing: there is nothing to take the Catalyst credentials from.');
for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) envFile[m[1]] = clean(m[2]);
}

const problems = credentialProblems(envFile);
if (problems.length) {
  fail(`Refusing to deploy: the Catalyst credentials in .env.local look wrong:\n    - ${problems.join('\n    - ')}\n  Fix them (npm run catalyst:connect) and run this again.`);
}
for (const k of ['CATALYST_PROJECT_ID', 'CATALYST_ORG_ID']) if (!envFile[k]) fail(`${k} is missing in .env.local.`);

/** A secret kept in a file in your home folder, made if it is not there. Never printed. */
function kept(file, make, ok = () => true) {
  const p = join(homedir(), file);
  if (existsSync(p)) {
    const v = readFileSync(p, 'utf8').trim();
    if (v && ok(v)) return { value: v, path: p, fresh: false };
  }
  const value = make();
  writeFileSync(p, value);
  try { chmodSync(p, 0o600); } catch { /* Windows */ }
  return { value, path: p, fresh: true };
}

const WORDS = ['amber', 'harbor', 'lantern', 'orchid', 'quiet', 'river', 'cedar', 'falcon', 'meadow', 'copper', 'velvet', 'summit', 'willow', 'ember', 'granite', 'saffron'];
const word = () => WORDS[randomInt(WORDS.length)];
const passphrase = kept('ksm-passphrase.txt',
  () => [word(), word(), word(), word(), randomInt(1000, 9999)].join('-'),
  (v) => !passphraseLooksCopied(v) && v.length >= 12);

const settings = {
  NODE_ENV: 'production',
  CATALYST_SCHEMA: envFile.CATALYST_SCHEMA || 'noah',
  CATALYST_ENV: envFile.CATALYST_ENV || 'Development',
  CATALYST_PROJECT_ID: envFile.CATALYST_PROJECT_ID,
  CATALYST_ORG_ID: envFile.CATALYST_ORG_ID,
  CATALYST_CLIENT_ID: envFile.CATALYST_CLIENT_ID,
  CATALYST_CLIENT_SECRET: envFile.CATALYST_CLIENT_SECRET,
  CATALYST_REFRESH_TOKEN: envFile.CATALYST_REFRESH_TOKEN,
  NOAH_API_BASE: envFile.NOAH_API_BASE || '',
  NOAH_ADMIN_API_KEY: envFile.NOAH_ADMIN_API_KEY || '',
  ALLOWED_ORIGINS: SITE,
  ADMIN_PASSPHRASE: passphrase.value,
};
for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMS_PROVIDER', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_MESSAGING_SERVICE_SID', 'CONSOLE_CACHE_SECONDS']) {
  if (envFile[k]) settings[k] = envFile[k];
}
let testCode = null;
if (testLogin) {
  testCode = kept('ksm-test-code.txt', () => String(randomInt(100000, 999999)), (v) => /^\d{6}$/.test(v));
  settings.ENABLE_TEST_LOGIN = 'true';
  settings.TEST_LOGIN_OTP = testCode.value;
}
for (const [k, v] of Object.entries(settings)) if (v === '') delete settings[k];

/* ---------- stage and deploy ---------- */

const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (dirty) console.log('\n  Uncommitted changes are NOT deployed (only the last commit is).');
say(`Deploying: ${execSync('git log --oneline -1', { cwd: root }).toString().trim()}`);

const work = mkdtempSync(join(tmpdir(), 'appsail-'));
try {
  const src = join(work, 'src');
  const api = join(work, 'api');
  mkdirSync(src);
  mkdirSync(api);
  /* An archive file, unpacked from inside the folder: `tar -C <drive path>` misreads "C:" as a host. */
  const tarball = join(work, 'source.tar');
  execSync(`git archive --format=tar -o "${tarball}" HEAD server package.json package-lock.json`, { cwd: root });
  run('tar -xf ../source.tar', src);

  /* The server goes up as ONE file with its dependencies folded in: AppSail then has no
     node_modules to install or find, and starts it the same way it started here. */
  say('Bundling the server into one file…');
  const esbuild = join(root, 'node_modules', '.bin', 'esbuild').replace(/\\/g, '/');
  const banner = "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);";
  const bundled = spawnSync(`"${esbuild}" server/index.js --bundle --platform=node --format=esm --target=node22 --outfile=../api/api.mjs --banner:js="${banner}" --log-level=warning`, {
    cwd: src, shell: true, stdio: 'inherit', env: { ...cliEnv(), NODE_PATH: join(root, 'node_modules') },
  });
  if (bundled.status !== 0) fail('FAILED: bundling the server (run npm install first).');
  writeFileSync(join(api, 'package.json'), JSON.stringify({ name: NAME, private: true, type: 'module' }, null, 2));
  const COMMAND = 'node api.mjs 9000';

  say(`Project ${PROJECT}, organisation ${ORG}`);
  run(`catalyst init --project ${PROJECT} --org ${ORG} --dc ${DC} -ni`, work);
  run(`catalyst appsail:add --name ${NAME} --stack node22 --source "${api.replace(/\\/g, '/')}" --command "${COMMAND}" -ni`, work);

  /* AppSail takes its settings from app-config.json. Written AFTER appsail:add, which makes it. */
  writeFileSync(join(api, 'app-config.json'), JSON.stringify({
    command: COMMAND, build_path: './', stack: 'node22', env_variables: settings, memory: 256, scripts: {},
  }, null, 2));

  run(`catalyst deploy appsail --name ${NAME} --build-path ./ --stack node22 --command "${COMMAND}" -ni`, work);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`
  Deployed. The address is printed above.

  The office passphrase is in:   ${passphrase.path}${passphrase.fresh ? '   (new)' : ''}
${testCode ? `  The test sign-in code is in:   ${testCode.path}${testCode.fresh ? '   (new)' : ''}\n` : ''}  Read a file with:  cat <that path>   Nothing was printed here.
`);
