# Karuna Sadan admin console: handover and knowledge transfer

For a manager who wants the picture, and for a developer who has to take it over.
Part 1 is the plain-language overview. Parts 2 to 9 are for the developer.

---

## Part 1. What it is, in plain words

**Karuna Sadan runs two mobile apps.** *Noah* is the church app: members pray, give,
book events, read the daily devotion, post and learn. *Jodie* is the matrimony app.

**This admin console is the office's back-office for both apps.** It is a website the
church staff sign in to. It does not replace the apps. It is where the office looks
after what the apps collect and publish.

### The main loop (why it exists)

1. A person installs the Noah app and registers: details, ID document, photograph and a
   short KYC video.
2. That registration lands in the console, in **Membership > App registrations**.
3. Office staff open the person, see their photograph, ID proof and video, check the
   details, and **approve, ask for a new video, or reject**.
4. The app notices the decision and opens up (or asks the member to try again).
5. After that, the office can **correct a member's details** (a misspelt name, a wrong
   pincode) and **give them an app role** (pastor, cell leader, prayer warrior and so on).
   The correction is written back to the same database the app reads, so the member sees it.

Everything the office does is **recorded in an audit log** (who did what, and when).

### What the office can do today (built and working)

| Area | What staff do there |
|---|---|
| **Dashboard** | See where the ministry stands this morning and what is waiting. |
| **Work queues** | One list of everything waiting for a decision, oldest first. |
| **Membership** | Approve or reject registrations. View approved members and history. Approve changes members ask for after approval. Browse the member register. Open any person for their full record (photo, ID, video, family, groups, pastor, partnership). Edit a person's details. |
| **App roles** | Give or take away app roles: pastor, cell leader, prayer warrior, pass scanner, bus coordinator, translator, covenant partner and more. |
| **Giving** | See receipts: every gift, its 80G receipt, mode and gateway. |
| **Events** | See events and the passes members booked. |
| **Community** | Moderate app prayer requests, the approval queue, flagged items and praise reports. |
| **Content** | Edit Daily Manna, Daily Prayers, Confessions, the Dream dictionary, banners and announcements. |
| **Media** | Noahgram posts and categories. Noah Tube videos and shelves. |
| **School** | Bible school levels, courses, sections and lessons. |
| **Communications** | Read member threads (messages to a pastor, cell leader or the office). |
| **Store** | Products the app sells, and orders to dispatch. |
| **Jodie** | Verification queues (four stages), recently decided, profiles, blocks and reports. |
| **Subscriptions** | Subscriptions, plans and add-ons, and the dunning queue (overdue payments). |
| **Staff and permissions** | Who has a sign-in and their role. The permission grid. A coverage report of every endpoint and the permission guarding it. |
| **Audit log** | Every change, who made it, and when. |
| **Reporting** | The report library. |

**Built: 37 screens. Planned: 44 more.** Planned screens are already in the menu and say
what they will hold, so nothing is a dead end. Examples still to build: reconciliation
and accounting, halls and seating, attendance, broadcast and push, Jodie calls, the
Drive, tasks and assets, scheduled reports.

### Who can do what (staff roles)

There are ten staff roles, each a set of permissions. A person only sees the areas their
role allows, and the server refuses the rest, so hiding a menu is never the only protection.

Super administrator (everything), Membership officer, Finance officer, Events
coordinator, Community moderator, Content editor, Communications officer, Jodie
verifier, Jodie administrator, and Pastor (read-only view of their own congregation).

These are **console** roles. They are different from **app roles** (what a member can do
in the Noah app). A pastor in the app and a pastor with a console sign-in are separate.

### How people sign in

By mobile number or email, plus a six-digit code. Right now no SMS or email service is
connected, so the live site **shows the code on the screen**, as a developer machine does.
That is fine for a trial and **not safe for real use**. See Part 8.

---

## Part 2. Architecture

```
  Noah / Jodie apps (Flutter)        Admin console (browser)
            |                                  |
            |                       Catalyst Slate (static site)
            |                                  |  HTTPS, Bearer token
            |                       Console API (Node, Express)
            |                       Catalyst AppSail  <-- this repo's server/
            |                                  |
            +-----------> Zoho Catalyst  <-----+
                          Data Store (tables), File Store (uploads)
                          and the Noah API (the colleague's functions)
```

