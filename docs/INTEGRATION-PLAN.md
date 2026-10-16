# Milestone 1: registration, end to end

**Flutter app → Zoho Catalyst → admin console.** A member registers, the
office approves, the app unlocks.

Three developers, three repositories, one contract.

| Who | Owns | Repository |
|---|---|---|
| Flutter developer | the member app | GitHub |
| Catalyst developer | the backend: Data Store, functions, hosting | Catalyst project |
| You | the admin console | `admin/code/` |

**Everything in the registration journey, done properly**: real OTP by SMS,
all the text fields, the ID scan, the photograph and the KYC video. The
client's wording is that the registration page should work perfectly, so there
is no "we will add uploads later" in this milestone.

The stage-by-stage flow is in
[REGISTRATION-FLOW.md](REGISTRATION-FLOW.md). This document is who does what,
in what order.

> **Start DLT registration today.** Indian SMS needs the sender id and each
> template approved by a telecom operator before anything can send. That is
> weeks, and it is paperwork, not code. If it starts when the code is ready,
> everything waits on it. See [step 1b](#step-1b--start-dlt-registration-catalyst-developer-day-one).

---

## The one thing that makes this work

Three people cannot integrate by talking. They integrate by building against
the same written contract and testing against it.

| Artifact | What it is for |
|---|---|
| [`docs/API-CONTRACT.md`](API-CONTRACT.md) | every endpoint, field, status word and status code |
| `admin/code/server/` | a **working implementation** of that contract |
| `npm run test:contract` | **78 checks** that prove a backend matches it |

The Catalyst developer is not being asked to guess. They have a running
reference they can call, read and copy, and a command that tells them when
they are done:

```bash
node server/contract-test.mjs https://<their-catalyst-url>
```

It walks the whole journey — submit, every validation rule, poll, return the
video, re-record, approve, sign in — and prints exactly what does not match.
**When it passes, milestone 1 is integrated.** Not before, and nothing else
needs to be argued about.

---

## Step by step

### Step 0 — agree the contract (everyone, half a day)

Get all three on a call. Walk `docs/API-CONTRACT.md` top to bottom. Settle:

- the field names (they are the Flutter app's own, so the Dart models do not
  change — confirm the Flutter developer is happy)
- the three status words: `pending`, `approved`, `videoReturned`
- the error shape: `{ error, errors: { field: message }, step }`

**Do not skip this.** Everything after assumes all three built the same thing.
Half a day here saves a week later.

**Output:** the contract is frozen. Changes from now on get announced to all
three.

---

### Step 1 — the Catalyst project exists (Catalyst developer, half a day)

1. Create a project — `karuna-sadan` — in org *Kishor* (`60088950048`).
2. **India data centre.** The app's terms promise members their record is held
   in India. `catalystserverless.in` keeps that true.
3. Development and Production environments. All of milestone 1 is Development.
4. Give you and the Flutter developer the dev URL and whatever access you need
   to see logs.

**Done when:** everyone has the dev URL.

---

### Step 1b — start DLT registration (Catalyst developer, day one)

**This runs in parallel with everything else and must start now.**

Indian SMS requires, with a telecom operator:

1. an entity registration
2. a **sender id** (the six letters that appear as the sender, e.g. `KSMNOA`)
3. **each message template approved** — the OTP one at minimum

Weeks, not days, and it is paperwork rather than engineering. Nothing else on
this plan is blocked by it, so long as it starts on day one.

Until it clears, everyone keeps using the mock's fixed code `4821`.

**Done when:** a test SMS arrives on a real phone from the registered sender
id. Track it from day one; it is the likeliest thing to delay go-live.

---

### Step 2 — the tables (Catalyst developer, 1 day)

Milestone 1 needs four:

| Table | Why |
|---|---|
| `Registrations` | the full column list is in [API-CONTRACT.md](API-CONTRACT.md#registrations-in-full) |
| `Members` | created when the office approves |
| `Staff` | who may sign in to the console |
| `AuditLog` | every decision, append only |

Encrypt `idNumber`, `mobile` and `email`. See
[CATALYST.md § What to encrypt](CATALYST.md#what-to-encrypt).

**Done when:** `Registrations` accepts a hand-written row with every field.

---

### Step 2b — storage and the upload endpoints (Catalyst developer, 2 days)

The three uploads. **The file never passes through the API** — the app asks
for a place to put it and uploads straight to storage.

| Endpoint | Does |
|---|---|
| `POST /app/uploads` | `{ kind, filename, bytes }` → `{ fileId, uploadUrl }`, a signed PUT |
| `GET /registrations/:id/file/:kind` | a short-lived URL for the office, **audited** |

| Upload | Accepts | Limit | Store |
|---|---|---|---|
| ID scan | jpg, jpeg, png, pdf | 5 MB | File Store |
| Photograph | jpg, jpeg, png | 5 MB | File Store |
| KYC video | mp4, mov | ~60 MB | **Stratus** |

**Check what actually arrived**, not the filename and byte count the app
claimed. Both are whatever the app says.

**Done when:** a file uploaded from a phone can be opened by the console
through a URL that expires.

---

### Step 3 — the member endpoints (Catalyst developer, 4–5 days)

Five endpoints. They are what the Flutter app calls.

| Endpoint | Note |
|---|---|
| `POST /app/auth/request-otp` | caches the code 5 min, sends the SMS, **returns nothing but ok** |
| `POST /app/auth/verify` | returns `member` \| `new` \| `pending` |
| `POST /app/registration` | **all validation re-run server-side** |
| `GET /app/registration/status` | what the waiting screen polls |
| `POST /app/registration/video` | re-record after a return |

On the OTP: keep it in **Cache**, not a table — 5-minute expiry, **one use**,
delete on success, die after five wrong attempts, and **rate limit by
number**. A backend that returns the code in the response is a backend anyone
can sign in to; the mock does it only because there is no SMS yet.

Three things that are easy to miss and are checked by the test:

1. **Accept the app's field names.** `address1`, `state`, `phone`,
   `videoSeconds`. If this is wrong the app cannot submit at all.
2. **Derive the honorific.** The app does not send one. `male` → `Mr`,
   `female` + `married` → `Mrs`, `female` otherwise → `Ms`, `other` → `""`.
3. **Never issue a usable token before approval.** `status: "pending"` must
   not come with a token. This is the whole security model.

`server/validate.js` is the validation, ready to copy — it is pure functions
with no I/O, so it can be lifted into a Catalyst function as it is.

**Done when:** `node server/contract-test.mjs <url>` reaches the admin section
without a failure.

---

### Step 4 — the admin endpoints (Catalyst developer, 2–3 days)

| Endpoint | Does |
|---|---|
| `GET /data/REGISTRATIONS` | the queue, with `state`, `q`, `sort`, `limit` |
| `GET /data/REGISTRATIONS/:id` | one |
| `POST /registrations/:id/approve` | creates the member, sets `approved` |
| `POST /registrations/:id/return-video` | `remark` required |
| `PATCH /registrations/:id/checks` | the office's tick boxes |
| `GET /queues` | the sidebar counts |
| staff sign-in | email + one-time code for now; Zoho SSO later |

**`approve` writes to three tables and Catalyst has no transaction across
them.** Decide now how a half-failure is handled. See
[API-CONTRACT.md](API-CONTRACT.md#approve-must-do-three-things-together).

**Done when:** the contract test passes all 78 checks.

---

### Step 4b — the video player in the console (you, 1 day)

The review panel already has the box. It needs to fetch the signed URL and
actually play the file.

**This is not optional.** Without it the office is approving a KYC video it
has never watched, which is the one thing the whole queue exists to prevent.
Same for the ID scan and the photograph: they need to be viewable at a size
where a face can be compared.

**Done when:** a video recorded on a phone plays in the console, and opening
it leaves an entry in the audit log.

---

### Step 5 — point the console at Catalyst (you, half a day)

One line:

```ts
// src/lib/api.ts
const BASE = import.meta.env.VITE_API_BASE ?? '/api';
```

Then `VITE_API_BASE=https://<catalyst-url>/api` in `.env.local`, and the dev
proxy in `vite.config.ts` points at the same place.

**Nothing in `src/modules/` changes.** No screen knows where its data comes
from. That was the point of routing everything through one file.

**Until this step you are not blocked.** Keep running `npm run dev` against
the local mock and keep building console screens. You only switch when
Catalyst is ready, and you can switch back by unsetting one variable.

**Done when:** the console shows registrations from Catalyst, and approving in
it changes the row in the Data Store.

---

### Step 6 — point the app at Catalyst (Flutter developer, 4–5 days)

1. Add an HTTP client and the base URL.
2. `POST /app/auth/request-otp` on the number screen; the resend timer uses
   `resendAfterSeconds`.
3. `POST /app/auth/verify`, then branch on `member` / `new` / `pending`.
4. **Upload each file as it is picked**, not all at the end — step 3 uploads
   the scan while the member fills in step 4. Keep the local path, show a
   retry on failure, and **never lose the typed answers because an upload
   failed**. On a phone connection this is the difference between a flow that
   completes and one people abandon.
5. `POST /app/registration` on **Complete registration**, sending the three
   `fileId`s.
6. The status page polls `GET /app/registration/status` every 20–30 seconds.
7. **Delete the two prototype buttons** — *Simulate: admin approves* and
   *Simulate: admin returns the video* — in `registration_status.dart`, and
   `approve()` / `returnVideo()` in `lib/data/registration_data.dart`.
8. Show `errors` against the right fields and jump to `step` on a `400`.

The Flutter developer can start this **as soon as the contract is agreed**, by
pointing at your machine's mock on port 4000. They do not wait for Catalyst.

**Done when:** a real phone registers and lands on the waiting screen.

---

### Step 7 — the three of you in a room (half a day)

On one call, one journey, on a real phone:

1. Types their number → **a real SMS arrives**
2. Enters the code → registration opens
3. Fills all six steps, **uploads a real scan, photo and video**
4. Taps Complete → waiting screen
5. You open the console → it is in the queue, every field correct, and **you
   can watch the video and read the ID**
6. You return the video with a reason → their phone shows that sentence and
   reopens step 6 only
7. They re-record → back in your queue
8. You approve → **their phone opens the app**

That is milestone 1. Record it; the client will want to see it.

---

### Step 8 — deploy the console (Catalyst developer + you, half a day)

```bash
npm run build      # typecheck, field audit, then build to dist/
```

`dist/` goes to **Catalyst Web Client Hosting**, same project as the API — no
CORS, one domain, one deploy.

---

## Rough shape of it

| Step | Who | Days |
|---|---|---|
| 0 agree the contract | all three | 0.5 |
| 1 project | Catalyst | 0.5 |
| **1b DLT registration** | **Catalyst** | **starts day one, weeks to clear** |
| 2 tables | Catalyst | 1 |
| 2b storage and uploads | Catalyst | 2 |
| 3 member endpoints + OTP | Catalyst | 4–5 |
| 4 admin endpoints | Catalyst | 2–3 |
| 4b video player in the console | you | 1 |
| 5 console points at it | you | 0.5 |
| 6 app points at it | Flutter | 4–5 |
| 7 integration | all three | 0.5 |
| 8 deploy | Catalyst + you | 0.5 |

**About three weeks of engineering**, with the Catalyst developer on the
critical path at 10–12 days. Steps 4b, 5 and 6 overlap with 2b to 4, because
both you and the Flutter developer build against the mock.

**But the real schedule is DLT.** If it takes four weeks to clear, go-live is
four weeks away no matter how fast the code goes. Everything else can be
finished and tested on the fixed code `4821`; only the last mile needs the
real SMS.

---

## What milestone 1 does not include

The registration journey itself is complete. These sit outside it — say so to
the client, so the demo is not mistaken for the whole product.

**Zoho SSO.** Staff sign in with email and a one-time code. SSO replaces that
step and touches nothing else.

**Push notifications.** The app polls every 20–30 seconds. That works; push is
what a member expects, and it is less wasteful. Milestone 2.

**Everything after the member gets in.** Approval opens the app — but Daily
Manna, events, passes, Noahgram, Jodie and the store are still on demo data in
the Flutter app. Registration being real does not make the rest of the app
real.

**The other 53 console screens.** Giving, events, content, Jodie verification
and the rest are routed and described, not built.

**Payments.** The Razorpay sheet is still a demo. No signature verification.

---

## Risks worth naming now

| Risk | What to do |
|---|---|
| **DLT registration blocks go-live** | **Start day one.** It is the likeliest thing to set the date, and no amount of coding speed helps. |
| Three developers drift apart | The contract test. Run it in CI on the Catalyst project so drift fails loudly. |
| Uploads fail on a patchy phone connection | Upload per step, retry, and never lose typed answers. Test on mobile data, not office wifi. |
| A 30-second video through a function | It will hit request size and time limits. Signed URL straight to Stratus, always. |
| `approve` half-fails across three tables | Decide the approach in step 2, not when it happens in production. |
| Filtering in code instead of in the query | Works at 184 members, falls over at 18,000. Push filters into ZCQL. |
| Identity documents viewable by anyone with a link | Short-expiry signed URLs, and audit every view. Already wired on the console side. |
| Client expects registration working means the app is done | It opens the door. What is behind it is still demo data. Say so before the demo. |

---

## What to hand each person

**Catalyst developer**
- `docs/REGISTRATION-FLOW.md` — what happens at every stage
- `docs/API-CONTRACT.md` — what to build
- `admin/code/server/` — a working implementation to run and read
- `server/validate.js` — the validation rules, copyable as they are
- `npm run test:contract -- <their-url>` — how they know they are done
- `docs/CATALYST.md` — which Catalyst component does what

**Flutter developer**
- `docs/REGISTRATION-FLOW.md` — the journey, including the upload sequence
- `docs/API-CONTRACT.md` — sections 1 to 4
- the mock on your machine, port 4000, to build against today
- the list of what to delete in step 6

**The client**
- the [What milestone 1 does not include](#what-milestone-1-does-not-include)
  section, before the demo
- the three things still waiting on them: the **video KYC script wording**,
  the **declaration PDF**, and the **real office phone number**
