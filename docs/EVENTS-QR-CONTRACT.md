# Events, entry passes and the door scanner: the contract

What the Noah API (`noah_api`) offers for events, QR entry passes and attendance, and what the **Admin Console** has to build on
top of it. The member app part is built (Events tab, booking, My passes, QR code). This is the console's part.

```
Member app                       Noah API                          Admin Console (door staff)
  GET  /events          ----->   events the member may see
  POST /events/:id/book ----->   one pass per booking (QR token)
  GET  /passes          ----->   the member's passes, each with its QR code
                                                                   shows a camera scanner (Event Scanner tab)
                                 <-----  POST /admin/events/:id/scan   { token | reference }          (look)
                                 <-----  POST /admin/events/:id/scan   { token, confirm: true, ... }  (admit)
                                 <-----  GET  /admin/events/:id/attendance                            (numbers, live)
```

## 1. Who may scan: `events.scan` is enforced by the console

The Noah API does not know the console's roles and permission grid, so **the console's own server must check `events.scan`
before it calls any of the endpoints below** (the `SCANS` area of `server/index.js` already maps to `events.scan`). A staff member
without it must get a 403 from the console for the page and for these calls; hiding the tab is not enough.

The console calls the Noah API with the admin key and names the person scanning:

| Header / body | Meaning |
|---|---|
| `X-Admin-Key` | the admin API key (as for every `/admin/*` call) |
| `X-Admin-Name` | the staff member's name, recorded in the audit trail |
| `staffId` (body, or header `X-Admin-Staff-Id`) | the staff member's id (digits). It is stored as `passes.passIsUsedEmployeeId` and `attendance.createdBy` |
| `deviceRef` (body, optional) | a label for the scanning device or session |

A signed-in **admin / superAdmin** member (a staff token from the app) is also accepted by these endpoints. A pastor or any other
member is refused (`403`). Revoking `events.scan` in the console takes effect at once because the console stops calling; records
already written are never touched.

Suggested defaults for the permission grid (the console, not the Noah API, applies them): Super administrator **yes**, Events
coordinator **yes**, Membership officer **optional**, every other role **no**. The scanner is controlled by the permission, never by the role name.

## 2. The scan result, in two steps

`POST /admin/events/:eventId/scan`

