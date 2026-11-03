/* Family requests from the Noah app (Me > Family), read from and decided through the Noah API.

   A member asks the office to add a spouse, child, parent, brother, sister or anyone else. Approving is
   done by the API, never by writing the tables: it links both accounts (or, for a child under 18, adds the
   child and links them to the member and the member's spouse) and tells both people. See ADMIN_INTEGRATION.md,
   "Family requests".

   This module only reads and tidies what the API returns. It keeps no copy of its own. */

import { listFamilyRequests } from './noah-api.js';

export const STATES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const LABEL = {
  spouse: 'Spouse', son: 'Son', daughter: 'Daughter', father: 'Father', mother: 'Mother',
  brother: 'Brother', sister: 'Sister', other: 'Other',
};

/** Enough of a number to recognise, not enough to use. */
const maskMobile = (m = '') => String(m || '').replace(/(\d{2})\d+(\d{2})$/, '$1••••••$2');

const asDate = (v) => {
  if (!v) return null;
  const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T') + 'Z');
  return Number.isNaN(+d) ? null : d;
};

/** Whole years between a date of birth and today; null when there is no usable date. */
export function ageOf(dob, today = new Date()) {
  const d = asDate(dob);
  if (!d) return null;
  let years = today.getUTCFullYear() - d.getUTCFullYear();
  const before = today.getUTCMonth() < d.getUTCMonth()
    || (today.getUTCMonth() === d.getUTCMonth() && today.getUTCDate() < d.getUTCDate());
  if (before) years -= 1;
  return years < 0 ? null : years;
}

/** One request as the console shows it. Contact numbers are masked here, so no screen can leak one by mistake. */
export function shape(r) {
  const relation = String(r.relation || '').toLowerCase();
  return {
    id: String(r.id),
    state: STATES.includes(r.state) ? r.state : 'Pending',
    relation,
    relationLabel: LABEL[relation] || 'Other',
    /* A child under 18: no account and no phone number, so approving adds a record rather than linking one. */
    kid: !!r.kid,
    name: String(r.name || '').trim(),
    gender: r.gender || null,
    dob: r.dob || null,
    age: ageOf(r.dob),
    mobile: r.mobile ? maskMobile(r.mobile) : '',
    note: String(r.note || '').trim(),
    requesterId: r.requesterId != null ? String(r.requesterId) : '',
    requesterName: String(r.requesterName || '').trim(),
    requesterMobile: maskMobile(r.requesterMobile),
    /* For a grown-up: the member that number belongs to, or none if they have not joined yet. */
    existingMemberId: r.existingMemberId != null ? String(r.existingMemberId) : null,
    existingMemberName: r.existingMemberName || null,
    at: asDate(r.at),
    /* The API does not say who decided or why, so these are filled from the audit log when it does. */
    decidedBy: r.decidedBy || '',
    remark: r.remark || '',
  };
}

export async function listRequests(state = 'Pending') {
  const rows = await listFamilyRequests(state);
  return rows.map(shape).sort((a, b) => (+a.at || 0) - (+b.at || 0));
}

/* The badge asks often and the inbox is small. A short cache keeps it from calling the Noah API on every page
   load; a decision clears it. */
let pending = null;
let pendingAt = 0;
const TTL = 30_000;
export const forgetFamilyRequests = () => { pending = null; };

export async function pendingRequests() {
  if (pending && Date.now() - pendingAt < TTL) return pending;
  pending = await listRequests('Pending');
  pendingAt = Date.now();
  return pending;
}
