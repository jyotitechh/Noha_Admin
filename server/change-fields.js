/* What a change request from the app means, and what approving one writes.

   A member cannot edit their details in the Noah app. They type the new values on Me > My information and the app files
   one row in `appChangeRequests` per changed detail: { memberRowId, fieldId, oldValue, newValue, status }. The office
   decides here. Approving writes `newValue` into the member's own column or columns and marks the request.

   `fieldId` and how it maps to `members` are from the Catalyst developer's ADMIN_INTEGRATION note ("Profile change
   requests"). The app's value is text, so each field says how to turn it into what the column holds:

     gender       male / female / other  ->  1 / 2 / 3
     smoking      yes / no               ->  true / false
     dob          YYYY-MM-DD             ->  a date; `deceased` is a datetime column, so it gets 00:00:00
     income       a number               ->  bigint (the start of the range the member chose)
     phone2       "+91 9876543210"       ->  the dial code and the number, in two columns
     landline     "+91 2212345678"       ->  likewise
     reference    one text name|+91|number  (`referBy`): name and phone each change only their own part
     address      "12 Mill Road, Kurla"  ->  address + area: the last comma-separated part is the area
     location     "Mumbai, Maharashtra, India" -> city + state + country
     (corr_* likewise, for the postal address)

   Not applied from here, and why:
     phone1   it is the member's sign-in number (`users.number`). Writing it to `members` alone would show a number they
              cannot sign in with, and changing the login would hand the account to whoever holds the new number. The Noah
              API refuses it too (409 change_by_hand): change it by hand in `users` and `members`, then turn the request down
              with a note such as "Changed".

   WHO APPLIES IT. When the Noah API key is set the API decides (GET /admin/profile-requests, POST .../decide): it writes the
   value in the right format and sends the member a push. This file's map is then used only to label a request, to guard the
   cases above, and for the table fallback (no key, or an API without those calls), where nobody is told.

   What needs the permission to see contact details (members.pii), because nobody applies what they may not read: email,
   phones, addresses and pincodes, and the ID numbers (PAN, Aadhaar, Emirates ID, passport, voter, driving licence).

   A request this does not recognise is shown and can be turned down, never approved: guessing which column a stranger's
   request means is how the wrong thing gets edited. Older spellings that name a console field directly (firstName,
   emailId1...) still resolve, through member-fields.js. */

import { fieldByName, checkValue } from './member-fields.js';

const empty = (raw) => raw === null || raw === undefined || String(raw).trim() === '';
const bad = (message, code = 'invalid_value') => ({ error: message, code });

/** One column, one text value. */
function text(column, label, max, { required = false, contact = false } = {}) {
  return {
    label, contact,
    apply(raw) {
      if (empty(raw)) return required ? bad(`${label} cannot be empty.`) : one(column, label, null);
      const s = String(raw).trim();
      if (s.length > max) return bad(`${label} is longer than ${max} characters.`);
      if (/[\u0000-\u001f]/.test(s)) return bad(`${label} has characters that cannot be stored.`);
      return one(column, label, s);
    },
  };
}

const one = (column, label, value, shown = value) => ({ parts: [{ column, label, value, shown: shown ?? '' }] });

/** One column, one of a fixed list (stored in lower case, as the app sends it). */
function pick(column, label, allowed) {
  return {
    label, contact: false,
    apply(raw) {
      if (empty(raw)) return one(column, label, null);
      const s = String(raw).trim().toLowerCase();
      return allowed.includes(s) ? one(column, label, s) : bad(`${label} must be one of: ${allowed.join(', ')}.`);
    },
  };
}

/** A day. `datetime` for a column that holds a time too. */
function day(column, label, { datetime = false, past = true } = {}) {
  return {
    label, contact: false,
    apply(raw) {
      if (empty(raw)) return one(column, label, null);
      const r = checkValue({ key: column, column, label, kind: 'date', past }, raw);
      if (r.error) return bad(r.error);
      return one(column, label, datetime ? `${r.value} 00:00:00` : r.value, r.value);
    },
  };
}