- **The apps and the console never talk to each other.** They read and write the same
  Catalyst rows. That is why an office decision changes what the member sees.
- **Frontend:** React 18 + TypeScript + Vite, in `src/`. A static site on **Catalyst Slate**.
- **Backend:** Node + Express, in `server/`. Runs on **Catalyst AppSail** (a Node host).
  It holds the Catalyst credentials, enforces permissions, writes the audit log and
  streams files. The browser never sees a Catalyst credential.
- **Database and files:** Zoho Catalyst Data Store and File Store, project `noah`
  (id 73626000000028001, org 60088815946). The tables belong to the app developer's
  schema. This console reads and writes them.
- **Noah API:** the colleague's functions in the same project. The console calls it for
  actions the apps must see (approving a registration, giving a pastor role), using a
  server-side admin key (`NOAH_ADMIN_API_KEY`, not yet received).

### Where things are

| Path | What is there |
|---|---|
| `src/modules/registry.ts` | The list of every area and tab, its permission and whether it is built. One list drives the menu, routes and headings. |
| `src/modules/<area>/` | One folder per area (members, content, finance and so on). |
| `src/components/` | Shared screens: `PersonDetail` (the full person record), `EditPerson`, `Upload` (photo, ID, video), `DecisionQueue`, `Shell`. |
| `src/lib/api.ts` | The only way the frontend reaches the server. `VITE_API_BASE` (in `.env.production`) is the API address baked in at build time. |
| `src/state/auth.tsx` | Sign-in state. The session token is kept in `sessionStorage`. |
| `server/index.js` | Server entry: routes, CORS, health, boot. |
| `server/routes/` | `admin.js` (registrations, files, dashboard, Jodie), `people.js`, `changes.js`, `content.js`, `staff.js`, `app.js` (the mock member-app API). |
| `server/auth.js`, `staff.js`, `roles.js` | Sign-in, codes, staff lookup, app roles. |
| `server/catalyst.js` | The Catalyst client: OAuth, Data Store calls, File Store. |
| `server/noah-schema.js` | The real table and column names, and how rows map to the console's shapes. |
| `server/member-fields.js` | Which member fields the office may edit, and their validation. |
| `server/content-types.js`, `content.js` | The 15 content kinds mapped onto Catalyst tables. |
| `server/seed/` | Sample data and the staff permission catalogue, used when Catalyst is not connected. |
| `docs/` | The deeper documents (see Part 9). |

---

## Part 3. The member journey in the console

1. **Registration arrives** (Membership > App registrations). The fields come from the
   registration tables. The photo, ID and video are in File Store.
2. **Open a person.** The panel shows what happened, the details, ID and photograph,
   declaration and signature, the KYC video, pastoral care, partnership, family and groups.
3. **Decide.** *Approve* (creates or opens the member and tells the Noah API), *Return
   the video* (the member records it again), or *Reject* (final).
4. **Approved and history** lists everything decided.
5. **Changes asked for.** After approval, a member can ask the app to change a detail.
   The office approves or declines. An approval is written to the member's record.
