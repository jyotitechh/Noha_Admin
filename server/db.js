/* In-memory store for the mock API.

   Everything lives in one object so a route can reach any collection by name.
   Writes mutate the seed arrays in place and append to the audit log, exactly
   as the prototype did, so the console behaves the same way. Restarting the
   server resets to the seed — there is no persistence yet, by design: see
   README.md, "Swapping the mock API for a real backend". */

import { SEED } from './seed/data.js';
import { AUD, ROLES, ME, PERM_GROUPS, PERM_LBL, ALL_PERMS } from './seed/roles.js';
import { REGISTRATIONS, PRAYER_INBOX, videoScript } from './seed/registrations.js';
import { now } from './seed/helpers.js';

export const db = {
  ...SEED,
  /* Queues the mobile app feeds. Not in the HTML prototype. */
  REGISTRATIONS,
  PRAYER_INBOX,
  /* Access control */
  AUD,
  ROLES,
  ME,
  PERM_GROUPS,
  PERM_LBL,
  ALL_PERMS,
};

export { videoScript };

/* ---------- audit ---------- */
let audSeq = 4900;

/** Record a change. Every mutating route calls this. */
export function audit(actor, roleName, action, mod, rec, before, after, remark) {
  const entry = {
    id: 'AU-' + ++audSeq,
    at: now(),
    actor,
    role: roleName,
    action,
    mod,
    rec,
    before: before ?? null,
    after: after ?? null,
    remark: remark || '',
    ip: '10.20.4.17',
    live: true,
  };
  AUD.unshift(entry);
  return entry;
}

/* ---------- permissions ---------- */
export const roleById = (id) => ROLES.find((r) => r.id === id) || ROLES[0];

/** True when `roleId` holds any one of `perm` (a string or a list). */
export function can(roleId, perm) {
  if (!perm) return true;
  const held = roleById(roleId).perms;
  return [].concat(perm).some((p) => held.includes(p));
}

/* ---------- small query helpers ---------- */
export const find = (coll, id) => (db[coll] || []).find((x) => String(x.id) === String(id));

/** Case-insensitive contains across the given fields. */
export const matches = (row, q, fields) => {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return fields.some((f) => String(row[f] ?? '').toLowerCase().includes(needle));
};

/** Slice a list into a { rows, total } page. */
export function page(rows, { offset = 0, limit = 50 } = {}) {
  const total = rows.length;
  const from = Math.max(0, Number(offset) || 0);
  const size = Math.min(500, Math.max(1, Number(limit) || 50));
  return { rows: rows.slice(from, from + size), total, offset: from, limit: size };
}