```json
{ "token": "KSP1.100596000000154022.AbC...", "staffId": "42", "deviceRef": "tablet-door-1" }
```
or, when the camera cannot be used, `{ "reference": "KS-0154022-3F9" }` (looked up among this event's passes).
Without `"confirm": true` nothing changes: this is the check that shows the member's details. Send the same body with
`"confirm": true` when the staff member taps **Confirm admission**.

Answer (always `200` for a result; `ok` is true for `valid` and `admitted`):

```json
{
  "result": "valid", "ok": true, "message": "Valid Pass: entry verified successfully.",
  "event":  { "id": "...", "name": "Annual Gathering", "start": "2026-11-15T12:30:00.000Z" },
  "pass":   { "id": "...", "reference": "KS-0154022-3F9", "bookedAt": "...", "attendedAt": null },
  "member": { "id": "...", "name": "Mr Ravi Kumar", "number": "M0311", "photoFileId": null }
}
```

| `result` | Show | Colour |
|---|---|---|
| `valid` | Valid Pass: entry verified successfully (then the **Confirm** button) | green |
| `admitted` | Admitted: attendance has been recorded | green |
| `already_scanned` | Already Scanned: this member has already been marked present (`pass.attendedAt` says when) | amber |
| `invalid` | Invalid QR: this QR code is not recognised | red |
| `wrong_event` | Wrong Event: this pass belongs to another event (`other.name`) | red |
| `cancelled` | Booking Cancelled: this booking is no longer valid | red |
| `not_confirmed` | Booking Not Confirmed: entry is not permitted | red |
| `event_closed` | Event Closed: attendance scanning is closed (archived, or ended more than `SCAN_CLOSES_AFTER_HOURS` = 12 hours ago) | red |
| `busy` | Another scanner is admitting this pass right now. Scan again in a moment | amber |

Use the `message` text as it is. The Noah API answers `500` when it could not record an admission (a network or store failure): the
console must show that as a **failed scan**, never as a success. The pass is put back, so the same code can simply be scanned again.

**Several scanners at once.** Admission is guarded by a short lock and, because the lock cannot be perfect in Catalyst Cache,
by a check after writing: the earliest attendance record counts and a later one is withdrawn, so one booking is never admitted twice.
`GET /admin/diagnostics/lock` (admin key only) reports whether the lock itself is working.

## 2b. The same scan from the member app (door staff)

A member whose roles include `scanner` (set on the App roles screen: `POST /admin/members/:id/roles` with `{ "scanner": true }`, stored as `users.is_employee`), or an office
admin / super admin, signed in to the app, can do the scan from the phone. These use that person's own token (`X-Noah-Token`); the role is checked by the Noah API.

| Call | Does |
|---|---|
| `GET /staff/events` | `{ events: [ { id, name, start, end, place } ] }`: events open for scanning now (published, not archived, starting within 36 hours or not yet closed) |
| `POST /staff/events/:id/scan` | exactly the console's scan (section 2): `{ token \| reference }` to look, `+ "confirm": true` to admit. `staffId` is the signed-in member; the name is read from their record; `deviceRef` is sent by the app |
| `GET /staff/events/:id/attendance` | the counter: `{ event, registered, confirmed, checkedIn, notYetArrived, cancelled, attendancePercent }` (no list of people) |

The `scanner` role is not an office role: it opens only these three calls. It does not skip registration. Taking it away (`"scanner": false`) stops the app from showing the
scan icon and refuses the calls at once.

## 3. The QR code

Each pass has one code, `KSP1.<pass id>.<signature>`. The signature is a keyed hash (the server's secret) of the pass, the event and
the member, so a code cannot be made up and holds nothing personal. The same pass always gives the same code. The camera scanner
only has to read the text and send it as `token`; the console never needs to decode it. The short reference `KS-0154022-3F9` is for
typing when a phone cannot show the code.

## 4. Attendance numbers, live view and report

`GET /admin/events/:id/attendance`

```json
{
  "event": { "id": "...", "name": "Annual Gathering", "start": "...", "scanningOpen": true },
  "registered": 500, "confirmed": 500, "checkedIn": 325, "notYetArrived": 175, "cancelled": 0, "attendancePercent": 65,
  "capped": false,
  "recent": [ { "at": "...", "manual": false, "member": { "id": "...", "name": "Mr Ravi Kumar" } } ]
}
```

`registered` = members who hold a pass; `confirmed` = passes not cancelled; `checkedIn` = confirmed passes used at the door;
`attendancePercent` = checkedIn / confirmed. `recent` is the last 15 people admitted: for the **live view** read this endpoint again every
3 to 5 seconds. `capped: true` means the event has more than 3000 passes and the numbers cover the first 3000.

`GET /admin/events/:id/attendance/export` returns a CSV file (`Reference, Member number, Name, Status, Booked at, Scanned at,
Scanned by (staff id)`). Cells that start like a formula are made harmless for spreadsheets.

## 5. Manual correction, with an audit trail

`POST /admin/events/:eventId/attendance/correct`

```json
{ "passId": "...", "action": "present", "reason": "Phone battery died", "staffId": "42" }
```
`action` is `present` or `absent`; give `passId` or `memberId`; `reason` is required (3 or more characters). `present` marks the pass used and writes
a manual attendance row; `absent` un-marks it and withdraws the attendance row (the member can then be scanned in properly).
The audit note is written **first**: if the audit table is missing the answer is `503 audit_unavailable` and nothing is changed.

Every admission and correction is also written to a table the office already has, so no new table is needed: the legacy **`logs`** table (the old app's
activity log) when the Data Store has it, otherwise **`taskLogs`**, which has the same columns plus `comment`. Rows written to `taskLogs` leave `taskId`
empty, so no task lists them. If `logs` is created later (columns in `schema/legacy-schema.json`), the trail simply starts going there. `GET /admin/diagnostics/audit`
says which table is used (`{ "ok": true, "table": "taskLogs" }`) or `ok: false` when neither exists; `GET /admin/diagnostics/tables` lists which tables exist.

A row has `userId` = the staff member, `elementId` = the event, `componentId` = the pass, `udid` = the scanning device, `actionId` = what was done (**9101**
admitted by QR, **9102** admitted by typed reference, **9103** marked present by hand, **9104** marked absent by hand), `method` = POST, `routeUrl`, `status` =
true when it worked, `params` = JSON `{ memberId, passId, action, staff, reason }`, `response` = the outcome, `comment` = the reason (`taskLogs` only),
`createdDate`. The 9100 to 9199 range is used only by this feature.

If neither table exists, a plain admission still works (who and when are in `passes.passIsUsedEmployeeId` / `passIsUsedTime` and `attendance.createdBy` /
`created`, and the failure to write the note is logged), but **a manual correction is refused** with `503 audit_unavailable`, because a correction needs its reason on record.

`GET /admin/events/:id/attendance/audit` (`?limit=` up to 300) returns that trail for an event, newest first, for the console's audit view:
`{ trail: [ { at, action, result, staff: { id, name }, deviceRef, reason, passId, member: { id, name } } ] }`.

The console's own audit list (`AuditLog`) is kept in memory when no table is configured, so it does not last through a restart: the `logs` rows above are the
lasting record. The console may still add its own line for each scan.

## 6. Where the data lives (the office's existing tables)

* `events` (written by the console): published when `publishDateTime` has passed, not `isArchived`, not `isInvisible` or `hideFromPublic`; the audience is in `filters`.
  A pass is needed when `passRequired` is true; seats are `passAvailable` and the number taken is `passUsed` (the Noah API keeps it up to date when a member books or cancels).
  Paid events (`passFeeType` set) and partners-only events (`availableFor` set) are shown in the app but cannot be booked there yet.
* `passes`: one row per booking. `inactive = true` means **cancelled by the member**; `passIsUsed`, `passIsUsedTime` and `passIsUsedEmployeeId` say it was used at the door.
* `logs`: the audit trail of admissions and corrections (see section 5).
* `attendance`: one row per member admitted (`created` = when, `createdBy` = staff, `manualScanning` = typed reference or correction). A withdrawn row has `isArchived = true`.

## 7. What the console builds

* **Event Scanner** page, shown only with `events.scan`: event selector, camera scanner (for example the browser's `BarcodeDetector`, or the
  `html5-qrcode` library), a field for the typed reference, the result panel of section 2, a live counter from section 4.
* **Attendance** on the event: the numbers and live list of section 4, the CSV export, and a correction dialog that asks for a reason (section 5).
* Navigation: Events > All Events, Create Event, Event Bookings, Attendance Reports, Event Scanner (only with `events.scan`).
* Mobile and tablet friendly; many staff can scan at the same time.

Member-side endpoints, for reference (`X-Noah-Token` of the signed-in member): `GET /events`, `POST /events/:id/book`
(`201` a new pass, `200` with `alreadyBooked: true` for the same pass), `GET /passes`, `POST /passes/:id/cancel`.
Errors the app shows as they are: `fully_booked`, `booking_closed`, `payment_required`, `partners_only`, `blocked_by_other_booking`,
`event_started`, `already_used`, `not_approved`.

When a new event is published the console also asks for the members to be told: see "Telling members about a new event" in the README.