/** yes / no into a boolean column. */
function yesNo(column, label) {
  return {
    label, contact: false,
    apply(raw) {
      if (empty(raw)) return one(column, label, null);
      const s = String(raw).trim().toLowerCase();
      if (s === 'yes') return one(column, label, true, 'Yes');
      if (s === 'no') return one(column, label, false, 'No');
      return bad(`${label} must be yes or no.`);
    },
  };
}

/** "+91 9876543210" -> { dial: '+91', number: '9876543210' }, or null. */
export function splitPhone(raw) {
  const m = String(raw ?? '').trim().match(/^(\+\d{1,4})[\s-]*([\d\s-]{4,20})$/);
  if (!m) return null;
  const number = m[2].replace(/[\s-]/g, '');
  return number.length >= 4 && number.length <= 15 ? { dial: m[1], number } : null;
}

/** A phone stored as a dial code column and a number column. */
function phone(numberColumn, dialColumn, label) {
  return {
    label, contact: true,
    apply(raw) {
      if (empty(raw)) {
        return { parts: [
          { column: numberColumn, label, value: null, shown: '' },
          { column: dialColumn, label: `${label} dial code`, value: null, shown: '' },
        ] };
      }
      const p = splitPhone(raw);
      if (!p) return bad(`${label} must look like +91 9876543210: a dial code, then the number.`);
      return { parts: [
        { column: numberColumn, label, value: p.number, shown: p.number },
        { column: dialColumn, label: `${label} dial code`, value: p.dial, shown: p.dial },
      ] };
    },
  };
}

const commaParts = (raw) => String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** "12 Mill Road, Kurla" -> the address, and the last part as the area. */
function addressWithArea(addressColumn, areaColumn, label) {
  return {
    label, contact: true,
    apply(raw) {
      const parts = commaParts(raw);
      if (!parts.length) {
        return { parts: [
          { column: addressColumn, label, value: null, shown: '' },
          { column: areaColumn, label: 'Area', value: null, shown: '' },
        ] };
      }
      const area = parts.length > 1 ? parts[parts.length - 1] : null;
      const address = parts.length > 1 ? parts.slice(0, -1).join(', ') : parts[0];
      if (String(raw).length > 2000) return bad(`${label} is too long.`);
      return { parts: [
        { column: addressColumn, label, value: address, shown: address },
        { column: areaColumn, label: 'Area', value: area, shown: area ?? '' },
      ] };
    },
  };
}

/** "Mumbai, Maharashtra, India" -> city, state and country. Needs all three: a guess would put a place in the wrong box. */
function cityStateCountry(cityColumn, stateColumn, countryColumn, label) {
  return {
    label, contact: true,
    apply(raw) {
      const parts = commaParts(raw);
      if (!parts.length) {
        return { parts: [
          { column: cityColumn, label: 'City', value: null, shown: '' },
          { column: stateColumn, label: 'State', value: null, shown: '' },
          { column: countryColumn, label: 'Country', value: null, shown: '' },
        ] };
      }
      if (parts.length < 3) {
        return bad(`${label} needs a city, a state and a country, separated by commas. “${String(raw).trim()}” has ${parts.length}. Turn it down, or correct the member's address by hand.`);
      }
      const country = parts[parts.length - 1];
      const state = parts[parts.length - 2];
      const city = parts.slice(0, -2).join(', ');
      if (country.length > 255) return bad('The country is longer than 255 characters.');
      return { parts: [
        { column: cityColumn, label: 'City', value: city, shown: city },
        { column: stateColumn, label: 'State', value: state, shown: state },
        { column: countryColumn, label: 'Country', value: country, shown: country },
      ] };
    },
  };
}

