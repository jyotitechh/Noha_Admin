# Changes asked for in the client module demo

What the client asked for in the module demo, what was built, the logic behind each, and where it lives.
Six items; five are built, one (CRM contacts) needs the client's field list first. Section 7 covers Bible study, which the client moved to Zoho TrainerCentral (the custom screens were removed).

| # | Ask | State |
|---|---|---|
| 1 | Stay signed in (no automatic logout) | Done |
| 2 | Request access, a super administrator approves | Done |
| 3 | Bible commentary: book, then a chapter of that book | Done |
| 4 | Leaders by location: distance, members, room left | Done (capacity is one setting, not per leader) |
| 5 | Family: the reverse relation shows automatically | Done in the console; subscriptions for a relative are an app job |
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
