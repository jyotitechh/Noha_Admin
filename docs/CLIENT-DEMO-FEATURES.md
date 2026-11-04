# Changes asked for in the client module demo

What the client asked for in the module demo, what was built, the logic behind each, and where it lives.
Six items; five are built, one (CRM contacts) needs the client's field list first. Section 7 covers Bible study, which the client moved to Zoho TrainerCentral (the custom screens were removed).

| # | Ask | State |
|---|---|---|
| 1 | Stay signed in (no automatic logout) | Done |
| 2 | Request access, a super administrator approves | Done |
| 3 | Bible commentary: book, then a chapter of that book | Done |
| 4 | Leaders by location: distance, members, room left | Done (capacity is one setting, not per leader) |
| 5 | Family: the reverse relation shows automatically, and family requests from the app | Done (person page, and the Family requests inbox); subscriptions for a relative are an app job |
| 6 | CRM / contacts | Proposal below; needs the client's CRM fields |

---

## 1. Staying signed in

**Cause.** Two things signed people out on a refresh. On the deployed API sessions lived only in memory, so any
restart or redeploy emptied them. And on page load, any failure of the "who am I" check, even a brief network
error, cleared the saved login.

**Logic.** With `SESSION_SECRET` set, the session token is signed (HMAC-SHA256) and carries the session inside it,
so a new process can pick it up again. After a restart the person is re-checked at once: suspended or revoked since
means signed out, a changed role means the new role. Sign-out and revocation are remembered while the process runs.
A session lasts a week (`SESSION_HOURS`); the token sits in the tab's `sessionStorage`, so closing the tab ends it.
In the browser, only a 401 clears the login; a slow or down server is retried and then shows "Cannot reach the
server" with a Try again button.

**Where.** `server/auth.js` (`mintToken`, `resumeFromToken`, `recheck`), `server/deploy-api.mjs` (makes and keeps the
secret in `~/ksm-session-secret.txt`), `src/state/auth.tsx`, `src/App.tsx`. Tests: `server/test-demo.mjs`.

## 2. Request access, then approve

**Flow.** A member registers in the Noah app and is approved. They open the console sign-in page, choose "Do not have
access yet? Ask a super administrator", type their number and an optional note. A super administrator sees it under
Staff and permissions > Access requests (and in the Work queues), picks a role and approves in one click, or
declines. The person then signs in with the same number.

**Logic.**
- The request is kept on the same row as a console role (the six `console*` columns on `membersExtra`, or the
  console-staff table), with status `Requested` and an empty role. An empty role never lets anyone in. Declined is
  `Declined`; approving is the ordinary grant (`Active` plus the role). No new table or column.
- The request endpoint is public, so it answers every request with the same sentence (it never says whether a
  number is a member or already staff), is limited to 6 an hour per address and 3 a day per number, and only an
  approved, active member is put on the list. The office passphrase applies if one is set.
- Approving uses the same rules as "Give access": only a super administrator can give Super administrator, nobody
  changes their own access, only approved members qualify. Everything is in the audit log.

**Where.** `server/access-requests.js` (public side), `server/noah-schema.js` (`requestConsoleAccess`,
`accessRequests`, `declineAccessRequest`), `server/routes/staff.js` (approve and decline), `server/queues.js`,
`src/modules/staff/Requests.tsx`, `src/modules/SignIn.tsx`.

## 3. Bible commentary

**Logic.** The Bible has 66 books and 1,189 chapters and they never change, so the book list and each book's
chapter count are fixed data (`BOOKS`, `CHAPTERS` in `server/content-types.js`), not a third-party service. The form
asks for the book, then offers only that book's chapters (Exodus 1 to 40, Psalms 150, Jude 1); changing the book clears
the chapter. The server checks the same rule, so the API cannot store Exodus 41. It is stored in the existing
`bibleCommentary` table: `bibleBookId` is the book's number (Genesis 1 to Revelation 66), `startChapter` is the
chapter, and `endChapter` is set equal to it, because a commentary here is one chapter.

**Assumption to confirm with the Catalyst developer:** `bibleBookId` as 1 to 66. The table is empty, so there was no
existing data to check against. The Noah API has no route for it yet (the console says so on the screen).

