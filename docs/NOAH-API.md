# The Noah API

The Catalyst developer's service. The admin console now uses it for every
decision on a registration, and for reading the uploads.

Their hand-off note is `ADMIN_INTEGRATION.md`. This is what was done with it.

## Why decisions go through it

> Do not change `Registrations.status` by editing the table: nothing is sent to
> the member that way.

That is the whole reason. Writing `approved` into the table changes the record
and tells nobody — the member stays on the waiting screen, never finds out, and
the office believes it is done. The API writes the record **and** emails them
(push as well, once Firebase is set up).

So: **decisions through the API, lists and reports straight from the tables.**
Their note allows the second explicitly.

## Where the key goes

The key is in `ADMIN_API_KEY.txt`, alongside their note. It goes in
`.env.local`:

```
NOAH_API_BASE=https://noah-backend-60063007256.development.catalystserverless.in/server/noah_api
NOAH_ADMIN_API_KEY=<the key>
```

**Never in the React app.** Anything the browser holds, any visitor can read —
open the dev tools and it is there. The console calls this Node server; this
server calls Noah. That is why `server/noah-api.js` exists at all.

Authentication is `X-Admin-Key`. Not `Authorization: Bearer` — the Catalyst
gateway rejects that.

Check it with:

```
npm run test:noah
```

It only reads. It never approves, because approving would email a real person.

## What runs through it now

| In the console | Calls |
|---|---|
| Approve a registration | `POST /admin/registrations/:id/approve` |
| Return the video | `POST /admin/registrations/:id/return-video` |
| Open the photo, ID or video | `GET /admin/files/:id` |

Everything else — the registration list, the member register, the approved
history, the counts on the dashboard — still reads the Catalyst tables
directly. Those are reads, nobody needs telling, and going through the API
would only make them slower.

## The video

This is what the File Store scope problem was. The console's own Catalyst OAuth
token is tables-only: `folder list` returns `OAUTH_SCOPE_MISMATCH`, `file by id`
returns 404. Every route in was tried.

The admin key reaches File Store, so `GET /admin/files/:id` solves it without
any new Catalyst scope.

The file ids come from `GET /admin/registrations/:id`, because only Noah knows
what its own ids mean. `findFileId` in `server/noah-api.js` finds them without
depending on one field name — it matches on what the keys are called and on
values that look like Catalyst ids. If their response shape differs from every
case it handles, it falls back to the `catalystFileId` in the Files table, and
then to a direct Catalyst read. If all three fail, the error names all of them
rather than just the last.

## Without the key

The console keeps working. Approvals and video returns fall back to writing the
tables, and the reply carries a warning saying so in as many words:

> Approved in the tables, but the member was NOT told: NOAH_ADMIN_API_KEY is
> not set, so no email went out.

That is deliberate. A silent approval that looks successful is worse than one
that says what it did not do.

## What it does *not* cover

**Roles.** Pastor, cell leader, prayer warrior and the rest are not in their
API. Those stay as direct `MemberRoles` table writes — `server/roles.js` and
`patchMemberRoles` — which work today and are covered by `npm run test:roles`.

The API decides *whether someone gets in*. The console decides *what they can
do once they are in*. If the roles should also notify the member, that is a new
endpoint to ask the Catalyst developer for.

## Errors

| Status and code | What it means here |
|---|---|
| `401 invalid_admin_key` | key wrong or missing — check `.env.local` |
| `404 registration_not_found` | Noah has no registration with that id |
| `409 not_pending` | already decided; passed through as 409, not an error |
| `503 server_misconfigured` | their service's settings are incomplete |
