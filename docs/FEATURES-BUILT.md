# What has been built, feature by feature

Each feature below is kept apart and explained the same way:
**What** it does, **Why** (what the client asked), **How** it works in plain words, **Where** the code is.
Longer notes are in `docs/CLIENT-DEMO-FEATURES.md`; how to run and deploy is in `docs/HANDOVER.md`.

---

## 1. Family relations (the way the client wants it)

**What.** The office assigns how two members are related. Once it is saved, both people see each other.

**Why.** The client's rule: a member who wants someone added as a relative asks the office; the office records the relation;
it then shows on both people.

**How.**
1. Person A is already a member and wants Person B added as a relative. A asks the office (from the app, which lands in
   Membership > Family requests), or tells them.
2. The office opens A's page: **Membership > Member register > open A > Family > Add a relative**. A **Go to family** button at the top of the page scrolls straight to the Family section, so the office does not have to scroll the whole page.
3. They search for B, choose what B is to A, and press **Add relation**.
4. One row is saved. A sees B as the relation chosen; B sees A as the **reverse**, with nothing more to do.
   - B is A's **Father** -> B sees A as **Son** (A is a man) or **Daughter** (A is a woman).
   - B is A's **Uncle** -> B sees A as **Nephew** or **Niece**. **Aunt** works the same way.
   - **Spouse** is one choice and reads the same both ways. It is shown as **Husband** or **Wife** by the other person's gender.

**The relations on offer (stored code in brackets):** Father (4), Mother (5), Son (2), Daughter (3), Spouse (1, shown as Husband or
Wife), Brother (6), Sister (7), Uncle / Aunt (12 or 13, picked by the other person's gender), Nephew / Niece (14 or 15, the same
way), Grand Parent (9), Grand Child (10), Other (8). Sibling (11) is no longer offered; rows already saved with it still read as
Sibling. 9 and 10 are named Parent and Child in the Noah app, so check the app's labels. A person already in the family can be
chosen again to **change** their relation. The member page has a button for each section at the top, to jump to it.

**Rules.** Both people must be members. The same two people cannot be related twice (remove the old relation first). A
gendered relation needs the first person's gender set, and the screen says so if it is not. Removing a relation takes it away from both people.

**Note on uncle, aunt, nephew and niece.** The Noah app's own list stops at 11 (Spouse ... Sibling). These four are added by the
console because the client asked for them. Confirm with the app developer that the app can show them before using them on
real members. They can be switched off with `FAMILY_EXTRA_RELATIONS=off`.

**Where.** `server/relations.js` (the codes, names and the reverse of each, fully commented), `server/noah-schema.js`
(`addRelation`, `removeRelation`), `server/routes/people.js`, `src/components/PersonDetail.tsx` (Family > Add a relative).

---

## 2. Family requests inbox

**What.** A list of what members have asked for from the app (Me > Family), for the office to approve or reject.

**Why.** Members ask the office to add a relative; the office must check before two accounts are linked.

**How.** **Membership > Family requests** shows Waiting, Approved, Rejected and Withdrawn. Open one:
- A **grown-up** shows which existing member the typed number belongs to (or "not joined yet"). If the number is wrong the office
  can link a different member instead.
- A **child under 18** is added as a record (no account), linked to the member and the member's spouse.
- **Approve** links both accounts and notifies both people. **Reject** needs a reason, which the member reads.
Decisions go through the Noah API, so the members are told. Numbers are masked. Every decision is in the audit log. A badge on
Membership and a row in Work queues count the waiting ones.

**Where.** `server/noah-api.js`, `server/family-requests.js`, `server/routes/family.js`, `server/queues.js`,
`src/modules/members/FamilyRequests.tsx`.

---

## 2d. Referred by, with a green or red tick

The app stores the reference a member gives at registration in `members.referBy` as one text,
`name|+91|number` (none given is `|+91|`). The member page (**Who they are > Referred by**) and the registration
review show the name and number with:

* **green tick, "Noah member"**: the name AND the number are the same member's. The number is their mobile
  (`mobileNumber1`, `mobileNumber2`) or login number (`users.number`), compared on the last 10 digits; the name is their
  full name or first and last name, ignoring case, dots and extra spaces. The matched member is shown under it.