/** The reference is stored as one text, name|+91|number. The name and the phone are separate requests and each changes only its own part. */
function reference(part, label) {
  return {
    label, contact: part === 'phone',
    apply(raw, member) {
      const [name = '', dial = '', number = ''] = String(member?.referBy ?? '').split('|');
      let next = { name, dial, number };
      if (part === 'name') {
        const s = String(raw ?? '').trim();
        if (s.includes('|')) return bad('A name cannot contain the | character.');
        next.name = s;
      } else if (empty(raw)) {
        next = { ...next, dial: '', number: '' };
      } else {
        const p = splitPhone(raw);
        if (!p) return bad(`${label} must look like +91 9876543210: a dial code, then the number.`);
        next = { ...next, dial: p.dial, number: p.number };
      }
      const joined = next.name || next.dial || next.number ? `${next.name}|${next.dial}|${next.number}` : null;
      if (joined && joined.length > 100) return bad('The reference is longer than 100 characters in all.');
      /* Stored as one text, but the office is shown only the part this request changes. */
      const shown = part === 'name' ? next.name : [next.dial, next.number].filter(Boolean).join(' ');
      return one('referBy', label, joined, shown);
    },
  };
}

/** A whole number (income is the start of the range the member chose). */
function whole(column, label) {
  return {
    label, contact: false,
    apply(raw) {
      if (empty(raw)) return one(column, label, null);
      const s = String(raw).trim().replace(/[,\s]/g, '');
      if (!/^\d{1,13}$/.test(s)) return bad(`${label} must be a whole number.`);
      return one(column, label, Number(s), s);
    },
  };
}

/** A blood group, as the app lists them. */
const bloodGroup = {
  label: 'Blood group', contact: false,
  apply(raw) {
    if (empty(raw)) return one('bloodGroup', 'Blood group', null);
    const s = String(raw).trim().toUpperCase();
    return /^(A|B|AB|O)[+-]$/.test(s) ? one('bloodGroup', 'Blood group', s) : bad('Blood group must be like A+ or O-.');
  },
};

const gender = {
  label: 'Gender', contact: false,
  apply(raw) {
    const r = checkValue({ key: 'gender', column: 'gender', label: 'Gender', kind: 'gender' }, raw);
    if (r.error) return bad(r.error);
    return one('gender', 'Gender', r.value, { 1: 'male', 2: 'female', 3: 'other' }[r.value] ?? '');
  },
};

const email = (column, label) => ({
  label, contact: true,
  apply(raw) {
    const r = checkValue({ key: column, column, label, kind: 'email' }, raw);
    return r.error ? bad(r.error) : one(column, label, r.value);
  },
});

/* The ID numbers: identity records, so applying one needs the same permission as reading contact details. */
const idNumber = (column, label) => text(column, label, 100, { contact: true });

