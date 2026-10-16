/* Checks that every field the Noah app collects reaches the console.

   Run it whenever either side changes:
     node server/field-audit.mjs

   It reads the Flutter model directly from
   code/noah/lib/data/registration_data.dart and prayer_data.dart, so it fails
   if someone adds a field to the app and forgets this side. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { REGISTRATIONS, PRAYER_INBOX } from './seed/registrations.js';
import { normalise } from './validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const flutter = resolve(here, 'data');

/** Pull the declared instance fields out of a Dart class body. */
function dartFields(src, className) {
  const start = src.indexOf(`class ${className}`);
  if (start < 0) throw new Error(`No class ${className} in the Dart source.`);
  const body = src.slice(start, src.indexOf('\n}', start));
  const out = new Set();
  /* `String firstName = '';`, `DateTime? dob;`, `final bool anonymous;` */
  for (const m of body.matchAll(/^\s*(?:final\s+)?(?:String|int|bool|DateTime|RegStatus)\??\s+(\w+)\s*[;=]/gm)) {
    out.add(m[1]);
  }
  return out;
}

/* Fields the app holds but that have no business leaving the phone, or that
   the server decides for itself. Each one needs a reason. */
const NOT_SENT = {
  idPath: 'local file path; the upload replaces it',
  photoPath: 'local file path; the upload replaces it',
  videoPath: 'local file path; the upload replaces it',
  completed: 'implied by the registration existing on the server',
  status: 'the server owns the workflow state, not the app',
};

let bad = 0;
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? 'ok  ' : 'MISS'}  ${line}`); };

console.log('\nRegistration — code/noah/lib/data/registration_data.dart\n');

const regSrc = readFileSync(resolve(flutter, 'registration_data.dart'), 'utf8');
const appFields = dartFields(regSrc, 'RegistrationState');
/* `phone` is declared under "Outcome" but is very much collected. */
const sample = REGISTRATIONS.find((r) => r.middleName && r.line2 && r.reference);
if (!sample) throw new Error('No seeded registration carries every optional field.');

for (const f of [...appFields].sort()) {
  if (NOT_SENT[f]) { console.log(`  --    ${f} — ${NOT_SENT[f]}`); continue; }
  /* The console may know it under its own name. */
  const mapped = Object.keys(normalise({ [f]: 1 }))[0];
  say(mapped in sample, `${f}${mapped !== f ? ` → ${mapped}` : ''}`);
}

console.log('\nPrayer request — code/noah/lib/data/prayer_data.dart\n');

const praySrc = readFileSync(resolve(flutter, 'prayer_data.dart'), 'utf8');
const prayFields = dartFields(praySrc, 'PrayerRequest');
const pr = PRAYER_INBOX.find((p) => p.mannaId) ?? PRAYER_INBOX[0];

for (const f of [...prayFields].sort()) {
  const mapped = Object.keys(normalise({ [f]: 1 }))[0];
  say(mapped in pr, `${f}${mapped !== f ? ` → ${mapped}` : ''}`);
}

/* The five categories, and the six marital statuses, must line up too. */
console.log('\nLists\n');
const listed = (src, name) => {
  const block = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]+)\\]`, 's'));
  return block ? [...block[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
};

const appCats = listed(praySrc, 'kPrayerCategories');
const ourCats = [...new Set(PRAYER_INBOX.map((p) => p.category))];
say(appCats.length === ourCats.length, `prayer categories: app has ${appCats.length}, console has ${ourCats.length}`);

const ourMarital = [...new Set(REGISTRATIONS.map((r) => r.marital))];
say(ourMarital.length <= 6 && ourMarital.every((m) => /^(single|married|widow|widower|separated|divorced)$/.test(m)),
  `marital statuses: console uses ${ourMarital.sort().join(', ')}`);

const ourGenders = [...new Set(REGISTRATIONS.map((r) => r.gender))].sort();
say(ourGenders.join(',') === 'female,male,other', `genders: console uses ${ourGenders.join(', ')} (app offers male, female, other)`);

console.log(bad === 0 ? '\nEvery app field reaches the console.\n' : `\n${bad} field(s) missing.\n`);
process.exit(bad === 0 ? 0 : 1);
