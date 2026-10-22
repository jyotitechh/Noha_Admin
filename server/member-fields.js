/* What the office may correct on a member, and how it is checked.

   The member filled these in on the Noah app and they live on `members`. When
   the office fixes a misspelt name or a wrong pincode here, it is written to the
   same column, so the app shows the corrected value.

   Deliberately NOT editable, and why:
     - the mobile number: it is the member's login (`users.number`), so changing
       it hands the account to whoever holds the new number;
     - ID numbers (Aadhaar, PAN, passport...): identity records, changed only
       through a re-verified registration;
     - the registration decision, roles, archive: they have their own actions.

   A field marked `contact` (email, addresses) needs the `members.pii` permission
   to change, the same one that lets a role see them unmasked: nobody edits what
   they are not allowed to read. */

const GENDER = { male: 1, female: 2, other: 3 };

export const MEMBER_FIELDS = [
  { key: 'salutation', column: 'salutation', label: 'Title', group: 'Name', kind: 'text', max: 20 },
  { key: 'firstName', column: 'firstName', label: 'First name', group: 'Name', kind: 'text', max: 100, required: true },
  { key: 'middleName', column: 'middleName', label: 'Middle name', group: 'Name', kind: 'text', max: 100 },
  { key: 'lastName', column: 'lastName', label: 'Last name', group: 'Name', kind: 'text', max: 100 },

  { key: 'gender', column: 'gender', label: 'Gender', group: 'Personal', kind: 'gender' },
  { key: 'dateOfBirth', column: 'dateOfBirth', label: 'Date of birth', group: 'Personal', kind: 'date', past: true },
  { key: 'maritalStatus', column: 'maritalStatus', label: 'Marital status', group: 'Personal', kind: 'text', max: 50 },
  { key: 'anniversaryDate', column: 'anniversaryDate', label: 'Anniversary', group: 'Personal', kind: 'date', past: true },
  { key: 'religion', column: 'religion', label: 'Religion', group: 'Personal', kind: 'text', max: 100 },
  { key: 'motherTongue', column: 'motherTongue', label: 'Mother tongue', group: 'Personal', kind: 'text', max: 100 },
  { key: 'commLanguage', column: 'commLanguage', label: 'Language to write to them in', group: 'Personal', kind: 'text', max: 100 },
  { key: 'educationDetail', column: 'educationDetail', label: 'Education', group: 'Personal', kind: 'text', max: 255 },
  { key: 'employedIn', column: 'employedIn', label: 'Employed in', group: 'Personal', kind: 'text', max: 255 },

  { key: 'email', column: 'emailId1', label: 'Email', group: 'Contact', kind: 'email', contact: true },
  { key: 'email2', column: 'emailId2', label: 'Second email', group: 'Contact', kind: 'email', contact: true },
  { key: 'address', column: 'address', label: 'Address', group: 'Home address', kind: 'text', max: 255, contact: true },
  { key: 'area', column: 'area', label: 'Area', group: 'Home address', kind: 'text', max: 100, contact: true },
  { key: 'city', column: 'city', label: 'City', group: 'Home address', kind: 'text', max: 100, contact: true },
  { key: 'state', column: 'state', label: 'State', group: 'Home address', kind: 'text', max: 100, contact: true },
  { key: 'country', column: 'country', label: 'Country', group: 'Home address', kind: 'text', max: 100, contact: true },
  { key: 'pincode', column: 'pincode', label: 'Pincode', group: 'Home address', kind: 'text', max: 12, contact: true },
  { key: 'corrAddress', column: 'corrAddress', label: 'Address', group: 'Postal address', kind: 'text', max: 255, contact: true },
  { key: 'corrArea', column: 'corrArea', label: 'Area', group: 'Postal address', kind: 'text', max: 100, contact: true },
  { key: 'corrCity', column: 'corrCity', label: 'City', group: 'Postal address', kind: 'text', max: 100, contact: true },
  { key: 'corrState', column: 'corrState', label: 'State', group: 'Postal address', kind: 'text', max: 100, contact: true },
  { key: 'corrCountry', column: 'corrCountry', label: 'Country', group: 'Postal address', kind: 'text', max: 100, contact: true },
  { key: 'corrPincode', column: 'corrPincode', label: 'Pincode', group: 'Postal address', kind: 'text', max: 12, contact: true },
];

export const fieldByKey = (key) => MEMBER_FIELDS.find((f) => f.key === key);

/** A field by its key, its column, or — loosely — its name with the case and
    punctuation ignored. The app's change requests name a field and the exact
    spelling is not documented, so be forgiving but never guess between two. */
export function fieldByName(name) {
  const flat = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = flat(name);
  if (!want) return null;
  const hits = MEMBER_FIELDS.filter((f) => flat(f.key) === want || flat(f.column) === want);
  return hits.length === 1 ? hits[0] : null;
}

const dayOk = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === s;
};

/**
 * Check one value. Returns { value } (what to store) or { error }.
 * `value` is what the column holds: a trimmed string, a day as YYYY-MM-DD, or
 * for gender 1, 2 or 3. An empty optional value is stored as null.
 */
export function checkValue(field, raw) {
  const empty = raw === null || raw === undefined || String(raw).trim() === '';
  if (empty) return field.required ? { error: `${field.label} cannot be empty.` } : { value: null };
  const s = String(raw).trim();

  switch (field.kind) {
    case 'text':
      if (s.length > field.max) return { error: `${field.label} is longer than ${field.max} characters.` };
      if (/[\u0000-\u001f]/.test(s)) return { error: `${field.label} has characters that cannot be stored.` };
      return { value: s };
    case 'email':
      if (s.length > 255 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return { error: `${field.label} is not an email address.` };
      return { value: s };
    case 'date': {
      if (!dayOk(s)) return { error: `${field.label} must be a real date, as YYYY-MM-DD.` };
      if (s < '1900-01-01') return { error: `${field.label} is before 1900.` };
      if (field.past && s > new Date().toISOString().slice(0, 10)) return { error: `${field.label} is in the future.` };
      return { value: s };
    }
    case 'gender': {
      const code = GENDER[s.toLowerCase()] ?? (['1', '2', '3'].includes(s) ? Number(s) : null);
      return code ? { value: code } : { error: 'Gender must be male, female or other.' };
    }
    default:
      return { error: `${field.label} cannot be edited.` };
  }
}

/**
 * Check a whole change. `patch` is { key: value }, keys from MEMBER_FIELDS.
 * Returns { values: { column: value }, errors: { key: message } }. An unknown
 * key is an error, not ignored: a typo should not look like a saved change.
 */
export function checkPatch(patch, { canContact = false } = {}) {
  const values = {};
  const errors = {};
  for (const [key, raw] of Object.entries(patch || {})) {
    const field = fieldByKey(key);
    if (!field) { errors[key] = 'That is not a field that can be edited.'; continue; }
    if (field.contact && !canContact) {
      errors[key] = 'Changing contact details needs permission to see them.';
      continue;
    }
    const r = checkValue(field, raw);
    if (r.error) errors[key] = r.error; else values[field.column] = r.value;
  }
  return { values, errors };
}
