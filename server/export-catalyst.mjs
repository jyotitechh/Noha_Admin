/* Pull everything out of the connected Catalyst project.

     node server/export-catalyst.mjs

   Writes to export/:
     catalyst-export.json   every table, every row, raw
     registrations.json     the five registration tables joined up
     REPORT.md              a readable summary
     files/                 the uploads, when the token may download them

   Downloading files needs a File Store scope that a self client is not
   granted by default. Without it the file metadata is still exported and the
   report says which scope is missing. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRows, configured, PROJECT_ID, ORG_ID } from './catalyst.js';
import { NOAH_TABLES, loadRegistrations, loadMembers } from './noah-schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'export');

if (!configured()) {
  console.error('\n  Not connected to Catalyst. Fill in .env.local first.\n');
  process.exit(1);
}

mkdirSync(out, { recursive: true });
mkdirSync(resolve(out, 'files'), { recursive: true });

const log = (s = '') => console.log(s);

log(`\n  Exporting project ${PROJECT_ID} (org ${ORG_ID})\n`);

/* ---------- every table ---------- */

const dump = {};
const counts = [];

for (const [name, id] of Object.entries(NOAH_TABLES)) {
  try {
    const rows = await getRows(id, { max: 5000 });
    dump[name] = rows;
    counts.push({ name, rows: rows.length });
    log(`  ${String(rows.length).padStart(5)}  ${name}`);
  } catch (err) {
    dump[name] = { error: err.message };
    counts.push({ name, rows: null, error: err.message });
    log(`    ERR  ${name}  ${err.message}`);
  }
}

writeFileSync(resolve(out, 'catalyst-export.json'), JSON.stringify(dump, null, 2));

/* ---------- the joined view ---------- */

const registrations = await loadRegistrations();
const members = await loadMembers();
writeFileSync(resolve(out, 'registrations.json'), JSON.stringify({ registrations, members }, null, 2));

/* ---------- the uploads ---------- */

const files = (Array.isArray(dump.files) ? dump.files : []).map((f) => {
  /* remoteSource is JSON: { name, mimeType, purpose }. */
  let meta = {};
  try { meta = typeof f.remoteSource === 'string' ? JSON.parse(f.remoteSource) : (f.remoteSource || {}); } catch { /* not JSON */ }
  return {
    ...f,
    name: meta.name || '',
    mimeType: meta.mimeType || '',
    purpose: meta.purpose || ({ 1: 'photo', 2: 'idProof', 3: 'video' }[f.fileType] || ''),
  };
});
let downloaded = 0;
let downloadError = '';
let folders = [];

/* The Files table records a `catalystFileId` but not which File Store folder
   holds it, and the download URL needs both. So list the folders first and
   try the file in each — there are only a handful, and a wrong folder answers
   404 cheaply. */
try {
  const H = await authHeaders();
  const res = await fetch(`https://api.catalyst.zoho.in/baas/v1/project/${PROJECT_ID}/folder`, { headers: H });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      res.status === 401
        ? 'the token has no File Store scope (OAUTH_SCOPE_MISMATCH)'
        : `listing folders failed: HTTP ${res.status} ${body.slice(0, 80)}`,
    );
  }
  folders = (await res.json())?.data ?? [];
  log(`\n  File Store folders: ${folders.length ? folders.map((f) => `${f.id} ${f.folder_name ?? ''}`).join(', ') : 'none'}`);

  for (const f of files) {
    /* `path` is the File Store id; the row's own ROWID is something else. */
    if (!f.path) continue;
    let got = false;
    for (const folder of folders) {
      const url = `https://api.catalyst.zoho.in/baas/v1/project/${PROJECT_ID}/folder/${folder.id}/file/${f.path}/download`;
      const r = await fetch(url, { headers: H });
      if (!r.ok) continue;
      writeFileSync(resolve(out, 'files', `${f.purpose}-${f.ROWID}-${f.name}`), Buffer.from(await r.arrayBuffer()));
      downloaded++;
      got = true;
      break;
    }
    if (!got) log(`    could not fetch ${f.name} (file ${f.path})`);
  }
} catch (err) {
  downloadError = err.message;
}

