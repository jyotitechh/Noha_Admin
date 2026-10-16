# Karuna Sadan — admin console (React)

The staff side of the Noah and Jodie apps, as a React application with a mock
API behind it.

It replaces the single-file HTML prototype at `admin/index.html`. That file
still works and is worth keeping open beside this one: it has screens this
build has not reached yet, and the navigation here says which.

**There is no Zoho single sign-on.** Sign-in is a local email and one-time
code. [Putting Zoho SSO back](#putting-zoho-sso-back) is two files.

---

## Running it

```bash
npm install
npm run dev
```

That starts both halves:

| | |
|---|---|
| Console | <http://localhost:5173> |
| Mock API | <http://localhost:4000> |

Sign in with any active staff email — `anitha.varghese@karunasadan.org` is the
super administrator. **Nothing is emailed**: the one-time code is printed in
the API's terminal and shown on screen. The sign-in page also lists the staff
accounts so you can try each role; both of those are prototype affordances and
are marked as such in `src/modules/SignIn.tsx`.

Other commands:

```bash
npm run dev:web     # console only
npm run dev:api     # API only
npm run typecheck   # tsc, no emit
npm run build       # typecheck then production build
```

---

## What it connects

The point of this build is that the console and the mobile app are joined up.
Two queues drive that, and **neither existed in the HTML prototype**:

### Member registrations — `/members/registrations`

A new member finishes the six-step registration in the Flutter app and waits.
Today the app fakes the outcome with its own *Simulate: admin approves* and
*Simulate: admin returns the video* buttons. This screen is the real decision.

The office sees all six steps in the order the app asked for them — details,
address, ID proof, photograph, declaration with the typed signature, and the
KYC video with the script the member was asked to read — plus the checks it
must satisfy itself about.

- **Approve** creates the member record. That is what unlocks the app.
- **Return the video** sends them back to step six, with a note they read on
  their waiting screen.

The app reads the outcome from `GET /api/app/registration/status`, which is
what it should poll instead of its simulate buttons.

### App prayer requests — `/community/prayer-inbox`

Requests raised from the prayer pop-up. Nothing reaches another member's wall
until a moderator approves it, and **the audience the member chose is
honoured**: `everyone: false` means prayer warriors only, and the server
filters `GET /api/app/prayer` by it. Approving does not widen the audience.

### Proving it end to end

```bash
# Ask what the app sees for a waiting registration
curl -s -G http://localhost:4000/api/app/registration/status \
  --data-urlencode "mobile=+91 94231 44290"
# -> {"state":"pending", ...}

# ... approve that person in the console ...

curl -s -X POST http://localhost:4000/api/app/auth/verify \
  -H 'content-type: application/json' \
  -d '{"mobile":"+91 94231 44290","code":"4821"}'
# -> {"status":"member","member":{"name":"Blessy Mathai", ...}}
```

---

## Documents for the integration

Three developers, three repositories, one contract.

| Document | For |
|---|---|
| [docs/REGISTRATION-FLOW.md](docs/REGISTRATION-FLOW.md) | what happens at every stage, in which system |
| [docs/API-CONTRACT.md](docs/API-CONTRACT.md) | every endpoint, field, status word and status code |
| [docs/INTEGRATION-PLAN.md](docs/INTEGRATION-PLAN.md) | who does what, in what order |
| [docs/CATALYST.md](docs/CATALYST.md) | which Catalyst component replaces what |

`server/` is a **working implementation** of that contract, and this proves
any backend matches it:

```bash
npm run test:contract                              # the local mock
node server/contract-test.mjs https://<catalyst>   # the real thing
```

78 checks: the whole registration journey, every validation rule, and the two
things easiest to get wrong — that an unapproved registration is never given a
token, and that the wrong role cannot approve one.

## Field coverage

Every field the Flutter app collects reaches the console. Checked by:

```bash
npm run audit:fields
```

It reads `code/noah/lib/data/registration_data.dart` and `prayer_data.dart`
directly and fails if a field is added to the app and not handled here, so
the two cannot drift apart quietly. It also runs as part of `npm run build`.

### Names differ on purpose

The app and the console grew up apart and name some things differently. The
**app's names are what go on the wire**; `server/validate.js` maps them, so
the Flutter app can post its own field names unchanged.

| App | Console | Why |
|---|---|---|
| `address1`, `address2` | `line1`, `line2` | console wording |
| `state` | `region` | `state` here is the workflow state |
| `videoSeconds` | `videoSecs` | console wording |
| `phone` | `mobile` | console wording |
| `categoryKey` (`pr_cat_healing`) | `category` (`Healing`) | a moderator reads it |
| `mannaTitleKey` | `mannaId` | console wording |

Four app fields are deliberately not sent: `idPath`, `photoPath` and
`videoPath` are local file paths that the upload replaces, and `status` is the
server's to decide, not the app's.

### Salutation: the two prototypes disagree

The older HTML prototype **asked** for a salutation from six options (Mr, Mrs,
Ms, Dr, Bro., Sis.). The Flutter app does not ask at all — it **derives** an
honorific from gender and marital status: male → Mr, female married → Mrs,
female otherwise → Ms, other → nothing.

The app is the newer of the two and is what members actually fill in, so the
console follows the app and derives it the same way. **If the client wants the
six-option list, it has to go into the app first** — the console cannot show a
title nobody was asked for.

### Validation is now the app's, enforced server-side

`server/validate.js` is a port of the rules in `registration_data.dart`, so
the server refuses exactly what the app refuses. The app validates to be
helpful; this is what decides, because the app can be bypassed.

- Name parts: letters, spaces, full stop, apostrophe, hyphen
- Email, and **age 18 or over**
- PIN: six digits not starting with zero for India; 4 to 10 characters elsewhere
- ID number: a format check per type —
  Aadhaar `[2-9]` + 11 digits, PAN `AAAAA9999A`, Passport letter + 7 digits,
  Driving licence `MH12 20110012345`, Voter ID `ABC1234567`
- Uploads: 5 MB limit; jpg/jpeg/png/pdf for documents, jpg/jpeg/png for photos
- Declaration **ticked**, and the typed signature equal to the full name
  including the middle name
- Video between 10 and 30 seconds

A rejection comes back as a field-to-message map plus `step`, the first of the
six steps that needs fixing, so the app can open that step and put each
message against its own box.

## What is built, and what is not

28 of 81 tabs are implemented against the API. **Every one of the 17 areas is
in the navigation and routed** — a tab that is not built says what it will
hold and which prototype screen it comes from, so nothing is a dead end. The
sidebar foot shows the count.

| Area | Built | Routed, not built |
|---|---|---|
| Dashboard, Work queues | both | — |
| Membership | App registrations, Member register, Video checks | Families, Pastoral hierarchy, Groups, Partnership, Duplicates |
| Community | App prayer requests, Approval queue, Flagged, Praise | Prayer wall, Obituaries, Feedback, Polls, Rewards |
| Content | Daily Manna, Banners and announcements | Library, Study, Courses, Media |
| Events | Events, Passes | Halls, Attendance, Services, Operations, Transport |
| Giving and finance | Receipts | Reconciliation, Gateways, Accounting, Expenses, Batches, Transactions, Tax |
| Communications | Member threads | Broadcast, Push, Email, Calls, SMS |
| Files and operations | Store | Drive, Tasks, Assets, Inventory, Administration |
| Jodie verification | To verify, Recently decided | — |
| Jodie admin | Profiles, Blocks and reports | Support, Featured, Questionnaire, Calls, Outbound, Content, Masters |
| Subscriptions | Subscriptions, Plans, Dunning | Mandates, Settlement, Refunds |
| Staff and permissions | Accounts, Roles, Coverage | Effective permissions |
| Audit log, Reporting | Audit log, Report library | Scheduled, Exports |
| App roles | — | all four |

---

## How it is put together

```
server/
  index.js            API, generic collection reads, permission map
  auth.js             email + one-time code, sessions, permission middleware
  db.js               the in-memory store and the audit log
  queues.js           the work queues, counted live
  routes/admin.js     everything the console writes
  routes/app.js       member-facing routes, for the Flutter app
  seed/
    data.js           sample data, copied from admin/_src/20-data.js
    helpers.js        the helpers that generator needs
    roles.js          staff, permissions and the ten roles
    registrations.js  NEW: registrations and prayer requests from the app
src/
  lib/                api client, formatting, icons, types, useQuery
  state/              auth and the work queues
  components/         shared UI, Table, DecisionQueue, ListScreen, layers
  modules/            registry.ts (every area) and one folder per area
  styles/             prototype.css (unedited) + app.css (additions)
```

### The sample data is the prototype's

`server/seed/data.js` is `admin/_src/20-data.js` with an import at the top and
an export block at the foot. The generator body is untouched and seeded, so
the console shows the same 184 members, 260 receipts and 96 Jodie profiles as
the HTML prototype, in the same order, on every boot.

Everything is pinned to **Friday 9 October 2026, 10:30 IST** and moves forward
in real time from page load, so ages and SLA colours behave.

### The design system is the prototype's

`src/styles/prototype.css` is `admin/_src/style.css`, unedited, so it can be
refreshed if that file changes. React-specific additions go in `app.css`.

### Permissions are enforced, not decorated

`can()` in the console hides what a role cannot use. The API checks the same
list on every call, so the hiding is a courtesy and the refusal is the
control. **Staff → Authorisation coverage** lists every endpoint and the
permission guarding it.

The account menu switches the console between the ten roles, which changes
what both halves allow. Verified across all ten: a content editor gets 403 on
`GET /api/data/MEMBERS`; only a super administrator or a membership officer
can approve a registration.

### Every change is recorded

Each write appends to the audit log with actor, role, record, before and
after. Reading a member's contact details is itself a logged action. Entries
made in the current session are marked, so you can watch your own work land.

---

## Putting Zoho SSO back

Two files, and nothing else moves:

- `server/auth.js` — issue the session after the Zoho callback instead of
  after `verify`. The roles, permissions and middleware stay as they are.
- `src/state/auth.tsx` — replace `requestCode` and `verify` with the redirect.
  `can`, `user` and every screen reading them are unaffected.

The prototype's sidebar had a "Zoho, single sign-on" block of three buttons
(CRM, Books, Analytics). It is not in this build.

---

## Swapping the mock API for a real backend

The plan for doing this on Zoho Catalyst is in [docs/CATALYST.md](docs/CATALYST.md):
which Catalyst component replaces what, the Data Store schema, and the order
to do it in.


The console only ever talks to `src/lib/api.ts`. Point `BASE` at the real
service and the screens do not change.

On the server side, `code/noah/docs/BACKEND_HANDOFF.md` is the contract the
`/api/app/*` routes follow. What a real implementation has to add:

1. **A database.** Everything is in memory and resets on restart.
2. **File storage.** ID scans, photographs and KYC videos are placeholders;
   the screens show labelled boxes rather than pretending otherwise.
3. **A mailer**, so the one-time code stops being returned in the response.
4. **Razorpay signature verification** before granting membership or credits.
5. **Push or polling**, to replace the app's simulate buttons.

---

## Still open, for the client

Carried over from the mobile prototype's session log, and unchanged here:

1. **The video KYC script is placeholder wording.** It is generated in
   `server/seed/registrations.js` → `videoScript()`, using the member's own
   name, city and reference. The client's final wording drops in there.
2. **The declaration PDF is not attached.** The declaration text (English,
   Hindi, Marathi) is the client's; the "open the full document" link is not.
3. **The office contact is made up** — Anitha Varghese, +91 98200 00000. It is
   returned by `GET /api/app/registration/status` and shown on the app's
   waiting page. Replace it with the real number.
4. **Hindi and Marathi need a native reviewer.** The declaration text was
   repaired from a damaged PDF copy and must be checked against the original.

## Known limitations

- No persistence: restarting the API resets everything to the seed.
- No file uploads; the API accepts filenames, not files.
- Replying to a member thread is not built, only reading.
- The console is desktop-first. It holds together down to a tablet; below that
  the sidebar collapses behind the menu button but the dense tables are
  cramped.
