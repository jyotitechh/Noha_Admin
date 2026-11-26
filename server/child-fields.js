/* What the office may correct on a child, and how it is checked (the `kids` row a parent made in the app).

   Checked like a member's details (server/member-fields.js): the same rules for names, gender and dates. A child's date of
   birth is required, because the notice at 15 and Make member depend on it. The Aadhaar number is a contact-level detail: only
   staff who may see contact details may change it, as for a member's address.

   Not editable here: the photo and the Aadhaar picture (files the parents uploaded), and the parents (family links). When the
   child has been made a member, the name, gender and date of birth are kept the same on their member record
   (SHARED_WITH_MEMBER), which is changed in the same step. */

import { checkValue } from './member-fields.js';

export const KID_FIELDS = [
  { key: 'salutation', column: 'salutation', label: 'Title', kind: 'text', max: 50 },
  { key: 'firstName', column: 'firstName', label: 'First name', kind: 'text', max: 100, required: true },
  { key: 'middleName', column: 'middleName', label: 'Middle name', kind: 'text', max: 100 },
  { key: 'lastName', column: 'lastName', label: 'Last name', kind: 'text', max: 100 },
  { key: 'gender', column: 'gender', label: 'Gender', kind: 'gender', required: true },
  { key: 'dateOfBirth', column: 'dateOfBirth', label: 'Date of birth', kind: 'date', past: true, required: true },
  { key: 'bloodGroup', column: 'bloodGroup', label: 'Blood group', kind: 'text', max: 100 },
  { key: 'aadhaarNo', column: 'aadhaarNo', label: 'Aadhaar number', kind: 'aadhaar', contact: true },
];

/** The fields a member record has too, with the same keys: changed on both when the child is a member. */
export const SHARED_WITH_MEMBER = ['salutation', 'firstName', 'middleName', 'lastName', 'gender', 'dateOfBirth'];

export const kidFieldByKey = (key) => KID_FIELDS.find((f) => f.key === key);

/** One value: { value } to store, or { error }. An empty optional value is stored as null. */
export function checkKidValue(field, raw) {
  if (field.kind !== 'aadhaar') return checkValue(field, raw);
  const empty = raw === null || raw === undefined || String(raw).trim() === '';
  if (empty) return { value: null };
  const digits = String(raw).replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(digits)) return { error: 'The Aadhaar number must be 12 digits.' };
  return { value: digits };
}

/**
 * Check a whole change: { key: value }, keys from KID_FIELDS. Returns { values: { column: value }, errors: { key: message } }.
 * An unknown key is an error, not ignored, so a typo never looks like a saved change.
 */
export function checkKidPatch(patch, { canContact = false } = {}) {
  const values = {};
  const errors = {};
  for (const [key, raw] of Object.entries(patch || {})) {
    const field = kidFieldByKey(key);
    if (!field) { errors[key] = 'That is not a field that can be edited.'; continue; }
    if (field.contact && !canContact) { errors[key] = 'Changing the Aadhaar number needs permission to see contact details.'; continue; }
    const r = checkKidValue(field, raw);
    if (r.error) errors[key] = r.error; else values[field.column] = r.value;
  }
  return { values, errors };
}