async function authHeaders() {
  /* catalyst.js keeps the token private, so mint one the same way. */
  const { readFileSync } = await import('node:fs');
  const env = {};
  for (const line of readFileSync(resolve(here, '..', '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  const u = new URL('https://accounts.zoho.in/oauth/v2/token');
  u.searchParams.set('refresh_token', env.CATALYST_REFRESH_TOKEN);
  u.searchParams.set('client_id', env.CATALYST_CLIENT_ID);
  u.searchParams.set('client_secret', env.CATALYST_CLIENT_SECRET);
  u.searchParams.set('grant_type', 'refresh_token');
  const t = await (await fetch(u, { method: 'POST' })).json();
  return { authorization: 'Zoho-oauthtoken ' + t.access_token, 'CATALYST-ORG': ORG_ID };
}

/* ---------- the report ---------- */

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const row = (cells) => '| ' + cells.map(fmt).join(' | ') + ' |';

const withData = counts.filter((c) => c.rows > 0);
const empty = counts.filter((c) => c.rows === 0);

const report = `# What is in Catalyst

Project \`${PROJECT_ID}\` · org \`${ORG_ID}\` · exported ${new Date().toLocaleString('en-IN')}

**${counts.reduce((n, c) => n + (c.rows || 0), 0)} rows across ${withData.length} of ${counts.length} tables.**

## Tables holding data

| Table | Rows |
|---|---:|
${withData.map((c) => row([c.name, c.rows])).join('\n')}

${empty.length ? `## Empty\n\n${empty.map((c) => c.name).join(' · ')}\n` : ''}
## Registrations

${registrations.length} registration records, joined across \`appRegistrations\`,
\`members\`, \`membersExtra\` and \`files\`.

| Status | Name | Mobile | City | ID | Video | Declaration |
|---|---|---|---|---|---|---|
${registrations
  .map((r) =>
    row([
      r.rawStatus,
      r.fullName,
      r.mobile,
      r.city,
      r.idType ? `${r.idType} ${r.idNumber}` : '',
      r.videoSecs ? `${r.videoSecs}s` : '',
      r.agreed ? `signed "${r.signature}" (${r.declarationLang})` : 'not accepted',
    ]),
  )
  .join('\n')}

## Members

| Mobile | Name | City | Date of birth | Joined |
|---|---|---|---|---|
${members
  .map((m) => row([m.mobile, m.name, m.loc, m.age ? `${m.age} years` : '', m.joined ? m.joined.toLocaleDateString('en-IN') : '']))
  .join('\n')}

## Uploads

${files.length} file records.

| Purpose | Name | Type | Size | File Store id | Owner (members.ROWID) |
|---|---|---|---|---|---|
${files
  .map((f) => row([f.purpose, f.name, f.mimeType, `${f.size} bytes`, f.path, f.uid]))
  .join('\n')}

${
  downloaded
    ? `\nDownloaded ${downloaded} of ${files.length} into \`export/files/\`.\n`
    : `\n**The files themselves were not downloaded.** ${downloadError ? `The attempt failed with: \`${downloadError}\`.` : ''}

A self client is not granted a File Store scope by default. To pull the actual
ID scans, photographs and KYC videos, generate a new code with the file scopes
added to the existing list, then run this again.
`
}
## Sign-in activity

${Array.isArray(dump.users) ? dump.users.length : 0} login rows (\`users\`), ${Array.isArray(dump.userTokens) ? dump.userTokens.length : 0} sign-in tokens (\`userTokens\`).

One-time codes live on \`users\` (\`otp\`, \`otpTime\`, \`otpAttempts\`). They are in
\`catalyst-export.json\` and deliberately not repeated here.

---

Raw data: \`catalyst-export.json\` · joined view: \`registrations.json\`
`;

writeFileSync(resolve(out, 'REPORT.md'), report);

log(`\n  Wrote export/catalyst-export.json, registrations.json and REPORT.md`);
if (downloaded) log(`  Downloaded ${downloaded} files into export/files/`);
else log(`  Files not downloaded${downloadError ? ` — ${downloadError}` : ''}`);
log();
