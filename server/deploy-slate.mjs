/* Deploy the console to Catalyst Slate.

     npm run deploy:slate

   Slate hosts the pages (the Node API stays on Render). This sends what is COMMITTED
   (`git archive HEAD`), not what is on disk, so a half-finished edit never goes live and
   the build is the same one anyone could reproduce. Slate builds it: `npm run build`,
   output /dist, with .env.production supplying the API address.

   It works in a temporary folder, so the repository gets no Catalyst files. It needs the
   Catalyst CLI signed in to the account that owns the project (`catalyst whoami`).

   The project and organisation the site lives in are below; override with
   SLATE_PROJECT_ID / SLATE_ORG_ID / SLATE_APP_NAME. After the first deploy the site's
   address is printed; it must be in ALLOWED_ORIGINS on the API (render.yaml). */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = process.env.SLATE_PROJECT_ID || '100596000000023003'; /* noah */
const ORG = process.env.SLATE_ORG_ID || '60093443705';
/* `npm run deploy:slate -- --test` deploys the TEST site (karuna-admin-test), built to talk to the test
   API (karuna-api-test, on the Development data) instead of the live one. TEST_API_BASE overrides its address. */
const test = process.argv.includes('--test');
const NAME = process.env.SLATE_APP_NAME || (test ? 'karuna-admin-test' : 'karuna-admin');
const TEST_API = process.env.TEST_API_BASE || 'https://karuna-api-test-50047381961.development.catalystappsail.in';
const DC = process.env.SLATE_DC || 'in';

const say = (s) => console.log(`\n  ${s}`);
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\n  FAILED: ${cmd}\n`); process.exit(r.status || 1); }
};

console.log('\nDeploy the console to Catalyst Slate\n' + '─'.repeat(64));

/* Only committed work goes out. Say so if there is more on disk. */
const dirty = execSync('git status --porcelain', { cwd: root }).toString().trim();
if (dirty) {
  console.log('\n  Uncommitted changes are NOT deployed (only the last commit is):');
  console.log(dirty.split('\n').slice(0, 8).map((l) => '    ' + l).join('\n'));
}
const head = execSync('git log --oneline -1', { cwd: root }).toString().trim();
say(`Deploying: ${head}`);

const work = mkdtempSync(join(tmpdir(), 'slate-'));
try {
  const app = join(work, 'console');
  mkdirSync(app);
  execSync(`git archive HEAD | tar -x -C "${app}"`, { cwd: root, shell: true });

  /* The test site is the same build pointed at the test API: only the copy being deployed changes. */
  if (test) {
    const envProd = join(app, '.env.production');
    const text = readFileSync(envProd, 'utf8');
    if (!/^VITE_API_BASE=.*$/m.test(text)) { console.error('\n  .env.production has no VITE_API_BASE line.\n'); process.exit(1); }
    writeFileSync(envProd, text.replace(/^VITE_API_BASE=.*$/m, `VITE_API_BASE=${TEST_API}`));
    say(`TEST site ${NAME}, talking to ${TEST_API}`);
  }

  say(`Project ${PROJECT}, organisation ${ORG}`);
  run(`catalyst init --project ${PROJECT} --org ${ORG} --dc ${DC} -ni`, work);
  run(`catalyst slate:link --name ${NAME} --framework React --source console -ni`, work);
  run(`catalyst deploy slate ${NAME} -ni`, work);
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('\n  Done. The address is printed above ("App Url").\n');
