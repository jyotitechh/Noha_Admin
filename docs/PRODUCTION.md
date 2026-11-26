# Production: what the console does with the app developer's FOR-CONSOLE-PRODUCTION.md

The Noah app goes to Google Play on the **Production** environment of the NoahApp project. This is how each point
of the developer's file lands in the console. Checked on 26 Nov 2026.

## 1. Point the console at Production

The console has no settings screen for this. It is three server settings, and `--production` sets all three:

| Setting | Development (now) | Production |
|---|---|---|
| `CATALYST_ENV` (which Data Store the console reads and writes) | `Development` | `Production` |
| `NOAH_API_BASE` | `https://noahapp-60093443705.development.catalystserverless.in/server/noah_api` | `https://noahapp-60093443705.catalystserverless.in/server/noah_api` |
| `NOAH_ADMIN_API_KEY` | the Development key in `.env.local` | **the new `ADMIN_API_KEY`**, given privately by the developer |

The tables are found by name, so nothing else changes. `.env.local` stays on Development for local work.

```
# 1. save the new key, alone on one line, in  C:\Users\WORK\ksm-production-api-key.txt
# 2. then
npm run deploy:api -- --email-codes --production
```

It refuses to run without that file or without `--email-codes`, and it never prints the key. The site (`npm run deploy:slate`)
needs no change: it still talks to the same API address.

What was checked against Production (read-only, with the console's existing credentials):

- The Production Data Store answers. It holds 1 member, 1 draft registration and 2 `users` rows (no admin flag, no email).
- Every column the console reads or writes is there, on every table that had a row to look at.
- **Nobody can sign in to the console on Production yet**: no user there has `users.is_super_admin`. See "First sign-in" below.

## 2. Registrations wait for the office

Already how the console works: App registrations → approve, return video, or decline. Nothing to build.

## 3. Pastors and cell leaders

Already built, after the people have registered: App roles → give **Pastor** (sets `memberType = pastor`); on a member's
record → Pastoral care → **Change pastor / Change cell leader** (sets `connectedPastor` / `connectedLeader`).

## 4. The reviewers' test account (+91 9000000999)

Nothing in the console. When Google's reviewer signs in once and fills the registration, approve it in App registrations
as an ordinary member (not pastor, not admin). The console's own test accounts (`+91 90000 0000x`) are switched off by
`--email-codes` and are a different thing.

## 5. Content for the live app

Production starts empty. Events, Daily Manna, prayers, confessions, Bible plans, banners and so on are entered in the
console once it is on Production. Each is translated to the six languages on save, as before.

## 6. When someone deletes their account

**Not in the console yet.** The app switches the account off and emails the support address; the office then has 30 days
to remove the personal data. The Data Store has a `membersExtra.isDeleteRequest` column that looks like the app's flag, and
`members.archived` / `archivedOn`, but nothing has ever written them in Development, so which of them the app sets, and when,
is a guess. To build a "Deletion requests" list with a 30-day countdown, the developer must say exactly what the app
writes. Until then: watch the support mailbox.

The support address is the developer's setting (`SUPPORT_EMAIL`), not the console's. A real mailbox such as
`support@karunasadan.com` should replace `noreply@karunasadan.com`.

## 7. Optional, later

- **Help assistant:** the console's Help Bot Questions screen is built. Turning the bot on is the developer's four
  QuickML settings (`FOR-CONSOLE-HELP-BOT.md`).
- **Push in the member's language:** add the `language` column to `deviceTokens`, then the developer sets
  `DEVICE_LANGUAGE_COLUMN=true`. The console does not touch `deviceTokens`.
- **Google Play account:** trader status; not the console.

## First sign-in on Production

The console lets someone in only if they are a super administrator (`users.is_super_admin = true`) or have been given
a console role by one. Production has neither, and a role can only be given from inside the console. So once, by hand
in the Production Data Store:

1. The first office member registers in the app (with the email they will sign in by) and the row exists in `users`.
2. The developer (or the Catalyst owner) sets `is_super_admin = true` on that `users` row.
3. That person signs in to the console by email, approves the others, and gives roles from the Staff screen.

## After the switch

1. `https://karuna-api-50047381961.development.catalystappsail.in/api/health?fresh=1` says `dataSource: catalyst`.
2. Sign in; the screens are empty, which is right.
3. Upload one picture in a content form (pictures go to the Stratus bucket) and open one member's photo once there is one.
