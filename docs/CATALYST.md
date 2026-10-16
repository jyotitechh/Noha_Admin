# Putting this on Zoho Catalyst

How the three pieces join up, and what has to change in each.

Nothing here has been built yet. This is the plan, written against the code
that exists today so the work can be estimated rather than guessed at.

**Your Catalyst account, as it stands:** org *Kishor* (`60088950048`), India
data centre, two empty projects (`zoho-catalyst`, `Project-Rainfall`), no
tables. A third project for this — call it `karuna-sadan` — is the first step.

The India data centre matters: the app's terms promise members that their
record is held in India, and `catalystserverless.in` keeps that true.

---

## 1. The shape of it

```
 Flutter app  ─┐
 (members)     │
               ├──► Catalyst ──► Data Store    the database
 React console ┘                 File Store    ID scans, photos, KYC video
 (staff)                         Functions     the API
                                 Cache         one-time codes, sessions
                                 Cron          scheduled jobs
                                 Push          "you have been approved"
```

Both clients talk to **one** API. That is the whole point: when the office
approves a registration, the member's app finds out because they are reading
and writing the same rows, not because anything was copied between systems.

Today that API is the Express server in `server/`, with its data in memory.
Catalyst replaces the *memory* part first, and the *hosting* part second.

---

## 2. Which Catalyst component does what

| Need | Catalyst component | Replaces |
|---|---|---|
| The database | **Data Store** (tables, queried with ZCQL) | `server/db.js`, `server/seed/` |
| The API | **AppSail** (runs a Node app) | hosting `server/index.js` |
| Hosting the console | **Web Client Hosting** (static) | `npm run build` → `dist/` |
| ID scans, photos, KYC video | **File Store**, or **Stratus** for the video | the placeholder boxes in the UI |
| One-time codes, sessions | **Cache** (key/value with a TTL) | the `Map`s in `server/auth.js` |
| Staff sign-in | **Catalyst Authentication** + Zoho SSO | the local OTP in `server/auth.js` |
| Scheduled jobs | **Cron functions** | the `JOBS` sample rows |
| Telling the app it was approved | **Push Notifications** | the app polling |

### Why AppSail rather than Advanced I/O functions

Both can host the API. AppSail runs a Node web app more or less as it is,
which means `server/index.js` and the two route files move across with their
routing, middleware and permission checks intact. Advanced I/O functions would
mean splitting the same code into separate deployable units.

Start with AppSail because the app already exists. Split the heavy or bursty
bits (video processing, bulk export) into their own functions later if they
need to scale differently.

---

## 3. The Data Store schema

The tables follow the collections the console already reads. The ones that
matter for the app-to-console link are first.

| Table | Holds | From |
|---|---|---|
| `Registrations` | the six-step registration and its workflow state | `seed/registrations.js` |
| `PrayerRequests` | requests from the app's pop-up, and their audience | `seed/registrations.js` |
| `Members` | the member register | `MEMBERS` |
| `Staff` | console sign-ins | `STAFF` |
| `Roles`, `RolePermissions` | the ten roles and what each may do | `seed/roles.js` |
| `AuditLog` | every change, append only | `AUD` |
| `Events`, `Passes`, `Halls` | events and the passes members book | `EVENTS`, `PASSES` |
| `Manna` | the daily devotional, one row per day per language | `MANNA` |
| `Receipts` | giving | `RECEIPTS` |
| `ModerationQueue`, `Flags`, `Praise`, `Obituaries` | what waits for a moderator | `MODQ` etc. |
| `JodieProfiles`, `JodieStages` | profiles and the four verification stages | `JPROFILES` |
| `Subscriptions`, `Plans`, `Invoices` | Jodie money | `SUBS`, `PLANS` |

### `Registrations`, in full

This is the table to get right, because it carries what a person swore to.

```
id                TEXT    REG-0000
mobile            TEXT    indexed; the app looks a registration up by this
firstName         TEXT
middleName        TEXT    optional
lastName          TEXT
fullName          TEXT    derived, stored so queries do not have to rebuild it
email             TEXT
gender            TEXT    male | female | other
dob               DATE
marital           TEXT    single | married | widow | widower | separated | divorced
reference         TEXT    optional, how they heard of Karuna Sadan
line1             TEXT
line2             TEXT    optional
city              TEXT
region            TEXT    state or province
country           TEXT
pin               TEXT
idType            TEXT    Aadhaar | PAN | Passport | Driving licence | Voter ID
idNumber          TEXT    see "What to encrypt" below
idFileId          TEXT    File Store id, not a filename
photoFileId       TEXT    File Store id
agreed            BOOLEAN the declaration tick box
declarationVersion TEXT   which wording they accepted
declarationLang   TEXT    en | hi | mr — which one they read
signature         TEXT    the typed name
signedOn          DATETIME
videoFileId       TEXT    Stratus id
videoSecs         INT
videoAttempt      INT
state             TEXT    pending | approved | videoReturned
submittedAt       DATETIME
decidedAt         DATETIME
decidedBy         TEXT    staff id
remark            TEXT    what the member is told when the video goes back
memberId          TEXT    set on approval; this is what unlocks the app
checksJson        TEXT    the office's three manual checks
```

