# Events in the admin console

The console's **Events** area (Events → Events, Events → Event groups) adds, changes, copies and archives events and
event groups in the Catalyst project's own tables. It follows the old admin app's flow: a list filtered by name and
dates, an event's details, and a nine-step form (Details, About, Banner, Terms, Formatted terms, Translations, Hall
and expenses, Who it is for, Pass booking).

Code: `server/events.js` (storage), `server/routes/events.js` (API), `src/modules/events/` (screens).

## Tables

| Table | What the console does |
|---|---|
| `events` | reads and writes |
| `eventGroup` | reads and writes |
| `eventLanguageGroups` | reads, and adds new ones ("Mumbai - English") |
| `halls` | reads (the Hall choice) |
| `locations` | reads and adds: the places chosen on the map before, offered again as "Saved places" |
| `groups` | reads (member groups an event can be limited to) |

All five were **empty** in the project when this was built, so the formats below are the console's choices. The Noah
API and the Flutter app must read them the same way.

## How an event is stored

| Form field | Column | Stored as |
|---|---|---|
| Name, Description | `name`, `description` | text |
| Show on dashboard, Hide from public, Hide from donation | `showOnDashboard`, `hideFromPublic`, `hideFromDonation` | boolean |
| Hide from leaders | `hideFromLeaders` | int, 1 or 0 |
| Visible in the app | `isInvisible` | boolean, the **opposite** of the switch |
| Event group | `eventGroupId` | the `eventGroup` ROWID |
| Tally ledger title | `tallyLegderTitle` | text (the column's own spelling) |
| Message title | `preachingTitle` | text |
| Preacher | `preacherId` | the member's `members` ROWID |
| Event date | `eventType`, `eventValue` | `1` and `'YYYY-MM-DD'` |
| Publish date and time | `publishDateTime` | `'YYYY-MM-DD HH:mm:ss'`, as entered (IST for the office) |
| Start, End | `startTime`, `endTime` | `'HH:mm'` in the event's timezone |
| | `startTimeUtc`, `endTimeUtc` | the same moments in UTC, `'YYYY-MM-DD HH:mm:ss'` |
| Timezone | `timezone` | IANA name, default `Asia/Kolkata` |
| Location | `locationName`, `locationAddress`, `locationLat`, `locationLon`, `locationId` | picked from a map search: the name, the full address, the latitude and longitude as text (6 decimals), and the map's own id (for example `way:12345`) |
| Attendee's maximum age | `allowMaxAge` | int or empty |
| Meeting link, Zoom ID, Zoom password | `meetingLink`, `zoomMeetingId`, `zoomMeetingPassword` | text |
| About | `formattedDescription` | HTML, cleaned (no scripts) |
| Banner | `photo` | a picture link |
| Terms and conditions | `terms` | plain text |
| Formatted terms | `formattedTermsAndConditions` | HTML, cleaned |
| Translations | `translation` | plain text |
| Hall | `hallId` | the `halls` ROWID |
| Expenses | `expenseHall`, `expenseSound`, `lights`, `expenseMusician`, `expenseMedia`, `expenseBus`, `expenseTransport`, `expensePhotography`, `expenseTranslator` | double, rupees |
| Who it is for | `filters` | JSON: `{"forPastor":true,"forLeader":false,"forVip":false,"forPrayerWarrior":false,"memberGroups":["<groups ROWID>"]}` |
| Blocked events for pass booking | `blockIfPassBookedFor` | JSON list of `events` ROWIDs |
| Archived | `isArchived`, `archivedOn` | see "Archive and delete" below |

Not written by the console: `id`, `ministryId`, `createdBy`, the pass and fee columns, recurrence, seat layout and the
target/result counters. Rows are linked by **ROWID**.

## How an event group is stored

| Form field | Column | Stored as |
|---|---|---|
| Name, Description | `name`, `description` | text |
| Event language group | `eventLanguageGroupId` | the `eventLanguageGroups` ROWID (required) |
| Donation collection team | `donationCollectionTeam` | JSON list of member ROWIDs |
| Scanning team | `scanningTeam` | JSON list of member ROWIDs |
| Pastors | `connectedEmployees` | JSON list of member ROWIDs (members whose `memberType` is pastor) |

A group that events still use cannot be archived.

## Attendance and bookings

Built from the Noah API developer's `docs/EVENTS-QR-CONTRACT.md` and `docs/FOR-CONSOLE-EVENTS.md` (`server/routes/attendance.js`,
`Attendance.tsx`, `Bookings.tsx`). **Door staff scan passes in the Noah app** (the `scanner` app role, below); the console has no
scanner of its own.