* **red cross, "Not a Noah member"**: anything less. When only one half matches, it says which: "The number is X's: the
  name does not match", or "Same name, different number: X". A number with no name is never a match.

The person themselves never counts as their own referrer. The referrer's number is masked like the member's own and
shown in full with **Reveal contact details** (audited). The tick is worked out when the page opens.

**Editing.** **Edit details** has a **Referred by** group: **Referrer name** and **Referrer mobile number** (digits
only, without the country code; a contact detail, so it needs `members.pii` and **Show contact details to edit**). Both
are written back into the one `referBy` column as `name|code|number`, keeping the existing country code (+91 when there
was none); clearing both leaves the app's own empty `|+91|`. The change is in the audit log (the number as
"(contact detail)"), and the tick follows the new number at once.

## 2f. A rejected registration comes back corrected

From `FOR-CONSOLE-REJECTED-REGISTRATIONS.md`. A rejection is no longer final: the member is told what to change (push,
email, notification), corrects it in the app and submits again, and it is **pending** once more.

* **Reject** asks for **What to correct** (required; the member sees it) and goes through `POST /admin/registrations/:id/reject`.
  The toast says it went back for correction and returns once they send it again.
* A registration sent again is marked **Sent again** in the list. Its drawer says when it was rejected (and how many
  times) and the note it was rejected with, so the office can check that exactly that was corrected. The API clears
  `reviewNote` on resubmission, so the note is read from the member's message in `notifications`
  (type `registration_rejected`, the note after the fixed sentence): one ZCQL query, cached a minute like the tables; if
  it fails, the registration still shows, without the note.
* "Sent again" is a pending registration with an earlier rejection message, or one submitted after its last decision
  (`submittedAt` later than `reviewedAt`, which also covers a returned video).
* A rejected one waiting for the member reads "Rejected — waiting for the member to correct it", and deciding it is
  refused with that reason.
* **Tell the member** (a decision written to the table without the API) calls `announce`, falling back to `notify`: the
  live API has only `notify` so far (13 Nov 2026).

## 2e. The console updates itself after a deploy

Slate serves the page with a one-year cache (`cache-control: public, max-age=31536000`), so a browser could keep
running an old console after a deploy. `src/lib/freshness.ts` asks for the page afresh on start, every ten minutes and
when the tab comes back into view; when it loads a different script, the next move to another screen loads the new
console (never mid-screen, so nothing typed is lost). A screen whose code is gone after a deploy also loads the new
version instead of failing. A browser still on a version from before this needs one **Ctrl + Shift + R**.

**Where.** `referrerIndex`/`referrerOf` in `server/noah-schema.js`, `server/routes/people.js`,
`src/components/ReferredBy.tsx`, `src/components/PersonDetail.tsx`, `src/modules/members/Registrations.tsx`.

---

## 2c. Reported comments, education details, WhatsApp number, Tamil

Brief: `FOR-CONSOLE-REPORTS-AND-EDUCATION.md`.

**Reported comments** (Community > **Reported comments**, `community.moderate`). Members can report a comment on the Daily Manna or on
Noahgram (`comments` rows, `component` 1 or 2). One member reports one comment once; at three the app hides it for everybody (`hide` = 1)
and tells no one. The screen lists every comment with `flagged` above 0 that is not removed, most reported first, with where it is (the
Manna title or the post's caption), who wrote it, and its replies shown together. Three decisions:
- **Keep it**: reported unfairly. `flagged` = 0 and `hide` = 0, so it shows again, and its rows in `flaggedComponentStats` are
  deleted so those members can report it again. Each row there is one member's report (`component` 3 = a Manna comment, 4 = a
  Noahgram comment, `componentId` = the comment); the screen shows "Reported by" with their names (REPORT-A-COMMENT-ERROR.md).
- **Hide it**: `hide` = 1. Out of sight, not removed.
- **Remove it**: `isArchived` = true, `archivedOn` = now, and the Manna's or post's `comments` count goes down by one (never below 0).
The Work queues row and the Community badge count what is reported. Under **Media > Noahgram**, a post's comments carry the same
"Reported N times" mark, and their Hide and Show now use the API's `hide` column too. Every decision is in the audit log.
`server/noahgram.js` (`reportedComments`, `moderateComment`), `server/routes/reported.js`, `src/modules/community/Reported.tsx`.

