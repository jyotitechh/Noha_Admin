# Connecting the admin server to Catalyst

The console reads and writes the Noah app's own database, in the Catalyst
project **`noah`** (Development; Production does not exist yet):

| | |
|---|---|
| Project id | `73626000000028001` |
| Organisation id | `60088815946` |
| Region | India (`.in`) |
| Noah API | `https://noah-60088815946.development.catalystserverless.in/server/noah_api` |

These are in `.env.local` already. **What is missing is the console's permission
to sign in**, which only you can create. The old project (`noah-backend`) is
disconnected: no id, credential or folder of it is left in the code or config.

## 1. A Self Client, once

1. The Zoho account that owns the `noah` project (or one Shashank has added to
   it as a user) opens <https://api-console.zoho.in/> and makes a **Self Client**.
2. Print the scopes to tick, and paste them as one comma-separated line:

   ```
   npm run catalyst:scopes
   ```

   They are `projects.READ`, `tables.ALL`, `tables.rows.ALL`, `tables.columns.ALL`,
   `zcql.CREATE`, and the two File Store ones. `tables.ALL` and `columns.ALL`
   are what let the console add a missing column; the running console itself only
   ever reads and writes rows.
3. Put the Client ID and Client Secret into `.env.local`
   (`CATALYST_CLIENT_ID`, `CATALYST_CLIENT_SECRET`), generate a code with those
   scopes (pick the longest duration), and exchange it:

   ```
   node server/catalyst.js --exchange <the code>
   ```

   It writes `CATALYST_REFRESH_TOKEN` into `.env.local` for you, then **reads back
   which scopes were really granted**. The API console accepts a scope it does not
   recognise and silently drops it, so asking is not the same as having. Anything
   it lists as NOT granted, tick by hand in the console's scope tree and try again.
4. The same three values go into Render's Environment tab for the deployed API.
   They are secrets: never in git, never in the React app, never in chat.

Every call to Catalyst sends `Authorization: Zoho-oauthtoken …`, `CATALYST-ORG` and
`Environment: Development`; `server/catalyst.js` does this.

## 2. Check what the project has

```
npm run check:schema
```

Read-only. It finds each table the console uses **by name** (table ids are
different in every project and are never written in the code), then asks Catalyst
for each table's columns, so an empty table is checked as well as a full one. It
costs no Data Store fetches.

## 3. Add what is missing

```
npm run catalyst:columns               shows what is missing; changes nothing
npm run catalyst:columns -- --apply    creates it
```

It only ever **adds**: a column, or the console's own `consoleStaff` table (which
holds who has which console role) and Noah Tube's two tables. It never alters or
removes anything that is there, and it does not create the Noah app's own tables.
What it wants is in `server/schema-spec.js`. Catalyst allows 104 columns in a
table and 191 tables in a project; a table that would go over is reported, not
forced.

Catalyst refuses a few column names (`date`, `order`, `time`, `key`, `rows`, `in`,
`out`, `priority`, `timestamp`), so the project spells them `dateCol`, `orderCol`
and so on; the console translates at the edge (`columnFor` in `content-types.js`).

## 4. The Noah admin key

Approving, rejecting, returning a video and making someone a pastor go through the
Noah API, because it also tells the member. It needs `NOAH_ADMIN_API_KEY`, which is
in `ADMIN_API_KEY.txt` on Shashank's machine: ask him for it privately. Without it
the console still works and says plainly that the member was **not** told. See
[NOAH-API.md](NOAH-API.md).

## 5. The free allowance is shared

Catalyst's free tier is **10,000 Data Store fetches and 1,000 updates a month for
the whole account**: the Noah app, the Noah API and this console draw on the same
amount. The last project ran out. So:

- What the console reads is kept for a minute (`CONSOLE_CACHE_SECONDS`), a decision
  made here clears it at once, and the **Refresh** button in the top bar clears it
  on demand. A registration the app has just sent in can take up to a minute to
  show; press Refresh for "now".
- Nothing polls on a timer. `/api/health` costs nothing.
- `GET /api/health` shows `catalystSpent`: what this process has used since it
  started, so it is possible to tell whether it is the console.
- A screen reads five tables (registrations, members, their extras, files, users).
  That is fine for a few hundred members. Past a few thousand it should move to
  ZCQL queries with `WHERE` and `LIMIT` (`query()` in `catalyst.js` is there and
  tested, and the `zcql.CREATE` scope is asked for), and the register should page.

---

# Reading the uploads: the File Store scope

## The symptom

Opening a photograph, ID proof or KYC video in a registration returns **403**,
and the console says the token has no File Store scope.

## What is actually wrong

Nothing is missing in Catalyst. The files are there — 33 of them, 11 photos,
11 ID proofs, 11 videos, every one with a `catalystFileId` in the `Files`
table. The console knows which file belongs to which registration.

The refresh token simply cannot read them. It was issued with five scopes:

```
ZohoCatalyst.tables.READ
ZohoCatalyst.tables.rows.CREATE
ZohoCatalyst.tables.rows.READ
ZohoCatalyst.tables.rows.UPDATE
ZohoCatalyst.tables.rows.DELETE
```

Tables only. Every File Store route answers the same way:

```
401 {"error_code":"OAUTH_SCOPE_MISMATCH","message":"invalid oauth scope to access this URL"}
```

That is true of listing folders, reading one folder, listing its files, and
downloading a file by id — checked individually with
`npm run probe:filestore`. Knowing the folder id does not help: the refusal is
about the token, not about finding the folder.

## The fix

Add two scopes and exchange a new code. Five minutes, in your own API console.

1. `npm run catalyst:scopes` — prints the full list to paste.
2. Go to <https://api-console.zoho.in/>, open the Self Client, **Generate
   Code** with that scope string. Pick a long duration.
3. `node server/catalyst.js --exchange <code>`
4. Restart the API server.

Then `npm run probe:filestore` should download rather than refuse, and the
video opens in the registration drawer.

### Two things that have caught us before

**The code is single use and expires in minutes.** `--exchange` writes the
refresh token straight into `.env.local` rather than printing it for someone
to copy, because a mistyped paste means starting over with a fresh code.

**The API console accepts a scope it does not recognise and then silently
drops it.** That is how the ZCQL scope was lost — it looked granted and was
not. So `--exchange` now reads back what was actually granted and fails loudly
if anything asked for is missing. If `ZohoCatalyst.files.READ` comes back in
that "NOT granted" list, tick it by hand in the console's own scope tree
instead of pasting it.

## Why there are two folder paths

Listing folders needs `folders.READ`; going straight to a known folder needs
only `files.READ`. `CATALYST_FILE_FOLDER_ID` in `.env.local` can hold the folder
the uploads live in (find it in the Catalyst console, File Store), so `downloadFile` tries it directly first and only falls
back to listing. One missing scope then need not stop the other working.

## The other way round

If the Catalyst developer sends `ADMIN_API_KEY.txt`, none of this is needed:
`GET /admin/files/:id` on the Noah API reads the same files with the admin key
and no Catalyst scope at all. See [NOAH-API.md](NOAH-API.md). Either route
fixes it; the scope is the one you can do without waiting for anyone.
