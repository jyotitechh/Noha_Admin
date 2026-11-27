/* Nothing reaches the live console that was not tried on the test console first.

     1. Work on the `develop` branch. `npm run deploy:test` puts it on the TEST console
        (karuna-admin-test, Development data). Try it there.
     2. When it is approved: merge develop into main, then `npm run deploy:live`.

   The live deploys (API and site) call `requireTested` below, which refuses unless
     - the branch is `main`, and
     - the commit being deployed is exactly the one the test API is running (its /api/health
       says which: deploy-api.mjs stamps every deploy with BUILD_COMMIT).
   A merge that only fast-forwards main keeps the same commit, so a tested commit passes as it is.
   Anything changed after testing is a new commit, and has to go to the test console first. */

import { execSync } from 'node:child_process';
import { get } from 'node:https';

/* One GET, connection closed after: with fetch's kept-alive socket, exiting straight after crashes Node on Windows. */
const getText = (url) => new Promise((resolve, reject) => {
  const req = get(url, { headers: { connection: 'close' }, timeout: 20000 }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve(body));
  });
  req.on('timeout', () => req.destroy(new Error('no answer in 20 seconds')));
  req.on('error', reject);
});

export const TEST_API = process.env.TEST_API_BASE || 'https://karuna-api-test-50047381961.development.catalystappsail.in';
export const LIVE_BRANCH = 'main';

const git = (cmd, cwd) => execSync(`git ${cmd}`, { cwd }).toString().trim();

/** The commit HEAD points at, in full. */
export const headCommit = (root) => git('rev-parse HEAD', root);

/** Stop (exit 1) unless HEAD is on main and is what the test console is running. */
export async function requireTested(root, what = 'the live console') {
  const stop = (msg) => { console.error(`\n  NOT DEPLOYED to ${what}.\n  ${msg}\n`); process.exit(1); };

  const branch = git('rev-parse --abbrev-ref HEAD', root);
  if (branch !== LIVE_BRANCH) {
    stop(`The live console is deployed from the "${LIVE_BRANCH}" branch only; this is "${branch}".\n  When the change is approved on the test console: git checkout ${LIVE_BRANCH} && git merge --ff-only develop`);
  }

  const head = headCommit(root);
  let tested = null;
  try {
    tested = JSON.parse(await getText(`${TEST_API}/api/health`))?.release || null;
  } catch (err) {
    stop(`Could not ask the test console which version it is running (${err.message}). Try again in a minute.`);
  }
  if (!tested) {
    stop('The test console does not say which version it runs yet. Deploy to it first: npm run deploy:test');
  }
  if (tested !== head) {
    const short = (s) => s.slice(0, 7);
    stop(`This commit (${short(head)}) has not been tried on the test console, which runs ${short(tested)}.\n  Deploy it there first (npm run deploy:test from develop), check it, then merge and deploy live.`);
  }
  console.log(`\n  Tested: the test console runs this commit (${head.slice(0, 7)}). Going live.`);
}
