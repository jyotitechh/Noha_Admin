# Who can sign in to the console, and as what

A member registers in the Noah app. A super administrator gives them a console
role. From then on they type the same mobile number into the console, enter a
code, and see exactly what that role allows.

```
Flutter app                Console (this repo)                    Catalyst
───────────                ───────────────────                    ────────
member registers  ───────────────────────────────────────────►   users + members
                           office approves the registration
                           super admin: Staff → Give access   ──►  console-staff table
                           (member, role, title)                   (memberRowId, role, status…)

member types number ──────► finds them by number ◄──────────────   reads users, members,
member enters the code      checks: approved, not archived,        console-staff table
                            access Active                          
                            opens a session as that role
```

## How the console decides

A number is staff if **any one** of these is true, checked in this order:

| # | Source | Role | Can the console change it? |
|---|---|---|---|
| 1 | **Test account**, if test login is on (below) | the role of that test number | no, fixed |
| 2 | **`users.is_super_admin = true`** in Catalyst: the office's own flag | Super administrator | no. It is the office's flag, and the Noah app reads it too |
| 3 | **A row in the console-staff table** | the role on the row | yes: change, suspend, revoke |

Then, for 2 and 3: the member must not be archived, and their login must not be
blocked (`users.archived`). Access given from the console also needs `status =
Active`. Someone who is suspended or revoked is told so.

Things that are **not** staff, on purpose:

- **`users.is_admin`.** The Noah app uses it to choose who answers the "church
  office" chat (the oldest such user). Treating every console user as one would
  quietly change who members are talking to. It is read by nothing here.
- **The prototype's sample people** (`anitha.varghese@karunasadan.org` and the
  rest). With Catalyst connected they are not staff, and an email does not sign
  in. They used to be, which on a live deployment meant a published email opened
  a super administrator session onto real members' data.

## Giving access

Staff screen → **Give access to a member**.

- Only **approved** members appear. Someone still waiting on registration cannot
  be given the console.
- Pick a role from the ten. Add a job title if you like.
- It is saved to Catalyst, and the next time that member types their number they
  are in.

Rules that cannot be bypassed from the UI or the API:

- **Nobody changes their own access.** It is how the only super administrator
  gets locked out, or a role becomes a bigger one.
- **There is always a super administrator.** Suspending, revoking or demoting
  the last real one is refused. Test accounts do not count.
- **Only a super administrator can make another.**
- **Revoking keeps the row**, marked `Revoked`, so who had access and who removed
  it can still be read. Giving access again restores the same row.
- **Suspending or revoking signs them out immediately.** It does not wait for
  their session to expire. A role change applies to an open session at once.
- Every grant, change, suspension and revocation is in the audit log.

## What the Catalyst developer needs to create

The office's schema has nowhere to say *which* console role someone has.
`users.is_admin` / `is_super_admin` are two flags; the console has ten roles.
So it needs one small table.

**Catalyst is at its 191-table cap**, and the console's token cannot create
tables, so this has to be done by someone with Catalyst access. Either create
one table, or repurpose an empty shell (one of the tables with no columns yet).

Suggested name `consoleStaff`. Columns, all optional as Catalyst makes them:

| Column | Type | Holds |
|---|---|---|
| `memberRowId` | varchar (or bigint) | `members.ROWID` of the person |
| `role` | varchar(40) | one of: `super`, `membership`, `finance`, `events`, `moderator`, `content`, `comms`, `jverifier`, `jadmin`, `pastor` |
| `status` | varchar(20) | `Active`, `Suspended` or `Revoked` |
| `title` | varchar(100) | job title |
| `grantedBy` | varchar(100) | who gave it |
| `grantedAt` | datetime | when (UTC, `YYYY-MM-DD HH:mm:ss`) |
| `lastSignedInAt` | datetime | stamped on each sign-in |

Then give the console its id:

```
CATALYST_TABLE_CONSOLE_STAFF=<the table id>
```

in `.env.local` locally and in Render's environment, and run
`npm run check:schema`. It confirms the table is there and has every column.
A row with a role the console does not define, or pointing at a member that does
not exist, is ignored rather than becoming access.

**Until it exists**, nothing is lost and nothing breaks:

- The office's super administrators (`users.is_super_admin`) can sign in by
  number and use the whole console.
- *Give access to a member* shows what is missing instead of failing.
- Test accounts work.

## Test accounts

One fixed number per role, so every role can be tried without a real person:

| Number | Role |
|---|---|
| `+91 90000 00001` | Super administrator |
| `+91 90000 00002` | Membership officer |
| `+91 90000 00003` | Finance officer |
| `+91 90000 00004` | Events coordinator |
| `+91 90000 00005` | Community moderator |
| `+91 90000 00006` | Content editor |
| `+91 90000 00007` | Communications officer |
| `+91 90000 00008` | Jodie verifier |
| `+91 90000 00009` | Jodie administrator |
| `+91 90000 00010` | Pastor |

The one-time code for all of them is **`123456`**, when run locally. They appear
as a clickable list on the sign-in page.

**On a deployed server they are off**, and have no default code, deliberately:

```
ENABLE_TEST_LOGIN=true
TEST_LOGIN_OTP=<a code you choose>
```

Both are needed in production. This repository is public, so a default written
into it would be known to everyone, and a published super-administrator login on
a console connected to real members is an open door. They are also still behind
`ADMIN_PASSPHRASE`.

**Switch them off before real use.** A test super administrator sees whatever
the console is connected to, which is real members' phone numbers, ID numbers and
identity documents. `ENABLE_TEST_LOGIN=false` turns them off anywhere. The Staff
screen shows a "switch off before going live" warning while any are on.

## The one-time code, honestly

There is **no SMS gateway yet**. The code is generated by the console and shown
on screen. That is a prototype stand-in, and it means whoever can reach the
sign-in page can ask for a code for any staff number and be shown it. The
**office passphrase** (`ADMIN_PASSPHRASE`) is what stands between that and the
internet, which is why a deployed console must have one.

To send the code to the person's phone, one of these is needed, and it is not
something the console can do alone:

- the Catalyst developer exposes the OTP sending the Noah app already uses
  (`users.otp`, `otpTime`, `otpAttempts`) as an admin endpoint, or
- an SMS provider is connected to the console.

Until then, treat the passphrase as the real lock, share it only with the
office, and keep test accounts off in production.

## Known limits

- **An office flag removed in Catalyst** (`is_super_admin` set to false) stops
  that person signing in again, but a session they already hold lasts up to its
  twelve hours. Roles given from the console end at once; this one is the
  office's, outside the console's reach.
- **A restart of the server on Render signs everyone out.** Sessions are kept in
  memory in production by design.
- **Zoho single sign-on** is still not wired up. When it is, it replaces the
  number and code step; the staff table and roles stay as they are.
