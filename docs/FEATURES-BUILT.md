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
2. The office opens A's page: **Membership > Member register > open A > Family > Add a relative**.
3. They search for B, choose what B is to A, and press **Add relation**.
4. One row is saved. A sees B as the relation chosen; B sees A as the **reverse**, with nothing more to do.
   - B is A's **Father** -> B sees A as **Son** (A is a man) or **Daughter** (A is a woman).
   - B is A's **Uncle** -> B sees A as **Nephew** or **Niece**. **Aunt** works the same way.
   - **Spouse** is one choice and reads the same both ways. It is shown as **Husband** or **Wife** by the other person's gender.

**The relations on offer:** Father, Mother, Son, Daughter, Spouse (shown as Husband or Wife), Brother, Sister, Uncle, Aunt,
Nephew, Niece, Parent, Child, Sibling, Other.

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

## 3. Changes members ask for (Me > My information)

**What.** Members cannot edit their own details. They ask, and the office approves or turns down.

**How.** **Membership > Changes asked for** lists each request. Approving writes the new value into the member's record.
The app's field names are mapped to the right columns, and values are converted where needed (gender, yes/no, income,
a phone split into dial code and number, an address into address and area, a location into city, state and country, a
reference name or phone). A value that cannot be applied is flagged before anyone presses Approve. The sign-in number is
never changed here, because it is the member's login. The member is not notified yet, and the screen says so.

**Where.** `server/change-fields.js`, `server/noah-schema.js`, `server/routes/changes.js`, `src/modules/members/ChangeRequests.tsx`.

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
