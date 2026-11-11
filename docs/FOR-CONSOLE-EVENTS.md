# Events: what the Admin Console has to do

For the console developer. The member app and the Noah API already show events, take bookings and make QR entry passes. This note lists what **the console**
has to do so an event created there reaches members. The full API (scanner, attendance, audit) is in `docs/EVENTS-QR-CONTRACT.md`; this is the short list of what
we found while testing, and what is still needed from the console.

## 1. What went wrong with the first test events (and the fix on our side)

We read the two events that were created in the console (`GET /admin/diagnostics/events`, admin key only: it says why each event is or is not shown).

| Found in the row | Effect |
|---|---|
| `publishDateTime` written as **wall-clock time in India** (11:43 meant 11:43 IST) while `startTimeUtc` / `endTimeUtc` are real UTC | The Noah API read 11:43 as UTC, so a just-published event looked "not published yet" for 5.5 hours. **Fixed in the Noah API:** `publishDateTime` is now read as wall-clock time in the event's `timezone` (India time if empty). **Please keep writing it this way**, and always fill `timezone` (for example `Asia/Kolkata`). |
| `filters` = `{"forPastor":true,"forLeader":true,"forVip":true,"forPrayerWarrior":true,"memberGroups":[]}` | Every role switch on means the event is **only** for pastors, leaders, VIPs and prayer warriors. An ordinary member never sees it. See section 2. |
| `passRequired`, `passAvailable` empty | The event is shown but cannot be booked (no pass, no seats). See section 3. |
| `startTimeUtc` in the past | The event is "Completed" and nobody can book it. Normal, just keep it in mind when testing. |

## 2. Audience (`filters`): decide and make the form match

The Noah API follows the rule in the earlier notes: **if any of the four role switches is on, the event is for those roles only**; `memberGroups` narrows it to
members of those groups; **none on and no groups means everyone**.

Please make the form match that, so an organiser cannot hide an event by accident:

* The default must be **all four off** (and no groups) = "Everyone". Label it so: "Everyone" when nothing is picked, "Only: pastors, leaders..." when something is.
* If the console really means "all four on = everyone", tell the Noah API developer: it is a one-line change on our side, but the two must agree.
* Save `filters` as JSON text, exactly these keys: `forPastor`, `forLeader`, `forVip`, `forPrayerWarrior` (booleans) and `memberGroups` (list of group ids as text).

## 3. Booking fields the event form must save

A member can book only an event with these values. The Noah API keeps `passUsed` correct itself when members book or cancel.

| Column | Value | Notes |
|---|---|---|
| `passRequired` | `true` for an event that needs a pass | If false or empty the event is only shown, never bookable |
| `passAvailable` | number of seats (for example `500`) | Empty or 0 means no limit |
| `passUsed` | `0` when created | **Never reset it when an event is edited**: it is the count of passes taken |
| `passFeeType` | empty for a free event | Paid events (anything set) are shown but cannot be booked in the app yet |
| `availableFor` | empty for everyone | Anything set means partners only; not bookable in the app yet |
| `blockIfPassBookedFor` | JSON list of event ids, or empty | A member holding a pass for one of those cannot book this one |
| `isArchived`, `isInvisible`, `hideFromPublic` | `false` | Archived or hidden events are never shown or announced |
| `startTimeUtc`, `endTimeUtc` | real UTC | The end is used for "Completed" and for closing the door (12 hours after the end) |
| `locationName`, `locationAddress` | text | Shown on the event page and the pass |
| `photo` | a full `https://` link to the picture | Only links starting with `http` are shown as the banner |

## 4. Tell members about a new event

The console writes events straight to the table, so the Noah API cannot know one was added. Two calls (admin key: `X-Admin-Key`):

* **When an event is saved or published:** `POST /admin/events/<event id>/announce` with body `{}`. Members with an approved registration and a registered phone, inside the
  event's audience, get a "New event" push and a row in their notification list. An event is announced once (a second call answers `alreadySent: true`; send
  `{"force": true}` to tell everyone again). It refuses an archived or hidden event, and an event not yet published (`409 not_published_yet`).