### What to encrypt

Catalyst Data Store columns can be marked encrypted. These should be:

- `idNumber` — an Aadhaar or PAN number in the clear is a liability
- `mobile`, `email` on `Members` and `Registrations`
- anything on `JodieProfiles` that is not shown in the public deck

The `members.pii` permission already exists in the console and already writes
an audit entry every time contact details are revealed. Encrypting the column
makes that control real rather than procedural.

---

## 4. What changes in the React console

**Very little, and that was deliberate.** Every screen reads through one
file.

| File | Change |
|---|---|
| `src/lib/api.ts` | `BASE` points at the Catalyst URL instead of `/api`. |
| `src/state/auth.tsx` | `requestCode`/`verify` become the Zoho SSO redirect. |
| `src/modules/SignIn.tsx` | the OTP form and the staff-account list come out; a "Continue with Zoho" button goes in. |
| `vite.config.ts` | the dev proxy points at the Catalyst dev URL. |

Nothing in `src/modules/` changes. No screen knows where its data comes from.

Deploying it is `npm run build` and uploading `dist/` to Web Client Hosting.

---

## 5. What changes in the API

`server/` is about 1,500 lines. Here is what happens to each part.

| File | Lines | What happens |
|---|---|---|
| `server/db.js` | 79 | **Rewritten.** The in-memory object becomes Data Store calls. This is the real work. |
| `server/seed/` | — | **Becomes a one-off import script**, not part of the running app. Run it once against the dev project to get a usable dataset, then never again. |
| `server/auth.js` | 139 | **Rewritten** for Catalyst Authentication and Zoho SSO. `requirePerm` stays as it is. |
| `server/validate.js` | 195 | **Unchanged.** Pure functions, no I/O. |
| `server/queues.js` | 90 | **Changed in shape.** Counting rows in memory becomes `SELECT COUNT(*)` per queue, and they should be counted in one round trip rather than 29. |
| `server/routes/admin.js` | 360 | **Mostly unchanged.** Swap `find()`/array mutation for Data Store reads and updates; the permission checks and audit calls stay. |
| `server/routes/app.js` | 262 | **Mostly unchanged**, plus the real upload handling. |
| `server/index.js` | 223 | **Mostly unchanged.** The generic `/api/data/:name` reader becomes a ZCQL query with the same permission map. |

### The one thing to watch

`server/db.js` returns arrays, and the routes filter them with
`.filter()`/`.find()`. Against a database that becomes a query per call. The
read path in `index.js` already takes `q`, filters, `sort` and `limit` from
the query string, so it maps onto ZCQL cleanly — but **it must not fetch every
row and filter in Node**, which is what it does now and what would quietly
work in testing with 184 members and fall over with 18,000.

---

## 6. What changes in the Flutter app

`code/noah/docs/BACKEND_HANDOFF.md` already lists these. In short:

| File | Change |
|---|---|
| `lib/data/registration_data.dart` | `approve()` and `returnVideo()` go. They are the simulate buttons. Status comes from the server. |
| `lib/screens/registration/registration_status.dart` | the two "Prototype controls" buttons come out; the page polls `GET /app/registration/status`, or waits for a push. |
| `lib/data/prayer_data.dart` | `add()` posts to the server; the wall is fetched, not held locally. |
| `lib/data/*.dart` (the rest) | seed lists become API calls. The screens do not change — that is what the hand-off doc was written to guarantee. |
| everywhere | an HTTP client, the session token, and error handling for a server that says no. |

The API already accepts the app's own field names (`address1`, `state`,
`phone`, `videoSeconds`), so the Dart models do not need renaming. See
`server/validate.js`.

---

## 7. Authentication: two different problems

These are not the same thing and should not share a solution.

### Staff, in the console → Zoho SSO

Catalyst Authentication with Zoho as the provider. The staff member is
redirected to Zoho, comes back with a token, and the API maps their Zoho
identity to a row in `Staff` to get their role.

Everything downstream already works: `requirePerm` and the ten roles do not
care how the session was established.

### Members, in the app → mobile number and an OTP

