/* Does the Noah API work, and does the video actually come back?

     npm run test:noah

   Run this after putting the key from ADMIN_API_KEY.txt into .env.local as
   NOAH_ADMIN_API_KEY. It makes no changes — it only reads. Approving from a
   test would email a real person. */

import * as noah from './noah-api.js';
import { noahConfigured, findFileId } from './noah-api.js';

const tick = (ok) => (ok ? '  ok   ' : '  FAIL ');
let failed = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failed++;
  console.log(tick(ok) + label + (detail ? '\n         ' + detail : ''));
  return ok;
};

console.log('\nNoah API\n' + '─'.repeat(64));

if (!noahConfigured()) {
  console.log(`
  Not configured yet.

  NOAH_API_BASE       ${process.env.NOAH_API_BASE ? 'set' : 'MISSING'}
  NOAH_ADMIN_API_KEY  ${process.env.NOAH_ADMIN_API_KEY ? 'set' : 'MISSING'}

  The key is in ADMIN_API_KEY.txt, next to ADMIN_INTEGRATION.md. Put it in
  .env.local as NOAH_ADMIN_API_KEY. It goes on this server only — never in
  the React app, where anyone could read it out of the browser.
`);
  process.exit(1);
}

console.log('  base   ' + process.env.NOAH_API_BASE);
console.log('  key    ' + process.env.NOAH_ADMIN_API_KEY.slice(0, 4) + '…(' + process.env.NOAH_ADMIN_API_KEY.length + ' chars)\n');

/* 1. the key ------------------------------------------------------------- */
let pending;
try {
  pending = await noah.listRegistrations('pending');
  check(true, 'The admin key is accepted');
} catch (err) {
  check(false, 'The admin key is accepted', err.message);
  console.log('\n  Nothing else can run until this passes.\n');
  process.exit(1);
}

/* The list may be an array or wrapped — accept either. */
const rows = Array.isArray(pending) ? pending
  : pending?.registrations ?? pending?.data ?? pending?.rows ?? [];
check(Array.isArray(rows), 'Pending registrations come back as a list',
  `${rows.length} pending`);

/* 2. every status the admin screens read --------------------------------- */
for (const status of ['approved', 'rejected', 'videoReturned', 'draft']) {
  try {
    await noah.listRegistrations(status);
    check(true, `status=${status} is accepted`);
  } catch (err) {
    check(false, `status=${status} is accepted`, err.message);
  }
}

/* 3. a registration's detail and its files -------------------------------- */
/* Prefer a pending one; fall back to any registration at all, since on a quiet
   day there may be nothing pending and that is not a failure. */
let sample = rows[0];
if (!sample) {
  for (const status of ['approved', 'videoReturned', 'rejected']) {
    const r = await noah.listRegistrations(status).catch(() => null);
    const list = Array.isArray(r) ? r : r?.registrations ?? r?.data ?? r?.rows ?? [];
    if (list.length) { sample = list[0]; break; }
  }
}

if (!sample) {
  console.log('\n  No registrations of any status, so the file check cannot run.\n');
  process.exit(failed ? 1 : 0);
}

const id = sample.id ?? sample.ROWID ?? sample.registrationId ?? sample.rowId;
check(!!id, 'A registration in the list carries an id', String(id));

let detail;
try {
  detail = await noah.getRegistration(id);
  check(true, 'Its detail can be read');
} catch (err) {
  check(false, 'Its detail can be read', err.message);
}

if (detail) {
  console.log('\n  Files named in the detail\n  ' + '─'.repeat(44));
  for (const kind of ['video', 'photo', 'id']) {
    const fileId = findFileId(detail, kind);
    console.log(`  ${kind.padEnd(6)} ${fileId ?? 'not uploaded / not named'}`);
  }

  /* 4. the actual bytes — this is the question that has been open ---------- */
  const videoId = findFileId(detail, 'video');
  if (!videoId) {
    console.log('\n  This registration has no video, so nothing to download.');
    console.log('  Field names seen in the detail, to check against the API:');
    console.log('  ' + Object.keys(detail ?? {}).join(', ') + '\n');
  } else {
    try {
      const { buffer, contentType } = await noah.getFile(videoId);
      check(buffer.length > 0, 'THE VIDEO DOWNLOADS',
        `${(buffer.length / 1024 / 1024).toFixed(2)} MB, ${contentType}`);
    } catch (err) {
      check(false, 'THE VIDEO DOWNLOADS', err.message);
    }
  }
}

console.log('\n' + '─'.repeat(64));
console.log(failed ? `  ${failed} failed\n` : '  All checks passed.\n');
process.exit(failed ? 1 : 0);