* **For events published at a later time:** call `POST /admin/events/announce-due` every 5 to 10 minutes from the console's scheduler. It announces everything whose publish
  time passed in the last 24 hours and was not announced yet.

## 5. The door scanner and attendance

Everything is in `docs/EVENTS-QR-CONTRACT.md`. In short, the console builds:

* The **Event Scanner** page, visible only with `events.scan`. **The console must check `events.scan` on its own server before every call**: the Noah API trusts the admin key
  and does not know the permission grid. Send the staff member's name (`X-Admin-Name`) and id (`staffId`) with each scan.
* The scan in two steps: `POST /admin/events/<id>/scan` with `{ "token": "<text of the QR>" }` (or `{ "reference": "KS-0154022-3F9" }`) to look, then the same with `"confirm": true`
  to admit. Show the `message` of the answer; `result` is one of `valid`, `admitted`, `already_scanned`, `invalid`, `wrong_event`, `cancelled`, `not_confirmed`, `event_closed`, `busy`.
* The numbers and live list: `GET /admin/events/<id>/attendance` (read again every 3 to 5 seconds), the CSV: `GET /admin/events/<id>/attendance/export`.
* Manual correction with a reason: `POST /admin/events/<id>/attendance/correct`. The audit trail of an event: `GET /admin/events/<id>/attendance/audit`.

The audit notes are written to the existing `taskLogs` table (rows have `taskId` empty), or to `logs` if that legacy table is ever created. Nothing new has to be created.
`GET /admin/diagnostics/audit` says which table is used.

## 5b. Door staff scan inside the Noah app: the scanner role (App roles screen)

Staff can scan entry passes **in the member app** (Events tab, a scan icon), without the console. Who gets it is decided in the console:

* A new role on the **App roles** screen: **Door staff / Pass scanner**. It uses the call the screen already uses for pastor and admin, with one more key:
  `POST /admin/members/<member id>/roles` with `{ "scanner": true }` to give it, `{ "scanner": false }` to take it away. The answer lists the member's roles
  (`["scanner"]`). It is stored on the member's login as `users.is_employee` (the old system's staff flag), so nothing new is created.
* The role is **not** an admin and does **not** skip registration: the person still registers and is approved like any member. The app shows the scan icon only to
  a signed-in member who holds `scanner` (or is an office admin / super admin).
* **Keep this in step with the console's own permission.** The console decides `events.scan` for its staff accounts; the app role is a separate switch that the Noah API
  can read. When a staff member is given `events.scan` and also uses the app, the console should also call the roles API with `scanner: true` for that member (and
  `false` when `events.scan` is taken away). Suggested defaults: Super administrator and Events coordinator **yes**, Membership officer optional, everyone else no.
* What the app calls (the signed-in staff member's own token; the Noah API checks the role, nothing to do for the console): `GET /staff/events` (events that can be scanned now),
  `POST /staff/events/<id>/scan` (same body and answers as the console's scan: look, then `"confirm": true` to admit), `GET /staff/events/<id>/attendance` (the counter).
  Every admission is recorded against the staff member who was signed in (`attendance.createdBy`, `passes.passIsUsedEmployeeId`, and the audit note).
* The console's attendance numbers, CSV and audit view show these admissions at once, because they are the same records.

## 6. Handy checks (admin key only, nothing about people)

| Call | Tells you |
|---|---|
| `GET /admin/diagnostics/events` | the newest events and **why each is or is not shown to members** |
| `GET /admin/diagnostics/tables` | which tables exist in the Data Store |
| `GET /admin/diagnostics/audit` | where the attendance audit trail is written |
| `GET /admin/diagnostics/lock` | whether the short lock used while admitting a pass works |

## 7. How to test with the console

1. Create an event: audience **Everyone**, start tomorrow, publish now, `passRequired` true, `passAvailable` 3 (section 3), then call announce (section 4).
2. Run `GET /admin/diagnostics/events`: the event must say `shownToMembers: true` and have no notes about the audience.
3. In the app (signed in as an approved member) open **Events**: the event shows "Booking Open". Book it: a QR pass appears.
4. In the console's scanner, scan that QR (or type the reference): `valid`, then Confirm: `admitted`. Scan again: `already_scanned`. The attendance numbers go up.