6. **Edit person.** The office can correct name, personal details, email and addresses.
   Not editable on purpose: the mobile number (it is the member's login), ID numbers
   (identity records), and the decision, roles and archive (they have their own actions).
   Email and addresses need the `members.pii` permission.
7. **Contact details are masked** until someone with the right permission clicks
   "Reveal contact details". That click is audited.

---

## Part 4. Files: photo, ID and video

Uploads are in Catalyst File Store (folder `noah_uploads`). The browser never gets a
public link. It asks the console API for `GET /api/registrations/:id/file/:kind`
(kind is photo, id or video). The server checks permission, fetches the bytes, sends the
right content type, and **writes the view to the audit log**.

---

## Part 5. Data and Catalyst

- **Connection:** a Zoho *Self Client* (client id, client secret, refresh token) created
  by the Zoho account that owns the project. The API swaps the refresh token for
  short-lived access tokens. Settings: `CATALYST_PROJECT_ID`, `CATALYST_ORG_ID`,
  `CATALYST_ENV` (Development), `CATALYST_SCHEMA` (noah), and the three credentials.
- **Console-only columns:** six columns on `membersExtra` (consoleRole, consoleStatus,
  consoleTitle, consoleGrantedBy, consoleGrantedAt, consoleLastSignedInAt) record who has
  console access. They are added with `npm run catalyst:columns -- --apply`.
- **Catalyst free tier:** about 10,000 reads and 1,000 updates a month, shared by the app
  and the console. The server caches reads for 60 seconds (`CONSOLE_CACHE_SECONDS`).
- **Big ids:** Catalyst sends 17-digit ids as JSON numbers, which JavaScript rounds. The
  parser in `catalyst.js` quotes any number of 16 or more digits. Do not remove this.
- **Without Catalyst** the server falls back to in-memory sample data, so the console
  always runs on a developer machine. `GET /api/health` reports `dataSource`
  (`catalyst` or `memory`).

---

## Part 6. Running it

```
npm install
npm run dev                # API on :4000 and the console on :5173
npm run dev:offline        # sample data only, never touches Catalyst
npm run catalyst:connect   # one-time: connect a Self Client (secrets typed in your terminal)
npm run catalyst:columns   # check the six console columns (add -- --apply to create them)
```

It needs `.env.local` (git-ignored) with the Catalyst settings above. **Never commit it.**
Local sign-in: pick a test account and the code is shown on screen.

**Tests** (offline, no Catalyst needed): `npm run test:schema`, `test:stack` (start
`node server/dev-offline.mjs` first), `test:demo`, `test:connect`, `test:roles`,
`test:journey`, `test:contract`. `npm run typecheck` checks the types.

---

## Part 7. Deploying

- **API (AppSail):** `npm run deploy:api -- --code-on-screen` (or `--test-login`, or no
  option for the locked-down mode). It bundles the server into one file, sets the settings
  and deploys to project `noah`. It needs the Catalyst CLI signed in as the project owner
  (`catalyst login`). AppSail rejects setting names that start with `CATALYST_`, so they
  are sent as `KSM_...` and mapped back in `catalyst.js`.
- **Console (Slate):** the Slate app builds from GitHub `main`. After pushing, start a new
  deployment of the same app in the Slate console. `npm run deploy:slate` also exists, but
  the CLI cannot update an app that was created in the console.
- **CORS:** Catalyst's gateway answers browser preflight checks itself. Every Slate address
  must be added under Authentication > Authorised Domains (without `https://`, CORS on).
  A new Slate app gets a new random address, so redeploy the same app instead of
  recreating it.
- **Git:** `main` on `github.com/kishor-2026/Noha_admin`.

---

## Part 8. Security: what to know before real use

- **The sign-in code on screen** is a trial setting. Anyone who knows a staff number can
  get in and see real members' ID proofs and videos. Before real use, set up email (SMTP)
  or SMS (Twilio), then redeploy with `npm run deploy:api` and no options. Codes are then
  sent, and the office passphrase returns as a second guard. See `docs/CONSOLE-ACCESS.md`.
- **Test accounts** (+91 90000 00001 to 10) act as every role, including super
  administrator. They must be off in production.
- **Secrets** live only in `.env.local` and the AppSail settings. The Self Client secret
  and codes were pasted in chat during setup, so **delete that Self Client and make a new one.**
- **Permissions are enforced on the server**, not only hidden in the menu.
- **Old items to remove:** apps and deployments left in the old demo3 account, the extra
  Slate apps, and the `karuna-hello` test AppSail in project `noah`.
- The repository history still holds an old `export/` folder with personal data.
  Consider making the repository private.

---

## Part 9. Still open, and where to read more

**Open items**
- `NOAH_ADMIN_API_KEY` from the Catalyst developer (needed for some app-visible actions).
- Email and SMS for sign-in codes (the SMTP and Twilio settings are wired but not filled in).
- Give real staff a console role (the six columns, or `users.is_super_admin`).
- The 44 planned screens, finance first.

**Documents in `docs/`:** `REGISTRATION-FLOW.md` (the whole journey, app and Catalyst),
`CONSOLE-ACCESS.md` (staff access and sign-in), `NOAH-API.md`, `CATALYST-SETUP.md` and
`CATALYST.md` (Catalyst), `DEPLOY.md`, `API-CONTRACT.md`, `CONTENT-TABLES.md`,
`SCHEMA-RECONCILIATION.md`, `INTEGRATION-PLAN.md`.
