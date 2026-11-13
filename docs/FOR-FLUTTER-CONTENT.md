# Content from the Admin Console in the Noah app

For the Flutter developer, and for whoever looks after the Noah API. When the office saves content in the Admin Console, it must appear
in the app. This note says what the console saves, where, and what the API and the app have to do so it shows.

Attach with this note: `CONTENT-TABLES.md` (every column of every content table, generated from the console's code).

## 1. How content reaches the app

```
Admin Console  ──writes──▶  Catalyst Data Store tables  ──read by──▶  Noah API  ──JSON──▶  Flutter app
```

* The console writes **straight to the office's own tables**. Nothing is copied or queued: a saved entry is in the table at once.
* The app **never reads the tables**. It calls the Noah API, which reads them (the tables need server credentials).
* The console does **not** send a push when content is saved. The app picks new content up when it loads or refreshes the list.

## 2. What the app can read today

Checked on 13 Nov 2026 against the development Noah API (a route that exists answers 401 without a sign-in; one that does not
answers 404 `not_found`).

| Console screen | Table | API route today | Status |
|---|---|---|---|
| Content > Daily Manna | `dailyMana` | `GET /content/manna`, `/content/manna/today` | **exists** |
| Content > Daily Manna > Manna categories | `dailyMannaCategories` | `GET /content/manna/categories` | **exists** |
| Content > Daily Prayers | `dailyPrayers` | `GET /content/prayers` | **exists** |
| Content > Confessions | `dailyConfessions` | `GET /content/confessions` | **exists** |
| Content > Dream dictionary | `dreamDictionary`, `dreamDictionaryCategory` | none | **API route needed** |
| Content > Bible commentary | `bibleCommentary` | none | **API route needed** |
| Content > Banners and announcements | `dashboard` (banners), `ads` (announcements) | none | **API route needed** |
| Media > Office posts and categories | `noahGram`, `noahGramCategory` | `GET /noahgram/feed` (posts); categories: none | feed **exists**; see `FOR-FLUTTER-NOAHGRAM-OFFICE-POSTS.md` |
| Media > Noah Tube | `videos`, `videoCategories` | none | **API route needed** |
| School > Bible school, Courses | `bibleSchool`, `rowilCourse…` tables | none | **confirm first** (section 6) |

For the four that exist, the next step is to check that an entry the office saves now actually comes back (section 5). For the rest,
the API needs a read route; suggested shapes are in section 4.

## 3. Rules for every content table

**What is live.** Show a row only when its live switch is on and its date has come. Dates are calendar days in **IST** (UTC+05:30).

| Table | Live when |
|---|---|
| `dailyMana` | `published` true and `publishDate` today or earlier |
| `dailyPrayers` | `published` true and `publishedDate` today or earlier |
| `dailyConfessions` | `published` true and `publishDate` today or earlier |
| `dreamDictionary` | `published` true and `publishedDate` empty or today or earlier |
| `dreamDictionaryCategory` | `isArchived` not true |
| `dashboard` (banners) | `isArchived` not true and (`expiryTime` empty or today or earlier than it) |
| `ads` (announcements) | `isArchived` not true |
| `bibleCommentary` | `isPublished` true and `isArchived` not true |
| `noahGram` (office posts) | `isApproved` true, `isArchived` not true, `scheduleDate` empty or passed |
| `noahGramCategory` | `isPublished` = 1 |
| `videos` | `isArchived` not true |
| `videoCategories` | `status` true, and today between `publishStart` and `publishEnd` when they are set |
| `bibleSchool` | `status` = 1 and `publishDate` empty or passed |
| `rowilCourseManagement`, `rowilCourseLessonManagement` | `published` = 1 and `publishedDate` empty or passed |

**Empty is not false.** The console does not write `isArchived` on most tables, so it is empty (`null`) on new rows. A query written as
`isArchived = false` **drops every row the console made**. Treat empty as "not archived" everywhere. The same goes for any other
switch that is empty.

**Language.** `contentLanguage` (and `language` on courses) is a number:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| English | Hindi | Marathi | Telugu | Malayalam | **Tamil** | Kannada |

Return the member's language and fall back to English (1) when there is nothing in theirs. Content arrives already translated by the
office: the app does not translate it.

**Partners only.** `visibleTo` (Manna, prayers, confessions, dictionary) and `onlyForPartners` (commentary): true means only covenant
partners see it (`membersExtra.isPartner`), false or empty means everyone. The API must filter this for the signed-in member.

**Show on obituary notices.** `showOnObituary` on the Daily Manna: 1 means it may also be shown on an obituary notice. 0 or empty: no.

**Ids.** `ROWID` is 17 to 19 digits. Keep every id as a **String** (a JSON number loses digits).

**Switches** are `true`/`false` in some columns and `1`/`0` in others. Treat `true`, `1` and `"1"` as on.

**Dates.** A `date` column is `YYYY-MM-DD`. A `datetime` column the console fills from a date picker (`publishedDate`, `expiryTime`,
`scheduleDate`, `publishStart`, `publishEnd`) is midnight: treat it as a calendar day and ignore the time.

**Formatted text is HTML.** These are written in a rich-text editor and stored as HTML: Manna `content` and `prayer`, prayer and
confession `content`, dictionary `content`, commentary `content`. Only these tags appear:
`p br strong b em i u s strike sub sup h1 h2 h3 h4 ul ol li blockquote hr a`. Links are http, https, mailto or tel only; the console
removes everything else. Show it with `flutter_widget_from_html` (or similar), and never run JavaScript. Older rows are plain text with
no `<`: show those as text and keep their line breaks.

**Pictures** are a plain `https://` link in the picture column (`image`, `photo`, `landscapeImage`, `portraitImage`, `thumb`,
`backgroundImage`, `icon`, `thumbnail`). The office either pastes a link or drops a file, which the console stores in the church's
public picture storage and saves as a link such as `https://karuna-pics-development.zohostratus.in/pictures/2026/<random>.jpg`.
Load it with a normal network image; no token is needed. Never rebuild the link: pictures saved before the move to Production keep
their Development address.

**Embeds.** Manna, prayers, confessions, dictionary and commentary have `embed01` to `embed20`: extra links (usually YouTube) or embed
code the office attaches. Return the non-empty ones in order. Where they sit in the text is to be agreed (section 6).

**Writer.** Manna and confessions have `writerId`, commentary has `memberId`: the `members.ROWID` of the person credited. Return their
name (first, middle, last), not the id.

**Not set by the console:** `ministryId` (empty), `createdBy`, counters (`likes`, `comments`, `counter`, `shares`: may be empty, treat
as 0). If the API filters on `ministryId`, nothing from the console will appear.

## 4. Routes still needed (suggested shapes)

All `GET`, JSON, same `X-Noah-Token` sign-in as the rest of the API. `lang` defaults to the member's language. The server applies the
rules in section 3, so the app never filters dates or switches itself.

```
GET /content/dictionary?lang=1&category=<id>&q=<text>&limit=50     featured first, then A to Z
GET /content/dictionary/categories?lang=1
GET /content/commentary?lang=1&book=<1-66>&chapter=<n>            one chapter's commentary
GET /home/banners?lang=1                                          by orderCol, lowest first
GET /home/announcements?lang=1                                    newest first
GET /noahgram/categories                                          by orderCol
GET /tube/categories?lang=1                                       nested by parentId
GET /tube/videos?lang=1&category=<id>&limit=30                    featured first, then orderCol
```

Item shapes (ids as strings, HTML as described):

```json
{ "id": "…", "title": "Snake", "meaning": "<p>…</p>", "categoryId": "…", "featured": true, "image": null, "language": 1 }
{ "id": "…", "title": "Romans 8", "book": 45, "chapter": 8, "body": "<p>…</p>", "writer": { "id": "…", "name": "…" },
  "youtubeId": "dQw4w9WgXcQ", "image": null, "embeds": [], "partnersOnly": false, "language": 1 }
{ "id": "…", "caption": "…", "landscapeImage": "https://…", "portraitImage": "https://…", "url": null, "order": 1 }
{ "id": "…", "title": "…", "message": "…", "link": null, "image": null }
{ "id": "…", "title": "…", "description": "…", "videoUrl": "https://youtu.be/…", "host": "youtube", "thumb": "https://…",
  "seconds": 312, "categoryId": "…", "featured": false }
```

`videoSourceType`: 1 YouTube, 2 Vimeo, 3 Wistia. Commentary `bibleBookId`: Genesis 1 to Revelation 66.

## 5. How to check that it reflects in the app

Do this for each screen once its route exists.

1. In the console, open the screen (for example **Content > Daily Manna**), add an entry dated **today**, in **English**, switch
   **Published** on, and save. Add a picture by dropping a file.
2. In the app, open the matching screen and pull to refresh. The entry must appear with its picture and its formatting.
3. In the console, switch **Published** off and save. After a refresh it must be gone.
4. Add one dated **tomorrow**. It must not appear until tomorrow.
5. Switch **Partners only** on. A member who is not a partner must no longer see it; a partner still does.
6. Set the language to **Tamil (6)**. A member using the app in Tamil sees it; one in English does not (they get the English entry).

If an entry saved in the console does not appear but an older one does, the usual cause is a filter on a column the console leaves
empty (`isArchived`, `ministryId`): see section 3.

## 6. For the app, and questions to settle

**In the app**

* Cache each list on the device; refresh on open and on pull-to-refresh. Never poll: the Data Store allowance is shared with the office.
* A day with no entry shows the most recent one, not an empty screen.
* Banners: pick `portraitImage` on phones and `landscapeImage` on tablets, falling back to the other. A banner with a `url` opens it.
* Daily Manna ends in a prayer or a confession (`isConfession`). The Prayers tab shows `dailyPrayers` **and** the Manna rows whose
  closing is a prayer; the Confessions tab likewise with `dailyConfessions` and the Manna rows whose closing is a confession.

**To settle**

1. **School.** The console still authors `bibleSchool` and the courses, but the client planned to run the Bible school in Zoho
   TrainerCentral. Confirm which one the app shows before building it.
2. **Embeds.** Where each `embedNN` appears in the text (the old app's rule is not written down).
3. **Announcements `type`.** The meaning of its values is not documented; ignore it until it is.
4. **Banners `hideFromPublic`.** Assumed to mean "only signed-in members see it".
5. **Video files.** Noah Tube takes a link (YouTube, Vimeo, Wistia); the console cannot upload a video file.