/** The documented ids (ADMIN_INTEGRATION, "Profile change requests"). */
export const CHANGE_FIELDS = {
  salutation: text('salutation', 'Title', 50),
  first_name: text('firstName', 'First name', 100, { required: true }),
  middle_name: text('middleName', 'Middle name', 100),
  last_name: text('lastName', 'Last name', 100),

  gender,
  blood_group: bloodGroup,
  dob: day('dateOfBirth', 'Date of birth'),
  anniversary: day('anniversaryDate', 'Anniversary'),
  deceased: day('deceasedDate', 'Date of passing', { datetime: true }),
  marital: pick('maritalStatus', 'Marital status', ['single', 'married', 'widow', 'widower', 'separated', 'divorced']),

  email: email('emailId1', 'Email'),
  email2: email('emailId2', 'Second email'),

  occupation: text('occupation', 'Designation', 255),
  employed: text('employedIn', 'Organisation name', 255),
  education: text('educationDetail', 'Education', 255),
  income: whole('annualIncome', 'Annual income'),

  mother_tongue: text('motherTongue', 'Mother tongue', 255),
  comm_language: text('commLanguage', 'Language to write to them in', 255),
  groups: text('specialGroup', 'Special group', 100),

  religion: text('religion', 'Religion', 100),
  height: text('height', 'Height', 100),
  weight: text('weight', 'Weight', 100),
  diet: pick('diet', 'Diet', ['veg', 'nonveg', 'egg', 'vegan']),
  complexion: pick('complexion', 'Complexion', ['fair', 'wheatish', 'brown', 'dark']),
  smoking: yesNo('smoking', 'Smoking'),
  drink: yesNo('drink', 'Drinking'),

  pan: idNumber('panNo', 'PAN'),
  aadhaar: idNumber('aadharNo', 'Aadhaar'),
  emirates: idNumber('emiratesID', 'Emirates ID'),
  passport: idNumber('passportNumber', 'Passport number'),
  voter: idNumber('voterId', 'Voter ID'),
  dl: idNumber('drivingLicense', 'Driving licence'),

  /* The sign-in number: see the top of this file. Known, shown, but never applied here. */
  phone1: {
    label: 'Mobile number', contact: true,
    blocked: 'This is the number the member signs in with. Changing it here would show a number they cannot sign in with, and changing the login hands the account to whoever holds the new number. Change it by hand in `users` and `members`, then turn the request down with a note such as “Changed”.',
  },
  phone2: phone('mobileNumber2', 'mobileNumber2CountryCode', 'Second mobile number'),
  landline: phone('landlineNumber', 'landlineCountryCode', 'Landline'),

  reference: reference('name', 'Reference name'),
  reference_phone: reference('phone', 'Reference phone'),

  address: addressWithArea('address', 'area', 'Address'),
  location: cityStateCountry('city', 'state', 'country', 'Location'),
  /* A new profile photo: `newValue` is a file id, and approving makes it members.photo. */
  photo: text('photo', 'Profile photo', 255),

  pin: text('pincode', 'Pincode', 50, { contact: true }),

  corr_address: addressWithArea('corrAddress', 'corrArea', 'Postal address'),
  corr_location: cityStateCountry('corrCity', 'corrState', 'corrCountry', 'Postal location'),
  corr_pin: text('corrPincode', 'Postal pincode', 100, { contact: true }),
};

/**
 * A status as the table may spell it: approved / Approved, rejected / Rejected / Turned down. Anything else is still waiting
 * (ADMIN_INTEGRATION: "any of approved, Approved ... is understood. Anything else counts as still waiting").
 */
export function normStatus(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected' || s === 'turned down') return 'rejected';
  return 'pending';
}

/** What the console can say about a field before anything is decided. */
export function describeChangeField(fieldId) {
  const f = Object.hasOwn(CHANGE_FIELDS, fieldId) ? CHANGE_FIELDS[fieldId] : null;
  if (f) return { label: f.label, known: !f.blocked, contact: !!f.contact, blocked: f.blocked || null };
  const legacy = fieldByName(fieldId);
  return legacy
    ? { label: legacy.label, known: true, contact: !!legacy.contact, blocked: null }
    : { label: null, known: false, contact: false, blocked: null };
}

/**
 * What approving this request would write: { parts: [{ column, label, value, shown }] }, or { error, code }.
 * `member` is the member's current row, needed only where a column holds more than one thing (the reference).
 */
export function resolveChange(fieldId, newValue, member) {
  if (Object.hasOwn(CHANGE_FIELDS, fieldId)) {
    const f = CHANGE_FIELDS[fieldId];
    if (f.blocked) return { error: f.blocked, code: 'blocked_field' };
    const r = f.apply(newValue, member);
    return r.error ? r : { ...r, label: f.label, contact: !!f.contact };
  }
  const legacy = fieldByName(fieldId);
  if (!legacy) {
    return { error: `The console does not know which detail "${fieldId}" is, so it cannot apply this. Reject it, or change the member's detail by hand.`, code: 'unknown_field' };
  }
  const r = checkValue(legacy, newValue);
  if (r.error) return bad(r.error);
  return { parts: [{ column: legacy.column, label: legacy.label, value: r.value, shown: r.value ?? '' }], label: legacy.label, contact: !!legacy.contact };
}