**Education details.** The app sends `education` change requests: one line per qualification, 10th and 12th with school, marks and year
after a dash. The request list shows the old and new text with its line breaks (Now / Asked for), the member page has an Education row,
and the office can edit it by hand in a text box that keeps the line breaks. The limit is 2,000 characters (the column holds 10,000);
it was 255, which the app's own entries could exceed. `server/member-fields.js`, `server/change-fields.js`.

**WhatsApp number.** The app's second phone is now the WhatsApp number (still `phone2`). Change requests label it so. The removed
fields (second email, landline, communication language) can still be edited by hand.

**Tamil** is `contentLanguage` 6, which is what the content forms already use. Nothing to change.

---

## 2b. Archive, restore and delete a member for good

**What.** Two steps, so a slip can be undone. On a member's page (Member register, or Approved and history):
- **Archive** (permission `members.archive`, the membership officer and super administrator) hides the member and blocks their
  login to the app. Nothing is deleted. A banner on the page offers **Restore**.
- **Delete for good** (permission `members.delete`, **super administrator only**) appears only on an archived member, and only after
  the member's name is typed. It removes the member, their extra row, registrations, change requests, family links, children recorded
  only under them, their uploads and their login, and clears them as pastor or cell leader of others. It cannot be undone.
- Refused: archiving or deleting your own record; archiving or deleting a super administrator flagged in the office's own system;
  deleting someone who still has console access (remove it first); deleting one who is not archived.
- Every step is in the audit log. The deletion entry keeps the name and member number, never contact details.

**Limits, said plainly.**
- Rows in the Noah app's other tables (passes, likes, comments, Noahgram posts) are not touched. They stay, pointing at no one.
- The uploaded ID, photograph and video are deleted from File Store too, but that needs the Catalyst token to hold
  `ZohoCatalyst.files.DELETE` (now in the scope list; run `npm run catalyst:connect` once to grant it). Without it the rows are
  removed and the screen says how many files could not be removed, so the Catalyst administrator can clear them.
- Events, event groups and the content kinds (Manna, prayers, banners and so on) already had delete (events: archive first).

**Where.** `server/noah-schema.js` (`setMemberArchived`, `deleteMemberForGood`), `server/routes/people.js`,
`src/components/PersonDetail.tsx`. Tested in `server/test-offline-stack.mjs` ("Archive, restore and delete a member for good").

---

## 2a. Noahgram moderation

**What.** Members post pictures and reels in the app. Every one **waits for the office**: nobody sees it, on the feed or on its
share link, until it is approved. **Media > Noahgram** is where the office decides.

**How.**
- **Waiting** lists the posts and reels, longest-waiting first, each with a thumbnail, who posted it (their own name, no title) and
  how long it has waited (red after 24 h). Open one to see the whole picture, or play the reel, before deciding.
- **Approve** makes it live and tells the author. **Turn down** needs a reason; the post is archived (never deleted) and the
  author is told.
- **Live on the feed** lists what members can see now, with likes, comments and views. Open one to **take it down** (the same
  turn-down: off the feed, its link stops working, the author is told), or to **hide or remove a comment**. Removing a comment
  also lowers the post's comment count; a hidden one stays listed, marked, and can be shown again.
- A badge on Media, a row in Work queues and a Dashboard card count the waiting ones. Every decision is in the audit log.

Decisions go through the Noah API (`/admin/noahgram/...`), never through the table, because only the API tells the author.
Comments have no API call, so they are written to the `comments` table. A picture or video is read through the console's own
server (permission checked; the file id is taken from the post, never from the request). Needs `community.moderate`.
The Media > Noahgram switch "Approved" is for posts the office writes itself and tells nobody: it says so.

**Where.** `server/noah-api.js` (`listNoahgramPending`, `decideNoahgramPost`), `server/noahgram.js`,
`server/routes/noahgram.js`, `server/queues.js`, `src/modules/community/Noahgram.tsx`. Brief: `FOR-CONSOLE-NOAHGRAM.md`.
Tested in `server/test-offline-stack.mjs` ("Noahgram moderation").

