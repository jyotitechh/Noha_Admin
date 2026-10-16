/* Field names and validation for a registration submitted by the Noah app.

   Both halves of this file exist because the Flutter app and this console
   grew up apart and named the same things differently. Rather than make
   either side rename its fields, the app's names are the ones on the wire and
   this module maps them to the console's.

   The rules are ported from code/noah/lib/data/registration_data.dart so the
   server refuses exactly what the app refuses. The app validates to be
   helpful; this is what actually decides, because anyone can bypass the app.
   BACKEND_HANDOFF.md § 3: "Validate everything server-side." */

/* ---------- names ----------

   app (registration_data.dart)   console              why they differ
   ────────────────────────────   ──────────────────   ─────────────────────
   address1, address2             line1, line2         console wording
   state                          region               `state` is the
                                                       workflow state here
   videoSeconds                   videoSecs            console wording
   phone                          mobile               console wording
   agreed                         agreed               same
*/
const FIELD_ALIASES = {
  address1: 'line1',
  address2: 'line2',
  state: 'region',
  videoSeconds: 'videoSecs',
  phone: 'mobile',
  videoPath: 'videoFile',
  idPath: 'idFile',
  photoPath: 'photoFile',
  categoryKey: 'category',
  mannaTitleKey: 'mannaId',
};

/** Rewrite a body sent with the app's field names into the console's. */
export function normalise(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    out[FIELD_ALIASES[k] ?? k] = v;
  }
  return out;
}

/* ---------- ID proof ----------

   The app offers five types by key; the console shows labels. Both are
   accepted, and the label is what gets stored. */
export const ID_TYPES = {
  aadhaar: { label: 'Aadhaar', re: /^[2-9]\d{11}$/, hint: '12 digits, not starting with 0 or 1' },
  pan: { label: 'PAN', re: /^[A-Z]{5}\d{4}[A-Z]$/, hint: 'five letters, four digits, one letter' },
  passport: { label: 'Passport', re: /^[A-PR-WY][1-9]\d{5}[1-9]$/, hint: 'one letter then seven digits' },
  dl: { label: 'Driving licence', re: /^[A-Z]{2}\d{2}(19|20)\d{2}\d{7}$/, hint: 'two letters, RTO code, year, then seven digits' },
  voter: { label: 'Voter ID', re: /^[A-Z]{3}\d{7}$/, hint: 'three letters then seven digits' },
};

/** 'aadhaar' or 'Aadhaar' -> the key, or null. */
export function idTypeKey(v) {
  const s = String(v || '').trim();
  if (ID_TYPES[s.toLowerCase()]) return s.toLowerCase();
  const byLabel = Object.entries(ID_TYPES).find(([, t]) => t.label.toLowerCase() === s.toLowerCase());
  return byLabel ? byLabel[0] : null;
}

const compact = (v) => String(v || '').replace(/[\s-]/g, '').toUpperCase();

/* ---------- the rules ---------- */

export const GENDERS = ['male', 'female', 'other'];
export const MARITAL = ['single', 'married', 'widow', 'widower', 'separated', 'divorced'];

export const MIN_VIDEO_SECONDS = 10;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const DOC_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf'];
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];

const NAME_RE = /^[\p{L}][\p{L} .'-]{1,}$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;
/* India: six digits, not starting with zero. Elsewhere: 4 to 10 alphanumerics,
   which is the rule the HTML prototype settled on for overseas members. */
const PIN_IN_RE = /^[1-9]\d{5}$/;
const PIN_OTHER_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/;

const years = (from, to) => {
  let age = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < from.getDate())) age--;
  return age;
};

const extOf = (name) => String(name || '').split('.').pop()?.toLowerCase() ?? '';

/**
 * Check a normalised registration body.
 * Returns { ok, errors, value } — `errors` is a field -> message map, so the
 * app can put each message against the right box.
 */
