/* Talking to Zoho Catalyst from this server.

   The console calls this server; this server calls Catalyst's Data Store over
   its REST API. Nothing in src/ knows Catalyst exists.

   ──────────────────────────────────────────────────────────────────────────
   SET-UP, once. Four values go in .env.local at the project root:

     CATALYST_PROJECT_ID=<the new project id>
     CATALYST_ORG_ID=<your org id>
     CATALYST_REFRESH_TOKEN=1000.xxxx
     CATALYST_CLIENT_ID=1000.XXXX
     CATALYST_CLIENT_SECRET=xxxx

   To get the last three:

     1. Go to https://api-console.zoho.in/ and create a **Self Client**.
     2. Generate a code with the scopes `node server/catalyst.js --scopes`
        prints. Pick a long duration; you exchange it once.
     3. Exchange the code for a refresh token:
          node server/catalyst.js --exchange <code>
        It writes straight into .env.local and then reads back which scopes
        were actually granted — the console accepts an unrecognised scope and
        silently drops it, so asking is not the same as having.

   The data centre is India (.in). For another DC change ACCOUNTS and API.
   ────────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/* A very small .env reader, so there is no dependency for five values. */
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(here, '..', file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const ACCOUNTS = process.env.CATALYST_ACCOUNTS_HOST || 'https://accounts.zoho.in';
const API = process.env.CATALYST_API_HOST || 'https://api.catalyst.zoho.in';

export const PROJECT_ID = process.env.CATALYST_PROJECT_ID || '';
export const ORG_ID = process.env.CATALYST_ORG_ID || '';

/* What the console needs from Catalyst.

   The two File Store scopes are what make the members' photographs, ID proofs
   and KYC videos readable. Without them every File Store route answers
   OAUTH_SCOPE_MISMATCH — the folder id does not help, because the refusal is
   about the token, not about finding the folder.

   Read-only on files and folders: the console shows uploads, it never writes
   or deletes them. */
export const SCOPES = [
  'ZohoCatalyst.tables.READ',
  'ZohoCatalyst.tables.rows.CREATE',
  'ZohoCatalyst.tables.rows.READ',
  'ZohoCatalyst.tables.rows.UPDATE',
  'ZohoCatalyst.tables.rows.DELETE',
  'ZohoCatalyst.folders.READ',
  'ZohoCatalyst.files.READ',
];

/* The File Store folder the uploads live in. Listing folders needs
   `folders.READ`; going straight to a known folder needs only `files.READ`.
   Knowing the id means one missing scope need not stop the other working. */
export const FILE_FOLDER_ID = process.env.CATALYST_FILE_FOLDER_ID || '';

/** True when there is enough configuration to try. */
export const configured = () =>
  !!(PROJECT_ID && ORG_ID && process.env.CATALYST_REFRESH_TOKEN &&
     process.env.CATALYST_CLIENT_ID && process.env.CATALYST_CLIENT_SECRET);

/* ---------- access token ----------
   Refresh tokens do not expire; access tokens last an hour. Cache one and
   renew a minute early rather than asking on every call. */

let token = null;
let tokenExpires = 0;

export async function accessToken() {
  if (token && Date.now() < tokenExpires - 60_000) return token;

  const url = new URL(ACCOUNTS + '/oauth/v2/token');
  url.searchParams.set('refresh_token', process.env.CATALYST_REFRESH_TOKEN);
  url.searchParams.set('client_id', process.env.CATALYST_CLIENT_ID);
  url.searchParams.set('client_secret', process.env.CATALYST_CLIENT_SECRET);
  url.searchParams.set('grant_type', 'refresh_token');

  const res = await fetch(url, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Catalyst would not issue an access token (${res.status}). ` +
      `${body.error || JSON.stringify(body).slice(0, 200)}. Check CATALYST_* in .env.local.`,
    );
  }
  token = body.access_token;
  tokenExpires = Date.now() + (Number(body.expires_in) || 3600) * 1000;
  return token;
}

/** Like `call`, but returns the whole envelope, so pagination tokens survive. */
async function callRaw(path, init = {}) {
  const at = await accessToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: 'Zoho-oauthtoken ' + at,
      'CATALYST-ORG': ORG_ID,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok || body?.status === 'failure') {
    throw new Error(`Catalyst: ${body?.data?.message || body?.message || `HTTP ${res.status}`}`);
  }
  return body;
}

async function call(path, init = {}) {
  const at = await accessToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      authorization: 'Zoho-oauthtoken ' + at,
      'CATALYST-ORG': ORG_ID,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }

  if (!res.ok || body?.status === 'failure') {
    const message = body?.data?.message || body?.message || `HTTP ${res.status}`;
    throw new Error(`Catalyst: ${message}`);
  }
  return body?.data ?? body;
}

/* ---------- the three things we do ---------- */

/* ZCQL is NOT used.

   A self client cannot be granted a ZCQL scope — the API console drops
   `ZohoCatalyst.zcql.EXECUTE` as invalid, and the endpoint then answers
   OAUTH_SCOPE_MISMATCH. ZCQL appears to be reachable only from inside a
   Catalyst function, through the SDK.

   So everything goes through the rows API, which the self client can reach,
   and filtering happens in Node. That is fine for hundreds of rows and wrong
   for tens of thousands: when this moves into Catalyst functions, the
   filtering should move into ZCQL there. See getRows below. */

/** Every row in a table, following the cursor until it runs out. */
export async function getRows(tableId, { max = 2000 } = {}) {
  const out = [];
  let next = '';
  /* The rows API pages with ?max_rows= and a next_token cursor. The token
     lives in the envelope beside `data`, which `call` throws away, so this
     one reads the envelope itself. */
  do {
    const qs = new URLSearchParams({ max_rows: '200' });
    if (next) qs.set('next_token', next);
    const envelope = await callRaw(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row?${qs}`);
    const rows = Array.isArray(envelope?.data) ? envelope.data : [];
    out.push(...rows);
    next = envelope?.more_records ? envelope?.next_token || '' : '';
  } while (next && out.length < max);
  return out;
}

