/* Member registrations arriving from the Noah mobile app.

   This collection is NEW. The HTML prototype had no queue for it: the Flutter
   app fakes the decision with its own "Simulate: admin approves" and
   "Simulate: admin returns the video" buttons (see the session log, item 4,
   and docs/BACKEND_HANDOFF.md section 3, "Registration").

   The shape below is the six-step registration the Flutter app collects:
     1 details   2 address   3 ID proof   4 photo   5 declaration   6 video KYC

   Office workflow, as the hand-off doc specifies it:
     pending -> approved        the member may open the app
     pending -> videoReturned   the member re-records step 6 and resubmits

   Access stays locked server side until a registration is approved, so the
   app's simulate buttons can be removed once it points at this API. */

import { dAgo, hAgo, pick, ri, chance, rnd } from './helpers.js';

/* The app does NOT ask for a salutation. It derives an honorific from gender
   and marital status (registration_data.dart, `honorific`): male -> Mr,
   female married -> Mrs, female otherwise -> Ms, other -> nothing.

   The older HTML prototype did ask for one, from a list of six. The app is
   the newer of the two and is what members actually fill in, so the app wins
   and this seed derives it the same way. If the client wants the six-option
   list back, it has to go into the app first. */
const honorific = (gender, marital) => {
  if (gender === 'male') return 'Mr';
  if (gender === 'female') return marital === 'married' ? 'Mrs' : 'Ms';
  return '';
};
/* The six the app offers, in its own lower-case keys. */
const MARITAL = ['single', 'married', 'widow', 'widower', 'separated', 'divorced'];
const ID_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving licence', 'Voter ID'];
const DECL_LANGS = ['en', 'hi', 'mr'];

const FIRST_M = ['Jeevan', 'Nithin', 'Allen', 'Vivek', 'Tobin', 'Ajay', 'Melvin', 'Ashish'];
const FIRST_F = ['Sherin', 'Anju', 'Blessy', 'Nikita', 'Reshma', 'Tina', 'Alphy', 'Linet'];
const MIDDLE = ['', '', '', 'Kumar', 'Mary', 'Raj', 'Grace'];
const LAST = ['Varkey', 'Mathai', 'Dsouza', 'Patil', 'Jose', 'Antony', 'Salve', 'Philip'];

/* City, region (state or province), country, a sample postal code.
   The address field is called `region`, not `state`: `state` on a registration
   is the workflow state (pending, approved, videoReturned). */
const CITIES = [
  ['Mumbai', 'Maharashtra', 'India', '400053'],
  ['Thane', 'Maharashtra', 'India', '400601'],
  ['Pune', 'Maharashtra', 'India', '411006'],
  ['Bengaluru', 'Karnataka', 'India', '560038'],
  ['Kochi', 'Kerala', 'India', '682025'],
  ['Hyderabad', 'Telangana', 'India', '500003'],
  ['Dubai', 'Dubai', 'United Arab Emirates', '00000'],
];

const HOW_HEARD = [
  'Ps. Emmanuel Kumar',
  'A friend at the Andheri Sunday service',
  'My cell leader, Rajesh Kamble',
  'The Night of Worship poster',
  '',
  '',
];

/* An ID number in the right shape for its type. Sample data only. */
function idNumber(type) {
  const digits = (n) => Array.from({ length: n }, () => ri(0, 9)).join('');
  const letters = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[ri(0, 23)]).join('');
  switch (type) {
    case 'Aadhaar': return digits(4) + ' ' + digits(4) + ' ' + digits(4);
    case 'PAN': return letters(5) + digits(4) + letters(1);
    case 'Passport': return letters(1) + digits(7);
    case 'Driving licence': return letters(2) + digits(2) + ' ' + digits(11);
    default: return letters(3) + digits(7);
  }
}

/* The video KYC reading line, built from the member's own answers. The final
   wording is still with the client (session log, placeholder 2). */
