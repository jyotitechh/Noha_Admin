# Connecting the admin server to Catalyst

**Nothing is connected.** The server runs on in-memory sample data until the
five values below are set.

This was connected once, to `flutter-calculator`, and has been disconnected.
See [What was cleared](#what-was-cleared) at the foot.

---

## What you need from the new project

| | |
|---|---|
| Project id | from the Catalyst console URL, or `List All Projects` |
| Org id | your Catalyst organisation |
| Client id and secret | a **Self Client** at <https://api-console.zoho.in/> |
| Refresh token | exchanged once, from a generated code |
| Four table ids | after the tables are created |

India data centre throughout — the app's terms promise members their record is
held in India, and `catalystserverless.in` keeps that true. For another DC,
change `CATALYST_ACCOUNTS_HOST` and `CATALYST_API_HOST`.

---

## 1. The tables

Four, with these columns. Create them in the new project and note each id.

### `Staff` — console sign-in

`email` varchar(255) unique mandatory · `name` varchar(120) mandatory ·
`title` varchar(120) · `role` varchar(32) mandatory, default `membership` ·
`status` varchar(16) mandatory, default `Active` · `lastSignedInAt` datetime

`role` is one of: `super`, `membership`, `finance`, `events`, `moderator`,
`content`, `comms`, `jverifier`, `jadmin`, `pastor`.

### `Registrations` — the six steps and the office's decision

`regId` varchar(24) unique mandatory · `mobile` varchar(20) mandatory ·
`salutation` varchar(8) · `firstName` varchar(100) mandatory ·
`middleName` varchar(100) · `lastName` varchar(100) mandatory ·
`email` varchar(255) · `gender` varchar(16) · `dob` date ·
`marital` varchar(16) · `reference` varchar(255) ·
`line1` varchar(255) · `line2` varchar(255) · `city` varchar(100) ·
`region` varchar(100) · `country` varchar(64) · `pin` varchar(16) ·
`idType` varchar(24) · **`idNumber` encrypted text, audit consent on** ·
`idFile` varchar(255) · `photoFile` varchar(255) ·
`agreed` boolean default false · `declarationLang` varchar(8) ·
`declarationVersion` varchar(16) · `signature` varchar(255) ·
`signedOn` datetime · `videoFile` varchar(255) · `videoSecs` int ·
`videoAttempt` int default 1 ·
`state` varchar(16) mandatory, default `pending` · `submittedAt` datetime ·
`decidedAt` datetime · `decidedBy` varchar(120) · `remark` text ·
`memberId` varchar(24)

`state` is `pending`, `approved` or `videoReturned` — nothing else.

**`idNumber` must be encrypted.** An Aadhaar or PAN number in the clear is a
liability, and the console already audits every reveal.

### `Members` — created when the office approves

`memberId` varchar(24) unique mandatory · `mobile` varchar(20) unique
mandatory · `name` varchar(255) mandatory · `email` varchar(255) ·
`gender` varchar(16) · `dob` date · `loc` varchar(100) ·
`address` varchar(255) · `lang` varchar(8) default `en` ·
`status` varchar(16) mandatory, default `Active` · `joinedOn` datetime ·
`fromRegistration` varchar(24)

### `AuditLog` — append only

`actor` varchar(120) mandatory · `role` varchar(64) ·
`action` varchar(120) mandatory · `module` varchar(64) ·
`record` varchar(255) · `beforeJson` text · `afterJson` text ·
`remark` text · `at` datetime mandatory · `ip` varchar(45)

---

## 2. The credentials

### Create a Self Client

<https://api-console.zoho.in/> → **Add Client** → **Self Client**.
Copy the Client ID and Client Secret.

### Generate a code

**Generate Code** tab, with this scope list:

```
ZohoCatalyst.tables.READ,ZohoCatalyst.tables.rows.CREATE,ZohoCatalyst.tables.rows.READ,ZohoCatalyst.tables.rows.UPDATE,ZohoCatalyst.tables.rows.DELETE
```

> **Do not add a ZCQL scope.** `ZohoCatalyst.zcql.EXECUTE` is not a valid self
> client scope — the console drops it silently and the endpoint then answers
> `OAUTH_SCOPE_MISMATCH`. ZCQL appears to work only from inside a Catalyst
> function. `server/store.js` uses the rows API for this reason.

Duration 10 minutes. The code **works once and dies in minutes**, so do the
next step straight away.

### Exchange it

```bash
cd admin/code
cp .env.example .env.local
```

Fill in `CATALYST_PROJECT_ID`, `CATALYST_ORG_ID`, `CATALYST_CLIENT_ID`,
`CATALYST_CLIENT_SECRET` and the four table ids, then:

```bash
node server/catalyst.js --exchange <the code>
```

It writes `CATALYST_REFRESH_TOKEN` into `.env.local` itself. Refresh tokens do
not expire, so this is once.

---

## 3. Check it

```bash
npm run dev
curl -s http://localhost:4000/api/health
```

```json
{ "ok": true, "dataSource": "catalyst", "catalyst": { "reachable": true } }
```

`"dataSource": "memory"` means one of the five values is missing.
`reachable: false` carries the reason Zoho gave.

Then seed one staff row so you can sign in, and:

```bash
npm run test:contract
```

78 checks, the whole registration journey against the live project.

---

## What connects once configured

| | Reads | Writes |
|---|---|---|
| Staff sign-in | `Staff` | `lastSignedInAt` |
| Registration queue and detail | `Registrations` | — |
| Approve | `Registrations` | `Members`, `Registrations`, `AuditLog` |
| Return video | `Registrations` | `Registrations`, `AuditLog` |
| Member register | `Members` | — |
| Audit log | `AuditLog` | — |
| App submit / status / re-record | `Registrations` | `Registrations` |

Everything else in the console — giving, events, content, Jodie — stays on the
in-memory seed. Those tables do not exist.

---

## Two things to decide before real data

**Approve writes three tables and Catalyst has no transaction across them.**
`Members` is written first on purpose: a registration still `pending` with a
member already carrying its id is recoverable, the reverse is not. It still
needs a reconciling job.

**Filtering happens in Node, not in the database**, because of the ZCQL scope
problem above. Fine for hundreds of rows, wrong for tens of thousands. When
this moves into Catalyst functions the filters move into ZCQL there, and the
function signatures in `store.js` do not change.

---

## What was cleared

On 16 October 2026, after a first connection to `flutter-calculator`
(`27145000000039371`) in org `60063007256`:

- **All four tables emptied** — `Staff`, `Registrations`, `Members`,
  `AuditLog`. The self client could not be granted `tables.DELETE`, so the
  empty tables are still there; drop them from the Catalyst console.
- **`.env.local` deleted** — refresh token and client secret gone.
- **Hard-coded table ids removed** from `server/store.js`, so nothing can
  quietly reconnect to the old project.
- **The `catalyst` MCP server removed** from this project's config.

`server/catalyst.js` and `server/store.js` are kept — they are the connection
code, and they work. They are simply dormant until `.env.local` exists.

> That client secret passed through a chat message. **Regenerate it** in the
> API console rather than reusing it on the new project.
