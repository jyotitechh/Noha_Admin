/* Profile change requests as the Noah API serves them (Me > My information), shaped for the console.

   The API owns the decision: it writes the member's column in the right format and sends the member a push. This file only
   reads what it returns and gives each request the same shape the console already shows (the table path in noah-schema.js
   produces the same one), so the screen does not care which path a request came by. */

import { listProfileRequests } from './noah-api.js';
import { describeChangeField, normStatus } from './change-fields.js';

const asDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
};

/** One item from GET /admin/profile-requests. */
export function shape(item) {
  const fieldId = String(item.fieldId ?? '');
  const field = describeChangeField(fieldId);
  return {
    id: String(item.id),
    memberRowId: item.memberRowId != null ? String(item.memberRowId) : null,
    memberName: String(item.memberName || '').trim() || '(unknown member)',
    fieldId,
    fieldLabel: field.label,
    known: field.known,
    contact: field.contact,
    blocked: field.blocked,
    /* The API checks and converts the value itself, so the console offers no second opinion here. */
    saves: null,
    problem: null,
    oldValue: item.oldValue ?? '',
    newValue: item.newValue ?? '',
    status: normStatus(item.status),
    photo: fieldId === 'photo',
    note: item.note || '',
    at: asDate(item.createdAt),
    decidedAt: asDate(item.reviewedAt),
  };
}

/** The requests with one status, from the API. Newest first. */
export async function listViaApi(status = 'pending') {
  const items = await listProfileRequests(status);
  return items.map(shape).sort((a, b) => (+(b.at ?? 0)) - (+(a.at ?? 0)));
}