export function videoScript(r) {
  const place = [r.city, r.country].filter(Boolean).join(', ');
  const heard = r.reference
    ? ` I came to know about Karuna Sadan through ${r.reference}.`
    : ' I came to this application through the Karuna Sadan registration process.';
  return `I am ${r.fullName}, from ${place}.${heard} I agree to the declaration I signed on ${r.signedOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
}

const REGISTRATIONS = [];
let _rseq = 7400;

/* 14 registrations: most waiting, a few already decided so the queue has
   history to show. Hours-ago values drive the ageing and SLA colours. */
const PLAN = [
  { state: 'pending', h: 2 }, { state: 'pending', h: 5 }, { state: 'pending', h: 9 },
  { state: 'pending', h: 14 }, { state: 'pending', h: 21 }, { state: 'pending', h: 27 },
  { state: 'pending', h: 33 }, { state: 'pending', h: 46 }, { state: 'pending', h: 58 },
  { state: 'videoReturned', h: 30 }, { state: 'videoReturned', h: 52 },
  { state: 'approved', h: 20 }, { state: 'approved', h: 44 }, { state: 'approved', h: 70 },
];

PLAN.forEach((plan, i) => {
  /* The app offers male, female and other, so the sample data has all three. */
  const gender = i === 6 ? 'other' : chance(0.5) ? 'male' : 'female';
  const first = gender === 'female' ? pick(FIRST_F) : pick(FIRST_M);
  const middle = pick(MIDDLE);
  const last = pick(LAST);
  const fullName = [first, middle, last].filter(Boolean).join(' ');
  const [city, region, country, pin] = pick(CITIES);
  const idType = pick(ID_TYPES);
  const at = hAgo(plan.h);
  const attempt = plan.state === 'videoReturned' ? 1 : chance(0.15) ? 2 : 1;
  const marital = pick(MARITAL);

  const reg = {
    id: 'REG-' + (++_rseq),
    /* step 1, details */
    salutation: honorific(gender, marital),
    firstName: first,
    middleName: middle,
    lastName: last,
    fullName,
    mobile: '+91 9' + ri(1000, 9999) + ' ' + ri(10000, 99999),
    email: (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
    gender,
    dob: dAgo(ri(19, 54) * 365 + ri(0, 364)),
    marital,
    reference: pick(HOW_HEARD),
    /* step 2, address */
    line1: ['Flat ' + ri(101, 904), 'House ' + ri(2, 88), 'B-' + ri(1, 40)][ri(0, 2)] + ', ' +
           pick(['Shanti Nagar', 'Gokul Dham', 'Church Road', 'Sai Krupa CHS', 'Green Park']),
    line2: chance(0.5) ? pick(['Near St. Peter’s School', 'Opposite the bus depot', 'Off Link Road']) : '',
    city, region, country, pin,
    /* step 3, ID proof */
    idType,
    idNumber: idNumber(idType),
    idFile: 'id-' + (_rseq) + (chance(0.6) ? '.jpg' : '.pdf'),
    idSizeKb: ri(240, 3800),
    /* step 4, photo */
    photoFile: 'photo-' + (_rseq) + '.jpg',
    photoSizeKb: ri(180, 2400),
    /* step 5, declaration and typed signature */
    agreed: true,
    declarationVersion: '2026.09',
    declarationLang: pick(DECL_LANGS),
    signature: fullName,
    signedOn: at,
    /* step 6, video KYC */
    videoSecs: ri(11, 29),
    videoFile: 'kyc-' + (_rseq) + '.mp4',
    videoAttempt: attempt,
    /* workflow */
    state: plan.state,
    at,
    decidedAt: plan.state === 'pending' ? null : hAgo(Math.max(1, plan.h - ri(2, 8))),
    decidedBy: plan.state === 'pending' ? '' : pick(['Anitha Varghese', 'Esther Daniel', 'Joyce Pereira']),
    remark: plan.state === 'videoReturned'
      ? pick([
          'The video is too dark to match the photograph. Please re-record in daylight.',
          'The reading stopped halfway. Please record the whole line.',
          'The face is not visible for the whole recording.',
        ])
      : '',
    memberId: null,
    /* checks the office works through before deciding */
    checks: {
      idReadable: chance(0.9),
      photoMatchesId: chance(0.85),
      videoAudible: plan.state === 'videoReturned' ? false : chance(0.92),
      nameMatchesSignature: true,
      ageOver18: true,
      duplicateMobile: chance(0.07),
    },
  };
  reg.script = videoScript(reg);
  REGISTRATIONS.push(reg);
});

/* Prayer requests raised in the mobile app and waiting for a moderator.
   The prototype's PRAYERS collection is the prayer wall; this is the queue the
   app's "New prayer request" pop-up feeds (session log, item 39).
   `everyone: false` means prayer warriors only, which the server enforces. */
const PRAYER_INBOX = [];
const PR_CATS = ['Healing', 'Family', 'Guidance', 'Thanksgiving', 'Other'];
const PR_BODY = [
  'Please pray for my mother, she has surgery on Thursday morning.',
  'I have an interview on Monday after eight months without work.',
  'For peace in our home and patience with my father.',
  'My daughter writes her final exams next week.',
  'Safe travel for my brother flying to Kochi on Saturday.',
  'For my visa decision, it has been pending for four months.',
  'Recovery from dengue, I have been in hospital since Sunday.',
  'Wisdom about whether to take a job in another city.',
  'Thank God, the loan came through. Praying it is used well.',
  'For my neighbour who lost her husband last month.',
];

PR_BODY.forEach((text, i) => {
  PRAYER_INBOX.push({
    id: 'PRQ-' + (3100 + i),
    category: PR_CATS[i % PR_CATS.length],
    text,
    everyone: chance(0.35),
    anonymous: chance(0.3),
    memberName: '',
    mobile: '+91 9' + ri(1000, 9999) + ' ' + ri(10000, 99999),
    at: hAgo(ri(1, 40) + rnd()),
    /* Set when the member wrote the request straight from a Daily Manna
       reading. The app passes the Manna it was open on; the moderator sees
       what prompted it. */
    mannaId: i === 1 || i === 4 || i === 7 ? 'DM-' + pick(['6-Oct', '7-Oct', '8-Oct']) : null,
    state: i < 6 ? 'Pending' : i < 8 ? 'Approved' : 'Declined',
    decidedBy: i < 6 ? '' : pick(['Priya Kamble', 'Deborah Masih']),
    remark: i === 9 ? 'Contains a phone number; asked the member to resend without it.' : '',
    prayedBy: i < 6 ? 0 : ri(4, 90),
  });
});

export { REGISTRATIONS, PRAYER_INBOX, MARITAL, ID_TYPES, DECL_LANGS, honorific };