**Where.** `server/content-types.js`, `server/content.js` (the `chapter` kind and `derive`),
`src/modules/content/ContentManager.tsx` (`ChapterSelect`), tab Content > Bible commentary.

## 4. Leaders by location

**Logic.** A member's current location is on their login (`users.latitude`, `users.longitude`), or in the place they
picked (`members.currentLocationData`). Distance to each cell leader is a straight-line (haversine) figure and never
shown as less than 1 km, as the app does. Leaders are listed nearest first, those without a location last. Each shows
how many members they lead (counted from `membersExtra.connectedLeader`), the area they are in, and, when
`LEADER_CAPACITY` is set, "room for N". The coordinates never leave the server, and the distances are sent only to
staff who may edit members.

**Not done:** a different capacity per leader (needs a column; today it is one setting for all) and the history table
`memberLeaderHistory`. Both are small follow-ups.

**Where.** `server/noah-schema.js` (`coordsOf`, `kmBetween`, `pastoralChoices`), `src/components/PersonDetail.tsx`.
Tests: `server/test-schema-offline.mjs` ("Cell leaders, nearest first").

## 5. Family

**Logic.** One row in `membersRelations` carries both directions (`relationshipA2B` is what B is to A,
`relationshipB2A` is what A is to B), and the person page reads every row that names the member on either side. So
one row is enough for both people to see each other. What matters is writing the second code correctly:
Parent and Child, Grandparent and Grandchild, Uncle or aunt and Nephew or niece are each other's reverse;
Cousin, Spouse and In-law are the same both ways; Brother or Sister depends on the gender of the person adding it
(a man is a Brother, a woman a Sister), so a person with no gender set is asked to set it first. Both people must be
members. The same two people cannot be related twice; removing archives the row, which removes it for both.

