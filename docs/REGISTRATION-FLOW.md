# Registration, end to end

What happens at every step, in which system, from the moment a new member
types their phone number to the moment the app opens for them.

```
  ┌──────────────┐        ┌──────────────────┐        ┌──────────────┐
  │  Flutter app │◄──────►│  Zoho Catalyst   │◄──────►│ Admin console│
  │   (member)   │        │ Functions · Data │        │   (office)   │
  │              │        │ Store · Files    │        │              │
  └──────────────┘        └──────────────────┘        └──────────────┘
                                   ▲
                                   │
                            ┌──────┴───────┐
                            │ SMS gateway  │  DLT-registered
                            │    (OTP)     │  templates
                            └──────────────┘
```

**The two clients never talk to each other.** They both read and write the
same rows. That is why the office approving something changes what the member
sees — not because anything was copied across.

---

## Stage 1 · The number

**Member sees:** a language picker, a country code (+91), a number box.

**App does:**

```http
POST /app/auth/request-otp
{ "mobile": "+91 90000 11111" }
```

**Catalyst does:**

1. Checks the number looks like a number.
2. Generates a six-digit code.
3. Puts it in **Cache**, keyed by the number, with a **5-minute** expiry.
   Not in a table — it is short-lived and should clean itself up.
4. Sends it by SMS through a **DLT-registered template**.
5. Returns `{ ok: true, expiresInSeconds: 300, resendAfterSeconds: 24 }`.

**Returns the code itself?** Never. The mock does, because there is no SMS and
the Flutter developer needs to log in. Catalyst must not — a backend that
returns the code is a backend anyone can sign in to.

**Rate limit this.** One number, a handful of requests an hour. Without it,
someone can spend your SMS budget in an afternoon.

---

## Stage 2 · The code

**Member sees:** a code box, a 24-second resend timer, *change number*.

**App does:**

```http
POST /app/auth/verify
{ "mobile": "+91 90000 11111", "code": "482195" }
```

**Catalyst does:** reads the cached code, compares, deletes it (**one use
only**), then answers the question that decides the whole journey:

| Who is this? | Response | App goes to |
|---|---|---|
| Already a member | `{ "status": "member", "token": "…", "member": {…} }` | **Home** |
| Never seen before | `{ "status": "new" }` | **Registration, step 1** |
| Registered, waiting | `{ "status": "pending", "registrationId": "…" }` | **Waiting screen** |
| Registered, video returned | `{ "status": "pending", "state": "videoReturned" }` | **Step 6 again** |

Count the failures. Five wrong codes and the code dies; make them ask again.

---

## Stage 3 · The six steps

**Member sees:** six screens, each refusing to continue until it is filled.

| # | Screen | Collects |
|---|---|---|
| 1 | Details | first, middle, last, email, gender, date of birth, marital status, how they heard |
| 2 | Address | line 1, line 2, city, state, country, PIN |
| 3 | ID proof | one of five types, its number, **a scan** |
| 4 | Photograph | **a photo** |
| 5 | Declaration | read in English, Hindi or Marathi; tick; type full name |
| 6 | Video KYC | **10–30 seconds**, reading a line with their name and city |

**Nothing is sent to the server yet** except the three files, as they are
picked. The app holds the answers until the member taps *Complete
registration*.

### The three uploads

This is the part worth getting right, because it is the slowest thing on the
screen and the easiest to build badly.

**The file never goes through the API.** The app asks where to put it,
uploads straight to storage, and keeps the id:

```
  App                     Catalyst                  File Store / Stratus
   │                          │                             │
   ├── POST /app/uploads ────►│                             │
   │   {kind, filename, bytes}│                             │
   │                          ├── make a signed PUT URL ───►│
   │◄── {fileId, uploadUrl} ──┤                             │
   │                                                        │
   ├── PUT the bytes ──────────────────────────────────────►│
   │◄── ok ─────────────────────────────────────────────────┤
   │
   └── keeps fileId, sends it with the registration
```

Why not just post the file to the API? A 30-second video is tens of megabytes.
Through the API that is uploaded twice — phone to function, function to
storage — and functions have request size and time limits you will hit.

| Upload | Accepts | Limit | Goes to |
|---|---|---|---|
| ID scan | jpg, jpeg, png, pdf | 5 MB | File Store |
| Photograph | jpg, jpeg, png | 5 MB | File Store |
| KYC video | mp4, mov | ~60 MB | **Stratus** (object storage; better for large files) |

**Check the real file, not the claim.** The app sends a filename and a byte
count; both are whatever the app says. Catalyst must check what actually
arrived — type and size — before letting the registration reference it.

**Upload as you go, not at the end.** Step 3 uploads the scan while the member
is still filling in step 4. By step 6 only the video is left. Otherwise
*Complete registration* becomes a 60-second wait on a phone connection, and
people kill the app halfway.

**Expect failures.** Patchy signal is normal. Keep the local file path, show a
retry, and never lose the typed answers because an upload failed.

---

## Stage 4 · Submit

**Member taps:** *Complete registration*.

```http
POST /app/registration
{ …all six steps…, "idFileId": "…", "photoFileId": "…", "videoFileId": "…" }
```

**Catalyst does, in this order:**

1. **Validates everything again.** The app already checked; the app can be
   bypassed, so the server is what decides. Every rule is in
   [API-CONTRACT.md](API-CONTRACT.md) and implemented in `server/validate.js`.
2. **Confirms the three files exist** and are the type and size claimed.
3. **Derives the honorific** — `male` → Mr, `female` + `married` → Mrs,
   `female` otherwise → Ms. The app does not send one.
4. **Stores which declaration** they accepted: version *and* language. What
   they agreed to, in the words they actually read.