**Not yet checked against the live Noah API.** The note does not give the shape of `GET /admin/noahgram/pending`, so the console
reads the usual names (`posts`, `items`, `rows`, a bare list; `author.name`, `caption`, `isReel`, `createdAt`) and fills what is
missing from the `noahGram` and `members` tables. Open the screen once against the live API and look.

---

## 3. Changes members ask for (Me > My information)

**What.** Members cannot edit their own details. They ask, and the office approves or turns down.

**How.** **Membership > Changes asked for** lists each request: Waiting, Approved, Turned down.
- The decision goes through the **Noah API**, which writes the value in the format the app expects and **sends the member a
  notification**. A reason given when turning one down is shown to the member. The screen says the member is notified.
- A **new profile photo** is shown beside the current one so the office can look at it before approving. Approving makes it
  the member's photo.
- The member's **sign-in mobile number** is never approved here (it is their login). The screen says to change it by hand,
  then turn the request down with a note such as "Changed".
- If the API key is not set, or the API does not have these calls yet, the console writes the record itself, and the screen
  shows a warning that the member is **not** notified.

**Where.** `server/noah-api.js`, `server/profile-requests.js`, `server/change-fields.js`, `server/routes/changes.js`,
`src/modules/members/ChangeRequests.tsx`.

---

## 4. Staying signed in

**What.** The office is not logged out on a refresh, a restart or a redeploy.

**How.** The sign-in is a signed token kept in the browser tab. The server can check it again after a restart. The page
only signs out when the server says the token is invalid, never because of a brief network problem.

**Where.** `server/auth.js`, `src/state/auth.tsx`, `src/App.tsx`.

---

## 5. Asking for console access, and a super administrator approves

**What.** A member who is not staff asks for access from the sign-in page. A super administrator approves it (choosing the role) or declines.

**How.** The request is stored against the member. Only approved members can be given access. Nobody changes their own access.
There is always at least one super administrator. Once approved, the member signs in with their own mobile number.

**Where.** `server/access-requests.js`, `server/routes/staff.js`, `src/modules/staff/Requests.tsx`, `src/modules/SignIn.tsx`.

---

## 6. Bible commentary by book and chapter

**What.** Commentary is written for a chosen book and then a chapter of that book.

**Where.** `server/content-types.js`, `server/content.js`, `src/modules/content/ContentManager.tsx`.

---

## 7. Cell leaders by location

**What.** When choosing a member's cell leader, the leaders are listed nearest first, with distance, how many members they
have and how much room is left.

**Where.** `server/noah-schema.js` (`coordsOf`, `kmBetween`, `pastoralChoices`), `src/components/PersonDetail.tsx`.

---

## 8. Picture upload on content forms

**What.** Drag and drop a picture onto a content form. It is stored in a Stratus bucket and the link is saved.

**Needs.** A public Stratus bucket and `STRATUS_BUCKET` set (the bucket must be created once in the Catalyst console).

**Where.** `server/pictures.js`, `src/modules/content/PictureInput.tsx`.

---

## 9. Smaller changes

- Removed the obituary toggle and the confession Prayer box from the content forms.
- Removed the custom Bible study screens: Bible study is to run in Zoho TrainerCentral (plan in `docs/CLIENT-DEMO-FEATURES.md`, section 7).
- CRM and contacts: a proposal only, waiting for the client's fields (section 6 of the same file).
- Fixed pink notes whose bold text was white and unreadable (`src/styles/prototype.css`).

---

## 10. Hosting and deployment

- The API runs on Catalyst AppSail; the site on Catalyst Slate (`https://karuna-admin.onslate.in`), both in the client's
  Catalyst organisation (60093443705), project NoahApp.
- Deploy with `npm run deploy:api -- --code-on-screen` and `npm run deploy:slate` (details in `docs/HANDOVER.md`).
- Code is on `https://github.com/jyotitechh/Noha_Admin.git`, branch `main`.

---

## Still open

- Photos and videos from the old project are not in the new File Store yet.
- The Stratus bucket for pictures has not been created.
- The secrets shared in chat should be replaced.
- Confirm the Noah app can show Uncle, Aunt, Nephew and Niece.
