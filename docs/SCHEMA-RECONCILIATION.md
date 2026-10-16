# The contract and the Catalyst schema do not match

Found on **16 October 2026**, by reading the live Catalyst project.

This is the drift the integration plan warned about, and it has landed on day
one — which is the best possible time to find it.

Nothing is wrong with either design. They are just different, and the console
cannot talk to a schema it was not written for.

---

## What is actually in Catalyst

**Org** `60063007256` · project **`noah-backend`** (`27145000000040056`)
Created 16 Oct 12:04, tables modified 14:34–14:40.

| | |
|---|---|
| Tables | **32** |
| Functions | **0** — there is no API yet |
| Data | the tables look empty |

> **The project ID given to me was `27145000000039371`, which is
> `flutter-calculator`** — a calculator demo holding one table, `CalcHistory`.
> Not this. The work is in `noah-backend`.

### The 32 tables

```
Members            MemberProfile      MemberAddresses    MemberIdentity
MemberRelations    MemberRoles        MemberPreferences  Registrations
Sessions           OtpRequests        Locations          Groups
GroupMembers       Kids               KidLinks           Files
Attachments        DailyManna         DailyMannaCategories
DailyPrayers       DailyConfessions   BibleCommentary    Books
BookCategories     BookChapters       Videos             VideoCategories
LiveVideos         Praises            PraiseReports      Favorites
DashboardBanners
```

**The login database already exists**, and is better than a hasty one would
have been:

| Table | Notable |
|---|---|
| `Members` | `phoneKey` varchar(20) **unique, mandatory** — the identity key |
| `OtpRequests` | `otpHash` (**hashed, not plaintext**), `expiresAt`, `attempts`, `sendCount`, `usedAt`, `ip` |
| `Sessions` | issued sessions |

`OtpRequests` already has one-use, expiry, attempt counting and the fields for
rate limiting by number and IP. That is the right design. **Do not create
another one.**

---

## The difference that matters

Everything else is renaming. This one is structural.

### The contract says

```
Registration (one flat row, holds everything the member typed)
      │
      └── approve ──► creates a Member
```

A registration is the record. **Approving brings the member into existence.**

### Catalyst says

```
Member (created first — phoneKey is mandatory and unique)
      ▲
      │ memberRowId  (mandatory foreign key, ON DELETE CASCADE)
      │
Registration (a review record about that member)
```

**The member exists from the moment they give a phone number.** The
registration is the office's review of them. Their details live in `Members`,
`MemberProfile`, `MemberAddresses` and `MemberIdentity` — not in
`Registrations`.

**Theirs is the better design**, and it matches how the app actually behaves:
a person who has entered their number and nothing else is already someone the
system knows about. It also makes `Members.status` the single gate on access.

But it means `POST /registrations/:id/approve` does something different:

| | Contract | Catalyst |
|---|---|---|
| On approve | `INSERT` into `Members` | `UPDATE Members.status` |
| Member id | created at approval | exists from sign-up |
| Where the details are | on the registration row | across four member tables |

**The console's approve flow has to be rewritten for this.** Not a big change,
but not a rename either.

---

## Field by field

### Where the six steps actually live

| Step | Contract field | Catalyst |
|---|---|---|
| 1 | `firstName`, `middleName`, `lastName` | `Members.firstName/middleName/lastName` |
| 1 | `salutation` | `Members.salutation` |
| 1 | `email` | `Members.email` |
| 1 | `gender`, `dob`, `marital` | `Members.gender/dob/maritalStatus` |
| 1 | `reference` | `Members.referenceName` (+ `referenceCode`, `referencePhone`, `referenceMemberLegacyId`) |
| 1 | `mobile` | `Members.phoneKey` + `countryCode` + `mobileNumber` |
| 2 | `line1`, `line2`, `city`, `region`, `country`, `pin` | **`MemberAddresses`** — needs checking |
| 3 | `idType` | `Registrations.idProofType` |
| 3 | `idNumber` | **not in `Registrations`** — presumably `MemberIdentity` |
| 3 | `idFile` | `Registrations.idProofFileId` (bigint) |
| 4 | `photoFile` | `Registrations.pendingPhotoFileId`, then `Members.photoFileId` |
| 5 | `agreed` | `Registrations.declarationAccepted` |
| 5 | `declarationLang` | `Registrations.declarationLanguage` |
| 5 | `signature` | `Registrations.signatureText` |
| 5 | `signedOn` | `Registrations.declarationAcceptedAt` |
| 6 | `videoSecs` | `Registrations.videoSeconds` |
| 6 | `videoFile` | `Registrations.videoFileId` (bigint) |
| — | `remark` | `Registrations.reviewNote` |
| — | `decidedAt` | `Registrations.reviewedAt` |
| — | `decidedBy` | `Registrations.reviewedByLegacyId` (bigint) |

The `pending…` prefix on `pendingPhotoFileId` and `pendingAboutMe` is a nice
touch — it separates what is awaiting approval from what is live.

### Three that need a decision

**1. The status vocabulary.** `Registrations.status` is `varchar(16)` with
default **`'draft'`**. The contract says `pending` | `approved` |
`videoReturned`. `videoReturned` is 13 characters, so it fits — but `draft` is
a state the contract does not have, and nobody has agreed the full list.

> Agree the exact set and who may move between them. Write it down.

**2. `videoConsentState` is an `int`.** The contract has a boolean `agreed`
plus separate video fields. What do the numbers mean? Nobody outside the
Catalyst developer's head knows.

> Either document the values or make it a varchar with words in it.

**3. The ID number has no home in `Registrations`.** Presumably
`MemberIdentity`. It must be **encrypted** wherever it lands — an Aadhaar
number in the clear is a liability, and the console already has a
`members.pii` permission and an audit entry for every reveal.

---

## There is no API yet

**0 functions deployed.** The tables are there; nothing serves them.

So "connect the admin to Catalyst" has two possible meanings, and they lead
to different places:

### Option A — the console talks to Catalyst's functions

```
Flutter ──┐
          ├──► Catalyst Functions ──► Data Store
Console ──┘
```

One place where the rules live. Approving is the same code path whoever calls
it. **This is what the integration plan assumes**, and what the contract test
checks.

**Blocked until the Catalyst developer writes the functions.**

### Option B — the console talks to the Data Store directly

```
Flutter ──► Catalyst Functions ──► Data Store
                                      ▲
Console ──► our Node server ──────────┘
```

Works **today**, because the tables exist. The console would write real rows
into Catalyst this afternoon.

But the approval rules would then live in two places — our server and their
functions — and the two would have to agree forever. That is the drift
problem, made permanent.

> **Recommended: A for anything that writes, B only if a demo is needed this
> week.** If B, treat it as temporary and say so out loud, because
> "temporary" integrations are the ones that survive longest.

---

## What to do next

**Today, in this order:**

1. **Confirm the project.** `noah-backend`, not `flutter-calculator`.
2. **Get the three of you on a call** with this document and
   [API-CONTRACT.md](API-CONTRACT.md) open. Thirty minutes.
3. **Settle the four open points:** the status vocabulary, what
   `videoConsentState` means, where `idNumber` lives and whether it is
   encrypted, and who creates the `Members` row.
4. **Decide A or B.**
5. **Update the contract** to match what was agreed — the contract follows the
   schema, not the other way round, because the schema is the better design.
6. Catalyst developer writes the functions against the updated contract and
   runs `node server/contract-test.mjs <url>` until it passes.

**What must not happen:** a second set of tables, in a second project,
matching the old contract. Two schemas in one account is worse than either
schema alone.