5. **Writes the row** with `state: "pending"`.
6. Returns `{ ok: true, registrationId: "REG-7501", state: "pending" }`.

**If something is wrong**, `400` with each message against its field and the
step to reopen:

```json
{ "errors": { "pin": "An Indian PIN code is six digits…" }, "step": 2 }
```

The app jumps to step 2 and puts that message under the PIN box. It does not
show one general error — the member cannot act on that.

---

## Stage 5 · Waiting

**Member sees:** "Your account is pending verification", a checklist, the
office phone number, *Sign out*.

**They cannot get into the app.** Not because the app hides it — because the
server will not issue a usable token until `state` is `approved`. Signing in
again lands them back here.

**App does:** polls every 20–30 seconds while the screen is open.

```http
GET /app/registration/status?mobile=+91 90000 11111
```

Or, better, Catalyst sends a **push notification** on the decision and the app
only polls as a fallback. Polling works; push is what a member expects.

**The two "Simulate: admin approves / returns the video" buttons are deleted
at this point.** They are the prototype standing in for the office. Now the
office is real.

---

## Stage 6 · The office

**Staff sees:** *Membership → App registrations*, oldest first, with how long
each has waited against a 24-hour target.

**Console does:**

```http
GET /data/REGISTRATIONS?state=pending&sort=at&dir=asc
```

Opening one shows all six steps as the member filled them, and the three
uploads. For each file the console asks for a short-lived URL:

```http
GET /registrations/REG-7501/file/video
```

**Every one of those is written to the audit log.** Looking at someone's
Aadhaar scan is an action, not a page view.

The office works three checks it alone can make:

- is the ID document readable?
- does the photograph match the ID?
- is the video clear, audible, and the right person?

Then one of two decisions.

### Approve

```http
POST /registrations/REG-7501/approve
{ "loc": "Thane" }
```

Catalyst writes **three things**:

1. a row in `Members`
2. `state: "approved"` and `memberId` on the registration
3. an `AuditLog` entry

**Catalyst has no transaction across tables.** If this stops halfway you get a
member nobody can trace, or a registration pointing at a member that does not
exist. Decide the handling before go-live: write `Members` first and treat a
registration still `pending` with a matching member as recoverable, plus a
cron that finds them.

### Return the video

```http
POST /registrations/REG-7501/return-video
{ "remark": "Too dark to match your photograph. Please record it again in daylight." }
```

**The reason is required**, because the member reads those exact words. The
registration goes to `videoReturned`, the attempt counter goes up, and it
leaves the queue until they resubmit.

---

## Stage 7 · The member finds out

### Approved

Next poll, or the push:

```json
{ "state": "approved", "memberId": "NH-104396" }
```

The app signs them in and **Home opens**. Everything unlocks: Daily Manna,
events and passes, Noahgram, prayer requests, Jodie, the store.

Their name — the one the office approved — now appears across the app.

### Video returned

```json
{ "state": "videoReturned", "remark": "Too dark to match your photograph…" }
```

The app shows that sentence and reopens **step 6 only**. Nothing else is
re-entered.

```http
POST /app/registration/video
{ "id": "REG-7501", "videoSeconds": 21, "videoFileId": "video_…" }
```

Back to `pending`, back in the office queue, back to stage 5.

---

## The whole thing on one page

```
MEMBER                     CATALYST                      OFFICE
──────                     ────────                      ──────
types number ────────────► cache code, send SMS
enters code ─────────────► check code ──► new? member? pending?
  │
  ├─ new → six steps
  │        files ────────► signed URL ──► storage
  │        submit ───────► validate, store  state=pending
  │                              │
waiting screen ◄───── poll ──────┤
  │                              │                  queue shows it ◄─┘
  │                              │                  office opens it
  │                              │                  watches the video
  │                              │                           │
  │                              │◄──── approve ─────────────┤
  │                              │      create member        │
  │                        state=approved                    │
  │◄─── poll / push ─────────────┤                           │
  └─ HOME OPENS                  │                           │
                                 │◄──── or return video ─────┘
                           state=videoReturned
  ◄─── reason shown, step 6 only
```

---

## What has to exist for this to work

| Piece | Who | Note |
|---|---|---|
| SMS gateway + **DLT registration** | Catalyst dev | **Weeks of lead time. Start now.** |
| Cache for codes | Catalyst dev | 5-minute expiry, one use, rate limited |
| `Registrations`, `Members`, `Staff`, `AuditLog` | Catalyst dev | schema in [API-CONTRACT.md](API-CONTRACT.md) |
| Signed upload URLs | Catalyst dev | File Store for images, Stratus for video |
| Signed view URLs + audit | Catalyst dev | short expiry |
| Upload-as-you-go, retries | Flutter dev | do not batch at the end |
| Field errors against fields | Flutter dev | use `errors` and `step` |
| Delete the simulate buttons | Flutter dev | `registration_status.dart` |
| Video player in the review panel | You | the box is ready |
| Point the console at Catalyst | You | one line in `src/lib/api.ts` |

### DLT is the thing that will bite

Indian SMS needs the sender id registered and **each template approved**
before anything sends. That is weeks, not days, and it is not engineering
work — it is paperwork with a telecom operator.

If it starts when the code is ready, the whole integration waits on it. Start
it in week one, in parallel with everything else.

Until it clears, the mock's fixed code `4821` keeps all three of you building.

---

## How you know it works

```bash
node server/contract-test.mjs https://<catalyst-url>
```

78 checks, the whole journey: submit, every validation rule, poll, return the
video, re-record, approve, sign in. It also checks the things easiest to get
wrong — that an unapproved registration is **never** given a token, and that a
content editor **cannot** approve a member.

When it passes against Catalyst, this flow works.