export function validateRegistration(b, { now = new Date() } = {}) {
  const e = {};
  const name = (v, field, required = true) => {
    const t = String(v || '').trim();
    if (!t) { if (required) e[field] = 'This is needed.'; return; }
    if (!NAME_RE.test(t)) e[field] = 'Use letters, spaces, a full stop, an apostrophe or a hyphen.';
  };

  /* step 1, details */
  name(b.firstName, 'firstName');
  name(b.middleName, 'middleName', false);
  name(b.lastName, 'lastName');
  name(b.reference, 'reference', false);

  if (!EMAIL_RE.test(String(b.email || '').trim())) e.email = 'That is not an email address.';
  if (!GENDERS.includes(String(b.gender || '').toLowerCase())) e.gender = 'Choose male, female or other.';
  if (!MARITAL.includes(String(b.marital || '').toLowerCase())) e.marital = 'Choose a marital status.';

  const dob = b.dob ? new Date(b.dob) : null;
  if (!dob || Number.isNaN(+dob)) e.dob = 'Give a date of birth.';
  else if (years(dob, now) < 18) e.dob = 'A member must be 18 or over.';

  /* step 2, address */
  if (String(b.line1 || '').trim().length < 5) e.line1 = 'Give the address.';
  if (!String(b.city || '').trim()) e.city = 'Give the city.';
  if (!String(b.country || '').trim()) e.country = 'Give the country.';

  const india = /^india$/i.test(String(b.country || '').trim());
  const pin = String(b.pin || '').trim();
  if (india ? !PIN_IN_RE.test(pin) : !PIN_OTHER_RE.test(pin)) {
    e.pin = india ? 'An Indian PIN code is six digits and does not start with zero.' : 'Give a postal code of 4 to 10 characters.';
  }

  /* step 3, ID proof */
  const key = idTypeKey(b.idType);
  if (!key) e.idType = 'Choose one of the five ID documents.';
  else if (!ID_TYPES[key].re.test(compact(b.idNumber))) {
    const article = /^[AEIOU]/.test(ID_TYPES[key].label) ? 'an' : 'a';
    e.idNumber = `That is not ${article} ${ID_TYPES[key].label} number — ${ID_TYPES[key].hint}.`;
  }
  if (!String(b.idFile || '').trim()) e.idFile = 'Upload the ID document.';
  else if (!DOC_EXTENSIONS.includes(extOf(b.idFile))) e.idFile = `Upload a ${DOC_EXTENSIONS.join(', ')} file.`;
  if (Number(b.idSizeKb || 0) * 1024 > MAX_UPLOAD_BYTES) e.idFile = 'That file is over 5 MB.';

  /* step 4, photograph */
  if (!String(b.photoFile || '').trim()) e.photoFile = 'Upload a photograph.';
  else if (!PHOTO_EXTENSIONS.includes(extOf(b.photoFile))) e.photoFile = `Upload a ${PHOTO_EXTENSIONS.join(', ')} image.`;
  if (Number(b.photoSizeKb || 0) * 1024 > MAX_UPLOAD_BYTES) e.photoFile = 'That photograph is over 5 MB.';

  /* step 5, declaration.
     The app will not let you past this step without ticking the box, so a
     submission without it means something bypassed the app. */
  if (b.agreed !== true) e.agreed = 'The declaration has to be accepted.';

  /* The app requires the signature to equal the full name including the
     middle name, so the server requires the same. */
  const fullName = [b.firstName, b.middleName, b.lastName].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
  if (String(b.signature || '').trim().toLowerCase() !== fullName.toLowerCase()) {
    e.signature = 'The typed signature has to match the full name given.';
  }

  /* step 6, video */
  const secs = Number(b.videoSecs || 0);
  if (!secs) e.videoSecs = 'Record the video.';
  else if (secs < MIN_VIDEO_SECONDS || secs > MAX_VIDEO_SECONDS) {
    e.videoSecs = `The video must be between ${MIN_VIDEO_SECONDS} and ${MAX_VIDEO_SECONDS} seconds.`;
  }

  /* who they are */
  if (!String(b.mobile || '').trim()) e.mobile = 'The mobile number is missing.';

  return {
    ok: Object.keys(e).length === 0,
    errors: e,
    value: {
      ...b,
      fullName,
      gender: String(b.gender || '').toLowerCase(),
      marital: String(b.marital || '').toLowerCase(),
      idType: key ? ID_TYPES[key].label : b.idType,
      idTypeKey: key,
      dob,
      /* The app derives the honorific from gender and marital status rather
         than asking for it. See the note in seed/registrations.js. */
      salutation: honorific(b.gender, b.marital),
    },
  };
}

/** What the app shows above the name. Mr / Mrs / Ms, or nothing. */
export function honorific(gender, marital) {
  const g = String(gender || '').toLowerCase();
  if (g === 'male') return 'Mr';
  if (g === 'female') return String(marital || '').toLowerCase() === 'married' ? 'Mrs' : 'Ms';
  return '';
}