**The codes** (from the Noah API's ADMIN_INTEGRATION note, "Family requests"): 1 Spouse, 2 Son, 3 Daughter, 4 Father,
5 Mother, 6 Brother, 7 Sister, 8 Other, 9 Parent, 10 Child, 11 Sibling. Spouse, Other and Sibling are the same both ways;
Parent and Child are each other's reverse. Son, Daughter, Father, Mother, Brother and Sister are the gendered ones, so
the reverse depends on the gender of the person adding it (a man adding "Daughter" is her Father). A child under 18
(a `kids` record) is shown as Son, Daughter or Child by the child's gender.

### Family requests from the app

A member asks, from Me > Family in the app, to add a spouse, child, parent, brother, sister or anyone else. The office
decides in **Membership > Family requests** (permission `members.edit`; a badge on Membership and a row in Work queues
show how many wait).

**Logic.** The Noah API owns the requests (the `familyRequests` table) and does the work, so the console never writes
those tables. It calls `GET /admin/family-requests?state=` for the list and `POST /admin/family-requests/:id/decide`
with `Approved` or `Rejected`. Approving links both accounts and pushes both people, so each sees the other. A child
under 18 has no account: approving adds the child record and links it to the member (and to the member's spouse if one is
linked). A grown-up is matched by the number the member typed; if that person has not joined yet the request is still
approved and the two are linked when they join. If the typed number belongs to someone else, the office picks the right
member in the drawer ("link a different member") and that id is sent as `memberId`.

**Rules.** Rejecting needs a reason, because the member reads it. A request already decided (here or elsewhere) is
refused with 409 and the list is refreshed. A member can only be picked for a grown-up, only when approving, and never
the member who asked. Mobile numbers are masked in every reply. Each decision is written to the audit log. Without
`NOAH_ADMIN_API_KEY` the inbox says so and nothing can be decided, because nobody would be told.

**Where.** `server/noah-api.js` (`listFamilyRequests`, `decideFamilyRequest`), `server/family-requests.js`,
`server/routes/family.js`, `server/queues.js`, `src/modules/members/FamilyRequests.tsx`. The offline fake of the API
is in `server/dev-offline.mjs`; tests are the "Family requests from the app" section of `server/test-offline-stack.mjs`.

**Where.** `server/noah-schema.js` (`addRelation`, `removeRelation`, `relationCandidates`), `server/routes/people.js`,
person page > Family > Add a relative.

**Not in the console:** buying a subscription for a relative from one's own app is an app and payments feature.

## 6. CRM and contacts: proposal

The client asked who uses the CRM and which fields it shows, and suggested copying their existing CRM. We do not
have its field list, so this is a starting point to confirm, built from what Catalyst already holds per member.

| Group | Fields (Catalyst column) | Who needs it |
|---|---|---|
| Identity | name, gender, date of birth, marital status, anniversary | Membership, pastors |
| Reach | mobile, email, second email | Membership, communications (masked until revealed, audited) |
| Place | address, area, city, state, country, pincode, congregation | Membership, pastors, leaders |
| Care | pastor (`connectedPastor`), cell leader (`connectedLeader`), alert list and comment | Pastors, leaders |
| Church | member since, baptised, covenant partner and expiry, VIP | Membership, finance |
| Work | profession, organisation, designation | Membership |
| Giving | payment customer id, default account | Finance only |
| Activity | last active, the sync status to the CRM | Membership |

Proposed access: membership officers see everything above except giving; pastors and leaders see their own
congregation or cell only; communications sees name, mobile, email and language; finance sees giving. Revealing
contact details stays one click and is audited, as on the person page today.

**Needed from the client:** which fields their CRM holds and which of them they actually use, who in the office uses
it, and whether it must stay in sync with Zoho CRM (a sync job exists in the prototype; none is built here).

---

## 7. Bible study (and Bible school): Zoho TrainerCentral instead of custom screens

**What was undone.** The console had its own Bible study screens: study plans, their steps (verses, video, photo) and quiz
questions, in a School > Bible study tab. They were removed: the three content kinds (`bibleStudies`, `bibleStudySteps`,
`bibleStudyQuizzes`), the Bible study section and tab, their sample data and checks. Nothing was deleted from Catalyst: the
tables (`bibleStudy`, `bibleStudyConnect`, `bibleStudyStepQuiz`) and the demo's test rows are still there, unused. The Bible
school and Courses tabs were not part of this and are still in place (see the open questions below).

**Why.** The client already runs courses, workshops and reading plans (30, 90 and 365 days, with the Bible built in) in
TrainerCentral, with enrolment, fees and reports. They want one system for Bible school and Bible study, not two.

**How it would connect.** TrainerCentral has an OAuth 2.0 REST API (`/api/v4/<orgId>/...`). The pieces:

1. **Courses live in TrainerCentral.** Staff author and price them there. The console builds nothing for authoring.
2. **The Noah API talks to TrainerCentral, never the app.** One server-side OAuth client (its secret kept on the server, like
   the Catalyst key) lets the Noah API list courses and enrol people. The app only calls the Noah API.
3. **Enrol from the app.** The member taps Enrol, the app asks "Are you sure?", and the Noah API enrols them with
   `addCourseAttendee` (POST `/api/v4/<orgId>/addCourseAttendee.json`, scope `TrainerCentral.userapi.CREATE`), sending the
   member's email and name from Catalyst plus the course id. They never retype their details. Access can be taken back with an
   update on the attendee (scope `TrainerCentral.courseapi.UPDATE`).
4. **Only enrolled members see a course.** The app shows the member's own enrolments; the rest of the catalogue shows an Enrol
   button.
5. **Learning happens in TrainerCentral's player**, opened inside the app. Reports (who enrolled, progress, completion) come
   from TrainerCentral itself.
6. **The console** could later show a read-only Learning view (enrolments per member). It is not needed to start.

**Who does what.** Client: a TrainerCentral admin login, the organisation id, which courses to offer and their fees. Catalyst
developer: the Noah API routes and the server-side OAuth client. Flutter developer: the screens. Console: nothing required.

**Open questions to settle first**
- **Email.** Enrolling needs the learner's email. Do all members have one on record? A member without one needs a fallback.
- **Sign-in to TrainerCentral.** Can members open courses without a second sign-in (single sign-on), or do they sign in once
  with their email? SSO was not confirmed from the documentation I could reach; ask TrainerCentral support or check the admin
  settings.
- **Fees.** Paid courses are expected to be paid through TrainerCentral's own checkout; confirm a payment gateway is set up
  there and that the app does not need to take the payment itself.
- **Bible school and Courses.** The client said both come from TrainerCentral. The console still has Bible school and Courses
  screens (the `rowil*` tables). Decide whether to remove them too.
- **Feasibility with Catalyst.** The client said they would check this on their side. The API is plain HTTPS with OAuth, which a
  Catalyst function can call.

## 8. Changes members ask for (Me > My information)

A member cannot edit their details in the app. They type the new values and press one button, and the app files one row
in `appChangeRequests` per changed detail. The office decides in **Membership > Changes asked for**.

**Logic.** The Noah API now decides these (`GET /admin/profile-requests?status=` and `POST /admin/profile-requests/:id/decide`
with `approve` or `reject`). It writes the value into the right column in the right format and **sends the member a push**
("Your change was approved"); a reason given when turning one down is shown to the member. So when `NOAH_ADMIN_API_KEY`
is set the console uses the API, and the screen says the member is notified. A **new profile photo** (`fieldId = photo`)
comes the same way: `newValue` is a file id, which the office looks at (the new one beside the current one, read through
the console and recorded in the audit log) before approving, and approving makes it the member's profile photo.

**The table fallback.** If the key is not set, or the Noah deployment does not have those calls yet (it answers 404), the
console does what it did before: it writes `newValue` into the member's own column or columns itself, then marks the
request (`status`, `reviewedAt`, `reviewedByRowId`). The value is written first and the request marked second, so a
failure leaves a request still pending, never one marked approved whose value was not saved. Nobody is told on this path,
and the screen says so in a warning. A network failure to the API does NOT fall back, because deciding by the table would
skip the member's notification. The status words in the table are read loosely, as the developer's note says: `approved` or
`Approved`, `rejected`, `Rejected` or `Turned down`; anything else counts as still waiting.

The map from the app's `fieldId` to the `members` columns is the developer's ADMIN_INTEGRATION note and lives in
`server/change-fields.js`. The API applies it itself, so the console uses the map to label a request, to guard the cases
below, and for the fallback. Each field says how the app's text becomes what the column holds:

| The app sends | The console stores |
|---|---|
| gender `male` / `female` / `other` | 1 / 2 / 3 |
| smoking, drink `yes` / `no` | true / false |
| `dob`, `anniversary` as YYYY-MM-DD | a date; `deceased` is a datetime column, so it gets 00:00:00 |
| income, a number (the start of the range) | a whole number |
| `phone2`, `landline` as `+91 9876543210` | the dial code and the number, in two columns |
| `reference` and `reference_phone` | one text `name|+91|number`; each changes only its own part |
| `address` as `12 Mill Road, Kurla` | address and area: the last comma-separated part is the area |
| `location` as `Mumbai, Maharashtra, India` | city, state, country (all three are needed) |
| `corr_address`, `corr_location`, `corr_pin` | the same, into the postal columns |

**What is not applied.** `phone1` is the number the member signs in with (`users.number`). Writing it to `members` alone
would show a number they cannot sign in with, and changing the login hands the account to whoever holds the new number.
The API refuses it too (409 `change_by_hand`). The screen says why and offers Turn down only: change the number by hand
in `users` and `members`, then turn the request down with a note such as "Changed". A `fieldId` the console does not know can also only be turned down.

**Checks.** A value that cannot be applied (a location without a state, a blood group that does not exist, a date in the
future) is flagged on the row before anyone presses Approve, and refused with 422 if they do. Where a value is split or
changed on the way in, the row shows "Will be saved as". Email, phones, addresses, pincodes and the ID numbers (PAN,
Aadhaar, Emirates ID, passport, voter, driving licence) need the permission to see contact details (`members.pii`) to
approve, and are masked in the list without it.

**Only on the fallback.** The member is not told, and a value is checked by the console rather than the API.

**Where.** `server/noah-api.js` (`listProfileRequests`, `decideProfileRequest`), `server/profile-requests.js`,
`server/change-fields.js`, `server/noah-schema.js` (the fallback), `server/routes/changes.js` (including the photograph
route), `src/modules/members/ChangeRequests.tsx`. Tests: "Change requests: the app's own field ids" in
`server/test-schema-offline.mjs`, and the requests section of `server/test-offline-stack.mjs`.
