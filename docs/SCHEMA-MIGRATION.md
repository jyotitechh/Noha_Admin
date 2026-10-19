# Moving the console to the new Catalyst tables

The Catalyst developer rebuilt `noah-backend` on the office's own schema
(`nodi_schema.sql`). The old tables — `Members`, `MemberAddresses`,
`MemberIdentity`, `Registrations`, `Files`, `MemberRoles`, `AdminUsers` and the
rest — are gone, and their ids in `noah-schema.js` were dead.

This is what changed in the console, from their `ADMIN.md`.

## The model

| Was | Now |
|---|---|
| `Registrations` | `appRegistrations` |
| `Members` + `MemberAddresses` + `MemberIdentity` + `MemberProfile` | **`members`**, one wide table, + `membersExtra` |
| `Files` (`catalystFileId`, `purpose`) | `files` (`path`, `fileType`, `remoteSource`) |
| `MemberRoles` | `members.memberType` + `membersExtra` flags |
| `OtpRequests`, `Sessions`, `AdminUsers` | `users`, `userTokens` |

`membersExtra.id = members.ROWID`. Catalyst allows 104 columns a table, so the
last 62 columns of `members` live in `membersExtra`, one row per member.

## The rules that matter

**Access.** The app lets someone in when `appRegistrations.status = 'approved'`.
A member the office already verified in its own system (`isUnVerified = false`)
with no registration row also counts. **Never `members.status`**: it is a
boolean now, and in the live data it is `true` for everyone, including people
who only asked for an OTP.

A number that has only asked for an OTP already has a `users` row, a `members`
row and a `draft` registration. A row existing is not approval.
`canEnterApp` encodes this, and the offline suite proves it fails closed:
a pending, rejected, returned or unknown status never gets in; an archived
member or a blocked login never gets in.

**Decisions go through the Noah API.** Approve, reject and return-video call
`ADMIN_INTEGRATION.md`'s endpoints, which update `appRegistrations`, set
`members.isUnVerified = false` and `verifiedOn`, and email the member. Writing
the tables does none of the notifying. Only a registration that is `pending` can
be decided, and only once; the console enforces that itself too, because
without the admin key there is no API to say 409.

**Ids are strings.** A ROWID is past `Number.MAX_SAFE_INTEGER`. Never `Number()`
it, and never take it from an insert response — Catalyst sends it unquoted
there. Read the row back.

**Two clocks.** Columns the app writes are UTC; Catalyst's own `CREATEDTIME` and
`MODIFIEDTIME` are IST. Reading one as the other is 5½ hours wrong.

## Files

`GET /admin/files/:id` takes the **`files` ROWID**. That is
`appRegistrations.idProofFileId`, `appRegistrations.videoFileId` and
`members.photo`. `files.path` is the Catalyst File Store id, used only for a
direct download when the admin key is not set. The console carries both:
`fileIds` and `storeIds` on each registration.

## Roles

A member's roles are now spread over two tables, and the console presents them
as one merged row:

- **Pastor** → `members.memberType = 'pastor'`. Removing it sets `'member'`.
- **Everything else** (cell leader, prayer warrior, pass scanner, …) → a flag on
  `membersExtra`, created first if the member has no row.
- **Their pastor and cell leader** → `membersExtra.connectedPastor` and
  `connectedLeader`, shown by name on the member register.
- **Office staff** → `users.is_admin` / `is_super_admin`. The console reads this
  (`isAdmin` on a member) but its own staff sign-in is unchanged.

The app picks role changes up within about 20 seconds. No API call is needed.

## What to run

```
npm run test:schema      91 checks, offline, no Catalyst
npm run dev:offline      the whole server on a fake Catalyst + fake Noah API
npm run test:stack       34 checks of decisions and files against it
npm run check:schema     does each table id and column still exist? (reads Catalyst)
```

`dev:offline` blocks every request that is not to this machine, so it cannot
reach the real project or email anyone. Point the older suites at it:

```
node server/contract-test.mjs   http://localhost:4300
node server/test-full-journey.mjs http://localhost:4300
node server/test-roles.mjs        http://localhost:4300
```

`OFFLINE_NO_KEY=1 npm run dev:offline` runs the no-admin-key fallback instead.

What the offline stack cannot prove: that Catalyst accepts a given column, or
that the real Noah API behaves like the stand-in built from its documentation.
That is `check:schema` and the live suites.

## Catalyst's Data Store allowance

The first live check after this change failed with *"You have exhausted the free
tier allowance for Datastore - Fetch."* The Flutter app and the Noah API read the
same project, so this is not only the console's problem.

Two things in the console were spending it for nothing, and are fixed:

- **`/api/health` hit the Data Store every 30 seconds.** A host polls it around
  the clock; that is roughly three thousand fetches a day to learn nothing. It
  now never touches Catalyst, and reports what was last learned.
  `/api/health?fresh=1` and `/api/health/catalyst` ask on purpose.
- **Reads were cached for 4 seconds.** A snapshot of the five tables the
  registration and member screens share is now cached for 15, and concurrent
  reads share one fetch.

The live suites (`test:contract`, `test:journey`, `test:roles`) each spend
hundreds of fetches. Run them sparingly, and prefer the offline ones.

The allowance itself is the Catalyst account owner's to restore — the usage
meter and billing are in the Catalyst console for org `60063007256`.

## Not done

- **Profile change requests** (`appChangeRequests`) have no API yet and no screen.
  To apply one: write `newValue` to the column, set the request's `status`,
  `reviewedAt` and `reviewedByRowId`.
- **Chat, notifications and device tokens** are read-only and not shown.
- **Content tables** (`dailyMana`, `dailyPrayers`, …) exist as empty shells, so
  those screens still show "not in the connected project".
- **Console staff** still sign in from the console's own list, not `users`.