/** One row by its ROWID. */
export const getRow = (tableId, rowId) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row/${rowId}`);

/** Every table in the project as `{ name, id }`, ids as strings.

    The table list sends `table_id` as a bare number, and a Catalyst id is past
    Number.MAX_SAFE_INTEGER, so JSON.parse would round it — the same trap as an
    unquoted ROWID on insert. The ids are quoted in the raw text first. Used to
    check that the ids in noah-schema.js still point at the tables they name:
    the schema has already been rebuilt once, and a dead id fails with an error
    that does not say so. */
export async function listTables() {
  const at = await accessToken();
  const res = await fetch(`${API}/baas/v1/project/${PROJECT_ID}/table`, {
    headers: { authorization: 'Zoho-oauthtoken ' + at, 'CATALYST-ORG': ORG_ID },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Catalyst: could not list tables (HTTP ${res.status}).`);
  const body = JSON.parse(text.replace(/("table_id"\s*:\s*)(\d{15,})/g, '$1"$2"'));
  return (body.data || []).map((t) => ({ name: t.table_name, id: String(t.table_id) }));
}

/* ---------- File Store ----------

   The Files table records a `catalystFileId` but not which folder holds it,
   and the download URL needs both. So the folders are listed once and cached,
   and a file is looked for across them.

   This needs a File Store scope. A self client granted only the table scopes
   gets OAUTH_SCOPE_MISMATCH here, which `fileScopeMissing` reports so the
   console can say so rather than showing a broken player. */

let folderCache = null;
let folderError = '';

export const fileScopeMissing = () => folderError;

export async function listFolders() {
  if (folderCache) return folderCache;
  try {
    const data = await call(`/baas/v1/project/${PROJECT_ID}/folder`);
    folderCache = Array.isArray(data) ? data : [];
    folderError = '';
    return folderCache;
  } catch (err) {
    folderError = /scope/i.test(err.message)
      ? 'The Catalyst token has no File Store scope, so uploads cannot be read.'
      : err.message;
    throw new Error(folderError);
  }
}

/**
 * Fetch one file's bytes.
 * Returns { buffer, contentType } or throws with a readable reason.
 */
export async function downloadFile(fileId) {
  const at = await accessToken();

  const tryFolder = async (folderId) => {
    const res = await fetch(
      `${API}/baas/v1/project/${PROJECT_ID}/folder/${folderId}/file/${fileId}/download`,
      { headers: { authorization: 'Zoho-oauthtoken ' + at, 'CATALYST-ORG': ORG_ID } },
    );
    if (res.ok) {
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || 'application/octet-stream',
      };
    }
    /* A scope refusal is about the token, so trying more folders is pointless
       and would just repeat the same 401 once per folder. */
    if (res.status === 401) {
      const body = await res.text();
      if (/OAUTH_SCOPE_MISMATCH/i.test(body)) {
        folderError = 'The Catalyst token has no File Store scope, so uploads cannot be read.';
        throw new Error(folderError);
      }
    }
    return null;
  };

  /* Straight to the known folder first: that needs `files.READ` alone, where
     listing folders also needs `folders.READ`. */
  if (FILE_FOLDER_ID) {
    const hit = await tryFolder(FILE_FOLDER_ID);
    if (hit) return hit;
  }

  const folders = await listFolders();
  if (!folders.length) throw new Error('There are no File Store folders in this project.');

  for (const folder of folders) {
    if (String(folder.id) === String(FILE_FOLDER_ID)) continue; /* already tried */
    const hit = await tryFolder(folder.id);
    if (hit) return hit;
  }
  throw new Error(`File ${fileId} was not found in any folder.`);
}

/** Insert rows into a table. */
export const insert = (tableId, rows) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row`, {
    method: 'POST',
    body: JSON.stringify([].concat(rows)),
  });

/** Update rows. Each must carry its ROWID.
    Catalyst uses PUT here; PATCH is refused with
    "The http request method type is not a valid one". */
export const update = (tableId, rows) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row`, {
    method: 'PUT',
    body: JSON.stringify([].concat(rows)),
  });