| Screen | Who | What it reads |
|---|---|---|
| **Attendance**: every event | `events.view` or `events.scan` | `GET /api/event-admin/attendance/events`: each event with booked, present, not yet arrived (from Catalyst's `passes` table) |
| **Attendance**: one event (click its name) | `events.view` or `events.scan` | `GET /api/event-admin/events/:id/people`: everyone booked, Present / Not yet arrived / Cancelled, when they came in (`passIsUsedTime`, UTC) and who let them in (`passIsUsedEmployeeId`). The numbers at the top are counted from this list |
| Latest arrivals | same | the Noah API's `recent` (`GET /admin/events/:id/attendance`): the last 15 let in, read every 5 s while Live is on; when its numbers move, the list and history are read again |
| History (audit trail) | same | `GET /admin/events/:id/attendance/audit`: every admission and hand correction, who, when, device, reason (kept by the Noah API in `taskLogs`) |
| CSV | same | `GET /admin/events/:id/attendance/export` |
| Mark present / absent | `events.scan` | `POST /admin/events/:id/attendance/correct`, a reason is required |
| **Bookings** | `events.view` | Catalyst's `passes` table, read only |
| "In the app" on an event | `events.view` | `GET /admin/diagnostics/events`: whether the app shows it and why not |

The console's server checks the permission before every call, and names the staff member (`X-Admin-Name`, `X-Admin-Staff-Id` / `staffId`).
The form saves `passRequired` and `passAvailable` (seats), writes `passUsed: 0` only when an event is created, and the audience is
"Everyone" unless roles are picked.

### Door staff scanning in the Noah app (the `scanner` app role)

Door staff can also scan inside the member app (Events tab, a scan icon) when they hold the app role `scanner`
(`FOR-CONSOLE-EVENTS.md` 5b). The Noah API keeps it on the member's login as `users.is_employee`. The app's own calls
(`/staff/events`, `/staff/events/:id/scan`, `/staff/events/:id/attendance`) need nothing from the console.

* **App roles > Door staff / Pass scanner** (`passScan` in `server/roles.js`) gives or takes it with
  `POST /admin/members/:id/roles { "scanner": true | false }`. The console's own `membersExtra.isPassScan` column is kept in step,
  and either flag counts as holding the role. Without the Noah API key only the column is written, and the screen says so.
* **Kept in step with `events.scan`** (`server/scanner-role.js`): a staff member whose console access starts to include `events.scan`
  (given access, approved request, role changed, re-enabled, or the permission switched on for their role in the grid) gets
  `scanner: true`; when it stops (role changed, suspended, revoked, or the permission switched off) they get `scanner: false`.
  If the Noah API refuses, the console change is still saved and the screen shows a warning to set it by hand on App roles.
  The permission grid lives in memory, so a grid change made before a restart is not re-applied to the app roles after it.
* **Staff given access before this** are listed on App roles ("N staff members can scan passes in the console but not yet in the
  Noah app") with a button that gives them `scanner: true` (`POST /api/app-roles/sync-scanners`). It only adds; nobody loses the role.

## Telling members about an event

The console writes events to the table itself, so it asks the Noah API to announce them (`server/event-announce.js`;
the Noah backend README, "Telling members about a new event"). The API sends the push and writes the member's notification
row; it announces an event **once**.

| When | What the console does |
|---|---|
| An event is added or saved | `POST /admin/events/:id/announce`. The office sees the result in the save message, for example "Members told: 36 of 40 got a notification." |
| The publish time is later | the API refuses with `not_published_yet`; the console says "Members will be told when it is published (…)" and the sweep sends it then |
| The event is hidden (`isInvisible` or `hideFromPublic`) or archived | nothing is sent |
| Every 5 minutes | `POST /admin/events/announce-due`: announces every event whose publish time passed in the last 24 hours and was not announced yet |
| The office presses **Tell members** on an event | announce now; if members were already told it asks before telling everyone again (`force`) |

- The sweep runs inside the console's API on a timer. It is on in production and off on a developer's machine, so a local run never
  announces to real members. `EVENT_SWEEP=on|off` forces it and `EVENT_SWEEP_MINUTES` (1 to 60, default 5) sets how often. If the host
  stops the API when it is idle, a Catalyst cron that calls the Noah API's `announce-due` with the admin key does the same job.
- A failure to announce never fails the save: the event is saved and the office is told members could not be told, with **Tell members** to retry.
- Who is told, and the push text, are the Noah API's: approved members with a registered phone, narrowed by the event's `filters`; the push
  is `{ title: "New event", body: "<name> · <day, time> · <place>", data: { type: "event_published", eventId } }`.
- Console calls: `POST /api/event-admin/events/:id/announce { force? }` (`events.manage`), and the save routes carry `announce: { status, text }`.
- Every announcement that reaches members is in the audit log ("Told members about an event").

## The place on the map

The Location field is a search, not typed text. The office types a place or address, picks one from a short list (a name and
one line under it), and the form then shows only a compact card: the name, the address and a small map with a pin.

- The search is OpenStreetMap's (Nominatim), asked from the server (`server/places.js`, `GET /api/event-admin/places?q=`).
  It needs no key. The public service asks for one request a second at most, so searches are spaced and remembered for ten
  minutes. `PLACES_BASE_URL` points it at another Nominatim. Google Places or Mapbox would replace `searchPlaces` and nothing else.
- **Choose on the map** opens a big map (most of the screen): search, click the map or drag the pin to the exact spot, then
  **Use this place**. With `MAPPLS_KEY` set on the API it is the Mappls (MapmyIndia) map and its Place Picker; without it, or if
  Mappls cannot load, it is OpenStreetMap (Leaflet) with the address at the pin from `GET /api/event-admin/places/reverse`.
  The Mappls key is a browser key: restrict it to the console's domains in the Mappls console.
- A place picked on the map is also written to `locations` (`name`, `area`, `city`, `state`, `country`, `lat`, `lng`, `locationId`),
  once, so the next event can choose it under "Saved places".
- The event itself carries the place (columns above), so the app can show it, and can open a map from `locationLat` and
  `locationLon`, without reading `locations`.

## Archive and delete

Archiving is how the office hides an event or an event group.

- **Archive** sets `isArchived = true` and `archivedOn`. The row stays in the table. The console moves it to the
  **Archived** view of Events or Event groups, where only the office sees it.
- **The Noah API and the app must not show an archived event or group.** Everything that lists events for members has to
  skip rows where `isArchived` is true. (The console cannot enforce that for the app.)
- **Restore** (from the Archived view) sets `isArchived = false` again and the event is back.
- **Delete** removes the row for good and is offered only on an archived event or group, after a confirmation. Deleting an
  event also takes it off the "blocked for pass booking" list of any other event.
- An event group cannot be archived while a live event uses it, and cannot be deleted while any event (archived ones
  included) uses it.

## API (console)

All under `/api/event-admin`, signed in. Reading needs `events.view`; changing needs `events.manage`.

| Call | Does |
|---|---|
| `GET /events?q=&from=YYYY-MM-DD&to=YYYY-MM-DD` | the list |
| `GET /events/:id` | one event, with group, hall, preacher and blocked-event names |
| `POST /events`, `PUT /events/:id`, `DELETE /events/:id` | add, change, archive |
| `GET /events?archived=1` | the archived events |
| `POST /events/:id/restore`, `DELETE /events/:id/permanently` | restore an archived event, delete it for good |
| `GET /groups`, `POST /groups`, `PUT /groups/:id`, `DELETE /groups/:id` | event groups (`?archived=1` for the archived ones; `DELETE` archives) |
| `POST /groups/:id/restore`, `DELETE /groups/:id/permanently` | restore an archived group, delete it for good |
| `GET /language-groups`, `POST /language-groups` | language groups |
| `GET /choices` | what the forms choose from |
| `GET /members?q=` or `?ids=` | members, for the preacher and the teams |

A refused form answers `400` with `errors: { field: message }`.

## Still to set up

- **Halls and member groups** are only read: the tables are empty, so the Hall and Member groups choices are empty
  until they are filled (by the Noah API, the old app's data, or a later console screen).
- **Banner upload** needs the Stratus bucket (`STRATUS_BUCKET`). Until then, paste a picture link.
- Every save is a Catalyst write and counts against the project's monthly allowance.
