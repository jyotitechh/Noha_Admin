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

## The place on the map

The Location field is a search, not typed text. The office types a place or address, picks one from a short list (a name and
one line under it), and the form then shows only a compact card: the name, the address and a small map with a pin.

- The search is OpenStreetMap's (Nominatim), asked from the server (`server/places.js`, `GET /api/event-admin/places?q=`).
  It needs no key. The public service asks for one request a second at most, so searches are spaced and remembered for ten
  minutes. `PLACES_BASE_URL` points it at another Nominatim. Google Places or Mapbox would replace `searchPlaces` and nothing else.
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
