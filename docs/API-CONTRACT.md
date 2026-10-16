# Registration API — the contract

**Milestone 1: a member registers in the Flutter app, the office approves in
the admin console, the app unlocks.** Text fields only; uploads come in
milestone 2.

Three people are building against this document:

| Who | Builds | Against this document |
|---|---|---|
| Flutter developer | the app | **calls** these endpoints |
| Catalyst developer | the backend | **implements** these endpoints |
| Admin developer | the console | **calls** the admin endpoints |

Nobody may change a field name, a status word or a status code in here without
telling the other two. That is the only rule that matters.

---

## There is a working implementation of this

`admin/code/server/` is a complete Node implementation of everything below. It
runs locally on port 4000:

```bash
cd admin/code && npm run dev:api
```

**Catalyst developer: this is your specification.** When the wording here is
ambiguous, the code is the answer — in particular `server/validate.js`, which
holds every validation rule, and `server/routes/app.js`, which holds these
endpoints.

**Flutter developer: build against this until Catalyst is ready.** It behaves
the same. Point at `http://<this machine>:4000` and carry on; no waiting.

**And it is how you prove you are done:**

```bash
node server/contract-test.mjs https://<your-catalyst-url>
```

That runs 30-odd checks against any base URL and prints what does not match.
When it passes against Catalyst, milestone 1 is integrated.

---

## Base URL

| | |
|---|---|
| Local mock | `http://localhost:4000/api` |
| Catalyst dev | `https://karuna-sadan-60088950048.development.catalystserverless.in/api` |

Everything below is relative to that. Member endpoints are under `/app/`;
console endpoints are not.

---

## 1. `POST /app/registration`

The Flutter app sends all six steps in one request when the member taps
**Complete registration**.

### Request

```json
{
  "firstName": "Shashank",
  "middleName": "Sanjay",
  "lastName": "Gupta",
  "email": "s.gupta@example.com",
  "gender": "male",
  "dob": "1996-04-11",
  "marital": "married",
  "reference": "My cell leader",

  "address1": "Flat 402, Shanti Nagar",
  "address2": "Near the bus depot",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "pin": "400053",

  "idType": "pan",
  "idNumber": "ABCDE1234F",
  "idFile": "id.jpg",

  "photoFile": "me.jpg",

  "agreed": true,
  "signature": "Shashank Sanjay Gupta",
  "declarationLang": "en",
  "declarationVersion": "2026.09",

  "videoSeconds": 18,
  "videoPath": "kyc.mp4",

  "phone": "+91 90000 11111"
}
```

**The field names are the Flutter app's own**, straight out of
`lib/data/registration_data.dart`. The Dart model does not need renaming.

| Field | Required | Notes |
|---|---|---|
| `firstName`, `lastName` | yes | letters, space, `.`, `'`, `-` |
| `middleName`, `address2`, `reference` | no | may be `""` |
| `email` | yes | |
| `gender` | yes | `male` \| `female` \| `other` |
| `dob` | yes | `YYYY-MM-DD`, **18 or over** |
| `marital` | yes | `single` \| `married` \| `widow` \| `widower` \| `separated` \| `divorced` |
| `address1` | yes | 5 characters or more |
| `city`, `state`, `country` | yes | from the app's bundled `world.json` |
| `pin` | yes | India: 6 digits, not starting with 0. Elsewhere: 4–10 characters |
| `idType` | yes | `aadhaar` \| `pan` \| `passport` \| `dl` \| `voter` |
| `idNumber` | yes | format per type, below |
| `idFile`, `photoFile` | yes | milestone 1: a filename. Milestone 2: a File Store id |
| `agreed` | yes | must be `true` — the declaration tick box |
| `signature` | yes | must equal first + middle + last, case-insensitive |
| `declarationLang` | yes | `en` \| `hi` \| `mr` — **which one they read** |
| `videoSeconds` | yes | 10 to 30 |
| `phone` | yes | with country code |

**ID number formats**, exactly as the app validates them:

| `idType` | Pattern | Example |
|---|---|---|
| `aadhaar` | `[2-9]` then 11 digits | `2345 6789 0123` |
| `pan` | 5 letters, 4 digits, 1 letter | `ABCDE1234F` |
| `passport` | `[A-PR-WY]`, `[1-9]`, 5 digits, `[1-9]` | `A1234567` |
| `dl` | 2 letters, 2 digits, year, 7 digits | `MH12 20110012345` |
| `voter` | 3 letters, 7 digits | `ABC1234567` |

Spaces and hyphens are stripped before checking.

### Response — accepted

`201`

```json
{ "ok": true, "registrationId": "REG-7501", "state": "pending" }
```

### Response — rejected

`400`. **The shape matters**: the app puts each message against its own box
and opens `step`.

```json
{
  "error": "Some answers need fixing.",
  "errors": { "pin": "An Indian PIN code is six digits and does not start with zero." },
  "step": 2
}
```