/** Delete rows by ROWID. Needs ZohoCatalyst.tables.rows.DELETE, which the
    console's token already carries. Ids stay strings: they are past
    Number.MAX_SAFE_INTEGER. */
export const remove = (tableId, rowIds) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row?ids=${[].concat(rowIds).map(String).join(',')}`, {
    method: 'DELETE',
  });

/** Escape a value for ZCQL. Single quotes are doubled, as in SQL. */
export const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

/** Does the configuration actually work? Used at boot and by /api/health. */
export async function check(staffTableId) {
  const rows = await call(`/baas/v1/project/${PROJECT_ID}/table/${staffTableId}/row?max_rows=1`);
  return { ok: true, projectId: PROJECT_ID, sampleRows: (rows || []).length };
}

/* ---------- one-off: exchange an authorisation code ---------- */

if (process.argv[2] === '--exchange') {
  const code = process.argv[3];
  if (!code) {
    console.error('Usage: node server/catalyst.js --exchange <code from the self client>');
    process.exit(1);
  }
  const url = new URL(ACCOUNTS + '/oauth/v2/token');
  url.searchParams.set('code', code);
  url.searchParams.set('client_id', process.env.CATALYST_CLIENT_ID || '');
  url.searchParams.set('client_secret', process.env.CATALYST_CLIENT_SECRET || '');
  url.searchParams.set('grant_type', 'authorization_code');

  const res = await fetch(url, { method: 'POST' });
  const body = await res.json();

  if (!body.refresh_token) {
    console.error('\n  No refresh token came back:\n', body, '\n');
    console.error('  An authorisation code works once and expires in minutes.');
    console.error('  Generate a fresh one and run this again.\n');
    process.exit(1);
  }

  /* Write it straight into .env.local. The code cannot be used twice, so
     printing it and hoping someone copies it correctly is one slip away from
     having to start over. */
  const envPath = resolve(here, '..', '.env.local');
  const line = `CATALYST_REFRESH_TOKEN=${body.refresh_token}`;
  let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  text = /^CATALYST_REFRESH_TOKEN=.*$/m.test(text)
    ? text.replace(/^CATALYST_REFRESH_TOKEN=.*$/m, line)
    : text.trimEnd() + '\n' + line + '\n';
  writeFileSync(envPath, text);

  console.log(`\n  Saved to .env.local (${body.refresh_token.slice(0, 12)}…).`);
  console.log('  Refresh tokens do not expire — this is done once.\n');

  /* The API console accepts a scope it does not recognise and then quietly
     leaves it out, so the only way to know what was really granted is to read
     it back. This is how the ZCQL scope was lost without anyone noticing. */
  const granted = String(body.scope || '').split(/[ ,]+/).filter(Boolean);
  const missing = SCOPES.filter((s) => !granted.includes(s));

  console.log('  Granted:');
  for (const s of granted) console.log('    ' + s);

  if (missing.length) {
    console.log('\n  NOT granted — the console dropped these:');
    for (const s of missing) console.log('    ' + s);
    console.log('\n  Generate the code again and tick these by hand in the');
    console.log('  self client\'s scope list rather than pasting them.\n');
    process.exit(1);
  }
  console.log('\n  Everything asked for was granted.\n');
}

/* ---------- print the scope string to paste into the console ---------- */

if (process.argv[2] === '--scopes') {
  console.log('\n  Paste this into the self client, as one comma-separated line:\n');
  console.log('  ' + SCOPES.join(',') + '\n');
}

/* ---------- saying what went wrong, in words an office can act on ----------

   "Catalyst refused the request: Catalyst: You have exhausted the free tier
   allowance for Datastore - Fetch" is accurate and tells nobody what to do. The
   two failures that actually happen are not the console's fault and have a
   different person to go to, so they are named. Anything else is passed on as
   it came. */
export function explainCatalyst(err) {
  const m = String(err?.message || err || '');

  if (/exhausted the free tier|allowance for|payment method/i.test(m)) {
    return {
      status: 503,
      code: 'catalyst_quota',
      message:
        'Catalyst has stopped answering: the free allowance for reading its database is used up, so the console has nothing to show. ' +
        'Nothing is wrong with the console. Whoever owns the Catalyst account needs to add a payment method or wait for the allowance to reset ' +
        '(Catalyst console, Billing). The Noah app and the Noah API read the same database, so they are affected too.',
    };
  }
  if (/would not issue an access token|invalid_code|invalid_client/i.test(m)) {
    return {
      status: 503,
      code: 'catalyst_auth',
      message:
        'The console cannot sign in to Catalyst: its CATALYST_CLIENT_ID, CATALYST_CLIENT_SECRET or CATALYST_REFRESH_TOKEN is missing or wrong on this server.',
    };
  }
  return null;
}