Catalyst Authentication is built around email. A phone-number sign-in is
either a custom flow (send the code through an SMS provider, verify it in a
function, issue your own token) or whatever mobile authentication Catalyst
offers in the India DC — **check this against the current Catalyst docs before
committing to a design**, because it decides how much you build yourself.

The sample `SMSTPL` rows in the seed are a reminder that Indian SMS needs DLT
registration: sender id, registered template per message type, and the OTP
template approved before anything sends. That has a lead time. Start it early.

---

## 8. Uploads: the biggest genuinely new piece

The console shows ID scans, photographs and KYC videos as **labelled
placeholders**, because there is no file storage. This is the part that is not
a port of anything — it does not exist yet in either prototype.

What it needs:

1. **Upload from the app.** The Flutter app has the files (`idPath`,
   `photoPath`, `videoPath`). It should ask the API for a signed upload URL,
   put the file straight into File Store or Stratus, and send back the id.
   Going through the API doubles the transfer for no benefit.
2. **Limits enforced server-side.** 5 MB, jpg/jpeg/png/pdf for documents,
   jpg/jpeg/png for photographs, video 10–30 seconds. `server/validate.js`
   checks the *claimed* size and extension today; the real thing must check
   the file.
3. **Signed, expiring URLs for the console.** A staff member viewing an ID
   scan should get a short-lived URL, not a permanent one. The view should be
   audited the way revealing a phone number already is.
4. **The video actually playing.** The office cannot honestly approve a KYC
   video it has never watched. `src/modules/members/Registrations.tsx` has the
   box ready; it needs a real player.

Until this exists, the registration queue can be demonstrated but not used.

---

## 9. What is new work, not a port

Everything above is moving existing code. These have no equivalent today:

- **File upload and playback** (section 8) — the largest piece
- **Razorpay signature verification.** The app's payment sheet is a demo. The
  server must create the order, verify `payment_id`/`order_id`/`signature`,
  and only then grant membership, credits or an order. Nothing may be granted
  on the app's say-so.
- **Push notifications**, so the app learns it was approved without polling
- **SMS and DLT**, for the member OTP
- **The 53 console screens** that are routed but not built
- **Backups and a restore you have actually tested**
- **Zoho Books and CRM**, if the "Posted to Books" and "Synced to CRM" columns
  in the sample data are to mean anything

---

## 10. A sensible order

Each step leaves something that works.

1. **Create the project**, pick the India DC, set up dev and production.
2. **Create the tables**, starting with `Registrations`, `Members`, `Staff`,
   `Roles`, `AuditLog`.
3. **Import the sample data once** into dev, from `server/seed/`. Now there is
   something to develop against.
4. **Rewrite `db.js`** against the Data Store. The console should work exactly
   as it does now, against real rows. *This is the step that proves the plan.*
5. **Deploy the API to AppSail**, the console to Web Client Hosting. Now it is
   a real deployment with fake auth.
6. **Zoho SSO for staff.** The console is now genuinely secured.
7. **File uploads.** The registration queue becomes usable rather than a demo.
8. **Point the Flutter app at it** and delete the simulate buttons. End to end.
9. **Member OTP, push, payments.**
10. **The remaining console screens**, in whatever order the office needs them.

Steps 1 to 4 are where the uncertainty is. Everything after is ordinary work.

---

## 11. Things that will bite

- **Catalyst Data Store is not Postgres.** ZCQL is a subset of SQL. No joins
  in the way you expect, no transactions across tables. The console's writes
  are mostly single-row, which helps, but *approve a registration* writes a
  member **and** updates the registration **and** appends an audit row. If it
  fails halfway you get a member with no registration pointing at them. Decide
  now whether that is reconciled by a cron job or avoided some other way.
- **Row limits and query costs.** Check the plan's limits against 18,000
  members and a daily-growing audit log before the schema is fixed.
- **The audit log grows forever.** It is append-only by design. Plan where old
  entries go.
- **Dates.** The sample data is pinned to 9 October 2026 and moves in real
  time. Real data will not behave that way; anything that assumed it needs a
  second look.
- **`checksJson`, and other JSON-in-a-column.** Convenient, unqueryable.
  Fine for the office's three tick boxes, wrong for anything you will report
  on.
- **Two prototypes still disagree in places.** The salutation question is
  settled (see the README); assume others will surface as screens get built.

---

## Where things are

| | |
|---|---|
| This console and its API | `admin/code/` |
| The API contract the app expects | `code/noah/docs/BACKEND_HANDOFF.md` |
| The Flutter app | `code/noah/` |
| The HTML prototypes | `admin/index.html`, `index.html` |
| Field mapping and validation | `admin/code/server/validate.js` |
| Field coverage check | `npm run audit:fields` |