`errors` is keyed by the **console's** field names (`line1`, `region`,
`videoSecs`, `mobile`), not the app's. The app maps them back. `step` is the
first of the six that needs fixing: 1 details, 2 address, 3 ID, 4 photo,
5 declaration, 6 video.

### What the server must do that the app cannot

- **Validate everything again.** The app validates to be helpful. The app can
  be bypassed, so the server is what decides.
- **Derive the honorific.** `male` → `Mr`, `female` + `married` → `Mrs`,
  `female` otherwise → `Ms`, `other` → `""`. **The app does not send one.**
- **Store `declarationLang` and `declarationVersion`.** Which wording, in
  which language, is what the member actually agreed to.
- **Set `state` to `pending`.** The app does not get to choose.

---

## 2. `GET /app/registration/status?mobile=<number>`

What the app polls on its waiting screen. **This replaces the two "Simulate:
admin approves / returns the video" buttons**, which come out of the app.

Also accepts `?id=REG-7501`.

### Response

`200`

```json
{
  "id": "REG-7501",
  "state": "pending",
  "remark": "",
  "decidedAt": null,
  "memberId": null,
  "office": {
    "name": "Anitha Varghese",
    "phone": "+91 98200 00000",
    "hours": "Monday to Saturday, 9 am to 6 pm"
  }
}
```

`404` when no registration exists for that number.

| `state` | The app shows |
|---|---|
| `pending` | the waiting screen |
| `approved` | Home. `memberId` is set |
| `videoReturned` | step 6 again, with `remark` shown as the reason |

**The office contact is placeholder and must come from config**, not be
hard-coded. The real number is still with the client.

---

## 3. `POST /app/registration/video`

Re-record after the office sent the video back.

```json
{ "id": "REG-7501", "videoSeconds": 21, "videoPath": "kyc-2.mp4" }
```

`200` → `{ "ok": true, "state": "pending" }`

`409` if the registration is not in `videoReturned`. The attempt counter goes
up by one, and it returns to the queue.

---

## 4. `POST /app/auth/verify`

```json
{ "mobile": "+91 90000 11111", "code": "4821" }
```

Returns **which of three things is true**, which is the whole point:

| Case | Response |
|---|---|
| Already a member | `{ "status": "member", "token": "...", "member": { "id", "name", "loc", "lang" } }` |
| Never registered | `{ "status": "new" }` |
| Registered, not yet decided | `{ "status": "pending", "registrationId": "...", "state": "pending" }` |

`400` on a wrong code. The mock accepts `4821`; Catalyst sends a real SMS.

**Access stays locked server-side until `state` is `approved`.** A member who
has not been approved must not get a usable token, whatever the app does.

---

## 5. Admin endpoints

These need a staff session. Milestone 1 can keep the mock's email + one-time
code; Zoho SSO replaces it later without touching anything below.

| Endpoint | Does |
|---|---|
| `GET /data/REGISTRATIONS?state=pending&limit=300&sort=at&dir=asc` | the queue |
| `GET /data/REGISTRATIONS/:id` | one registration |
| `POST /registrations/:id/approve` | `{ "loc": "Thane" }` → creates the member, sets `approved` |
| `POST /registrations/:id/return-video` | `{ "remark": "..." }` → sets `videoReturned`. **`remark` is required** — the member reads it |
| `PATCH /registrations/:id/checks` | the office's three manual tick boxes |
| `GET /queues` | the counts behind the sidebar badges |

### `approve` must do three things together

1. insert a row in `Members`
2. set the registration to `approved` and write `memberId` onto it
3. append to `AuditLog`

**Catalyst Data Store has no cross-table transaction.** If this fails halfway
you get a member nobody can trace back, or a registration pointing at a member
that does not exist. Decide how that is handled — a reconciling cron, or doing
the writes in an order where a half-failure is recoverable — before this goes
near real data.

---

## Status words

Not free text. Exactly these, including the capitals.

| Thing | Values |
|---|---|
| Registration `state` | `pending`, `approved`, `videoReturned` |
| Prayer request `state` | `Pending`, `Approved`, `Declined` |
| Auth `status` | `member`, `new`, `pending` |

## Status codes

| Code | Means |
|---|---|
| `200` / `201` | fine |
| `400` | the answers need fixing — body carries `errors` and `step` |
| `401` | no staff session |
| `403` | signed in, but the role is not allowed. Body carries `needs` |
| `404` | no such record |
| `409` | right record, wrong state (approving twice, re-recording when not asked) |

---

## Open, and owned by the client

These are not engineering decisions and should not be invented:

1. The **video KYC script** wording. Generated today in
   `server/seed/registrations.js` from the member's own name and city.
2. The **declaration PDF**. The text exists in three languages; the document
   does not.
3. The **office phone number**. `+91 98200 00000` is made up and is on the
   app's waiting screen.
