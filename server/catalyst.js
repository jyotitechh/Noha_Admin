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
     2. Generate a code with these scopes, comma separated:
          ZohoCatalyst.tables.READ,
          ZohoCatalyst.tables.rows.CREATE,
          ZohoCatalyst.tables.rows.READ,
          ZohoCatalyst.tables.rows.UPDATE,
          ZohoCatalyst.tables.rows.DELETE,
        Pick a long duration; you exchange it once.
     3. Exchange the code for a refresh token:
          node server/catalyst.js --exchange <code>
        and put the refresh_token it prints into .env.local.

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

/** True when there is enough configuration to try. */
export const configured = () =>
  !!(PROJECT_ID && ORG_ID && process.env.CATALYST_REFRESH_TOKEN &&
     process.env.CATALYST_CLIENT_ID && process.env.CATALYST_CLIENT_SECRET);

/* ---------- access token ----------
   Refresh tokens do not expire; access tokens last an hour. Cache one and
   renew a minute early rather than asking on every call. */

let token = null;
let tokenExpires = 0;

async function accessToken() {
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

/** Insert rows into a table. */
export const insert = (tableId, rows) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row`, {
    method: 'POST',
    body: JSON.stringify([].concat(rows)),
  });

/** Update rows. Each must carry its ROWID. */
export const update = (tableId, rows) =>
  call(`/baas/v1/project/${PROJECT_ID}/table/${tableId}/row`, {
    method: 'PATCH',
    body: JSON.stringify([].concat(rows)),
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
}
