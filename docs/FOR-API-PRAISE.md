# Praise reports: what the Noah API and the app need

For the Noah API developer and the Flutter developer. The Admin Console's **Community > Praise** screen now reads and
decides Catalyst's `praiseReport` table. The table is empty, because nothing can write to it yet: the Noah API has no
praise routes (checked 16 Nov 2026: `/praise`, `/praises`, `/praise-reports` and the `/admin/...` variants all answer
404). This note says what to add so a member's praise report reaches the office and, once published, the app.

## 1. The table (already in Catalyst, nothing to create)

`praiseReport`, one row per praise report:

| Column | What goes in it |
|---|---|
| `memberId` | the member's `members.ROWID` |
| `memberName`, `phoneNumber`, `email` | as the member is known when they send it (the console falls back to the member row) |
| `text` | the testimony, plain text, line breaks kept |
| `videoLink` | an optional link (YouTube or similar) |
| `photo1` to `photo5` | each a `files` ROWID (an upload), or an `https://` link |
| `location` | optional place, as the member typed it |
| `comment` | an optional note from the member (the console shows it and never writes it) |
| `isComplete`, `isFeatured`, `isClosed`, `isArchived` | see section 2; write `false` on a new report |
| `created`, `updated` | UTC `YYYY-MM-DD HH:mm:ss` |

`praisePhotos`, `praiseStats` and `praiseStatsSummary` exist but have no columns, and nothing uses them.

## 2. What the flags mean (the console already works this way)

| State | Flags |
|---|---|
| **Waiting** for the office | `isComplete` not true and `isArchived` not true |
| **Published** | `isComplete = true` (the office checked it; it may be shown) |
| **Rejected** | `isArchived = true` (never shown; nothing is deleted) |
| **Featured** | `isFeatured = true` on a published one: shown first |

`isClosed` is not used by the console. Treat an empty flag as false.

The console writes `isComplete`, `isArchived`, `isFeatured`, `updated` and `updatedBy` only. The reason for a
rejection is kept in the console's audit log; there is no column for it, so the member is not told why.

## 3. Routes to add (suggested)

```
POST /praise-reports                       member signed in (X-Noah-Token)
     { text, videoLink?, photos?: [fileId], location?, comment? }
     -> { id, status: "waiting" }          writes one praiseReport row, flags false

GET  /praise-reports?limit=30&before=<id>  member signed in: the praise wall
     -> published ones only (isComplete true, isArchived not true),
        featured first, then newest first; ids as strings; photos as links the app can load

GET  /praise-reports/mine                  member signed in: their own, with a state each
                                           ("waiting" | "published" | "rejected")
```

Optional, so the member hears back: when the console publishes one, a push "Your praise report is on the praise wall".
The console does not call the API for this today; if you add `POST /admin/praise-reports/:id/publish` (and `/reject`
with `{ note }`), say so and the console will call it instead of writing the flags itself, as it does for registrations.

## 4. How to check it

1. In the app, send a praise report with a photo.
2. In the console, **Community > Praise**: it is under **Waiting**, with the photo, the text and the member.
3. **Publish** it. In the app's praise wall it appears; **Feature on the praise wall** moves it to the top.
4. Send another and **Reject** it: it never appears in the app.
